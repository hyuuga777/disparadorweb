document.addEventListener('DOMContentLoaded', () => {
    // --- Configurações e Estado ---
    const STORAGE_KEYS = ['gemini_api_key', 'ai_enabled', 'delay_ms', 'base_message'];
    let contacts = [];

    // --- Elementos da Interface ---
    const ui = {
        csv: document.getElementById('csvFile'),
        csvLabel: document.getElementById('csvLabel'),
        dropZone: document.getElementById('dropZone'),
        useAI: document.getElementById('chkUseAI'),
        aiInputs: document.getElementById('aiInputs'),
        apiKey: document.getElementById('apiKeyMain'),
        message: document.getElementById('baseMessage'),
        media: document.getElementById('mediaFile'),
        audio: document.getElementById('audioFile'),
        delay: document.getElementById('delayInput'),
        btnSend: document.getElementById('btnSend'),
        btnStop: document.getElementById('btnStop'),
        labelSend: document.getElementById('labelSend'),
        logs: document.getElementById('logContainer'),
        statusDot: document.getElementById('statusDot')
    };

    // --- 1. Armazenamento Persistente (Auto-Save) ---
    const loadSettings = () => {
        chrome.storage.local.get(STORAGE_KEYS, (data) => {
            if (data.gemini_api_key) ui.apiKey.value = data.gemini_api_key;
            if (data.ai_enabled !== undefined) {
                ui.useAI.checked = data.ai_enabled;
            }
            if (data.delay_ms) ui.delay.value = data.delay_ms;
            if (data.base_message) ui.message.value = data.base_message;
        });
    };

    const saveSettings = () => {
        chrome.storage.local.set({
            gemini_api_key: ui.apiKey.value,
            ai_enabled: ui.useAI.checked,
            delay_ms: ui.delay.value,
            base_message: ui.message.value
        });
    };

    // Ouvintes para Auto-Save
    [ui.apiKey, ui.useAI, ui.delay, ui.message].forEach(el => {
        el.addEventListener('input', saveSettings);
        el.addEventListener('change', saveSettings);
    });

    // (O listener avulso de visibilidade foi removido)

    // --- 2. Processamento Seguro de CSV ---
    if (ui.dropZone) {
        ui.dropZone.addEventListener('click', () => ui.csv.click());
    }

    ui.csv.addEventListener('change', handleCSVUpload);

    async function handleCSVUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target.result;
            contacts = parseCSV(text);
            
            if (contacts.length > 0) {
                ui.csvLabel.textContent = `${file.name} (${contacts.length} válidos)`;
                ui.csvLabel.classList.add('text-royal');
                ui.btnSend.disabled = false;
                addLog(`✅ CSV carregado: ${contacts.length} contatos prontos.`, 'success');
            } else {
                addLog("❌ CSV inválido ou sem contatos formatados corretamente (Nome, Telefone).", 'error');
                ui.btnSend.disabled = true;
            }
        };
        reader.onerror = () => addLog("❌ Erro ao ler o arquivo CSV.", "error");
        reader.readAsText(file);
    }

    function parseCSV(text) {
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
        if (lines.length < 2) return [];

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const nameIdx = headers.indexOf('nome');
        const phoneIdx = headers.indexOf('telefone');

        if (nameIdx === -1 || phoneIdx === -1) return [];

        return lines.slice(1).reduce((acc, line) => {
            const cols = line.split(',');
            const name = cols[nameIdx]?.trim();
            const rawPhone = cols[phoneIdx]?.trim();

            if (name && rawPhone) {
                // Limpeza: Apenas dígitos. Ex: +55 (11) 999 -> 5511999
                const cleanPhone = rawPhone.replace(/\D/g, '');
                if (cleanPhone.length >= 8) {
                    acc.push({ name, phone: cleanPhone });
                }
            }
            return acc;
        }, []);
    }

    // --- 3. Tratamento de Anexos (Base64) ---
    const fileToDataURL = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsDataURL(file);
        });
    };

    // --- 4. Orquestração e Mensageria ---
    ui.btnSend.addEventListener('click', async () => {
        if (!contacts.length) return;

        setSendingUI(true);
        addLog(`🚀 Iniciando disparos para ${contacts.length} contatos...`);

        const pContainer = document.getElementById('progressCounterContainer');
        const pCount = document.getElementById('progressCount');
        const pTotal = document.getElementById('progressTotal');
        if (pContainer && pCount && pTotal) {
            pCount.textContent = '0';
            pTotal.textContent = contacts.length;
            pContainer.classList.remove('hidden-view');
        }

        try {
            const payload = {
                contacts,
                api_key: ui.apiKey.value,
                ai_enabled: ui.useAI.checked,
                base_message: ui.message.value,
                delay: parseInt(ui.delay.value) || 3000,
                media_base64: ui.media.files[0] ? await fileToDataURL(ui.media.files[0]) : null,
                audio_base64: ui.audio.files[0] ? await fileToDataURL(ui.audio.files[0]) : null
            };

            chrome.runtime.sendMessage({ action: 'START_QUEUE', payload });
        } catch (error) {
            addLog(`❌ Erro técnico ao processar mídia: ${error.message}`, 'error');
            setSendingUI(false);
        }
    });

    ui.btnStop.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'STOP_QUEUE' });
        setSendingUI(false);
        addLog("🛑 Envio interrompido pelo usuário.", 'error');
    });

    // Escuta eventos do Background
    chrome.runtime.onMessage.addListener((msg) => {
        switch (msg.action) {
            case 'STATUS_UPDATE':
                addLog(msg.message, msg.type);
                break;
            case 'MESSAGE_SENT':
                addLog(`✓ ${msg.message}`, 'success');
                const pCount = document.getElementById('progressCount');
                if (pCount) pCount.textContent = parseInt(pCount.textContent || 0) + 1;
                break;
            case 'ERROR':
                addLog(`⚠️ ${msg.message}`, 'error');
                break;
            case 'QUEUE_FINISHED':
                setSendingUI(false);
                addLog("🏁 <b>Fila de disparos finalizada!</b>", 'success');
                break;
        }
    });

    // --- Utilitários ---
    function addLog(msg, type = 'info') {
        const entry = document.createElement('div');
        const colorClass = type === 'error' ? 'text-error' : type === 'success' ? 'text-success' : 'text-info';
        entry.className = `mb-1 ${colorClass}`;
        entry.innerHTML = `<span class="opacity-40 text-xs">[${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}]</span> ${msg}`;
        ui.logs.appendChild(entry);
        ui.logs.scrollTop = ui.logs.scrollHeight;
        ui.logs.classList.remove('hidden-view');
    }


    function setSendingUI(isSending) {
        ui.btnSend.disabled = isSending;
        ui.labelSend.innerText = isSending ? "PROCESSANDO..." : "INICIAR DISPAROS";
        ui.btnStop.classList.toggle('hidden-view', !isSending);
        if (ui.statusDot) ui.statusDot.classList.toggle('active', isSending);
        if (isSending) ui.btnSend.classList.add('opacity-50');
        else ui.btnSend.classList.remove('opacity-50');
    }

    // --- 5. Keep-Alive (Ping background a cada 20s) ---
    setInterval(() => {
        try {
            chrome.runtime.sendMessage({ action: 'PING' });
        } catch(e) { /* background inativo momentaneamente */ }
    }, 20000);

    // Inicialização
    loadSettings();
});
