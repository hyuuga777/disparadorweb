document.addEventListener('DOMContentLoaded', () => {
    const STORAGE_KEYS = ['openai_api_key', 'ai_enabled', 'delay_ms', 'base_message', 'send_order'];
    let contacts = [];

    const ui = {
        csv: document.getElementById('csvFile'),
        csvLabel: document.getElementById('csvLabel'),
        dropZone: document.getElementById('dropZone'),
        useAI: document.getElementById('chkUseAI'),
        aiInputs: document.getElementById('aiInputs'),
        apiKey: document.getElementById('apiKeyMain'),
        message: document.getElementById('baseMessage'),
        limitWarning: document.getElementById('limitWarning'), // Novo elemento
        media: document.getElementById('mediaFile'),
        audio: document.getElementById('audioFile'),
        delay: document.getElementById('delayInput'),
        sendOrder: document.getElementById('sendOrder'),
        btnSend: document.getElementById('btnSend'),
        btnStop: document.getElementById('btnStop'),
        labelSend: document.getElementById('labelSend'),
        logs: document.getElementById('logContainer'),
        statusDot: document.getElementById('statusDot')
    };

    // --- LÓGICA DE BLOQUEIO DA CAIXA DE TEXTO (Sem acento, max 150 chars, max 4 linhas) ---
    ui.message.addEventListener('input', (e) => {
        let text = ui.message.value;
        
        // 1. Remove acentos em tempo real
        text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        let lines = text.split('\n');
        let exceedsLimit = false;

        // 2. Trava em 4 linhas
        if (lines.length > 4) {
            lines = lines.slice(0, 4);
            text = lines.join('\n');
            exceedsLimit = true;
        }

        // 3. Trava em 150 caracteres
        if (text.length > 150) {
            text = text.substring(0, 150);
            exceedsLimit = true;
        }

        ui.message.value = text;
        ui.limitWarning.style.display = exceedsLimit ? 'block' : 'none';
        saveSettings();
    });

    const loadSettings = () => {
        if (!window.chrome || !chrome.storage) return;
        chrome.storage.local.get(STORAGE_KEYS, (data) => {
            if (data.openai_api_key) ui.apiKey.value = data.openai_api_key;
            if (data.ai_enabled !== undefined) ui.useAI.checked = data.ai_enabled;
            if (data.delay_ms) ui.delay.value = data.delay_ms;
            if (data.base_message) ui.message.value = data.base_message;
            if (data.send_order) ui.sendOrder.value = data.send_order;
            else ui.sendOrder.value = 'media_text_audio';
        });
    };

    const saveSettings = () => {
        if (!window.chrome || !chrome.storage) return;
        chrome.storage.local.set({
            openai_api_key: ui.apiKey.value,
            ai_enabled: ui.useAI.checked,
            delay_ms: ui.delay.value,
            base_message: ui.message.value,
            send_order: ui.sendOrder.value
        });
    };

    [ui.apiKey, ui.useAI, ui.delay, ui.sendOrder].forEach(el => {
        el.addEventListener('input', saveSettings);
        el.addEventListener('change', saveSettings);
    });

    ui.csv.addEventListener('change', handleCSVUpload);

    async function handleCSVUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            contacts = parseCSV(event.target.result);
            if (contacts.length > 0) {
                ui.csvLabel.textContent = `${file.name} (${contacts.length} válidos)`;
                ui.csvLabel.classList.add('text-royal');
                ui.btnSend.disabled = false;
                addLog(`✅ CSV: ${contacts.length} contatos prontos.`, 'success');
            } else {
                addLog("❌ CSV inválido.", 'error');
                ui.btnSend.disabled = true;
            }
        };
        reader.readAsText(file);
        
        // Resetar o input para permitir selecionar o mesmo arquivo novamente
        e.target.value = '';
    }

    function parseCSV(text) {
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
        if (lines.length < 2) return [];
        
        // Remove BOM se existir e converte para minúsculo
        const firstLine = lines[0].replace(/^\uFEFF/, '').trim().toLowerCase();
        
        // Descobre o delimitador (pode ser , ou ;)
        const delimiter = firstLine.includes(';') ? ';' : ',';
        const headers = firstLine.split(delimiter).map(h => h.replace(/["']/g, '').trim());
        
        const nameIdx = headers.indexOf('nome');
        const phoneIdx = headers.indexOf('telefone');
        
        if (nameIdx === -1 || phoneIdx === -1) return [];

        return lines.slice(1).reduce((acc, line) => {
            const cols = line.split(delimiter);
            const name = cols[nameIdx]?.trim();
            const rawPhone = cols[phoneIdx]?.trim();
            if (name && rawPhone) {
                const cleanPhone = rawPhone.replace(/\D/g, '');
                if (cleanPhone.length >= 8) acc.push({ name, phone: cleanPhone });
            }
            return acc;
        }, []);
    }

    const fileToDataURL = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
    });

    ui.btnSend.addEventListener('click', async () => {
        if (!contacts.length) return;
        setSendingUI(true);
        addLog(`🚀 Iniciando disparos para ${contacts.length} contatos...`);

        document.getElementById('progressCount').textContent = '0';
        document.getElementById('progressTotal').textContent = contacts.length;
        document.getElementById('progressCounterContainer').classList.remove('hidden-view');

        try {
            const payload = {
                contacts,
                api_key: ui.apiKey.value,
                ai_enabled: ui.useAI.checked,
                base_message: ui.message.value,
                delay: parseInt(ui.delay.value) || 3000,
                send_order: ui.sendOrder.value,
                media_base64: ui.media.files[0] ? await fileToDataURL(ui.media.files[0]) : null,
                audio_base64: ui.audio.files[0] ? await fileToDataURL(ui.audio.files[0]) : null
            };
            chrome.runtime.sendMessage({ action: 'START_QUEUE', payload });
        } catch (error) {
            addLog(`❌ Erro técnico: ${error.message}`, 'error');
            setSendingUI(false);
        }
    });

    ui.btnStop.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'STOP_QUEUE' });
        setSendingUI(false);
        addLog("🛑 Envio interrompido pelo usuário.", 'error');
    });

    if (window.chrome && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((msg) => {
            switch (msg.action) {
                case 'STATUS_UPDATE': addLog(msg.message, msg.type); break;
                case 'MESSAGE_SENT':
                    addLog(`✓ ${msg.message}`, 'success');
                    const pCount = document.getElementById('progressCount');
                    if (pCount) pCount.textContent = parseInt(pCount.textContent || 0) + 1;
                    break;
                case 'ERROR': addLog(`⚠️ ${msg.message}`, 'error'); break;
                case 'QUEUE_FINISHED':
                    setSendingUI(false);
                    addLog("🏁 <b>Fila finalizada!</b>", 'success');
                    break;
            }
        });
    }

    function addLog(msg, type = 'info') {
        const entry = document.createElement('div');
        const colorClass = type === 'error' ? 'text-error' : type === 'success' ? 'text-success' : 'text-info';
        entry.className = `mb-1 ${colorClass}`;
        entry.innerHTML = `<span class="opacity-40 text-xs">[${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span> ${msg}`;
        ui.logs.appendChild(entry);
        ui.logs.scrollTop = ui.logs.scrollHeight;
        ui.logs.classList.remove('hidden-view');
    }

    function setSendingUI(isSending) {
        ui.btnSend.disabled = isSending;
        ui.labelSend.innerText = isSending ? "PROCESSANDO..." : "INICIAR DISPAROS";
        ui.btnStop.classList.toggle('hidden-view', !isSending);
        if (ui.statusDot) ui.statusDot.classList.toggle('active', isSending);
        ui.btnSend.classList.toggle('opacity-50', isSending);
    }

    setInterval(() => { try { chrome.runtime.sendMessage({ action: 'PING' }); } catch (e) { } }, 20000);
    loadSettings();
});