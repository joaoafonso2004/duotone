//! O WebView2 sem o que o Electron não tinha: atalhos do browser (F5, Ctrl+R,
//! Ctrl+F, Ctrl+P, Ctrl+Shift+I), barra de estado dos links, zoom e pinça,
//! gesto de recuar, sugestões de preenchimento, guardar palavras-passe, o menu
//! por omissão ("Inspect", "Reload"...) e as DevTools na build final.
//! O menu dos campos de texto (cortar, copiar, colar, ortografia) voltou na F5.

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

/// A janela principal só navega dentro da app (o `will-navigate` do Electron).
pub fn navegacao_da_app(url: &tauri::Url) -> bool {
    let origem = format!("http://localhost:{}", crate::canal::PORTA);
    url.as_str() == "about:blank" || url.origin().ascii_serialization() == origem
}

/// Links para fora (F5): o `window.open` da app (Privacy, Donations, o site) e uma
/// navegação para fora abrem no browser por omissão, como o `shell.openExternal`
/// do Electron. Só http(s): nunca `file:`, `ms-settings:` nem outro protocolo.
pub fn abrir_fora(url: &tauri::Url) {
    if !matches!(url.scheme(), "http" | "https") {
        crate::registo::linha(&format!("link recusado ({}:)", url.scheme()));
        return;
    }
    use windows::core::{w, HSTRING};
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    unsafe {
        ShellExecuteW(None, w!("open"), &HSTRING::from(url.as_str()), None, None, SW_SHOWNORMAL);
    }
}

/// As teclas do modo limpo, pelo código virtual do Windows.
fn tecla_do_modo_limpo(codigo: u32) -> Option<&'static str> {
    match codigo {
        0x7A => Some("F11"),   // VK_F11
        0x1B => Some("Escape"), // VK_ESCAPE
        _ => None,
    }
}

pub fn configurar(janela: &tauri::WebviewWindow) {
    let (para_o_ecra, para_as_teclas) = (janela.clone(), janela.clone());
    let feito = janela.with_webview(move |w| unsafe {
        use webview2_com::Microsoft::Web::WebView2::Win32::*;
        use windows::core::Interface;
        let Ok(nucleo) = w.controller().CoreWebView2() else { return };
        let Ok(s) = nucleo.Settings() else { return };
        let _ = s.SetIsStatusBarEnabled(false);
        let _ = s.SetIsZoomControlEnabled(false);
        // O menu do Windows só nos campos de texto (cortar, copiar, colar, a
        // ortografia), como o `menuDoTexto.cjs` do Electron; no resto nenhum (os
        // menus da app são da página, que cancela o seu `contextmenu`). Sem o
        // ICoreWebView2_11 fica tudo desligado, como na F1.
        let mut menu_dos_campos = false;
        if let Ok(n11) = nucleo.cast::<ICoreWebView2_11>() {
            let filtro = webview2_com::ContextMenuRequestedEventHandler::create(Box::new(|_, args| {
                let Some(args) = args else { return Ok(()) };
                let mut editavel = windows::core::BOOL(0);
                args.ContextMenuTarget()?.IsEditable(&mut editavel)?;
                if !editavel.as_bool() {
                    args.SetHandled(true)?;
                }
                Ok(())
            }));
            let mut ficha = 0i64;
            menu_dos_campos = n11.add_ContextMenuRequested(&filtro, &mut ficha).is_ok();
        }
        let _ = s.SetAreDefaultContextMenusEnabled(menu_dos_campos);
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

        // A saúde (F8): um processo do WebView2 que morre fica nos incidentes, e a
        // página que morre recarrega-se (no máximo 3 vezes em 5 min, `saude.rs`),
        // como o `render-process-gone` do Electron. Presa: só se regista, como lá.
        let falhou = webview2_com::ProcessFailedEventHandler::create(Box::new(|nucleo, args| {
            let Some(args) = args else { return Ok(()) };
            let mut tipo = COREWEBVIEW2_PROCESS_FAILED_KIND::default();
            args.ProcessFailedKind(&mut tipo)?;
            let mut codigo = 0i32;
            if let Ok(a2) = args.cast::<ICoreWebView2ProcessFailedEventArgs2>() {
                let _ = a2.ExitCode(&mut codigo);
            }
            if tipo == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED {
                if crate::saude::renderer_morreu("render-process-exited", codigo) {
                    if let Some(n) = nucleo {
                        let _ = n.Reload();
                    }
                }
            } else if tipo == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE {
                crate::saude::registar(serde_json::json!({ "tipo": "bloqueio", "fatal": false, "onde": "janela", "motivo": "unresponsive" }));
            } else if tipo == COREWEBVIEW2_PROCESS_FAILED_KIND_GPU_PROCESS_EXITED {
                crate::saude::registar(serde_json::json!({ "tipo": "gpu", "fatal": false, "onde": "gpu", "motivo": "gpu-process-exited", "codigo": codigo }));
            } else if tipo == COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED {
                crate::saude::registar(serde_json::json!({ "tipo": "renderer", "fatal": true, "onde": "browser", "motivo": "browser-process-exited", "codigo": codigo }));
                crate::registo::linha(&format!("saúde: o WebView2 morreu ({codigo})"));
            }
            Ok(())
        }));
        let mut ficha_da_saude = 0i64;
        let _ = nucleo.add_ProcessFailed(&falhou, &mut ficha_da_saude);

        // O ecrã inteiro da página (o modo limpo, F11). O WebView2 só avisa: é a
        // janela que tem de ir a ecrã inteiro, o que o Electron fazia sozinho. Sem
        // isto, a capa enchia a janela mas a barra do Windows ficava à vista.
        let ecra = webview2_com::ContainsFullScreenElementChangedEventHandler::create(Box::new(move |nucleo, _| {
            let Some(n) = nucleo else { return Ok(()) };
            let mut cheio = windows::core::BOOL(0);
            n.ContainsFullScreenElement(&mut cheio)?;
            let _ = para_o_ecra.set_fullscreen(cheio.as_bool());
            Ok(())
        }));
        let mut ficha_do_ecra = 0i64;
        let _ = nucleo.add_ContainsFullScreenElementChanged(&ecra, &mut ficha_do_ecra);

        // O F11 e o Esc chegam à página mesmo com o foco dentro de um frame (o do
        // YouTube de recurso), como o `before-input-event` do Electron. A tecla
        // NÃO se consome: o Esc continua a fechar diálogos. Presa, só conta a 1.ª.
        let teclas = webview2_com::AcceleratorKeyPressedEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else { return Ok(()) };
            let mut tipo = COREWEBVIEW2_KEY_EVENT_KIND::default();
            args.KeyEventKind(&mut tipo)?;
            if tipo != COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN && tipo != COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN {
                return Ok(());
            }
            let mut estado = COREWEBVIEW2_PHYSICAL_KEY_STATUS::default();
            args.PhysicalKeyStatus(&mut estado)?;
            let mut tecla = 0u32;
            args.VirtualKey(&mut tecla)?;
            if let (false, Some(nome)) = (estado.WasKeyDown.as_bool(), tecla_do_modo_limpo(tecla)) {
                crate::ponte::entregar(&para_as_teclas, "modo-limpo:tecla", serde_json::json!(nome));
            }
            Ok(())
        }));
        let mut ficha_das_teclas = 0i64;
        let _ = w.controller().add_AcceleratorKeyPressed(&teclas, &mut ficha_das_teclas);
    });
    if let Err(e) = feito {
        crate::registo::linha(&format!("WebView2 sem configurar: {e}"));
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn as_teclas_do_modo_limpo() {
        assert_eq!(tecla_do_modo_limpo(0x7A), Some("F11"));
        assert_eq!(tecla_do_modo_limpo(0x1B), Some("Escape"));
        assert_eq!(tecla_do_modo_limpo(0x7B), None, "o F12 não");
        assert_eq!(tecla_do_modo_limpo(0x0D), None);
    }

    #[test]
    fn a_janela_so_navega_dentro_da_app() {
        let url = |s: &str| tauri::Url::parse(s).unwrap();
        assert!(navegacao_da_app(&url(&format!("http://localhost:{}/index.html", crate::canal::PORTA))));
        assert!(navegacao_da_app(&url("about:blank")));
        assert!(!navegacao_da_app(&url("http://localhost:1/index.html")), "outra porta é outra origem");
        assert!(!navegacao_da_app(&url("https://duotone.example/privacy")));
        assert!(!navegacao_da_app(&url(&format!("http://localhost.evil.com:{}/", crate::canal::PORTA))));
    }
}
