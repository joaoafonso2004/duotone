//! A passagem do Electron (F10, secção 8 do plano). No 1.º arranque da Duotone em
//! Tauri, o que a versão ponte (6.2.0, `electron/exportacao.cjs`) exportou volta:
//!
//! - **O `localStorage`** (a sessão do Supabase e as preferências) entra por um
//!   script de arranque, ANTES de a página correr: a app abre já com a conta e
//!   tudo como estava. Só num perfil vazio (nunca por cima de dados da app nova)
//!   e só na origem da app. Se falhar a meio, limpa o que escreveu e tenta na
//!   abertura seguinte.
//! - **Os JSON da pasta de dados** (a janela e o arranque com o Windows; o mini
//!   leitor) passam tal e qual: a casca nova usa os mesmos nomes e formatos. Nunca
//!   por cima de um que já exista. Os atalhos não: saíram da casca nova.
//! - Depois de a página confirmar, uma marca (`migracao.json` na pasta de dados)
//!   diz que está feita, e o script deixa de entrar. O `%APPDATA%\Duotone` fica
//!   intacto (a volta atrás, e a limpeza duas versões depois).
//!
//! Só na Duotone de produção: a Preview nunca copia a sessão da instalada (o
//! Supabase roda os refresh tokens e podia terminar a sessão de lá). Numa build
//! de desenvolvimento, `DUOTONE_MIGRACAO_DE` aponta para uma pasta de ensaio (a
//! "pasta do Electron") e tudo o resto também vai para lá: o perfil do WebView2,
//! a marca e os JSON. A build de lançamento não tem esta troca.

use std::{
    fs,
    path::PathBuf,
    sync::{mpsc, Mutex},
    time::Duration,
};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, WebviewWindow};

const VERSAO: u64 = 1;
/// Os JSON que passam, e para que pasta: `true` = a de dados (roaming), `false` = a local.
const FICHEIROS: [(&str, bool); 3] = [("windows-window.json", true), ("windows-startup.json", true), ("mini-leitor.json", false)];

/// A exportação à espera de a página confirmar: quantas chaves, de que versão e de quando.
struct Pendente {
    chaves: usize,
    app: String,
    em: u64,
}
static PENDENTE: Mutex<Option<Pendente>> = Mutex::new(None);

pub fn origem_da_app() -> String {
    format!("http://localhost:{}", crate::canal::PORTA)
}

/// As mesmas regras do `exportacaoValida` do Electron, e a origem tem de ser a desta casca.
pub fn exportacao_valida(e: &Value, origem: &str) -> bool {
    let par = |p: &Value| p.as_array().is_some_and(|a| a.len() == 2 && a[0].is_string() && a[1].is_string());
    e.get("versao").and_then(Value::as_u64) == Some(VERSAO)
        && e.get("origem").and_then(Value::as_str) == Some(origem)
        && e.get("em").and_then(Value::as_f64).is_some_and(f64::is_finite)
        && e.get("localStorage").and_then(Value::as_array).is_some_and(|l| !l.is_empty() && l.iter().all(par))
        && e.get("ficheiros").is_some_and(Value::is_object)
}

/// O script de arranque que repõe o `localStorage`. Só no frame principal e na
/// origem da app; só num perfil vazio; e uma vez por sessão (o `sessionStorage`
/// sobrevive a um recarregar, não a fechar a app). O resultado fica em
/// `window.__duotoneMigracao` para o Rust confirmar.
pub fn script_de(entradas: &Value, origem: &str) -> String {
    format!(
        r#"(() => {{
  if (window.top !== window || location.origin !== {origem}) return;
  try {{
    if (sessionStorage.getItem('__duotone_migracao')) {{ window.__duotoneMigracao = JSON.parse(sessionStorage.getItem('__duotone_migracao')); return; }}
    let estado;
    if (localStorage.length > 0) {{
      estado = {{ estado: 'ja-tinha', chaves: localStorage.length }};
    }} else {{
      const e = {entradas};
      try {{
        for (const [k, v] of e) localStorage.setItem(k, v);
      }} catch (erro) {{
        localStorage.clear();
        throw erro;
      }}
      estado = {{ estado: 'reposta', chaves: e.length }};
    }}
    sessionStorage.setItem('__duotone_migracao', JSON.stringify(estado));
    window.__duotoneMigracao = estado;
  }} catch (erro) {{
    window.__duotoneMigracao = {{ estado: 'erro', erro: String((erro && erro.message) || erro).slice(0, 200) }};
  }}
}})();"#,
        origem = json!(origem),
        entradas = entradas
    )
}

// --- as pastas ---

/// A pasta de ensaio de uma build de desenvolvimento (`DUOTONE_MIGRACAO_DE`).
fn ensaio() -> Option<PathBuf> {
    #[cfg(debug_assertions)]
    if let Some(p) = std::env::var_os("DUOTONE_MIGRACAO_DE") {
        return Some(PathBuf::from(p));
    }
    None
}

/// A pasta de dados do Electron (`%APPDATA%\Duotone`), de onde vem a exportação.
fn pasta_do_electron() -> Option<PathBuf> {
    if let Some(p) = ensaio() {
        return Some(p);
    }
    if crate::canal::E_A_PREVIEW {
        return None;
    }
    std::env::var_os("APPDATA").map(|a| PathBuf::from(a).join("Duotone"))
}

/// O perfil do WebView2 da janela principal: o de sempre, ou o da pasta de ensaio.
pub fn perfil_de_ensaio() -> Option<PathBuf> {
    ensaio().map(|p| p.join("perfil-tauri"))
}

fn pasta_de_dados(app: &AppHandle, roaming: bool) -> Option<PathBuf> {
    if let Some(p) = ensaio() {
        return Some(p.join(if roaming { "dados-tauri" } else { "local-tauri" }));
    }
    if roaming { app.path().app_data_dir().ok() } else { app.path().app_local_data_dir().ok() }
}

fn marca(app: &AppHandle) -> Option<PathBuf> {
    pasta_de_dados(app, true).map(|p| p.join("migracao.json"))
}

/// Copia os JSON que existem na exportação e ainda não existem na casca nova.
/// Devolve os nomes copiados.
pub fn copiar_ficheiros(ficheiros: &Value, para: impl Fn(bool) -> Option<PathBuf>) -> Vec<&'static str> {
    let mut copiados = Vec::new();
    for (nome, roaming) in FICHEIROS {
        let Some(conteudo) = ficheiros.get(nome).filter(|v| v.is_object()) else { continue };
        let Some(pasta) = para(roaming) else { continue };
        let destino = pasta.join(nome);
        if destino.exists() || fs::create_dir_all(&pasta).is_err() {
            continue;
        }
        if fs::write(&destino, conteudo.to_string()).is_ok() {
            copiados.push(nome);
        }
    }
    copiados
}

// --- a app ---

/// No arranque, antes de a janela existir: o script que repõe o `localStorage`, se
/// houver uma passagem por fazer. Os JSON copiam-se já aqui (antes de os módulos os lerem).
pub fn preparar(app: &AppHandle) -> Option<String> {
    let electron = pasta_do_electron()?;
    let marca = marca(app)?;
    if marca.exists() {
        return None;
    }
    // A cópia que o instalador pôs a salvo antes de retirar o Electron (ganchos.nsh),
    // e a do próprio Electron: a boa mais recente.
    let origem = origem_da_app();
    let candidatas = [pasta_de_dados(app, true).map(|p| p.join("migracao").join("exportacao.json")), Some(electron.join("migracao").join("exportacao.json"))];
    let mut lidas = 0;
    let mut melhor: Option<(String, Value)> = None;
    for ficheiro in candidatas.into_iter().flatten() {
        let Ok(texto) = fs::read_to_string(&ficheiro) else { continue };
        lidas += 1;
        let e: Value = serde_json::from_str(&texto).unwrap_or(Value::Null);
        if exportacao_valida(&e, &origem) && melhor.as_ref().is_none_or(|(_, m)| e["em"].as_f64() > m["em"].as_f64()) {
            melhor = Some((texto, e));
        }
    }
    let Some((texto, exportacao)) = melhor else {
        crate::registo::linha(if lidas == 0 {
            "migração: sem exportação do Electron (nada a repor)"
        } else {
            "migração: a exportação do Electron não serve (versão, origem ou conteúdo)"
        });
        return None;
    };
    let entradas = &exportacao["localStorage"];
    let chaves = entradas.as_array().map(Vec::len).unwrap_or(0);
    let app_do_electron = exportacao["app"].as_str().unwrap_or("?").to_string();
    let em = exportacao["em"].as_f64().unwrap_or(0.0) as u64;
    let copiados = copiar_ficheiros(&exportacao["ficheiros"], |roaming| pasta_de_dados(app, roaming));
    crate::registo::linha(&format!(
        "migração: exportação da {app_do_electron} com {chaves} chaves ({} KB); ficheiros copiados: {}",
        texto.len() / 1024,
        if copiados.is_empty() { "nenhum".to_string() } else { copiados.join(", ") }
    ));
    *PENDENTE.lock().unwrap_or_else(|e| e.into_inner()) = Some(Pendente { chaves, app: app_do_electron, em });
    Some(script_de(entradas, &origem))
}

/// Depois de a página carregar: lê o que o script fez e, se as chaves estão lá,
/// grava a marca. Corre numa thread à parte (espera pela página).
pub fn confirmar(janela: &WebviewWindow) {
    let Some(pendente) = PENDENTE.lock().unwrap_or_else(|e| e.into_inner()).take() else { return };
    let Some(marca) = marca(janela.app_handle()) else { return };
    let janela = janela.clone();
    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel::<String>();
        let pedido = janela.with_webview(move |w| unsafe {
            let Ok(nucleo) = w.controller().CoreWebView2() else { return };
            let fim = webview2_com::ExecuteScriptCompletedHandler::create(Box::new(move |_, resultado| {
                let _ = tx.send(resultado);
                Ok(())
            }));
            let _ = nucleo.ExecuteScript(windows::core::w!("JSON.stringify(window.__duotoneMigracao || null)"), &fim);
        });
        let resposta = if pedido.is_ok() { rx.recv_timeout(Duration::from_secs(10)).ok() } else { None };
        // O ExecuteScript devolve o valor em JSON: aqui, um texto com JSON lá dentro.
        let estado: Value = resposta
            .and_then(|r| serde_json::from_str::<Value>(&r).ok())
            .and_then(|v| v.as_str().and_then(|s| serde_json::from_str(s).ok()))
            .unwrap_or(Value::Null);
        match estado["estado"].as_str() {
            Some(como @ ("reposta" | "ja-tinha")) => {
                let n = estado["chaves"].as_u64().unwrap_or(0);
                if let Some(p) = marca.parent() {
                    let _ = fs::create_dir_all(p);
                }
                let gravada = fs::write(&marca, json!({ "feita": crate::saude::agora(), "como": como, "chaves": n, "exportadas": pendente.chaves, "app": pendente.app, "exportadaEm": pendente.em }).to_string()).is_ok();
                crate::registo::linha(&format!("migração: {como}, {n} chaves (exportadas {}); marca {}", pendente.chaves, if gravada { "gravada" } else { "NÃO gravada" }));
            }
            Some("erro") => crate::registo::linha(&format!("migração: a página não conseguiu repor ({}); tenta na abertura seguinte", estado["erro"].as_str().unwrap_or("?"))),
            _ => crate::registo::linha("migração: a página não respondeu; tenta na abertura seguinte"),
        }
    });
}

#[cfg(test)]
mod testes {
    use super::*;

    fn boa() -> Value {
        json!({ "versao": 1, "app": "6.2.0", "em": 1_800_000_000_000u64, "origem": "http://localhost:18081",
                "localStorage": [["sb-sessao", "{\"a\":1}"], ["duotone:prefs", "x"]], "ficheiros": { "windows-window.json": { "closeToTray": false } } })
    }

    #[test]
    fn so_uma_exportacao_boa_e_desta_origem() {
        let o = "http://localhost:18081";
        assert!(exportacao_valida(&boa(), o));
        assert!(!exportacao_valida(&boa(), "http://localhost:18082"), "a de outra origem (a Preview, ou o Electron em desenvolvimento) não");
        for (campo, valor) in [("versao", json!(2)), ("localStorage", json!([])), ("localStorage", json!([["k"]])), ("localStorage", json!([["k", 1]])), ("ficheiros", json!([])), ("em", json!("ontem"))] {
            let mut e = boa();
            e[campo] = valor.clone();
            assert!(!exportacao_valida(&e, o), "{campo} = {valor}");
        }
        assert!(!exportacao_valida(&Value::Null, o));
    }

    #[test]
    fn o_script_so_repoe_num_perfil_vazio_e_desfaz_uma_falha() {
        let s = script_de(&boa()["localStorage"], "http://localhost:18081");
        assert!(s.contains(r#"location.origin !== "http://localhost:18081""#), "só na origem da app");
        assert!(s.contains("window.top !== window"), "só no frame principal");
        assert!(s.contains("if (localStorage.length > 0)"), "nunca por cima de dados da app nova");
        assert!(s.contains("localStorage.clear();\n        throw erro;"), "uma falha a meio não fica a meio");
        assert!(s.contains(r#"[["sb-sessao","{\"a\":1}"],["duotone:prefs","x"]]"#), "as chaves como JSON");
        // Um valor com aspas, barras ou fins de linha não parte o script.
        let estranho = script_de(&json!([["k", "a\"b\\c\n</script>\u{2028}"]]), "http://localhost:18081");
        assert!(estranho.contains(r#"[["k","a\"b\\c\n</script>"#));
    }

    #[test]
    fn os_ficheiros_passam_sem_pisar_os_que_ja_existem() {
        let raiz = std::env::temp_dir().join(format!("duotone-migracao-{}", std::process::id()));
        let _ = fs::remove_dir_all(&raiz);
        let (dados, local) = (raiz.join("dados"), raiz.join("local"));
        fs::create_dir_all(&dados).unwrap();
        fs::write(dados.join("windows-startup.json"), r#"{"ja":"estava"}"#).unwrap();
        let ficheiros = json!({
            "windows-window.json": { "closeToTray": false },
            "windows-startup.json": { "mode": "tray" },
            "mini-leitor.json": { "escala": 1.2 },
            "atalhos.json": { "tocar": "Ctrl+Alt+P" },
        });
        let copiados = copiar_ficheiros(&ficheiros, |roaming| Some(if roaming { dados.clone() } else { local.clone() }));
        assert_eq!(copiados, vec!["windows-window.json", "mini-leitor.json"]);
        assert_eq!(fs::read_to_string(dados.join("windows-startup.json")).unwrap(), r#"{"ja":"estava"}"#, "o que já existe fica");
        assert_eq!(fs::read_to_string(local.join("mini-leitor.json")).unwrap(), r#"{"escala":1.2}"#, "o mini na pasta local");
        assert!(!dados.join("atalhos.json").exists() && !local.join("atalhos.json").exists(), "os atalhos saíram da casca nova");
        let _ = fs::remove_dir_all(&raiz);
    }
}
