(function() {
  console.log("🎤 [Cyborg] Webpack Hook ativado para PTT no MAIN world via Manifest...");
  
  function patchModule(exports) {
    if (!exports || typeof exports !== 'object') return;
    
    // Lista de funções que o WhatsApp usa para processar mídia e que podem conter a flag PTT
    const targets = ['prepRawMedia', 'createOpaqueDataForRawMedia', 'processRawAudio', 'prepareRawAudio'];
    
    targets.forEach(target => {
      try {
        if (exports[target] && typeof exports[target] === 'function') {
          const original = exports[target];
          
          // Verifica se a propriedade pode ser escrita ou redefinida
          const descriptor = Object.getOwnPropertyDescriptor(exports, target);
          if (descriptor && !descriptor.writable && !descriptor.configurable) {
            console.warn(`⚠️ [Cyborg] Propriedade ${target} não é editável no webpack exports.`);
            return;
          }
          
          const patchedFn = function(file, options) {
            // Se o arquivo for o nosso áudio gravado ou qualquer áudio vindo da extensão
            if (file && (file.name === "recorded_audio.ogg" || (file.type && file.type.includes("audio")))) {
              options = options || {};
              options.isPtt = true;
              options.asPtt = true;
              options.type = 'ptt';
              console.log(`🎯 [Cyborg] ${target}: Forçando modo PTT (Voz Gravada) para o áudio!`);
            }
            return original.call(this, file, options);
          };
          
          // Preserva propriedades estáticas anexadas à função original
          Object.keys(original).forEach(key => {
            try { patchedFn[key] = original[key]; } catch(e) {}
          });
          
          if (!descriptor || descriptor.writable) {
            exports[target] = patchedFn;
          } else if (descriptor.configurable) {
            Object.defineProperty(exports, target, {
              value: patchedFn,
              writable: true,
              configurable: true,
              enumerable: descriptor.enumerable
            });
          }
        }
      } catch (err) {
        console.error(`❌ [Cyborg] Erro ao aplicar patch em ${target}:`, err);
      }
    });
  }

  function applyHook(chunk) {
    const originalPush = chunk.push.bind(chunk);
    chunk.push = function(args) {
      const modules = args[1];
      for (const key in modules) {
        const originalFunc = modules[key];
        modules[key] = function(module, exports, require) {
          const result = originalFunc.apply(this, arguments);
          if (module.exports && typeof module.exports === 'object') {
            patchModule(module.exports);
            if (module.exports.default) patchModule(module.exports.default);
          }
          return result;
        };
      }
      return originalPush(args);
    };
    console.log("✅ [Cyborg] Webpack hook injetado com sucesso no ciclo de vida!");
  }

  // Interceptação ultra veloz por Getter/Setter no window
  if (window.webpackChunkwhatsapp_web_client) {
    applyHook(window.webpackChunkwhatsapp_web_client);
  } else {
    let rawChunk = undefined;
    Object.defineProperty(window, 'webpackChunkwhatsapp_web_client', {
      get: () => rawChunk,
      set: (val) => {
        rawChunk = val;
        applyHook(val);
      },
      configurable: true
    });
  }
})();
