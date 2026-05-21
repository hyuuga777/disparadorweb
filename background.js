let queue = [];
let isProcessing = false;
let config = {};
let currentTabId = null;
let lastMessageLength = 0;
let contactCounter = 0; // Novo contador para variação de tamanho

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_QUEUE') {
    const { payload } = request;
    queue = [...payload.contacts];
    config = {
      apiKey: payload.api_key,
      aiEnabled: payload.ai_enabled,
      baseMessage: payload.base_message,
      delay: parseInt(payload.delay) || 5000,
      sendOrder: payload.send_order,
      media: payload.media_base64,
      audio: payload.audio_base64,
    };

    chrome.storage.local.remove('active_task', () => {
      if (!isProcessing) {
        isProcessing = true;
        contactCounter = 0; // Reseta ao iniciar
        initializeQueue();
      }
    });
  } else if (request.action === 'STOP_QUEUE') {
    isProcessing = false;
    queue = [];
    chrome.storage.local.remove('active_task');
    chrome.runtime.sendMessage({ action: 'STATUS_UPDATE', message: '🛑 Fila interrompida.', type: 'error' });
  } else if (request.action === 'STEP_COMPLETED') {
    chrome.storage.local.remove('active_task');
    chrome.runtime.sendMessage({ action: 'MESSAGE_SENT', message: 'Mensagem enviada!' });
    if (queue.length === 0) finishQueue();
    else handleNextStep();
  } else if (request.action === 'STEP_ERROR') {
    chrome.storage.local.remove('active_task');
    chrome.runtime.sendMessage({ action: 'ERROR', message: `❌ Erro: ${request.error}` });
    if (queue.length === 0) finishQueue();
    else handleNextStep();
  } else if (request.action === 'STATUS_INVALID_NUMBER') {
    chrome.storage.local.remove('active_task');
    chrome.runtime.sendMessage({ action: 'ERROR', message: `❌ Número sem WhatsApp.` });
    setTimeout(() => {
      processQueue();
    }, 3000);
  } else if (request.action === 'PING') {
    sendResponse({ status: 'alive' });
  }
});

function finishQueue() {
    isProcessing = false;
    chrome.runtime.sendMessage({ action: 'QUEUE_FINISHED' });
}

async function initializeQueue() {
  const tabs = await chrome.tabs.query({ url: '*://web.whatsapp.com/*' });
  if (tabs.length === 0) {
    chrome.runtime.sendMessage({ action: 'ERROR', message: '❌ Abra o WhatsApp Web!' });
    isProcessing = false;
    return;
  }
  currentTabId = tabs[0].id;
  await ensureContentScript(currentTabId);
  processQueue();
}

async function ensureContentScript(tabId) {
  try {
    const tabs = await chrome.tabs.query({ url: '*://web.whatsapp.com/*' });
    if (!tabs.some((tab) => tab.id === tabId)) throw new Error(`Aba fechada.`);
  } catch (e) { throw new Error(`Falha: ${e.message}`); }

  let attempts = 0;
  while (attempts < 5) {
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'PING_CONTENT' });
      return;
    } catch (e) {
      attempts++;
      if (attempts >= 5) {
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
        await new Promise((r) => setTimeout(r, 3000));
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function processQueue() {
  if (!isProcessing || queue.length === 0) {
    finishQueue();
    return;
  }

  const contact = queue.shift();
  contactCounter++; // Incrementa a posição do contato

  try {
    chrome.runtime.sendMessage({
      action: 'STATUS_UPDATE',
      message: `🤖 Preparando para: ${contact.name || 'Lead'}...`,
      type: 'info',
    });

    const safeName = contact.name && contact.name.trim() !== '' ? contact.name.trim() : '';
    let messageWithPlaceholder = config.baseMessage.replace(/{{nome}}/gi, safeName);
    
    // Tratamento estético para nomes vazios (remove vírgulas flutuantes e espaços extras)
    let finalMessage = messageWithPlaceholder;
    if (safeName === '') {
      // Remove vírgulas flutuantes que ficaram sozinhas
      finalMessage = finalMessage.replace(/,\s*,/g, ',');
      // Remove espaços antes de vírgulas e pontos
      finalMessage = finalMessage.replace(/\s+([,.!?])/g, '$1');
      // Se a mensagem começar com pontuação devido ao nome estar no início, remove
      finalMessage = finalMessage.replace(/^[,.!?]\s*/, '');
      // Se a mensagem terminar com pontuação estranha, limpa
      finalMessage = finalMessage.replace(/\s*[,.!?]$/, '.');
      // Consolida espaços duplos e trim
      finalMessage = finalMessage.replace(/\s+/g, ' ').trim();
      
      // Caso especial: "Olá , tudo bem?" -> "Olá, tudo bem?"
      finalMessage = finalMessage.replace(/Olá\s*,\s*/gi, 'Olá, ');
    }

    if (config.aiEnabled && config.apiKey) {
      chrome.runtime.sendMessage({
        action: 'STATUS_UPDATE',
        message: `🧠 Gerando variação Humanizada (Contato ${contactCounter})...`,
        type: 'info',
      });
      try {
        finalMessage = await generateAIMessage(messageWithPlaceholder, config.apiKey, contactCounter);
      } catch (err) {
        chrome.runtime.sendMessage({
          action: 'STATUS_UPDATE',
          message: `⚠️ IA falhou: ${err.message}.`,
          type: 'error',
        });
      }
    }

    lastMessageLength = finalMessage.length;

    const task = {
      name: contact.name,
      phone: contact.phone.replace(/\D/g, ''),
      message: finalMessage,
      media: config.media,
      audio: config.audio,
      sendOrder: config.sendOrder,
      timestamp: Date.now(),
    };

    // Salva o active_task no storage local antes de despachar o envio
    chrome.storage.local.set({ active_task: task }, async () => {
      try {
        await chrome.tabs.sendMessage(currentTabId, { action: 'NAVIGATE_AND_SEND', task });
      } catch (err) {
        console.warn("⚠️ Content script não respondeu. Forçando navegação via URL...", err);
        // Fallback: Se o content script não respondeu (ex: aba acabou de recarregar ou descarregada),
        // navegamos diretamente a aba. O content script injetado recuperará a tarefa do storage no startup.
        try {
          chrome.tabs.update(currentTabId, { url: `https://web.whatsapp.com/send?phone=${task.phone}` });
        } catch (updateErr) {
          console.error("❌ Falha crítica ao forçar navegação de aba:", updateErr);
          chrome.runtime.sendMessage({ action: 'ERROR', message: `Falha crítica ao abrir aba para ${contact.name}` });
          if (queue.length === 0) finishQueue();
          else handleNextStep();
        }
      }
    });
  } catch (error) {
    chrome.runtime.sendMessage({ action: 'ERROR', message: `Falha em ${contact.name}: ${error.message}` });
    if (queue.length === 0) finishQueue();
    else handleNextStep();
  }
}

async function handleNextStep() {
  if (!isProcessing) return;
  const baseDelay = config.delay || 3000;
  const typingDelay = lastMessageLength * 50;
  const jitter = Math.floor(Math.random() * (47000 - 15000 + 1)) + 15000;
  const totalDelay = baseDelay + typingDelay + jitter;

  chrome.runtime.sendMessage({
    action: 'STATUS_UPDATE',
    message: `⏳ Próximo envio em ${(totalDelay / 1000).toFixed(1)}s...`,
    type: 'info',
  });

  setTimeout(() => processQueue(), totalDelay);
}

// --- Integração OPENAI (Com regras rígidas de PT-BR e Limites Dinâmicos) ---
async function generateAIMessage(textToRewrite, apiKey, contactNumber) {
  
  // Define o tamanho baseado na ordem do contato na fila
  let lengthRule = "";
  let mod = contactNumber % 4;
  if (mod === 1) lengthRule = "A mensagem deve ter entre 100 e 150 caracteres.";
  else if (mod === 2) lengthRule = "A mensagem deve ter entre 70 e 80 caracteres.";
  else if (mod === 3) lengthRule = "A mensagem deve ter próximo de 70 caracteres.";
  else lengthRule = "A mensagem deve ter entre 90 e 100 caracteres.";

  const prompt = `Reescreva o texto abaixo simulando uma pessoa normal enviando WhatsApp de forma fria.

MENSAGEM:
"${textToRewrite}"

REGRAS OBRIGATÓRIAS:
1. TAMANHO DINÂMICO: ${lengthRule} NUNCA ultrapasse 4 linhas.
2. ZERO VENDAS: É estritamente proibido mencionar preços, valores ou fazer discursos de venda. Aja como um contato de relacionamento comum.
3. ZERO EMOJIS: É estritamente proibido incluir qualquer tipo de emoji.
4. SEM ACENTOS: Não use acentuação gráfica. Substitua "não" por "nao", "você" por "voce", "está" por "esta", etc.
5. PORTUGUÊS INFORMAL (ERROS LEVES): Para soar humano, introduza vícios de linguagem naturais. Exemplos: Use "ta" no lugar de "está", "vc" no lugar de "você", "eh" no lugar de "é". Use pontuação informal (ex: letras minúsculas no começo de frase). Evite erros de analfabetismo graves.
6. SEM ASPAS: Retorne apenas o texto final.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "Você é um usuário casual de WhatsApp que digita sem acentos, usa gírias como 'vc' e 'ta', e nunca tenta vender nada." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.message || `Erro ${response.status}`);
    }

    const data = await response.json();
    let generatedText = data.choices[0].message.content.trim();
    
    // FILTROS DE SEGURANÇA: Limpeza Forçada (Caso a IA desobedeça)
    generatedText = generatedText.replace(/^["']|["']$/g, ''); // Remove aspas
    generatedText = generatedText.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Remove acentos
    generatedText = generatedText.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, ''); // Arranca Emojis
    
    return generatedText || textToRewrite;
  } catch (err) {
    throw err;
  }
}