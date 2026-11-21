//! O WebView2 sem o que o Electron não tinha: atalhos do browser (F5, Ctrl+R,
//! Ctrl+F, Ctrl+P, Ctrl+Shift+I), barra de estado dos links, zoom e pinça,
//! gesto de recuar, sugestões de preenchimento, guardar palavras-passe, o menu
//! por omissão ("Inspect", "Reload"...) e as DevTools na build final.
//! O menu dos campos de texto (cortar, copiar, colar, ortografia) volta na F5.

/// Corre em TODOS os frames (é o que o wry faz desde a 0.51), por isso confere
/// primeiro que está no frame principal e na origem da app. Conta o arranque e
/// os erros ao registo da casca.
pub const SCRIPT_DO_ARRANQUE: &str = r#"(() => {
  if (window.top !== window || location.origin !== 'http://localhost:18082') return;
  const contar = (t) => { try { window.__TAURI_INTERNALS__.invoke('registo_da_pagina', { texto: String(t) }); } catch (e) {} };
  window.addEventListener('error', (e) => contar('erro: ' + e.message + ' @ ' + (e.filename || '') + ':' + (e.lineno || 0)));
  window.addEventListener('unhandledrejection', (e) => contar('promessa rejeitada: ' + (e.reason && (e.reason.message || e.reason))));
  document.addEventListener('DOMContentLoaded', () => {
    contar('DOMContentLoaded aos ' + Math.round(performance.now()) + ' ms');
    setTimeout(() => {
      const raiz = document.getElementById('root');
      contar('aos 4 s: ' + (raiz ? raiz.childElementCount : -1) + ' filhos no #root, título "' + document.title + '"');
    }, 4000);
  });
})();"#;

/// O "slowed" no IFrame de recurso (crossfade, Jam, seguir um amigo, falhas).
/// O Electron põe o `preservesPitch = false` no `<video>` do frame do YouTube por
/// fora (`PRESERVAR_TOM` no main.cjs); no Tauri não se injeta num frame já
/// aberto, e o `naoEsticarOTempo` da ponte só chegava ao `<audio>` do motor: a
/// 21/11 o João ouviu o lento ESTICADO (o tom igual) em vez de slowed (o tom a
/// descer, como uma fita). Este script corre só nesse frame, sem ponte nem
/// comandos: em cada vídeo que carrega, toca ou muda de velocidade, o tom
/// acompanha a velocidade.
pub fn script_do_frame_do_youtube() -> String {
    r#"(() => {
  if (window.top === window || !/(^|\.)youtube(-nocookie)?\.com$/.test(location.hostname)) return;
  const pai = location.ancestorOrigins && location.ancestorOrigins[location.ancestorOrigins.length - 1];
  if (pai !== '__ORIGEM__') return;
  const tom = (e) => {
    const v = e.target;
    if (v instanceof HTMLMediaElement && v.preservesPitch !== false) {
      v.preservesPitch = false;
      v.webkitPreservesPitch = false;
    }
  };
  for (const ev of ['loadstart', 'loadedmetadata', 'play', 'playing', 'ratechange']) document.addEventListener(ev, tom, true);
})();"#
        .replace("__ORIGEM__", &format!("http://localhost:{}", crate::canal::PORTA))
}

pub fn configurar(janela: &tauri::WebviewWindow) {
    let feito = janela.with_webview(|w| unsafe {
        use webview2_com::Microsoft::Web::WebView2::Win32::*;
        use windows::core::Interface;
        let Ok(nucleo) = w.controller().CoreWebView2() else { return };
        let Ok(s) = nucleo.Settings() else { return };
        let _ = s.SetIsStatusBarEnabled(false);
        let _ = s.SetIsZoomControlEnabled(false);
        let _ = s.SetAreDefaultContextMenusEnabled(false);
        if !cfg!(debug_assertions) {
            let _ = s.SetAreDevToolsEnabled(false);
        }
        if let Ok(s3) = s.cast::<ICoreWebView2Settings3>() {
            let _ = s3.SetAreBrowserAcceleratorKeysEnabled(false);
        }
        if let Ok(s4) = s.cast::<ICoreWebView2Settings4>() {
            let _ = s4.SetIsPasswordAutosaveEnabled(false);
            let _ = s4.SetIsGeneralAutofillEnabled(false);
        }
        if let Ok(s5) = s.cast::<ICoreWebView2Settings5>() {
            let _ = s5.SetIsPinchZoomEnabled(false);
        }
        if let Ok(s6) = s.cast::<ICoreWebView2Settings6>() {
            let _ = s6.SetIsSwipeNavigationEnabled(false);
        }
        // As capas e as fotos do Google vão SEM Referer (30/9 no Electron): com o da
        // app, o servidor delas responde 429 ao fim de poucas imagens. Só imagens e só
        // esses anfitriões; o resto (o IFrame do YouTube precisa do Referer) não muda.
        for filtro in [windows::core::w!("https://*.googleusercontent.com/*"), windows::core::w!("https://*.ggpht.com/*")] {
            let _ = nucleo.AddWebResourceRequestedFilter(filtro, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_IMAGE);
        }
        let manipulador = webview2_com::WebResourceRequestedEventHandler::create(Box::new(|_, args| {
            let Some(args) = args else { return Ok(()) };
            let pedido = args.Request()?;
            let mut uri = windows::core::PWSTR::null();
            pedido.Uri(&mut uri)?;
            let endereco = webview2_com::take_pwstr(uri);
            // O wry também recebe acontecimentos daqui (os protocolos dele): só as capas.
            if endereco.contains(".googleusercontent.com/") || endereco.contains(".ggpht.com/") {
                let _ = pedido.Headers()?.RemoveHeader(windows::core::w!("Referer"));
            }
            Ok(())
        }));
        let mut ficha = 0i64;
        let _ = nucleo.add_WebResourceRequested(&manipulador, &mut ficha);
    });
    if let Err(e) = feito {
        crate::registo::linha(&format!("WebView2 sem configurar: {e}"));
    }
}
