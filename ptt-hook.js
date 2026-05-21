(function() {
  console.log("🎤 [Cyborg] Webpack Hook ativado para PTT no MAIN world via Manifest...");
  
  function patchModule(exports) {
    if (exports && exports.prepRawMedia) {
      const originalPrep = exports.prepRawMedia;
      exports.prepRawMedia = function(file, options) {
        if (file && (file.name.includes("recorded_audio") || file.type.includes("audio"))) {
          options = options || {};
          options.isPtt = true;
          options.asPtt = true;
          console.log("🎯 [Cyborg] prepRawMedia: Forçando PTT para áudio!");
        }
        return originalPrep.call(this, file, options);
      };
    }
    if (exports && exports.createOpaqueDataForRawMedia) {
      const originalCreate = exports.createOpaqueDataForRawMedia;
      exports.createOpaqueDataForRawMedia = function(file, options) {
        if (file && (file.name.includes("recorded_audio") || file.type.includes("audio"))) {
          options = options || {};
          options.isPtt = true;
          options.asPtt = true;
          console.log("🎯 [Cyborg] createOpaqueDataForRawMedia: Forçando PTT para áudio!");
        }
        return originalCreate.call(this, file, options);
      };
    }
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
