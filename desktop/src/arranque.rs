//! "Start with Windows" (F5): o `electron/arranqueComWindows.cjs` mais o
//! `getStartup`/`startup:set` do `main.cjs`.
//!
//! - **O registo:** um valor no `Run` do HKCU com o nome da identidade, a dizer
//!   `"<exe>" --duotone-auto-start` (o mesmo formato que o Electron escreve). O
//!   Gestor de Tarefas desliga-o no `StartupApproved\Run` sem apagar o `Run`: um
//!   1.º byte ímpar é "desligado", e isso conta como desligado aqui também.
//! - **O ficheiro:** `windows-startup.json` na pasta de dados, `{ mode, decidido }`.
//!   Sem ele o modo é "window"; com ele, só "window" é "window" (o resto é "tray").
//! - **De origem:** a app instalada liga-o na 1.ª abertura, uma vez só (27/9).
//!   A Preview NUNCA o liga sozinha (correria ao lado da Duotone em cada arranque):
//!   só quem mexe na opção. E nunca lê nem escreve o valor da Duotone instalada.
//! - **Disponível** só no .exe de release, como o `app.isPackaged` do Electron.

use std::path::Path;

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, WebviewWindow};
use crate::chaves::{apagar, escrever, escrever_texto, ler_texto, ler_valor, REG_BINARY, RRF_RT_REG_BINARY};

pub const ARGUMENTO: &str = "--duotone-auto-start";
const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const APROVADO: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
/// Como o Electron: a app que se liga fica "aprovada" (1.º byte par).
const APROVADO_LIGADO: [u8; 12] = [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
/// O modo de origem: abre a janela (para as pessoas se lembrarem da app; João, 27/9).
const MODO_DE_ORIGEM: &str = "window";

/// A linha de comando do valor do `Run`.
pub fn comando(exe: &Path) -> String {
    format!("\"{}\" {ARGUMENTO}", exe.display())
}

/// O modo guardado (`startupMode` do Electron).
fn modo(guardado: Option<&Value>) -> &'static str {
    match guardado {
        None => MODO_DE_ORIGEM,
        Some(v) if v["mode"] == "window" => "window",
        Some(_) => "tray",
    }
}

/// O que gravar na 1.ª abertura (`arranqueAoAbrir`): só quando não há ficheiro.
fn ao_abrir(guardado: Option<&Value>) -> Option<Value> {
    match guardado {
        Some(v) if v.is_object() => None,
        _ => Some(json!({ "mode": MODO_DE_ORIGEM, "decidido": true })),
    }
}

/// O que gravar quando a pessoa muda a opção (`escolhaDaPessoa`).
fn escolha(modo: &str) -> Value {
    json!({ "mode": if modo == "window" { "window" } else { "tray" }, "decidido": true })
}

/// Ligado quando o `Run` aponta para ESTE .exe e o Gestor de Tarefas não o desligou.
fn ligado(valor: Option<&str>, aprovado: Option<&[u8]>, esperado: &str) -> bool {
    let aponta = valor.is_some_and(|v| v.trim().eq_ignore_ascii_case(esperado));
    let aprovado = aprovado.and_then(|b| b.first()).is_none_or(|b| b & 1 == 0);
    aponta && aprovado
}

// --- o registo (HKCU, `chaves.rs`), com a subchave por parâmetro para os testes não tocarem no Run ---

/// Está ligado no registo para este nome e esta linha de comando?
fn ligado_no_registo(run: &str, aprovado: &str, nome: &str, esperado: &str) -> bool {
    ligado(ler_texto(run, nome).as_deref(), ler_valor(aprovado, nome, RRF_RT_REG_BINARY).as_deref(), esperado)
}

/// Liga (o `Run` e "aprovado", como o `setLoginItemSettings`) ou desliga (apaga os dois).
fn gravar_no_registo(run: &str, aprovado: &str, nome: &str, comando: &str, ligar: bool) -> Result<(), String> {
    if ligar {
        escrever_texto(run, nome, comando)?;
        escrever(aprovado, nome, REG_BINARY.0, &APROVADO_LIGADO)
    } else {
        apagar(run, nome)?;
        apagar(aprovado, nome)
    }
}

// --- a app ---

fn disponivel() -> bool {
    !cfg!(debug_assertions)
}

fn ficheiro(app: &AppHandle) -> Option<std::path::PathBuf> {
    let pasta = app.path().app_data_dir().ok()?;
    std::fs::create_dir_all(&pasta).ok()?;
    Some(pasta.join("windows-startup.json"))
}

fn guardado(app: &AppHandle) -> Option<Value> {
    let texto = std::fs::read_to_string(ficheiro(app)?).ok()?;
    serde_json::from_str(&texto).ok()
}

fn exe() -> Result<std::path::PathBuf, String> {
    std::env::current_exe().map_err(|e| e.to_string())
}

fn estado(app: &AppHandle) -> Value {
    let disponivel = disponivel();
    let ligado = disponivel && exe().is_ok_and(|e| ligado_no_registo(RUN, APROVADO, crate::canal::IDENTIFICADOR, &comando(&e)));
    json!({ "available": disponivel, "enabled": ligado, "mode": modo(guardado(app).as_ref()) })
}

/// Arrancou pelo Windows com o modo "tray": a janela fica escondida no tabuleiro.
pub fn fica_no_tabuleiro(app: &AppHandle) -> bool {
    std::env::args().any(|a| a == ARGUMENTO) && modo(guardado(app).as_ref()) == "tray"
}

/// Na 1.ª abertura da app instalada, liga o arranque (uma vez só). Na Preview, nada.
pub fn aplicar_de_origem(app: &AppHandle) {
    if crate::canal::E_A_PREVIEW || !disponivel() {
        return;
    }
    let Some(gravar) = ao_abrir(guardado(app).as_ref()) else { return };
    let resultado = exe().and_then(|e| gravar_no_registo(RUN, APROVADO, crate::canal::IDENTIFICADOR, &comando(&e), true)).and_then(|_| {
        let f = ficheiro(app).ok_or("sem pasta de dados")?;
        std::fs::write(f, gravar.to_string()).map_err(|e| e.to_string())
    });
    match resultado {
        Ok(()) => crate::registo::linha("arranque com o Windows ligado de origem"),
        Err(e) => crate::registo::linha(&format!("arranque: não foi possível ligar de origem ({e})")),
    }
}

fn da_janela_principal(janela: &WebviewWindow) -> Result<(), String> {
    if janela.label() == "main" { Ok(()) } else { Err("Pedido inválido.".into()) }
}

#[tauri::command]
pub fn arranque_ler(app: AppHandle, janela: WebviewWindow) -> Result<Value, String> {
    da_janela_principal(&janela)?;
    Ok(estado(&app))
}

#[tauri::command]
pub fn arranque_definir(app: AppHandle, janela: WebviewWindow, enabled: bool, mode: String) -> Result<Value, String> {
    da_janela_principal(&janela)?;
    if mode != "window" && mode != "tray" {
        return Err("Pedido inválido.".into());
    }
    if !disponivel() {
        return Err("Disponível na aplicação instalada no Windows.".into());
    }
    let f = ficheiro(&app).ok_or("sem pasta de dados")?;
    std::fs::write(f, escolha(&mode).to_string()).map_err(|e| e.to_string())?;
    gravar_no_registo(RUN, APROVADO, crate::canal::IDENTIFICADOR, &comando(&exe()?), enabled)?;
    crate::registo::linha(&format!("arranque com o Windows: {} ({mode})", if enabled { "ligado" } else { "desligado" }));
    Ok(estado(&app))
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn as_regras_do_electron() {
        // arranqueAoAbrir: sem ficheiro liga a abrir a janela; com ficheiro manda a pessoa.
        assert_eq!(ao_abrir(None), Some(json!({ "mode": "window", "decidido": true })));
        assert_eq!(ao_abrir(Some(&json!({ "mode": "tray", "decidido": true }))), None);
        assert_eq!(ao_abrir(Some(&json!({ "mode": "window" }))), None, "quem já mexeu na opção não a vê voltar");
        // startupMode: sem ficheiro "window"; só "window" é "window".
        assert_eq!(modo(None), "window");
        assert_eq!(modo(Some(&json!({ "mode": "tray" }))), "tray");
        assert_eq!(modo(Some(&json!({ "mode": "window" }))), "window");
        assert_eq!(modo(Some(&json!({}))), "tray");
        // escolhaDaPessoa
        assert_eq!(escolha("window"), json!({ "mode": "window", "decidido": true }));
        assert_eq!(escolha("qualquer"), json!({ "mode": "tray", "decidido": true }));
    }

    #[test]
    fn a_linha_de_comando_e_a_do_electron() {
        // A que o Electron deixou no PC do João (21/11).
        let e = Path::new(r"C:\Users\Utilizador\AppData\Local\Programs\Duotone\Duotone.exe");
        assert_eq!(comando(e), r#""C:\Users\Utilizador\AppData\Local\Programs\Duotone\Duotone.exe" --duotone-auto-start"#);
    }

    #[test]
    fn ligado_so_se_aponta_para_este_exe_e_esta_aprovado() {
        let c = r#""C:\a\Duotone.exe" --duotone-auto-start"#;
        assert!(ligado(Some(c), None, c));
        assert!(ligado(Some(&c.to_uppercase()), None, c), "o Windows não distingue maiúsculas nos caminhos");
        assert!(!ligado(None, None, c));
        assert!(!ligado(Some(r#""C:\outro\Duotone.exe" --duotone-auto-start"#), None, c));
        assert!(ligado(Some(c), Some(&[2, 0, 0]), c));
        assert!(ligado(Some(c), Some(&[6, 0, 0]), c));
        assert!(!ligado(Some(c), Some(&[3, 0, 0]), c), "desligado no Gestor de Tarefas");
        assert!(!ligado(Some(c), Some(&[7, 0, 0]), c));
    }

    /// Escreve e lê no registo a sério, mas numa chave de teste (nunca no Run).
    #[test]
    fn ida_e_volta_no_registo() {
        use windows::core::HSTRING;
        use windows::Win32::System::Registry::{RegDeleteTreeW, HKEY_CURRENT_USER};
        let base = format!(r"Software\DuotoneTesteDoArranque{}", std::process::id());
        let (run, aprovado) = (format!(r"{base}\Run"), format!(r"{base}\Aprovado"));
        let nome = "com.joao.duotone.desktop.teste";
        let c = r#""C:\Programas\Duotone Ç\Duotone.exe" --duotone-auto-start"#;
        assert!(!ligado_no_registo(&run, &aprovado, nome, c));
        gravar_no_registo(&run, &aprovado, nome, c, true).unwrap();
        assert_eq!(ler_texto(&run, nome).as_deref(), Some(c), "o texto volta igual (acentos e espaços)");
        assert!(ligado_no_registo(&run, &aprovado, nome, c));
        // O Gestor de Tarefas desliga-o: o Run fica, o aprovado passa a ímpar.
        escrever(&aprovado, nome, REG_BINARY.0, &[3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).unwrap();
        assert!(!ligado_no_registo(&run, &aprovado, nome, c));
        // Ligar outra vez nas Definições volta a aprovar.
        gravar_no_registo(&run, &aprovado, nome, c, true).unwrap();
        assert!(ligado_no_registo(&run, &aprovado, nome, c));
        gravar_no_registo(&run, &aprovado, nome, c, false).unwrap();
        assert!(!ligado_no_registo(&run, &aprovado, nome, c));
        assert_eq!(ler_texto(&run, nome), None);
        // Desligar o que já não existe não é erro.
        gravar_no_registo(&run, &aprovado, nome, c, false).unwrap();
        unsafe { let _ = RegDeleteTreeW(HKEY_CURRENT_USER, &HSTRING::from(base.as_str())); }
        unsafe { let _ = windows::Win32::System::Registry::RegDeleteKeyW(HKEY_CURRENT_USER, &HSTRING::from(base.as_str())); }
    }
}
