//! Os comandos da ponte `window.duotoneDesktop` (F2) e os acontecimentos que o
//! Rust entrega à página. O lado da página é `ponte.js`. Cada comando novo tem de
//! entrar também no `build.rs` (AppManifest) e em `capabilities/default.json`.
//! Todos conferem que quem chama é a janela principal (o `daJanelaPrincipal`).

use std::{fs, path::PathBuf, sync::OnceLock, time::SystemTime};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, WebviewWindow};

/// O script da ponte, já com a origem da app.
pub fn script() -> String {
    include_str!("ponte.js").replace("__ORIGEM__", &format!("http://localhost:{}", crate::canal::PORTA))
}

/// Entrega um acontecimento à página (só ao frame principal).
pub fn entregar(janela: &WebviewWindow, nome: &str, dados: Value) {
    let js = format!("window.__duotoneEvento && window.__duotoneEvento({}, {})", json!(nome), dados);
    let _ = janela.eval(&js);
}

static INICIO: OnceLock<u128> = OnceLock::new();
pub fn marcar_inicio() {
    let _ = INICIO.set(SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0));
}

fn da_janela_principal(janela: &WebviewWindow) -> Result<(), String> {
    if janela.label() == "main" { Ok(()) } else { Err("Pedido inválido.".into()) }
}

fn ficheiro_da_janela(app: &AppHandle) -> Option<PathBuf> {
    let pasta = app.path().app_data_dir().ok()?;
    fs::create_dir_all(&pasta).ok()?;
    Some(pasta.join("windows-window.json"))
}

#[tauri::command]
pub fn janela_minimizar(janela: WebviewWindow) -> Result<(), String> {
    da_janela_principal(&janela)?;
    janela.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn janela_alternar_maximizar(janela: WebviewWindow) -> Result<(), String> {
    da_janela_principal(&janela)?;
    if janela.is_maximized().unwrap_or(false) { janela.unmaximize() } else { janela.maximize() }.map_err(|e| e.to_string())
}

/// Fechar. Até haver tabuleiro (F5) fecha a app de vez, mesmo com "fechar para o
/// tabuleiro" ligado: escondida sem ícone, ninguém a voltava a encontrar.
#[tauri::command]
pub fn janela_fechar(app: AppHandle, janela: WebviewWindow) -> Result<(), String> {
    da_janela_principal(&janela)?;
    crate::registo::linha("fechar (sem tabuleiro ainda: a app sai)");
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub fn janela_maximizada(janela: WebviewWindow) -> Result<bool, String> {
    da_janela_principal(&janela)?;
    janela.is_maximized().map_err(|e| e.to_string())
}

/// O `windows-window.json` de sempre: `{ closeToTray }`, ligado por omissão.
#[tauri::command]
pub fn fechar_para_tabuleiro_ler(app: AppHandle, janela: WebviewWindow) -> Result<bool, String> {
    da_janela_principal(&janela)?;
    let valor = ficheiro_da_janela(&app)
        .and_then(|f| fs::read_to_string(f).ok())
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .and_then(|v| v["closeToTray"].as_bool());
    Ok(valor.unwrap_or(true))
}

#[tauri::command]
pub fn fechar_para_tabuleiro_definir(app: AppHandle, janela: WebviewWindow, enabled: bool) -> Result<bool, String> {
    da_janela_principal(&janela)?;
    let f = ficheiro_da_janela(&app).ok_or("sem pasta de dados")?;
    fs::write(f, json!({ "closeToTray": enabled }).to_string()).map_err(|e| e.to_string())?;
    Ok(enabled)
}

/// Como na app não instalada do Electron: o arranque com o Windows não existe ainda (F5).
#[tauri::command]
pub fn arranque_ler(janela: WebviewWindow) -> Result<Value, String> {
    da_janela_principal(&janela)?;
    Ok(json!({ "available": false, "enabled": false, "mode": "tray" }))
}

/// Os incidentes da casca (F8 traz os do WebView2). Por agora: nenhum.
#[tauri::command]
pub fn saude_ler(janela: WebviewWindow) -> Result<Value, String> {
    da_janela_principal(&janela)?;
    Ok(json!({ "incidentes": [], "processoComecouEm": INICIO.get().copied().unwrap_or(0) }))
}

/// Segundos sem rato nem teclado no sistema inteiro (a presença dos amigos).
#[tauri::command]
pub fn segundos_sem_interacao(janela: WebviewWindow) -> Result<u64, String> {
    da_janela_principal(&janela)?;
    use windows::Win32::System::SystemInformation::GetTickCount;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    unsafe {
        if !GetLastInputInfo(&mut info).as_bool() {
            return Err("sem medida".into());
        }
        Ok((GetTickCount().wrapping_sub(info.dwTime) / 1000) as u64)
    }
}
