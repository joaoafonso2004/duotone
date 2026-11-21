//! As notificações das mensagens (F5): o `notification:message` e o
//! `notification:unread` do `main.cjs`.
//!
//! - **Toasts do Windows** (WinRT) com o AUMID da identidade. Uma app sem pacote
//!   só os vê mostrados se o AUMID tiver um atalho no Menu Iniciar (a Preview não
//!   tem) ou estiver em `HKCU\Software\Classes\AppUserModelId\<AUMID>` com o nome
//!   e o ícone: regista-se no arranque (o nome é o `productName`, "Duotone Preview"
//!   na Preview, por isso nunca se confunde com a Duotone instalada).
//! - **Só com a janela sem foco.** O clique mostra a janela e abre a conversa
//!   (`notification:open` → `onNotificationClick`), enquanto a app estiver aberta.
//! - **Até 100 guardadas**; sem mensagens por ler saem todas, do ecrã e da central.
//! - O número no ícone da barra e o piscar vivem em `barra.rs`.

use std::sync::Mutex;

use serde_json::{json, Map, Value};
use sha1::{Digest, Sha1};
use tauri::{AppHandle, Manager, WebviewWindow};
use windows::core::HSTRING;
use windows::Data::Xml::Dom::XmlDocument;
use windows::Foundation::TypedEventHandler;
use windows::UI::Notifications::{ToastNotification, ToastNotificationManager};

const GRUPO: &str = "mensagens";
const MAXIMO: usize = 100;

static GUARDADAS: Mutex<Vec<(String, ToastNotification)>> = Mutex::new(Vec::new());

fn guardadas() -> std::sync::MutexGuard<'static, Vec<(String, ToastNotification)>> {
    GUARDADAS.lock().unwrap_or_else(|e| e.into_inner())
}

fn aumid() -> HSTRING {
    HSTRING::from(crate::canal::IDENTIFICADOR)
}

/// O PNG maior de um .ico (os do Tauri são todos PNG), para o ícone das notificações.
fn png_do_ico(ico: &[u8]) -> Option<&[u8]> {
    let n = u16::from_le_bytes(ico.get(4..6)?.try_into().ok()?) as usize;
    (0..n)
        .filter_map(|i| {
            let e = ico.get(6 + 16 * i..22 + 16 * i)?;
            let lado = if e[0] == 0 { 256 } else { e[0] as u32 };
            let tamanho = u32::from_le_bytes(e[8..12].try_into().ok()?) as usize;
            let inicio = u32::from_le_bytes(e[12..16].try_into().ok()?) as usize;
            let dados = ico.get(inicio..inicio.checked_add(tamanho)?)?;
            dados.starts_with(b"\x89PNG").then_some((lado, dados))
        })
        .max_by_key(|(lado, _)| *lado)
        .map(|(_, dados)| dados)
}

/// Texto para dentro do XML do toast.
fn escapar(texto: &str) -> String {
    texto.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&apos;")
}

fn cortar(texto: &str, maximo: usize) -> String {
    texto.chars().take(maximo).collect()
}

/// A mensagem que a página manda, validada: (id, título, corpo, a conversa a abrir).
fn mensagem_valida(m: &Value) -> Option<(String, String, String, Value)> {
    let id = m.get("id")?.as_str()?.to_string();
    let titulo = cortar(m.get("title")?.as_str()?, 100);
    let corpo = cortar(m.get("body")?.as_str()?, 300);
    let mut conversa = Map::new();
    for chave in ["friendId", "groupId"] {
        if let Some(v) = m.get(chave).and_then(Value::as_str) {
            conversa.insert(chave.into(), json!(cortar(v, 100)));
        }
    }
    Some((id, titulo, corpo, Value::Object(conversa)))
}

fn xml_do_toast(titulo: &str, corpo: &str) -> String {
    format!(
        r#"<toast><visual><binding template="ToastGeneric"><text>{}</text><text>{}</text></binding></visual></toast>"#,
        escapar(titulo),
        escapar(corpo)
    )
}

/// A etiqueta do toast (o Windows aceita até 64 caracteres): do id da mensagem.
fn etiqueta(id: &str) -> String {
    Sha1::digest(id.as_bytes()).iter().take(8).map(|b| format!("{b:02x}")).collect()
}

/// No arranque: o nome e o ícone do AUMID, para o Windows mostrar os toasts.
pub fn preparar(app: &AppHandle) {
    let nome = app.config().product_name.clone().unwrap_or_else(|| "Duotone".into());
    let icone = app.path().app_local_data_dir().ok().and_then(|pasta| {
        let png = png_do_ico(include_bytes!("../icons/icon.ico"))?;
        std::fs::create_dir_all(&pasta).ok()?;
        let f = pasta.join("notificacoes.png");
        std::fs::write(&f, png).ok()?;
        Some(f)
    });
    let chave = format!(r"Software\Classes\AppUserModelId\{}", crate::canal::IDENTIFICADOR);
    let mut r = crate::chaves::escrever_texto(&chave, "DisplayName", &nome);
    if let Some(f) = &icone {
        r = r.and(crate::chaves::escrever_texto(&chave, "IconUri", &f.display().to_string()));
    }
    if let Err(e) = r {
        crate::registo::linha(&format!("notificações: o AUMID não ficou registado ({e})"));
    }
}

/// Mostra o toast; o clique abre a conversa.
fn mostrar(app: &AppHandle, id: String, titulo: &str, corpo: &str, conversa: Value) -> windows::core::Result<()> {
    let xml = XmlDocument::new()?;
    xml.LoadXml(&HSTRING::from(xml_do_toast(titulo, corpo)))?;
    let toast = ToastNotification::CreateToastNotification(&xml)?;
    toast.SetTag(&HSTRING::from(etiqueta(&id)))?;
    toast.SetGroup(&HSTRING::from(GRUPO))?;
    let app_do_clique = app.clone();
    toast.Activated(&TypedEventHandler::new(move |_, _| {
        crate::mostrar_janela(&app_do_clique);
        if let Some(j) = app_do_clique.get_webview_window("main") {
            crate::ponte::entregar(&j, "notificacao:abrir", conversa.clone());
        }
        Ok(())
    }))?;
    let notificador = ToastNotificationManager::CreateToastNotifierWithId(&aumid())?;
    notificador.Show(&toast)?;
    let mut lista = guardadas();
    lista.push((id, toast));
    while lista.len() > MAXIMO {
        let (_, velha) = lista.remove(0);
        let _ = notificador.Hide(&velha);
    }
    Ok(())
}

/// Sem mensagens por ler: saem todas, do ecrã e da central de notificações.
fn tirar_todas() {
    let todas = std::mem::take(&mut *guardadas());
    if todas.is_empty() {
        return;
    }
    if let Ok(notificador) = ToastNotificationManager::CreateToastNotifierWithId(&aumid()) {
        for (_, toast) in &todas {
            let _ = notificador.Hide(toast);
        }
    }
    if let Ok(historia) = ToastNotificationManager::History() {
        let _ = historia.RemoveGroupWithId(&HSTRING::from(GRUPO), &aumid());
    }
}

fn da_janela_principal(janela: &WebviewWindow) -> Result<(), String> {
    if janela.label() == "main" { Ok(()) } else { Err("Pedido inválido.".into()) }
}

/// Uma mensagem nova com a janela sem foco (a página já decidiu que é para mostrar).
#[tauri::command]
pub fn notificacao_mensagem(app: AppHandle, janela: WebviewWindow, mensagem: Value) -> Result<(), String> {
    da_janela_principal(&janela)?;
    if janela.is_focused().unwrap_or(false) {
        return Ok(());
    }
    let Some((id, titulo, corpo, conversa)) = mensagem_valida(&mensagem) else { return Ok(()) };
    if guardadas().iter().any(|(i, _)| *i == id) {
        return Ok(());
    }
    let app_ = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Err(e) = mostrar(&app_, id, &titulo, &corpo, conversa) {
            crate::registo::linha(&format!("notificações: o toast falhou ({e})"));
        }
    });
    Ok(())
}

/// As mensagens por ler: o número na barra, o piscar e, a zero, os toasts fora.
#[tauri::command]
pub fn notificacao_por_ler(app: AppHandle, janela: WebviewWindow, count: Value, attention: Value) -> Result<(), String> {
    da_janela_principal(&janela)?;
    let n = count.as_u64().filter(|n| *n <= (1u64 << 53));
    if let (Some(n), Some(atencao)) = (n, attention.as_bool()) {
        crate::barra::mensagens_por_ler(&app, &janela, n.min(u32::MAX as u64) as u32, atencao);
    }
    if n == Some(0) {
        let _ = app.run_on_main_thread(tirar_todas);
    }
    Ok(())
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn o_icone_e_o_png_maior() {
        let png = png_do_ico(include_bytes!("../icons/icon.ico")).expect("o icon.ico tem PNGs");
        assert!(png.starts_with(b"\x89PNG"));
        // O IHDR diz 256 x 256.
        assert_eq!(u32::from_be_bytes(png[16..20].try_into().unwrap()), 256);
        assert_eq!(png_do_ico(b"lixo"), None);
        assert_eq!(png_do_ico(&[0, 0, 1, 0, 1, 0]), None, "uma entrada que não existe");
    }

    #[test]
    fn a_mensagem_validada_como_no_electron() {
        assert_eq!(mensagem_valida(&json!({ "id": 1, "title": "a", "body": "b" })), None);
        assert_eq!(mensagem_valida(&json!({ "id": "x", "title": "a" })), None);
        let (id, titulo, corpo, conversa) =
            mensagem_valida(&json!({ "id": "m1", "title": "é".repeat(150), "body": "b".repeat(400), "friendId": "f".repeat(150), "groupId": 3 })).unwrap();
        assert_eq!(id, "m1");
        assert_eq!(titulo.chars().count(), 100);
        assert_eq!(corpo.chars().count(), 300);
        assert_eq!(conversa, json!({ "friendId": "f".repeat(100) }), "só os ids em texto, cortados");
        assert_eq!(mensagem_valida(&json!({ "id": "m", "title": "", "body": "" })).unwrap().3, json!({}));
    }

    #[test]
    fn o_xml_nao_se_parte() {
        let xml = xml_do_toast("A & B <script>", "\"olá\" 'tu'");
        assert!(xml.contains("<text>A &amp; B &lt;script&gt;</text>"));
        assert!(xml.contains("<text>&quot;olá&quot; &apos;tu&apos;</text>"));
        assert_eq!(etiqueta("qualquer coisa").len(), 16);
        assert_eq!(etiqueta("a"), etiqueta("a"));
        assert_ne!(etiqueta("a"), etiqueta("b"));
    }

    /// Mostra um toast a sério com o AUMID da Preview e tira-o logo. Pede o AUMID
    /// registado (abrir a Preview uma vez). Correr à mão: `cargo test -- --ignored toast`.
    #[test]
    #[ignore]
    fn toast_de_verdade() {
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        let xml = XmlDocument::new().unwrap();
        xml.LoadXml(&HSTRING::from(xml_do_toast("Duotone Preview", "Teste das notificações (sai sozinho)"))).unwrap();
        let toast = ToastNotification::CreateToastNotification(&xml).unwrap();
        toast.SetTag(&HSTRING::from("teste")).unwrap();
        toast.SetGroup(&HSTRING::from("teste")).unwrap();
        ToastNotificationManager::CreateToastNotifierWithId(&aumid()).unwrap().Show(&toast).unwrap();
        std::thread::sleep(std::time::Duration::from_secs(3));
        let historia = ToastNotificationManager::History().unwrap();
        let n = historia.GetHistoryWithId(&aumid()).unwrap().Size().unwrap();
        historia.RemoveGroupWithId(&HSTRING::from("teste"), &aumid()).unwrap();
        assert!(n >= 1, "o Windows não guardou o toast (AUMID por registar?)");
    }
}
