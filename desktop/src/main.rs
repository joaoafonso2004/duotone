// A casca do Duotone para Windows em Tauri. Fase F1 do plano (`.claude/planos/
// PLANO-TAURI.md`, fora do git): a janela, o servidor local, uma só instância, o
// registo e o WebView2 sem o que o Electron não tinha. A ponte `duotoneDesktop`
// é a F2; até lá a app corre como num browser.
//
// Enquanto for Preview, a identidade é a da Preview (canal.rs): corre ao lado da
// Duotone instalada sem lhe tocar. A identidade de produção entra na F9.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod canal;
mod registo;
mod servidor;
mod webview;

use std::path::PathBuf;

use tauri::{webview::PageLoadEvent, Manager, WebviewUrl, WebviewWindowBuilder};

/// A página regista o arranque e os erros (o script em webview.rs). Só texto, cortado.
#[tauri::command]
fn registo_da_pagina(texto: String) {
    registo::linha(&format!("página: {}", texto.chars().take(500).collect::<String>()));
}

/// O `dist-web` que o servidor serve. Em desenvolvimento: `DUOTONE_WEB`, ou
/// `desktop/dist-web` ao lado do `target/`. (Embutido no .exe: F9.)
fn pasta_da_web() -> PathBuf {
    if let Ok(p) = std::env::var("DUOTONE_WEB") {
        return PathBuf::from(p);
    }
    let exe = std::env::current_exe().unwrap_or_default();
    exe.parent().and_then(|p| p.parent()).and_then(|p| p.parent()).map(|p| p.join("dist-web")).unwrap_or_else(|| PathBuf::from("dist-web"))
}

fn main() {
    registo::instalar_panico();
    // Antes de qualquer janela: o Windows encontra o atalho afixado e agrupa a
    // barra de tarefas por este id (o Tauri não o faz sozinho).
    canal::definir_aumid();
    registo::linha(&format!("arranque {} (porta {})", canal::IDENTIFICADOR, canal::PORTA));

    tauri::Builder::default()
        // Primeiro plugin: uma segunda instância sai aqui, antes de abrir a porta.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(j) = app.get_webview_window("main") {
                let _ = j.unminimize();
                let _ = j.show();
                let _ = j.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![registo_da_pagina])
        .setup(|app| {
            let web = pasta_da_web();
            registo::linha(&format!("web em {}", web.display()));
            if let Err(e) = servidor::arrancar(web, canal::PORTA) {
                registo::linha(&format!("porta ocupada: {e}"));
                canal::caixa_de_erro(&format!("A porta {} está a ser usada por outro programa. Fecha-o e abre o Duotone outra vez.", canal::PORTA));
                app.handle().exit(1);
                return Ok(());
            }
            let url = format!("http://localhost:{}/index.html", canal::PORTA);
            let janela = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url.parse().unwrap()))
                .title("Duotone")
                .inner_size(1440.0, 900.0)
                .min_inner_size(960.0, 640.0)
                .decorations(false)
                .visible(false)
                .background_color(tauri::window::Color(9, 9, 13, 255))
                .initialization_script(webview::SCRIPT_DO_ARRANQUE)
                // Mostra-se no primeiro desenho da página, como o `ready-to-show`.
                .on_page_load(|janela, carga| {
                    if carga.event() == PageLoadEvent::Finished {
                        let _ = janela.show();
                    }
                })
                .build()?;
            webview::configurar(&janela);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao correr o Duotone");
}
