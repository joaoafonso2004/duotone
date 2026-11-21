// A casca do Duotone para Windows em Tauri. Fase F1 do plano (`.claude/planos/
// PLANO-TAURI.md`, fora do git): a janela, o servidor local, uma só instância, o
// registo e o WebView2 sem o que o Electron não tinha. A ponte `duotoneDesktop`
// é a F2; até lá a app corre como num browser.
//
// Enquanto for Preview, a identidade é a da Preview (canal.rs): corre ao lado da
// Duotone instalada sem lhe tocar. A identidade de produção entra na F9.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audio;
mod canal;
mod ponte;
mod rede;
mod registo;
mod servidor;
mod webview;

use std::{path::PathBuf, sync::Mutex};

use serde_json::json;
use tauri::{webview::PageLoadEvent, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

/// O último estado dito à página, para só avisar quando muda.
static ESTADO_DA_JANELA: Mutex<(Option<bool>, Option<&'static str>)> = Mutex::new((None, None));

/// Maximizada? Visível, minimizada ou escondida? Dito à página quando muda.
fn avisar_estado_da_janela(app: &tauri::AppHandle) {
    let Some(janela) = app.get_webview_window("main") else { return };
    let maximizada = janela.is_maximized().unwrap_or(false);
    let visibilidade = if !janela.is_visible().unwrap_or(true) || janela.is_minimized().unwrap_or(false) { "hidden" } else { "visible" };
    let mut estado = ESTADO_DA_JANELA.lock().unwrap();
    if estado.0 != Some(maximizada) {
        estado.0 = Some(maximizada);
        ponte::entregar(&janela, "janela:maximizada", json!(maximizada));
    }
    if estado.1 != Some(visibilidade) {
        estado.1 = Some(visibilidade);
        ponte::entregar(&janela, "janela:visibilidade", json!(visibilidade));
    }
}

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

/// Esconde a janela no tabuleiro (o X, com "fechar para o tabuleiro"): a música continua.
pub fn esconder_no_tabuleiro(app: &tauri::AppHandle) {
    if let Some(j) = app.get_webview_window("main") {
        let _ = j.hide();
    }
    avisar_estado_da_janela(app);
}

/// Volta a mostrar a janela (o ícone do tabuleiro, ou abrir a app outra vez).
fn mostrar_janela(app: &tauri::AppHandle) {
    if let Some(j) = app.get_webview_window("main") {
        let _ = j.unminimize();
        let _ = j.show();
        let _ = j.set_focus();
    }
    avisar_estado_da_janela(app);
}

/// O ícone do tabuleiro (F5), como o `createTray` do Electron: "Open Duotone" e
/// "Quit" no menu; um clique mostra ou esconde a janela. O mini leitor entra na F6.
fn criar_tabuleiro(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
    let Some(icone) = app.default_window_icon().cloned() else {
        registo::linha("tabuleiro: sem ícone, fica sem tabuleiro");
        return Ok(());
    };
    let abrir = MenuItem::with_id(app, "abrir", "Open Duotone", true, None::<&str>)?;
    let separador = PredefinedMenuItem::separator(app)?;
    let sair = MenuItem::with_id(app, "sair", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&abrir, &separador, &sair])?;
    TrayIconBuilder::with_id("principal")
        .icon(icone)
        .tooltip("Duotone")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, evento| match evento.id().as_ref() {
            "abrir" => mostrar_janela(app),
            "sair" => {
                registo::linha("sair pelo tabuleiro");
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tabuleiro, evento| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = evento {
                let app = tabuleiro.app_handle();
                let visivel = app.get_webview_window("main").map(|j| j.is_visible().unwrap_or(false) && !j.is_minimized().unwrap_or(false)).unwrap_or(false);
                if visivel { esconder_no_tabuleiro(app) } else { mostrar_janela(app) }
            }
        })
        .build(app)?;
    Ok(())
}

fn main() {
    registo::instalar_panico();
    ponte::marcar_inicio();
    // Antes de qualquer janela: o Windows encontra o atalho afixado e agrupa a
    // barra de tarefas por este id (o Tauri não o faz sozinho).
    canal::definir_aumid();
    registo::linha(&format!("arranque {} (porta {})", canal::IDENTIFICADOR, canal::PORTA));
    // A cache do áudio poda-se só aqui, no arranque (no iPhone, podar a meio fazia cair a app).
    audio::podar_cache();

    tauri::Builder::default()
        // Primeiro plugin: uma segunda instância sai aqui, antes de abrir a porta.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| mostrar_janela(app)))
        .invoke_handler(tauri::generate_handler![
            registo_da_pagina,
            ponte::janela_minimizar, ponte::janela_alternar_maximizar, ponte::janela_fechar, ponte::janela_maximizada,
            ponte::fechar_para_tabuleiro_ler, ponte::fechar_para_tabuleiro_definir,
            ponte::arranque_ler, ponte::saude_ler, ponte::segundos_sem_interacao,
            rede::yt_pesquisa, rede::ytmusic_pesquisa, rede::yt_mix, rede::yt_refrao, rede::ytmusic_artista, rede::ytmusic_radio, rede::ytmusic_letra,
            rede::catalogo_pedir, rede::supabase_pedir, rede::spotify_embed, rede::apple_playlist, rede::deezer_link,
            rede::innertube_pedir, rede::innertube_aquecer, rede::googlevideo_sondar, audio::audio_registar, audio::audio_adiantar, audio::audio_na_cache,
        ])
        .on_window_event(|janela, evento| {
            // O fechar do Windows (Alt+F4, a barra de tarefas) faz o mesmo que o X da app.
            if let WindowEvent::CloseRequested { api, .. } = evento {
                if janela.label() == "main" && ponte::fecha_para_o_tabuleiro(janela.app_handle()) {
                    api.prevent_close();
                    esconder_no_tabuleiro(janela.app_handle());
                    return;
                }
            }
            if matches!(evento, WindowEvent::Resized(_) | WindowEvent::Focused(_)) {
                avisar_estado_da_janela(janela.app_handle());
            }
        })
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
                // A ponte `window.duotoneDesktop` (F2), antes de qualquer script da app.
                .initialization_script(&ponte::script())
                // O tom acompanha a velocidade também no IFrame de recurso (o "slowed" do Electron).
                .initialization_script(&webview::script_do_frame_do_youtube())
                // Links para fora no browser; a janela da app nunca sai da origem dela.
                .on_new_window(|url, _| {
                    webview::abrir_fora(&url);
                    tauri::webview::NewWindowResponse::Deny
                })
                .on_navigation(|url| {
                    if webview::navegacao_da_app(url) { return true; }
                    webview::abrir_fora(url);
                    false
                })
                // Mostra-se no primeiro desenho da página, como o `ready-to-show`.
                .on_page_load(|janela, carga| {
                    if carga.event() == PageLoadEvent::Finished {
                        let _ = janela.show();
                        // Uma página recarregada começa sem saber: volta a dizer-se tudo.
                        *ESTADO_DA_JANELA.lock().unwrap() = (None, None);
                        avisar_estado_da_janela(janela.app_handle());
                    }
                })
                .build()?;
            webview::configurar(&janela);
            if let Err(e) = criar_tabuleiro(app) {
                registo::linha(&format!("tabuleiro falhou: {e}"));
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao correr o Duotone");
}
