let queue = [];
let isProcessing = false;
let config = {};
let currentTabId = null;
let lastMessageLength = 0;

// --- Listener de Mensagens ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'START_QUEUE') {
        const { payload } = request;
        queue = [...payload.contacts];
        config = {
            apiKey: payload.api_key,
            aiEnabled: payload.ai_enabled,
            baseMessage: payload.base_message,
            delay: parseInt(payload.delay) || 5000,
            media: payload.media_base64,
            audio: payload.audio_base64
        };
        
        if (!isProcessing) {
            isProcessing = true;
            initializeQueue();
        }
    } else if (request.action === 'STOP_QUEUE') {
        isProcessing = false;
        queue = [];
        chrome.runtime.sendMessage({ action: 'STATUS_UPDATE', message: "🛑 Fila interrompida pelo usuário.", type: "error" });
    } else if (request.action === 'STEP_COMPLETED') {
        chrome.runtime.sendMessage({ action: 'MESSAGE_SENT', message: 'Mensagem enviada com sucesso!' });
        handleNextStep();
    } else if (request.action === 'STEP_ERROR') {
        chrome.runtime.sendMessage({ action: 'ERROR', message: `❌ Erro: ${request.error}` });
        handleNextStep();
    } else if (request.action === 'STATUS_INVALID_NUMBER') {
        chrome.runtime.sendMessage({ action: 'ERROR', message: `❌ Número inválido ou sem WhatsApp.` });
        processQueue(); // Pula o delay de comportamento humano
    } else if (request.action === 'PING') {
        sendResponse({ status: "alive" }); // Keep-alive do Service Worker
    }
});

async function initializeQueue() {
    const tabs = await chrome.tabs.query({ url: "*://web.whatsapp.com/*" });
    if (tabs.length === 0) {
        chrome.runtime.sendMessage({ action: 'ERROR', message: "❌ WhatsApp Web não encontrado. Abra-o em uma aba!" });
        isProcessing = false;
        return;
    }
    currentTabId = tabs[0].id;

    // Garantir que o content script está injetado na aba
    await ensureContentScript(currentTabId);

    processQueue();
}

async function ensureContentScript(tabId) {
    try {
        // Testa se o content script responde
        await chrome.tabs.sendMessage(tabId, { action: 'PING_CONTENT' });
    } catch (e) {
        // Não está injetado - injetar agora
        console.log('[Background] Injetando content script na aba do WhatsApp...');
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
        });
        // Dar tempo para o script inicializar
        await new Promise(r => setTimeout(r, 1000));
    }
}

async function processQueue() {
    if (!isProcessing || queue.length === 0) {
        isProcessing = false;
        chrome.runtime.sendMessage({ action: 'QUEUE_FINISHED' });
        return;
    }

    const contact = queue.shift();
    
    try {
        chrome.runtime.sendMessage({ 
            action: 'STATUS_UPDATE', 
            message: `🤖 Preparando convite para: ${contact.name}...`, 
            type: 'info' 
        });

        // 1. Gerar Mensagem personalizada
        const safeName = (contact.name && contact.name.trim() !== "") ? contact.name.trim() : "Cliente";
        let finalMessage = config.baseMessage.replace(/{nome}/gi, safeName);
        
        if (config.aiEnabled && config.apiKey) {
            try {
                finalMessage = await generateAIMessage(safeName, config.baseMessage, config.apiKey);
            } catch (err) {
                console.error("Erro IA:", err);
            }
        }

        lastMessageLength = finalMessage.length;

        // 2. Enviar tarefa diretamente ao Content Script (Soft Navigation)
        const cleanPhone = contact.phone.replace(/\D/g, '');
        const task = {
            name: contact.name,
            phone: cleanPhone,
            message: finalMessage,
            media: config.media,
            audio: config.audio,
            timestamp: Date.now()
        };

        await chrome.tabs.sendMessage(currentTabId, {
            action: 'NAVIGATE_AND_SEND',
            task
        });

    } catch (error) {
        chrome.runtime.sendMessage({ 
            action: 'ERROR', 
            message: `Falha em ${contact.name}: ${error.message}` 
        });
        handleNextStep();
    }
}

async function handleNextStep() {
    if (!isProcessing) return;
    
    // Novo cálculo de delay anti-ban
    // Tempo Base: config.delay
    // Tempo de Digitação: 50ms por caractere
    // Jitter: Entre 15.000ms e 47.000ms
    const baseDelay = config.delay || 3000;
    const typingDelay = lastMessageLength * 50;
    const jitter = Math.floor(Math.random() * (47000 - 15000 + 1)) + 15000; 
    
    const totalDelay = baseDelay + typingDelay + jitter;
    
    chrome.runtime.sendMessage({ 
        action: 'STATUS_UPDATE', 
        message: `⏳ Aguardando ${(totalDelay/1000).toFixed(1)}s (comportamento humano)...`, 
        type: 'info' 
    });

    console.log(`[Anti-Ban] Delay aplicado: Base(${baseDelay}ms) + Digitação(${typingDelay}ms) + Jitter(${jitter}ms) = Total(${totalDelay}ms)`);

    setTimeout(() => {
        processQueue();
    }, totalDelay);
}

// --- Integração Gemini ---
async function generateAIMessage(name, template, apiKey) {
    const prompt = `Atue como um atendente sofisticado e amigável.
    Reescreva esta mensagem para ${name}, mantendo o tom elegante e profissional:
    "${template}"
    
    Regras:
    - Use o nome ${name}.
    - Não use marcadores de posição.
    - Seja conciso (máximo 3 frases).
    - Retorne APENAS o texto da mensagem.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        })
    });

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || template.replace(/{nome}/gi, name);
}
