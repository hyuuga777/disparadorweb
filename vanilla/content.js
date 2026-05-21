console.log("🤖 SPA IA: Content Script v5.0 Ativo (Soft Navigation)");

let isWorking = false;
let isExtensionInvalidated = false;

function checkExtensionValid() {
    if (isExtensionInvalidated) return false;
    try {
        if (!chrome.runtime || !chrome.runtime.id) {
            isExtensionInvalidated = true;
            return false;
        }
        return true;
    } catch (e) {
        isExtensionInvalidated = true;
        return false;
    }
}

// --- Seletores Dinâmicos ---
const SELECTORS = {
    CHAT_INPUT: 'div[title="Digite uma mensagem"], div[aria-label="Mensagem"], div[contenteditable="true"][data-tab="10"]',
    SEND_BTN: 'button span[data-icon="send"], span[data-icon="send-light"], button[aria-label="Enviar"]',
    ATTACH_BTN: 'div[aria-label="Anexar"], [data-icon="plus"], [data-icon="add"]',
    FILE_INPUTS: 'input[type="file"]',
    CAPTION_INPUT: 'div[contenteditable="true"][data-tab="11"], div[aria-label="Adicione uma legenda"]',
    MODAL_ERROR: 'div[role="dialog"]'
};

// ============================
// SOFT NAVIGATION - Abre chat sem recarregar a página
// ============================
function openChatSmoothly(phone) {
    return new Promise((resolve) => {
        const link = document.createElement('a');
        link.href = `https://web.whatsapp.com/send?phone=${phone}`;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
            document.body.removeChild(link);
            resolve();
        }, 500);
    });
}

// ============================
// Listener de mensagens do Background
// ============================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'NAVIGATE_AND_SEND') {
        handleDirectTask(msg.task);
    } else if (msg.action === 'PING_CONTENT') {
        sendResponse({ alive: true });
    }
});

async function handleDirectTask(task) {
    if (isWorking) return;
    isWorking = true;

    try {
        console.log(`🔗 Abrindo chat para: ${task.name} (${task.phone}) via Soft Navigation...`);

        // 1. Navegar suavemente (sem reload)
        await openChatSmoothly(task.phone);

        // 2. Aguardar o campo de texto aparecer (o chat carregou)
        console.log("⏳ Aguardando chat carregar...");
        const chatInput = await waitForSelector(SELECTORS.CHAT_INPUT, 30);
        if (!chatInput) {
            throw new Error("Chat não carregou após navegação (campo de mensagem não encontrado)");
        }

        console.log(`✅ Chat aberto para ${task.name}. Enviando mensagem...`);

        // 3. Executar o envio
        await executeTask(task);

    } catch (err) {
        console.error("❌ Erro na automação:", err);
        if (checkExtensionValid()) {
            chrome.runtime.sendMessage({ action: 'STEP_ERROR', error: err.message }).catch(() => {});
        }
    } finally {
        isWorking = false;
    }
}

// ============================
// Execução do Envio
// ============================
async function executeTask(task) {
    console.log(`🎯 Executando tarefa para: ${task.name}`);

    const input = await waitForSelector(SELECTORS.CHAT_INPUT, 30);
    if (!input) throw new Error("Campo de mensagem não encontrado (timeout)");

    await sleep(2000);

    if (task.media) {
        await handleMediaUpload(task.media, task.message);
    } else {
        await handleTextOnly(task.message);
    }

    if (task.audio) {
        await handleAudioUpload(task.audio);
    }

    if (checkExtensionValid()) {
        chrome.runtime.sendMessage({ action: 'STEP_COMPLETED' }).catch(() => {});
    }
}

// --- Handlers de Envio ---
async function handleTextOnly(message) {
    const input = document.querySelector(SELECTORS.CHAT_INPUT);
    input.focus();
    document.execCommand('insertText', false, message);
    await sleep(800);
    
    const sendBtn = await waitForSelector(SELECTORS.SEND_BTN, 5);
    if (sendBtn) (sendBtn.closest('button') || sendBtn).click();
    await sleep(1500);
}

async function handleMediaUpload(base64, message) {
    await attachFile(base64, "media");
    const caption = await waitForSelector(SELECTORS.CAPTION_INPUT, 10);
    if (caption) {
        caption.focus();
        document.execCommand('insertText', false, message);
        await sleep(1000);
        const sendBtn = await waitForSelector('div[aria-label="Enviar"], [data-icon="send"]', 5);
        if (sendBtn) (sendBtn.closest('div[role="button"]') || sendBtn).click();
        await sleep(4000);
    }
}

async function handleAudioUpload(base64) {
    await attachFile(base64, "document");
    await sleep(1500);
    const sendBtn = await waitForSelector('div[aria-label="Enviar"], [data-icon="send"]', 5);
    if (sendBtn) (sendBtn.closest('div[role="button"]') || sendBtn).click();
    await sleep(3000);
}

// --- Helpers de Baixo Nível ---
async function attachFile(base64, type) {
    const attachBtn = document.querySelector(SELECTORS.ATTACH_BTN);
    if (attachBtn) attachBtn.click();
    await sleep(800);

    const inputs = document.querySelectorAll(SELECTORS.FILE_INPUTS);
    const input = type === "media" ? inputs[0] : (inputs[1] || inputs[0]);
    
    if (input) {
        const file = await base64ToFile(base64);
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        input.files = dataTransfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

async function base64ToFile(base64) {
    const res = await fetch(base64);
    const blob = await res.blob();
    const mime = base64.split(';')[0].split(':')[1];
    return new File([blob], `upload.${mime.split('/')[1]}`, { type: mime });
}

function waitForSelector(selector, timeoutSeconds) {
    return new Promise(resolve => {
        let count = 0;
        const interval = setInterval(() => {
            const el = document.querySelector(selector);
            if (el) { clearInterval(interval); resolve(el); }
            if (++count > timeoutSeconds) { clearInterval(interval); resolve(null); }
        }, 1000);
    });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- Observadores de Erro (Número Inválido) ---
const errorObserver = new MutationObserver(() => {
    if (!checkExtensionValid()) return;
    const modal = document.querySelector(SELECTORS.MODAL_ERROR);
    if (modal && (modal.innerText.includes("inválido") || modal.innerText.includes("invalid"))) {
        const okBtn = modal.querySelector('button');
        if (okBtn) {
            okBtn.click();
            isWorking = false;
            if (checkExtensionValid()) {
                chrome.runtime.sendMessage({ action: 'STATUS_INVALID_NUMBER' }).catch(() => {});
            }
        }
    }
});
errorObserver.observe(document.body, { childList: true, subtree: true });
