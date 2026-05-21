console.log('🤖 SPA IA: Content Script v7.2 Ativo (Isolated World)');

let isWorking = false;
let isExtensionInvalidated = false;
let currentTaskInvalid = false; // FLAG NOVA: Avisa se o número deu erro

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

const SELECTORS = {
  CHAT_INPUT: 'div[title="Digite uma mensagem"], div[title="Type a message"], div[aria-label="Mensagem"], div[aria-label="Type a message"], div[role="textbox"][contenteditable="true"], div[contenteditable="true"][data-tab="10"], footer div[contenteditable="true"], #main footer div[contenteditable="true"]',
  SEND_BTN: 'span[data-icon="send"], span[data-icon="send-light"], button[aria-label="Enviar"], button[aria-label="Send"], span[data-testid="send"], span[data-icon="last-msg-status-v-check"]',
  MODAL_ERROR: 'div[role="dialog"], div.x1n2onr6.x1vjfegm',
  ATTACH_BTN: 'div[aria-label="Anexar"], div[aria-label="Attach"], [data-icon="plus"], [data-icon="add"], [data-icon="plus-rounded"], [data-testid="plus-rounded"], button[aria-label="Anexar"], button[aria-label="Attach"], span[data-icon="plus"]',
  FILE_INPUTS: 'input[type="file"]',
};

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
  currentTaskInvalid = false; // Reseta a flag para o contato atual

  try {
    console.log(`🔗 Abrindo chat para: ${task.name} (${task.phone})...`);
    await openChatSmoothly(task.phone);

    // 🛑 A MÁGICA ACONTECE AQUI: Esperamos o WhatsApp decidir se o número existe
    console.log('⏳ Verificando integridade do contato...');
    await sleep(2500); 

    // 1ª Checagem: O Observer fantasma (lá embaixo) já pegou o modal de erro?
    if (currentTaskInvalid) {
        console.log('🛑 Número bloqueado (Não existe no WhatsApp). Pulando...');
        if (checkExtensionValid()) chrome.runtime.sendMessage({ action: 'STATUS_INVALID_NUMBER' }).catch(() => { });
        isWorking = false;
        return; // Aborta tudo e foge antes de digitar no contato errado!
    }

    // 2ª Checagem Dupla: Busca manual na tela (caso a net esteja lenta)
    const modal = document.querySelector(SELECTORS.MODAL_ERROR);
    if (modal) {
       const text = modal.innerText.toLowerCase();
       if (text.includes('não está no whatsapp') || 
           text.includes('inválido') || 
           text.includes('invalid') || 
           text.includes('não é válido') || 
           text.includes('not valid') || 
           text.includes('não existe')) {
           
           const okBtn = Array.from(modal.querySelectorAll('button')).find(b => {
             const t = b.innerText.toUpperCase();
             return t.includes('OK') || t.includes('FECHAR') || t.includes('ENTENDI') || t.includes('CLOSE') || t.includes('DISMISS');
           }) || modal.querySelector('button');
           
           if (okBtn) okBtn.click();
           console.log('🛑 Número inválido detectado na checagem manual. Pulando...');
           if (checkExtensionValid()) chrome.runtime.sendMessage({ action: 'STATUS_INVALID_NUMBER' }).catch(() => { });
           isWorking = false;
           return; // Aborta tudo!
       }
    }

    // Se passou daqui, o número existe e a tela já está no chat certo! Pode mandar bala.
    const chatInput = await waitForSelector(SELECTORS.CHAT_INPUT, 30);
    if (currentTaskInvalid) {
        console.log('🛑 Número bloqueado detectado durante a espera. Pulando...');
        if (checkExtensionValid()) chrome.runtime.sendMessage({ action: 'STATUS_INVALID_NUMBER' }).catch(() => { });
        isWorking = false;
        return; // Aborta e pula sem lançar erro!
    }
    if (!chatInput) {
        console.warn('⚠️ [Cyborg] Chat não carregou dentro do tempo limite.');
        if (checkExtensionValid()) {
            chrome.runtime.sendMessage({ action: 'STEP_ERROR', error: 'Chat não carregou' }).catch(() => { });
        }
        isWorking = false;
        return;
    }

    await executeTask(task);
  } catch (err) {
    console.error('❌ Erro inesperado na automação:', err);
    if (checkExtensionValid()) {
      try {
        await chrome.runtime.sendMessage({ action: 'STEP_ERROR', error: err.message || 'Erro inesperado' });
      } catch (e) { }
    }
  } finally {
    isWorking = false; // Libera o robô para a próxima tarefa de forma segura
  }
}

async function executeTask(task) {
  const input = await waitForSelector(SELECTORS.CHAT_INPUT, 30);
  if (!input) {
    console.warn('⚠️ [Cyborg] Campo de mensagem não encontrado.');
    if (checkExtensionValid()) {
      chrome.runtime.sendMessage({ action: 'STEP_ERROR', error: 'Campo de mensagem não encontrado' }).catch(() => { });
    }
    return;
  }

  await sleep(1500);

  const order = task.sendOrder || 'media_text_audio';

  if (order === 'media_text_audio') {
    if (task.media) await handleMediaUpload(task.media);
    if (task.message && task.message.trim() !== '') await handleTextOnly(task.message);
    if (task.audio) await handleAudioUpload(task.audio);
  } 
  else if (order === 'text_media_audio') {
    if (task.message && task.message.trim() !== '') await handleTextOnly(task.message);
    if (task.media) await handleMediaUpload(task.media);
    if (task.audio) await handleAudioUpload(task.audio);
  }
  else if (order === 'text_audio_media') {
    if (task.message && task.message.trim() !== '') await handleTextOnly(task.message);
    if (task.audio) await handleAudioUpload(task.audio);
    if (task.media) await handleMediaUpload(task.media);
  }
  else if (order === 'audio_media_text') {
    if (task.audio) await handleAudioUpload(task.audio);
    if (task.media) await handleMediaUpload(task.media);
    if (task.message && task.message.trim() !== '') await handleTextOnly(task.message);
  }
  else if (order === 'audio_text_media') {
    if (task.audio) await handleAudioUpload(task.audio);
    if (task.message && task.message.trim() !== '') await handleTextOnly(task.message);
    if (task.media) await handleMediaUpload(task.media);
  }
  else if (order === 'media_audio_text') {
    if (task.media) await handleMediaUpload(task.media);
    if (task.audio) await handleAudioUpload(task.audio);
    if (task.message && task.message.trim() !== '') await handleTextOnly(task.message);
  }

  if (checkExtensionValid()) {
    chrome.runtime.sendMessage({ action: 'STEP_COMPLETED' }).catch(() => { });
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitForSelector(selector, timeoutSeconds) {
  return new Promise((resolve) => {
    let count = 0;
    const interval = setInterval(() => {
      // Aborta imediatamente se descobrirmos que o número é inválido
      if (currentTaskInvalid) {
        clearInterval(interval);
        resolve(null);
        return;
      }
      const el = document.querySelector(selector);
      if (el) {
        clearInterval(interval);
        resolve(el);
      }
      if (++count > timeoutSeconds) {
        clearInterval(interval);
        resolve(null);
      }
    }, 1000);
  });
}

async function waitForFunction(fn, timeoutSeconds, description) {
  return new Promise((resolve) => {
    let count = 0;
    const interval = setInterval(() => {
      try {
        const result = fn();
        if (result) {
          clearInterval(interval);
          resolve(result);
          return;
        }
      } catch (e) { }
      if (++count > timeoutSeconds) {
        clearInterval(interval);
        resolve(null);
      }
    }, 1000);
  });
}

function base64ToFile(base64, type) {
  // SEGURANÇA: Evita que URLs vazias/undefined resultem em falha
  if (!base64 || typeof base64 !== 'string' || !base64.startsWith('data:')) {
    console.error("❌ [Cyborg] base64 inválido ou não inicializado recebido em base64ToFile:", base64);
    if (checkExtensionValid()) {
      chrome.runtime.sendMessage({ action: 'STEP_ERROR', error: `Arquivo de ${type} inválido ou não carregado na extensão.` }).catch(() => { });
    }
    return null;
  }

  try {
    const parts = base64.split(';base64,');
    const mimeType = parts[0].split(':')[1];
    
    // Limpa parâmetros extras de codecs ou tipos como "video/mp4;codecs=h264" para obter o MIME principal
    let cleanMimeType = mimeType.split(';')[0].trim();
    
    const byteString = atob(parts[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    
    let ext = 'file';
    // Normaliza tipos MIME para garantir compatibilidade total
    if (cleanMimeType.includes('video/')) {
      cleanMimeType = 'video/mp4';
      ext = 'mp4';
    }
    else if (cleanMimeType.includes('image/')) {
      if (cleanMimeType.includes('jpeg')) ext = 'jpg';
      else if (cleanMimeType.includes('png')) ext = 'png';
      else if (cleanMimeType.includes('webp')) ext = 'webp';
      else if (cleanMimeType.includes('gif')) ext = 'gif';
      else {
        cleanMimeType = 'image/jpeg';
        ext = 'jpg';
      }
    }
    else if (cleanMimeType.includes('audio/')) {
      cleanMimeType = 'audio/ogg; codecs=opus';
      ext = 'ogg';
    }

    const blob = new Blob([ab], { type: cleanMimeType });
    let fileName = `upload.${ext}`;

    // Para o áudio, força o nome recorded_audio para o interceptador de PTT atuar
    if (type === 'audio') {
      fileName = 'recorded_audio.ogg';
      return new File([blob], fileName, { type: 'audio/ogg; codecs=opus' });
    }

    return new File([blob], fileName, { type: cleanMimeType });
  } catch (err) {
    console.error("❌ [Cyborg] Erro na decodificação base64:", err);
    if (checkExtensionValid()) {
      chrome.runtime.sendMessage({ action: 'STEP_ERROR', error: `Falha ao converter dados de ${type} em arquivo.` }).catch(() => { });
    }
    return null;
  }
}

function isPreviewOpened() {
  // 1. Procura pela caixa de legenda (caption input) do preview de mídia
  const captionInput = document.querySelector(
    'div[contenteditable="true"][data-tab="11"], ' +
    'div[aria-label="Adicione uma legenda"], ' +
    'div[aria-label="Add a caption"], ' +
    'div[aria-placeholder*="legenda"], ' +
    'div[aria-placeholder*="caption"], ' +
    'div[role="textbox"][aria-label*="legenda"]'
  );
  if (captionInput) return true;

  // 2. Procura pelo botão de enviar do preview
  const icons = document.querySelectorAll(
    'span[data-icon="send"], ' +
    'span[data-icon="checkmark-medium"], ' +
    'span[data-icon="wds-ic-send-filled"], ' +
    'span[data-testid="wds-ic-send-filled"], ' +
    'span[data-icon="send-light"], ' +
    'div[aria-label^="Enviar"], ' +
    'div[aria-label^="Send"], ' +
    'div[aria-label*="item selecionado"], ' +
    'button[aria-label^="Enviar"], ' +
    'button[aria-label^="Send"], ' +
    '[data-testid="send"]'
  );
  for (let icon of icons) {
    let btn = icon.closest('div[role="button"]') || icon.closest('button') || icon;
    if (btn && (btn.offsetParent !== null || btn.getBoundingClientRect().width > 0)) {
      // Exclui o botão de enviar comum da conversa (que fica no footer)
      if (!btn.closest('footer')) {
        return true;
      }
    }
  }

  // 3. Procura por elementos típicos do preview de mídia
  const previewElements = document.querySelectorAll(
    'div[style*="background-image"][class*="x"], ' +
    'div[class*="media-preview"], ' +
    'div[class*="x10l6t27"] canvas, ' +
    'span[data-icon="close"], ' +
    'span[data-icon="x-viewer"], ' +
    'div[aria-label="Visualização de mídia"], ' +
    'div[aria-label="Media preview"]'
  );
  for (let el of previewElements) {
    if (!el.closest('#main') && !el.closest('footer')) {
      return true;
    }
  }

  // 4. Checagem específica para áudio (PTT) - O preview de áudio é diferente
  const audioPreview = document.querySelector('div[aria-label="Enviar mensagem de voz"], div[aria-label="Send voice message"], span[data-icon="ptt-check-blue"]');
  if (audioPreview) return true;

  return false;
}

async function attachFileViaInputFallback(base64, type) {
  console.log(`⚠️ [Cyborg] Drag & Drop falhou. Ativando Fallback de Input File...`);
  
  const file = base64ToFile(base64, type);
  if (!file) return false;

  const attachBtn = document.querySelector(SELECTORS.ATTACH_BTN);
  if (attachBtn) {
    console.log('🤖 [Cyborg] Clicando no botão de anexo "+"...');
    attachBtn.click();
    await sleep(800);
  } else {
    console.warn('⚠️ [Cyborg] Botão de anexo "+" não encontrado. Tentando localizar inputs diretamente...');
  }

  const inputs = document.querySelectorAll(SELECTORS.FILE_INPUTS);
  if (inputs.length === 0) {
    console.error('❌ [Cyborg] Nenhum input do tipo file encontrado.');
    return false;
  }

  // Se for media (imagem/vídeo), costuma ser o primeiro input. Se for áudio, tentamos o segundo (documentos) ou primeiro.
  const input = type === 'media' ? inputs[0] : (inputs[1] || inputs[0]);
  if (!input) {
    console.error('❌ [Cyborg] Input de arquivo correspondente não encontrado.');
    return false;
  }

  try {
    console.log('🤖 [Cyborg] Injetando arquivo diretamente no input e disparando evento change...');
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));

    console.log('⏳ [Cyborg] Aguardando painel de preview...');
    for (let i = 0; i < 18; i++) {
      await sleep(200);
      if (isPreviewOpened()) {
        console.log('🎉 [Cyborg] Preview de mídia detectado com sucesso via Input File Fallback!');
        return true;
      }
    }
  } catch (err) {
    console.error('❌ [Cyborg] Erro no Fallback de Input File:', err);
  }

  return false;
}

async function attachFileViaDrop(base64, type) {
  const file = base64ToFile(base64, type);
  if (!file) return false;
  
  const chatInput = document.querySelector(SELECTORS.CHAT_INPUT);
  if (!chatInput) {
    console.error('❌ [Cyborg] Campo de entrada de mensagem do WhatsApp não encontrado.');
    return false;
  }

  console.log(`🤖 [Cyborg] Simulando Drag & Drop humano do arquivo (${type === 'media' ? 'mídia' : 'áudio'})...`);
  chatInput.focus();

  // Foco e seleção do contêiner alvo (prioriza #main da conversa para maior fidelidade)
  const dropTarget = document.querySelector('#main') || 
                     document.querySelector('div[role="region"]') || 
                     chatInput.closest('.x14z9mp') || 
                     chatInput || 
                     document.body;

  let previewOpened = false;

  try {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    const triggerDragEvent = (target, eventName) => {
      const ev = new DragEvent(eventName, {
        bubbles: true,
        cancelable: true,
        composed: true,
        dataTransfer: dataTransfer
      });
      try {
        Object.defineProperty(ev, 'dataTransfer', {
          value: dataTransfer,
          writable: false,
          configurable: true
        });
      } catch (e) {}
      target.dispatchEvent(ev);
    };

    // Sequência de eventos de UI que simulam o movimento humano de arrastar e soltar
    console.log('🔄 [Cyborg] Disparando sequência de eventos de UI (DragEnter -> DragOver -> Drop)...');
    
    triggerDragEvent(document.body, 'dragenter');
    triggerDragEvent(dropTarget, 'dragenter');
    await sleep(150);
    
    triggerDragEvent(document.body, 'dragover');
    triggerDragEvent(dropTarget, 'dragover');
    await sleep(200);

    // Tenta encontrar um overlay de drop ativo no DOM
    const dropOverlay = document.querySelector('div[style*="z-index"][style*="position: absolute"]') ||
                        document.querySelector('div[class*="drop"]') ||
                        document.querySelector('div[class*="drag"]') ||
                        document.querySelector('.x13faqbe') ||
                        Array.from(document.querySelectorAll('div')).find(el => {
                          const txt = el.innerText.toLowerCase();
                          return txt.includes('arraste') || txt.includes('solte') || txt.includes('drag') || txt.includes('drop');
                        });

    if (dropOverlay) {
      console.log('🎯 [Cyborg] Overlay de Drop detectado! Efetuando Drop diretamente nele...');
      triggerDragEvent(dropOverlay, 'drop');
      await sleep(100);
    } else {
      console.log('🤖 [Cyborg] Nenhum overlay de Drop visual localizado. Efetuando Drop nos alvos padrão...');
      triggerDragEvent(dropTarget, 'drop');
      await sleep(100);
      triggerDragEvent(document.body, 'drop');
    }

    console.log('⏳ [Cyborg] Aguardando painel de preview do WhatsApp...');
    
    // Aguarda até 5 segundos observando se o preview abriu
    for (let i = 0; i < 25; i++) { // 25 * 200ms = 5000ms
      await sleep(200);
      if (isPreviewOpened()) {
        previewOpened = true;
        console.log('🎉 [Cyborg] Preview de mídia detectado com sucesso via Drag & Drop!');
        break;
      }
    }
  } catch (err) {
    console.error('❌ [Cyborg] Erro ao simular Drag & Drop humano:', err);
  }

  // FALLBACK ATIVO: Se o Drag & Drop falhou, aciona a injeção via input file clássico
  if (!previewOpened) {
    previewOpened = await attachFileViaInputFallback(base64, type);
  }

  return previewOpened;
}

async function handleTextOnly(message) {
  console.log('[DEBUG] Injetando texto com quebras de linha via DataTransfer...');
  const input = document.querySelector(SELECTORS.CHAT_INPUT);
  if (!input) return;
  input.focus();
  
  const dataTransfer = new DataTransfer();
  dataTransfer.setData('text/plain', message);
  const pasteEvent = new ClipboardEvent('paste', {
    clipboardData: dataTransfer,
    bubbles: true,
    cancelable: true
  });
  input.dispatchEvent(pasteEvent);

  setTimeout(() => {
    if (input.innerText.trim() === '') {
       document.execCommand('insertText', false, message);
    }
  }, 300);

  await sleep(1000);

  const sendBtn = await waitForSelector(SELECTORS.SEND_BTN, 5);
  if (sendBtn) (sendBtn.closest('button') || sendBtn).click();
  await sleep(1500);
}

async function handleMediaUpload(base64) {
  const success = await attachFileViaDrop(base64, 'media');
  if (!success) {
    console.error('❌ [Cyborg] Falha ao carregar pré-visualização da mídia.');
    if (checkExtensionValid()) {
      chrome.runtime.sendMessage({ action: 'STEP_ERROR', error: 'Falha ao carregar pré-visualização da mídia.' }).catch(() => { });
    }
    return;
  }
  
  // ⏳ AGUARDA A GERAÇÃO DE THUMBNAIL E PROCESSAMENTO PELO WHATSAPP WEB
  // Vídeos e imagens grandes precisam de tempo para o WhatsApp gerar o blob interno
  console.log('⏳ [Cyborg] Aguardando estabilização e processamento da mídia...');
  await sleep(4500); 
  
  const sendBtn = await waitForFunction(() => {
    const icons = document.querySelectorAll(
      'span[data-icon="send"], ' +
      'span[data-icon="checkmark-medium"], ' +
      'span[data-icon="wds-ic-send-filled"], ' +
      'span[data-testid="wds-ic-send-filled"], ' +
      'span[data-icon="send-light"], ' +
      'div[aria-label^="Enviar"], ' +
      'div[aria-label^="Send"], ' +
      'div[aria-label*="item selecionado"], ' +
      'button[aria-label^="Enviar"], ' +
      'button[aria-label^="Send"], ' +
      '[data-testid="send"]'
    );
    for (let icon of icons) {
      let btn = icon.closest('div[role="button"]') || icon.closest('button') || icon;
      if (btn && (btn.offsetParent !== null || btn.getBoundingClientRect().width > 0)) {
         // Garante que não é o botão do footer
         if (!btn.closest('footer')) return btn;
      }
    }
    return null;
  }, 20, 'Botão Enviar Mídia');

  if (!sendBtn) {
    console.error('❌ [Cyborg] Botão enviar mídia não encontrado!');
    if (checkExtensionValid()) {
      chrome.runtime.sendMessage({ action: 'STEP_ERROR', error: 'Botão enviar mídia não encontrado' }).catch(() => { });
    }
    return;
  }
  
  console.log('🚀 [Cyborg] Clicando no botão de enviar mídia...');
  sendBtn.click();
  await sleep(4000);
}

async function handleAudioUpload(base64) {
  const success = await attachFileViaDrop(base64, 'audio');
  if (!success) {
    console.error('❌ [Cyborg] Falha ao carregar pré-visualização do áudio.');
    if (checkExtensionValid()) {
      chrome.runtime.sendMessage({ action: 'STEP_ERROR', error: 'Falha ao carregar pré-visualização do áudio.' }).catch(() => { });
    }
    return;
  }
  
  // ⏳ AGUARDA A ESTABILIZAÇÃO E PROCESSAMENTO DA NOTA DE VOZ
  console.log('⏳ [Cyborg] Aguardando estabilização da nota de voz...');
  await sleep(2500);
  
  const sendBtn = await waitForFunction(() => {
    // Para áudio PTT, o botão pode ter ícones específicos
    const icons = document.querySelectorAll(
      'span[data-icon="send"], ' +
      'span[data-icon="checkmark-medium"], ' +
      'span[data-icon="ptt-check-blue"], ' +
      'span[data-testid="send"], ' +
      'div[aria-label^="Enviar"], ' +
      'div[aria-label^="Send"], ' +
      'button[aria-label^="Enviar"], ' +
      'button[aria-label^="Send"]'
    );
    for (let icon of icons) {
      let btn = icon.closest('div[role="button"]') || icon.closest('button') || icon;
      if (btn && (btn.offsetParent !== null || btn.getBoundingClientRect().width > 0)) {
         if (!btn.closest('footer')) return btn;
      }
    }
    return null;
  }, 20, 'Botão Enviar Áudio');

  if (!sendBtn) {
    console.error('❌ [Cyborg] Botão enviar áudio não encontrado!');
    if (checkExtensionValid()) {
      chrome.runtime.sendMessage({ action: 'STEP_ERROR', error: 'Botão enviar áudio não encontrado' }).catch(() => { });
    }
    return;
  }
  
  console.log('🚀 [Cyborg] Clicando no botão de enviar áudio...');
  sendBtn.click();
  await sleep(3500);
}

// ==========================================
// 🛑 Observer Vigia (Captura os popups de Erro na mosca)
// ==========================================
const errorObserver = new MutationObserver(() => {
  if (!checkExtensionValid()) return;
  const modal = document.querySelector(SELECTORS.MODAL_ERROR);
  if (modal) {
     const text = modal.innerText.toLowerCase();
     if (text.includes('não está no whatsapp') || 
         text.includes('inválido') || 
         text.includes('invalid') || 
         text.includes('não é válido') || 
         text.includes('not valid') || 
         text.includes('não existe')) {
        
        const okBtn = Array.from(modal.querySelectorAll('button')).find(b => {
          const t = b.innerText.toUpperCase();
          return t.includes('OK') || t.includes('FECHAR') || t.includes('ENTENDI') || t.includes('CLOSE') || t.includes('DISMISS');
        }) || modal.querySelector('button');

        if (okBtn) {
           console.log('🤖 [Cyborg] Modal de número inválido detectado pelo Observer. Clicando no botão para fechar e pulando...');
           okBtn.click();
           currentTaskInvalid = true; // Avisa a navegação principal que deu ruim!
        }
     }
  }
});

errorObserver.observe(document.body, { childList: true, subtree: true });