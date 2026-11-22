//! A conta do Spotify no PC (F7), porta do `electron/contaDoSpotify.cjs` (o porquê
//! está lá: a API oficial do Spotify só deixa entrar 5 contas). A biblioteca lê-se
//! como o leitor web do próprio Spotify a lê (o método do ytspot).
//!
//! - **Entrar:** uma janela com o login do Spotify, numa pasta de dados SÓ dela
//!   (`%LOCALAPPDATA%\<id>\spotify`, o `persist:spotify` do Electron). Fecha-se
//!   sozinha quando aparece um `sp_dc` novo, ou quando chega ao leitor já com ele.
//!   O "Continuar com o Google" não entra (o Google recusa janelas embutidas):
//!   avisa-se o que fazer, como no Electron.
//! - **O token:** uma cópia escondida e calada do leitor web, aberta só quando é
//!   preciso, faz os pedidos dela ao `api-partner.spotify.com`, e daí copiam-se os
//!   cabeçalhos (`authorization`, `client-token`) pelo `WebResourceResponseReceived`.
//!   Não se imita o TOTP do Spotify: quem tira o token é o leitor.
//! - **As consultas:** pelo reqwest, com os hashes lidos do script do leitor (os de
//!   `CONSULTAS` se essa leitura falhar).
//!
//! O que promete (o mesmo do Electron): o `sp_dc` e o token NUNCA saem do Rust (a
//! página da app só recebe as respostas); só correm as consultas de `CONSULTAS`,
//! todas de leitura; nada corre até a pessoa carregar no botão; as janelas só
//! existem enquanto se entra ou se lê. As janelas do Spotify não estão na
//! capability (só a "main"): a ACL recusa-lhes qualquer comando.
//!
//! Sem testes ao vivo contra o Spotify (memória `duotone-spotify-leitor-web`):
//! as regras testam-se com respostas falsas, e quem prova com a conta é o João.

use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU32, Ordering},
        mpsc, Arc, Mutex, OnceLock,
    },
    time::{Duration, Instant},
};

use serde_json::{json, Value};
use tauri::{
    webview::{NewWindowFeatures, NewWindowResponse, PageLoadEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent, Wry,
};

/// As consultas que a app pode pedir, todas de leitura, com os hashes que o leitor
/// tinha a 8/11/2026 (os mesmos do `contaDoSpotify.cjs`).
pub const CONSULTAS: [(&str, &str); 4] = [
    ("profileAttributes", "08ffb4730af3746e04a8301396f20875dbbce10c75243803091a9274eacc8ac0"),
    ("libraryV3", "390c78e5b951029bad359785e69b07b536a509c581cbcd0aded5e5067f187455"),
    ("fetchLibraryTracks", "087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240"),
    ("fetchPlaylist", "21ea11a6ac75a5f3e01fd365d29c18e0a4a8b7dc09f89bbb5d73910190c6acaf"),
];

/// O token copiado usa-se 40 min (o do leitor dura uma hora).
const VIDA_DO_TOKEN: Duration = Duration::from_secs(40 * 60);
const ESPERA_PELO_TOKEN: Duration = Duration::from_secs(30);
const ESPERA_POR_CONSULTA: Duration = Duration::from_secs(20);
const LOGIN: &str = "spotify-entrar";
const LEITOR: &str = "spotify-leitor";
const LIMPAR: &str = "spotify-limpar";

/// Os endereços. Numa build de desenvolvimento, `DUOTONE_SPOTIFY_FALSO` troca-os
/// por um servidor local (o ensaio sem conta e sem pedidos ao Spotify); a build de
/// lançamento não tem esta troca.
struct Enderecos {
    aberto: String,
    login: String,
    pathfinder: String,
    api: String,
}

fn enderecos() -> &'static Enderecos {
    static E: OnceLock<Enderecos> = OnceLock::new();
    E.get_or_init(|| {
        #[cfg(debug_assertions)]
        if let Ok(base) = std::env::var("DUOTONE_SPOTIFY_FALSO") {
            let base = base.trim_end_matches('/').to_string();
            return Enderecos {
                aberto: format!("{base}/"),
                login: format!("{base}/login"),
                pathfinder: format!("{base}/pathfinder/v2/query"),
                api: format!("{base}/pathfinder/"),
            };
        }
        Enderecos {
            aberto: "https://open.spotify.com/".into(),
            login: "https://accounts.spotify.com/login?continue=https%3A%2F%2Fopen.spotify.com%2F".into(),
            pathfinder: "https://api-partner.spotify.com/pathfinder/v2/query".into(),
            api: "https://api-partner.spotify.com/".into(),
        }
    })
}

fn agora_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

// --- a pasta e a marca de "ligada" ---

static PASTA: OnceLock<PathBuf> = OnceLock::new();

/// No arranque: a pasta de dados do Spotify (não se cria aqui).
pub fn preparar(app: &AppHandle) {
    if let Ok(d) = app.path().app_local_data_dir() {
        let _ = PASTA.set(d.join("spotify"));
    }
}

fn pasta() -> Result<PathBuf, String> {
    PASTA.get().cloned().ok_or_else(|| "sem pasta".into())
}

/// A marca de "ligada": quando se entrou e até quando o `sp_dc` vale. Ler o
/// cookie obrigava a abrir um WebView2 (um processo do browser) só para isso; o
/// Electron lia-o da sessão sem janela. Uma conta que o Spotify esqueça dá
/// "desligado" na consulta, e a app di-lo (igual ao Electron com um cookie velho).
fn marca() -> Option<PathBuf> {
    PASTA.get().map(|p| p.join("conta.json"))
}

pub fn conta_valida(marca: &Value, agora: u64) -> bool {
    marca.get("entrou").and_then(Value::as_u64).is_some()
        && marca.get("ate").and_then(Value::as_u64).is_none_or(|ate| ate > agora)
}

fn ligada() -> bool {
    let Some(f) = marca() else { return false };
    let Ok(texto) = fs::read_to_string(f) else { return false };
    conta_valida(&serde_json::from_str(&texto).unwrap_or(Value::Null), agora_ms())
}

fn gravar_marca(ate: Option<u64>) {
    let (Ok(p), Some(f)) = (pasta(), marca()) else { return };
    let _ = fs::create_dir_all(p);
    let _ = fs::write(f, json!({ "entrou": agora_ms(), "ate": ate }).to_string());
}

// --- o Google ---

/// O "Continuar com o Google" (11/11): o Google recusa entrar dentro de apps.
pub fn do_google(url: &str) -> bool {
    static PADRAO: OnceLock<regex::Regex> = OnceLock::new();
    PADRAO.get_or_init(|| regex::Regex::new(r"(?i)^https://accounts\.google\.[a-z.]+/").unwrap()).is_match(url)
}

static AVISO_ABERTO: AtomicBool = AtomicBool::new(false);

/// Diz o que fazer, como o `avisarDoGoogle` do Electron. Numa thread à parte: a
/// caixa tem o seu ciclo de mensagens e não se abre dentro de um acontecimento do WebView2.
fn avisar_do_google() {
    if AVISO_ABERTO.swap(true, Ordering::SeqCst) {
        return;
    }
    crate::registo::linha("spotify: o Google não entra dentro da app (aviso)");
    std::thread::spawn(|| {
        use windows::core::{w, HSTRING};
        use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONINFORMATION, MB_OK, MB_SETFOREGROUND, MB_TOPMOST};
        let texto = "Google doesn't allow signing in inside apps.\n\nType the email of your Google account in the Spotify login and choose to log in with a code. Spotify emails you a code, and no password is needed.";
        unsafe {
            MessageBoxW(None, &HSTRING::from(texto), w!("Log in to Spotify"), MB_OK | MB_ICONINFORMATION | MB_SETFOREGROUND | MB_TOPMOST);
        }
        AVISO_ABERTO.store(false, Ordering::SeqCst);
    });
}

// --- entrar ---

struct Login {
    vez: u32,
    janela: WebviewWindow,
    popups: Vec<WebviewWindow>,
    esperas: Vec<mpsc::Sender<bool>>,
}

static ENTRADA: Mutex<Option<Login>> = Mutex::new(None);
static VEZES: AtomicU32 = AtomicU32::new(0);
/// Uma janela de login a ser criada de cada vez.
static A_CRIAR: Mutex<()> = Mutex::new(());

fn entrada() -> std::sync::MutexGuard<'static, Option<Login>> {
    ENTRADA.lock().unwrap_or_else(|e| e.into_inner())
}

/// Fecha o login (e os popups dele) e responde a quem esperava. `ate`: até quando o `sp_dc` vale.
fn acabar(vez: u32, ok: bool, ate: Option<u64>) {
    let login = {
        let mut e = entrada();
        if e.as_ref().is_none_or(|l| l.vez != vez) {
            return;
        }
        e.take()
    };
    let Some(login) = login else { return };
    if ok {
        // Uma conta nova: o token da anterior já não serve.
        *acesso() = None;
        gravar_marca(ate);
    }
    crate::registo::linha(&format!("spotify: login {}", if ok { "feito" } else { "fechado antes de entrar" }));
    for p in &login.popups {
        let _ = p.destroy();
    }
    let _ = login.janela.destroy();
    for tx in login.esperas {
        let _ = tx.send(ok);
    }
}

/// O `sp_dc` desta janela (o valor e até quando vale), lido FORA da thread principal
/// (no WebView2 a leitura dos cookies pendura dentro de um acontecimento).
fn sp_dc(janela: &WebviewWindow) -> Option<(String, Option<u64>)> {
    let url = enderecos().aberto.parse().ok()?;
    let cookies = janela.cookies_for_url(url).ok()?;
    let c = cookies.into_iter().find(|c| c.name() == "sp_dc" && !c.value().is_empty())?;
    let ate = c.expires_datetime().map(|t| (t.unix_timestamp().max(0) as u64) * 1000);
    Some((c.value().to_string(), ate))
}

/// Um popup do login ("Continuar com a Apple/o Facebook"), no mesmo ambiente do
/// WebView2 (a mesma sessão); fecha com o login. O do Google não abre.
fn popup(app: &AppHandle, url: tauri::Url, janelas: NewWindowFeatures) -> NewWindowResponse<Wry> {
    if do_google(url.as_str()) {
        avisar_do_google();
        return NewWindowResponse::Deny;
    }
    if url.scheme() != "https" {
        return NewWindowResponse::Deny;
    }
    let rotulo = format!("spotify-popup-{}", VEZES.fetch_add(1, Ordering::SeqCst));
    let Ok(em_branco) = "about:blank".parse() else { return NewWindowResponse::Deny };
    let feito = WebviewWindowBuilder::new(app, rotulo, WebviewUrl::External(em_branco))
        .window_features(janelas)
        .title("Log in to Spotify")
        .inner_size(480.0, 700.0)
        .on_navigation(|u| {
            if do_google(u.as_str()) {
                avisar_do_google();
                return false;
            }
            true
        })
        .build();
    match feito {
        Ok(janela) => {
            if let Some(l) = entrada().as_mut() {
                l.popups.push(janela.clone());
            }
            NewWindowResponse::Create { window: janela }
        }
        Err(_) => NewWindowResponse::Deny,
    }
}

/// Abre o login do Spotify; responde `true` quando entrou, `false` se a janela
/// fechou antes. Carregar outra vez traz a mesma janela para a frente.
fn entrar(app: &AppHandle) -> Result<mpsc::Receiver<bool>, String> {
    let _uma_de_cada_vez = A_CRIAR.lock().unwrap_or_else(|e| e.into_inner());
    let (tx, rx) = mpsc::channel();
    if let Some(l) = entrada().as_mut() {
        let _ = l.janela.set_focus();
        l.esperas.push(tx);
        return Ok(rx);
    }
    let vez = VEZES.fetch_add(1, Ordering::SeqCst);
    let url = enderecos().login.parse().map_err(|_| "endereço".to_string())?;
    let app_dos_popups = app.clone();
    let mut construtor = WebviewWindowBuilder::new(app, LOGIN, WebviewUrl::External(url))
        .title("Log in to Spotify")
        .inner_size(480.0, 760.0)
        .background_color(tauri::window::Color(18, 18, 18, 255))
        .data_directory(pasta()?)
        .on_navigation(|u| {
            // Navegar para o Google na mesma janela (ou ser redirecionado) também se trava.
            if do_google(u.as_str()) {
                avisar_do_google();
                return false;
            }
            true
        })
        .on_new_window(move |u, janelas| popup(&app_dos_popups, u, janelas))
        .on_page_load(move |janela, carga| {
            // Já com sessão o cookie não muda e o login segue direto para o leitor:
            // chegar lá com o `sp_dc` também é ter entrado.
            if carga.event() != PageLoadEvent::Finished || !carga.url().as_str().starts_with(&enderecos().aberto) {
                return;
            }
            std::thread::spawn(move || {
                if let Some((_, ate)) = sp_dc(&janela) {
                    acabar(vez, true, ate);
                }
            });
        });
    if let Some(principal) = app.get_webview_window("main") {
        construtor = construtor.parent(&principal).map_err(|e| e.to_string())?;
    }
    let janela = construtor.build().map_err(|e| e.to_string())?;
    janela.on_window_event(move |e| {
        if let WindowEvent::Destroyed = e {
            acabar(vez, false, None);
        }
    });
    *entrada() = Some(Login { vez, janela: janela.clone(), popups: Vec::new(), esperas: vec![tx] });
    crate::registo::linha("spotify: login aberto");
    // O `changed` dos cookies do Electron: um `sp_dc` NOVO (diferente do que já lá
    // estava ao abrir) é ter entrado. Um velho que o Spotify recusa não fecha a janela.
    std::thread::spawn(move || {
        let antes = sp_dc(&janela).map(|(v, _)| v);
        loop {
            std::thread::sleep(Duration::from_millis(800));
            if entrada().as_ref().is_none_or(|l| l.vez != vez) {
                return;
            }
            if let Some((valor, ate)) = sp_dc(&janela) {
                if antes.as_deref() != Some(valor.as_str()) {
                    acabar(vez, true, ate);
                    return;
                }
            }
        }
    });
    Ok(rx)
}

// --- o token ---

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Falha {
    Desligado,
    Rede,
    Ocupado,
    Mudou,
    Recusado,
}

impl Falha {
    pub fn nome(self) -> &'static str {
        match self {
            Falha::Desligado => "desligado",
            Falha::Rede => "rede",
            Falha::Ocupado => "ocupado",
            Falha::Mudou => "mudou",
            Falha::Recusado => "recusado",
        }
    }
}

/// Os cabeçalhos do leitor e os hashes das consultas.
pub struct Acesso {
    quando: Instant,
    pub cabecalhos: Vec<(String, String)>,
    pub hashes: HashMap<String, String>,
}

static ACESSO: Mutex<Option<Arc<Acesso>>> = Mutex::new(None);
/// Um só pedido de token de cada vez: várias consultas que veem o token caducar partilham o novo.
static A_AUTORIZAR: Mutex<()> = Mutex::new(());

fn acesso() -> std::sync::MutexGuard<'static, Option<Arc<Acesso>>> {
    ACESSO.lock().unwrap_or_else(|e| e.into_inner())
}

/// Os cabeçalhos que vão nas consultas, dos que o leitor mandou.
pub fn cabecalhos_do_leitor(lidos: &HashMap<String, String>, aberto: &str) -> Vec<(String, String)> {
    let mut fora: Vec<(String, String)> = Vec::new();
    for nome in ["authorization", "client-token", "spotify-app-version", "app-platform", "user-agent", "accept-language"] {
        let valor = lidos.get(nome).cloned().unwrap_or_else(|| match nome {
            "app-platform" => "WebPlayer".into(),
            "accept-language" => "en".into(),
            _ => String::new(),
        });
        // Um cabeçalho vazio não vai (o Electron mandava-o vazio; o reqwest não manda nenhum).
        if !valor.is_empty() {
            fora.push((nome.into(), valor));
        }
    }
    let origem = aberto.trim_end_matches('/').to_string();
    fora.push(("content-type".into(), "application/json;charset=UTF-8".into()));
    fora.push(("accept".into(), "application/json".into()));
    fora.push(("origin".into(), origem));
    fora.push(("referer".into(), aberto.into()));
    fora
}

/// Os hashes do script do leitor (`"fetchPlaylist","query","<64 hex>"`), por cima dos guardados.
pub fn hashes_do_script(js: &str) -> HashMap<String, String> {
    let mut hashes: HashMap<String, String> = CONSULTAS.iter().map(|(n, h)| (n.to_string(), h.to_string())).collect();
    for (nome, _) in CONSULTAS {
        let padrao = format!(r#""{nome}","query","([0-9a-f]{{64}})""#);
        if let Some(achado) = regex::Regex::new(&padrao).ok().and_then(|r| r.captures(js)).map(|c| c[1].to_string()) {
            hashes.insert(nome.to_string(), achado);
        }
    }
    hashes
}

/// `/web-player/web-player.<hex>.js`: o script de onde se leem os hashes.
pub fn e_o_script_do_leitor(url: &str) -> bool {
    static PADRAO: OnceLock<regex::Regex> = OnceLock::new();
    PADRAO.get_or_init(|| regex::Regex::new(r"/web-player/web-player\.[0-9a-f]+\.js$").unwrap()).is_match(url.split('?').next().unwrap_or(url))
}

fn cliente() -> Result<reqwest::blocking::Client, Falha> {
    reqwest::blocking::Client::builder().timeout(ESPERA_POR_CONSULTA).build().map_err(|_| Falha::Rede)
}

/// Limpa dados do perfil desta janela (SÓ das janelas do Spotify, na pasta dele) e
/// espera que acabe. `tudo`: a conta inteira (o "sair"); senão só a cache.
fn limpar(janela: &WebviewWindow, tudo: bool) {
    if !janela.label().starts_with("spotify-") {
        return; // nunca o perfil da app: lá estão os dados do utilizador
    }
    let (tx, rx) = mpsc::channel::<()>();
    let pedido = janela.with_webview(move |w| unsafe {
        use webview2_com::Microsoft::Web::WebView2::Win32::*;
        use windows::core::Interface;
        let perfil = w.controller().CoreWebView2().and_then(|n| n.cast::<ICoreWebView2_13>()).and_then(|n| n.Profile()).and_then(|p| p.cast::<ICoreWebView2Profile2>());
        let Ok(perfil) = perfil else {
            let _ = tx.send(());
            return;
        };
        let feito = tx.clone();
        let fim = webview2_com::ClearBrowsingDataCompletedHandler::create(Box::new(move |_| {
            let _ = feito.send(());
            Ok(())
        }));
        let r = if tudo {
            perfil.ClearBrowsingDataAll(&fim)
        } else {
            perfil.ClearBrowsingData(COREWEBVIEW2_BROWSING_DATA_KINDS_DISK_CACHE | COREWEBVIEW2_BROWSING_DATA_KINDS_CACHE_STORAGE, &fim)
        };
        if r.is_err() {
            let _ = tx.send(());
        }
    });
    if pedido.is_ok() {
        let _ = rx.recv_timeout(Duration::from_secs(10));
    }
}

/// Abre a cópia escondida do leitor e espera pelos cabeçalhos de um pedido dele à API.
fn autorizar(app: &AppHandle) -> Result<Acesso, Falha> {
    let e = enderecos();
    let em_branco = "about:blank".parse().map_err(|_| Falha::Rede)?;
    let janela = WebviewWindowBuilder::new(app, LEITOR, WebviewUrl::External(em_branco))
        .visible(false)
        .skip_taskbar(true)
        .focused(false)
        .data_directory(pasta().map_err(|_| Falha::Rede)?)
        .on_navigation(|u| !do_google(u.as_str()))
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .build()
        .map_err(|_| Falha::Rede)?;
    let (tx, rx) = mpsc::channel::<Result<HashMap<String, String>, Falha>>();
    let script = Arc::new(Mutex::new(String::new()));
    let (do_script, api) = (script.clone(), e.api.clone());
    let preparado = janela.with_webview(move |w| unsafe {
        use webview2_com::Microsoft::Web::WebView2::Win32::*;
        use windows::core::{Interface, PWSTR};
        let Ok(nucleo) = w.controller().CoreWebView2() else { return };
        // Calada, e sem imagens, vídeo nem letra: ninguém vê esta página.
        if let Ok(n8) = nucleo.cast::<ICoreWebView2_8>() {
            let _ = n8.SetIsMuted(true);
        }
        if let Ok(ambiente) = nucleo.cast::<ICoreWebView2_2>().and_then(|n2| n2.Environment()) {
            for contexto in [COREWEBVIEW2_WEB_RESOURCE_CONTEXT_IMAGE, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_MEDIA, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FONT] {
                let _ = nucleo.AddWebResourceRequestedFilter(windows::core::w!("*"), contexto);
            }
            let cortar = webview2_com::WebResourceRequestedEventHandler::create(Box::new(move |_, args| {
                let Some(args) = args else { return Ok(()) };
                let mut contexto = COREWEBVIEW2_WEB_RESOURCE_CONTEXT::default();
                args.ResourceContext(&mut contexto)?;
                if [COREWEBVIEW2_WEB_RESOURCE_CONTEXT_IMAGE, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_MEDIA, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FONT].contains(&contexto) {
                    let resposta = ambiente.CreateWebResourceResponse(None, 403, windows::core::w!("Blocked"), windows::core::w!(""))?;
                    args.SetResponse(&resposta)?;
                }
                Ok(())
            }));
            let mut ficha = 0i64;
            let _ = nucleo.add_WebResourceRequested(&cortar, &mut ficha);
        }
        // Os pedidos que o leitor fez, já com os cabeçalhos que a rede lhes pôs.
        let tx_cabecalhos = tx.clone();
        let respostas = webview2_com::WebResourceResponseReceivedEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else { return Ok(()) };
            let pedido = args.Request()?;
            let mut uri = PWSTR::null();
            pedido.Uri(&mut uri)?;
            let endereco = webview2_com::take_pwstr(uri);
            if e_o_script_do_leitor(&endereco) {
                *do_script.lock().unwrap_or_else(|e| e.into_inner()) = endereco.clone();
            }
            if !endereco.starts_with(&api) {
                return Ok(());
            }
            let cabecalhos = pedido.Headers()?;
            let mut lidos = HashMap::new();
            for nome in ["authorization", "client-token", "spotify-app-version", "app-platform", "user-agent", "accept-language"] {
                let nome_w = windows::core::HSTRING::from(nome);
                let mut tem = windows::core::BOOL(0);
                if cabecalhos.Contains(&nome_w, &mut tem).is_ok() && tem.as_bool() {
                    let mut valor = PWSTR::null();
                    if cabecalhos.GetHeader(&nome_w, &mut valor).is_ok() {
                        lidos.insert(nome.to_string(), webview2_com::take_pwstr(valor));
                    }
                }
            }
            if lidos.get("authorization").is_some_and(|v| !v.is_empty()) && lidos.get("client-token").is_some_and(|v| !v.is_empty()) {
                let _ = tx_cabecalhos.send(Ok(lidos));
            }
            Ok(())
        }));
        if let Ok(n2) = nucleo.cast::<ICoreWebView2_2>() {
            let mut ficha = 0i64;
            let _ = n2.add_WebResourceResponseReceived(&respostas, &mut ficha);
        }
        // A página do leitor que não carrega (o "did-fail-load" do Electron).
        let tx_falha = tx.clone();
        let carregou = webview2_com::NavigationCompletedEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else { return Ok(()) };
            let mut ok = windows::core::BOOL(0);
            args.IsSuccess(&mut ok)?;
            let mut estado = COREWEBVIEW2_WEB_ERROR_STATUS::default();
            args.WebErrorStatus(&mut estado)?;
            if !ok.as_bool() && estado != COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED {
                let _ = tx_falha.send(Err(Falha::Rede));
            }
            Ok(())
        }));
        let mut ficha = 0i64;
        let _ = nucleo.add_NavigationCompleted(&carregou, &mut ficha);
    });
    let foi = preparado.is_ok() && e.aberto.parse::<tauri::Url>().is_ok_and(|url| janela.navigate(url).is_ok());
    let lidos = if foi { rx.recv_timeout(ESPERA_PELO_TOKEN).unwrap_or(Err(Falha::Rede)) } else { Err(Falha::Rede) };
    let script = script.lock().unwrap_or_else(|e| e.into_inner()).clone();
    // Os scripts do leitor só voltam a ser precisos na próxima leitura.
    limpar(&janela, false);
    let _ = janela.destroy();
    let lidos = lidos?;
    let hashes = if script.is_empty() {
        hashes_do_script("")
    } else {
        cliente().ok().and_then(|c| c.get(&script).send().ok()).and_then(|r| r.text().ok()).map(|js| hashes_do_script(&js)).unwrap_or_else(|| hashes_do_script(""))
    };
    crate::registo::linha(&format!("spotify: token do leitor copiado ({} hashes do script)", if script.is_empty() { "sem" } else { "com" }));
    Ok(Acesso { quando: Instant::now(), cabecalhos: cabecalhos_do_leitor(&lidos, &e.aberto), hashes })
}

// --- as consultas ---

/// O que fazer com uma resposta do pathfinder (as regras do `consultar` do Electron).
#[derive(Debug, PartialEq)]
pub enum Passo {
    /// 401 pela 1.ª vez: um token novo e repete-se.
    Renovar,
    /// Ocupado ou a cair: espera-se e repete-se.
    Esperar(Duration),
    /// Saiu um leitor novo: um token novo traz os hashes do script novo.
    Reler,
    Falhou(Falha),
    Dados(Value),
}

/// `n`: a tentativa (a partir de 1); `renovado` e `reler`: se já se fez uma vez.
pub fn decidir(estado: u16, retry_after: Option<f64>, corpo: Option<Value>, n: u32, renovado: bool, reler: bool) -> Passo {
    if estado == 401 && !renovado {
        return Passo::Renovar;
    }
    if (estado == 429 || estado >= 500) && n < 6 {
        let segundos = retry_after.filter(|s| *s > 0.0).unwrap_or(2f64.powi(n as i32)).min(30.0);
        return Passo::Esperar(Duration::from_secs_f64(segundos));
    }
    if estado == 429 {
        return Passo::Falhou(Falha::Ocupado);
    }
    if estado == 401 {
        return Passo::Falhou(Falha::Desligado);
    }
    if !(200..400).contains(&estado) {
        return Passo::Falhou(if estado >= 500 { Falha::Ocupado } else { Falha::Recusado });
    }
    let Some(json) = corpo else { return Passo::Falhou(Falha::Rede) };
    let erro = json.pointer("/errors/0/message").and_then(Value::as_str).unwrap_or("").to_string();
    if erro.to_lowercase().contains("persistedquerynotfound") {
        return if reler { Passo::Falhou(Falha::Mudou) } else { Passo::Reler };
    }
    let sem_me = json.pointer("/data/me").is_none_or(Value::is_null);
    let erro_min = erro.to_lowercase();
    if !erro.is_empty() && (erro_min.contains("not authorized") || erro_min.contains("unauthorized")) && sem_me {
        return Passo::Falhou(Falha::Desligado);
    }
    // Uma resposta só com erros (uma parcial ainda traz dados) não é uma biblioteca vazia.
    let sem_dados = json.get("data").is_none_or(|d| d.is_null() || d == &Value::Bool(false));
    if !erro.is_empty() && sem_dados {
        return Passo::Falhou(Falha::Recusado);
    }
    Passo::Dados(json.get("data").cloned().unwrap_or(Value::Null))
}

/// Uma resposta da rede: o estado, o `retry-after` e o corpo (se era JSON).
pub type Resposta = (u16, Option<f64>, Option<Value>);

/// A consulta, com o token e a rede trocáveis (para os testes).
pub fn consultar_com(
    nome: &str,
    variaveis: &Value,
    mut autorizado: impl FnMut() -> Result<Arc<Acesso>, Falha>,
    mut esquecer: impl FnMut(&Arc<Acesso>),
    mut enviar: impl FnMut(&Acesso, &Value) -> Result<Resposta, ()>,
    mut esperar: impl FnMut(Duration),
) -> Value {
    let falhou = |f: Falha| json!({ "ok": false, "falha": f.nome() });
    if !CONSULTAS.iter().any(|(n, _)| *n == nome) {
        return falhou(Falha::Recusado);
    }
    let (mut renovado, mut reler) = (false, false);
    for n in 1u32.. {
        let a = match autorizado() {
            Ok(a) => a,
            Err(f) => return falhou(f),
        };
        let hash = a.hashes.get(nome).cloned().unwrap_or_default();
        let corpo = json!({ "variables": variaveis, "operationName": nome, "extensions": { "persistedQuery": { "version": 1, "sha256Hash": hash } } });
        let Ok((estado, depois, json)) = enviar(&a, &corpo) else {
            if n >= 4 {
                return falhou(Falha::Rede);
            }
            esperar(Duration::from_millis(1000 * n as u64));
            continue;
        };
        match decidir(estado, depois, json, n, renovado, reler) {
            Passo::Renovar => {
                renovado = true;
                esquecer(&a);
            }
            Passo::Esperar(d) => esperar(d),
            Passo::Reler => {
                reler = true;
                esquecer(&a);
            }
            Passo::Falhou(f) => return falhou(f),
            Passo::Dados(d) => return json!({ "ok": true, "dados": d }),
        }
    }
    falhou(Falha::Rede)
}

fn autorizado(app: &AppHandle) -> Result<Arc<Acesso>, Falha> {
    let _uma_de_cada_vez = A_AUTORIZAR.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(a) = acesso().clone().filter(|a| a.quando.elapsed() < VIDA_DO_TOKEN) {
        return Ok(a);
    }
    // Uma falha não fica guardada: a próxima consulta tenta de novo.
    let novo = Arc::new(autorizar(app)?);
    *acesso() = Some(novo.clone());
    Ok(novo)
}

fn consultar(app: &AppHandle, nome: &str, variaveis: &Value) -> Value {
    let cliente = match cliente() {
        Ok(c) => c,
        Err(f) => return json!({ "ok": false, "falha": f.nome() }),
    };
    consultar_com(
        nome,
        variaveis,
        || autorizado(app),
        |a| {
            let mut g = acesso();
            if g.as_ref().is_some_and(|x| Arc::ptr_eq(x, a)) {
                *g = None;
            }
        },
        |a, corpo| {
            let mut pedido = cliente.post(&enderecos().pathfinder).body(corpo.to_string());
            for (k, v) in &a.cabecalhos {
                pedido = pedido.header(k.as_str(), v.as_str());
            }
            let r = pedido.send().map_err(|_| ())?;
            let estado = r.status().as_u16();
            let depois = r.headers().get("retry-after").and_then(|v| v.to_str().ok()).and_then(|v| v.trim().parse::<f64>().ok());
            Ok((estado, depois, r.json::<Value>().ok()))
        },
        std::thread::sleep,
    )
}

// --- sair ---

/// Esquece a conta: o cookie, a cache e o token. A pasta do Spotify não se apaga
/// (o WebView2 tranca-a enquanto o processo dele vive): limpa-se por dentro.
fn sair(app: &AppHandle) {
    if let Some(vez) = entrada().as_ref().map(|l| l.vez) {
        acabar(vez, false, None);
    }
    *acesso() = None;
    if let Some(f) = marca() {
        let _ = fs::remove_file(f);
    }
    let Ok(p) = pasta() else { return };
    if !p.join("EBWebView").exists() {
        return; // nunca ligado: abrir um WebView2 aqui criava a pasta
    }
    let Ok(em_branco) = "about:blank".parse() else { return };
    let Ok(janela) = WebviewWindowBuilder::new(app, LIMPAR, WebviewUrl::External(em_branco))
        .visible(false)
        .skip_taskbar(true)
        .focused(false)
        .data_directory(p)
        .build()
    else {
        return;
    };
    limpar(&janela, true);
    let _ = janela.destroy();
    crate::registo::linha("spotify: conta esquecida");
}

// --- os comandos (só a janela principal) ---

fn da_janela_principal(janela: &WebviewWindow) -> Result<(), String> {
    if janela.label() == "main" { Ok(()) } else { Err("Pedido inválido.".into()) }
}

/// O que chega da página: um nome da lista e um objeto pequeno (como o `main.cjs`).
pub fn pedido_valido(nome: &str, variaveis: &Value) -> bool {
    CONSULTAS.iter().any(|(n, _)| *n == nome) && variaveis.is_object() && variaveis.to_string().len() <= 4000
}

async fn noutra_thread<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn spotify_ligado(janela: WebviewWindow) -> Result<bool, String> {
    da_janela_principal(&janela)?;
    Ok(ligada())
}

#[tauri::command]
pub async fn spotify_entrar(janela: WebviewWindow) -> Result<bool, String> {
    da_janela_principal(&janela)?;
    let rx = entrar(janela.app_handle())?;
    noutra_thread(move || rx.recv().unwrap_or(false)).await
}

#[tauri::command]
pub async fn spotify_sair(janela: WebviewWindow) -> Result<(), String> {
    da_janela_principal(&janela)?;
    let app = janela.app_handle().clone();
    noutra_thread(move || sair(&app)).await
}

#[tauri::command]
pub async fn spotify_consultar(janela: WebviewWindow, nome: Value, variaveis: Value) -> Result<Value, String> {
    da_janela_principal(&janela)?;
    let Some(nome) = nome.as_str().map(str::to_string).filter(|n| pedido_valido(n, &variaveis)) else {
        return Ok(json!({ "ok": false, "falha": "recusado" }));
    };
    let app = janela.app_handle().clone();
    noutra_thread(move || consultar(&app, &nome, &variaveis)).await
}

/// O ensaio sem conta (só em desenvolvimento, com `DUOTONE_SPOTIFY_FALSO` a apontar
/// para um servidor local): ligada? → entrar → uma consulta → sair → ligada?
#[cfg(debug_assertions)]
pub fn ensaio(app: &AppHandle) {
    if std::env::var("DUOTONE_SPOTIFY_FALSO").is_err() || std::env::var("DUOTONE_ENSAIO_SPOTIFY").is_err() {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(3));
        crate::registo::linha(&format!("ensaio spotify: ligada antes = {}", ligada()));
        let entrou = entrar(&app).map(|rx| rx.recv_timeout(Duration::from_secs(60)).unwrap_or(false));
        crate::registo::linha(&format!("ensaio spotify: entrou = {entrou:?}; ligada = {}", ligada()));
        let r1 = consultar(&app, "fetchPlaylist", &json!({ "uri": "spotify:playlist:x", "offset": 0, "limit": 1 }));
        crate::registo::linha(&format!("ensaio spotify: 1.ª consulta = {r1}"));
        let r2 = consultar(&app, "profileAttributes", &json!({}));
        crate::registo::linha(&format!("ensaio spotify: 2.ª consulta = {r2}"));
        crate::registo::linha(&format!("ensaio spotify: recusada = {}", consultar(&app, "deleteThing", &json!({}))));
        sair(&app);
        crate::registo::linha(&format!("ensaio spotify: ligada depois de sair = {}", ligada()));
    });
}

#[cfg(test)]
mod testes {
    use super::*;

    fn acesso_de_teste(token: &str) -> Arc<Acesso> {
        let mut lidos = HashMap::new();
        lidos.insert("authorization".to_string(), format!("Bearer {token}"));
        lidos.insert("client-token".to_string(), "C".to_string());
        Arc::new(Acesso { quando: Instant::now(), cabecalhos: cabecalhos_do_leitor(&lidos, "https://open.spotify.com/"), hashes: hashes_do_script("x,\"fetchPlaylist\",\"query\",\"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff\",y") })
    }

    /// A rede falsa do `test-conta-do-spotify.cjs`: as respostas por ordem, e os pedidos enviados.
    struct Rede {
        respostas: Vec<Resposta>,
        enviados: Vec<(String, Value)>,
        tokens: u32,
        esperas: Vec<Duration>,
    }

    fn correr(rede: &mut Rede, atual: &mut Option<Arc<Acesso>>, nome: &str, variaveis: Value) -> Value {
        let tokens = std::cell::Cell::new(rede.tokens);
        let atual_ = std::cell::RefCell::new(atual.take());
        let respostas = std::cell::RefCell::new(std::mem::take(&mut rede.respostas));
        let enviados = std::cell::RefCell::new(Vec::new());
        let esperas = std::cell::RefCell::new(Vec::new());
        let r = consultar_com(
            nome,
            &variaveis,
            || {
                let mut g = atual_.borrow_mut();
                if g.is_none() {
                    tokens.set(tokens.get() + 1);
                    *g = Some(acesso_de_teste(&format!("T{}", tokens.get())));
                }
                Ok(g.clone().unwrap())
            },
            |a| {
                let mut g = atual_.borrow_mut();
                if g.as_ref().is_some_and(|x| Arc::ptr_eq(x, a)) {
                    *g = None;
                }
            },
            |a, corpo| {
                let token = a.cabecalhos.iter().find(|(k, _)| k == "authorization").map(|(_, v)| v.clone()).unwrap_or_default();
                enviados.borrow_mut().push((token, corpo.clone()));
                let mut r = respostas.borrow_mut();
                if r.is_empty() {
                    panic!("resposta a mais");
                }
                Ok(r.remove(0))
            },
            |d| esperas.borrow_mut().push(d),
        );
        rede.tokens = tokens.get();
        rede.respostas = respostas.into_inner();
        rede.enviados.extend(enviados.into_inner());
        rede.esperas.extend(esperas.into_inner());
        *atual = atual_.into_inner();
        r
    }

    #[test]
    fn as_consultas_como_no_electron() {
        let mut rede = Rede { respostas: vec![], enviados: vec![], tokens: 0, esperas: vec![] };
        let mut atual = None;
        let ok = |d: Value| -> Resposta { (200, None, Some(d)) };
        let estado = |s: u16| -> Resposta { (s, None, None) };

        assert_eq!(correr(&mut rede, &mut atual, "deleteThing", json!({})), json!({ "ok": false, "falha": "recusado" }), "só as consultas da lista");
        assert!(rede.enviados.is_empty());

        rede.respostas = vec![ok(json!({ "data": { "playlistV2": { "name": "X" } } }))];
        let r1 = correr(&mut rede, &mut atual, "fetchPlaylist", json!({ "uri": "spotify:playlist:x", "offset": 0, "limit": 1 }));
        assert_eq!(r1, json!({ "ok": true, "dados": { "playlistV2": { "name": "X" } } }));
        let (token, corpo) = &rede.enviados[0];
        assert_eq!(token, "Bearer T1");
        assert_eq!(corpo["operationName"], "fetchPlaylist");
        assert_eq!(corpo["extensions"]["persistedQuery"]["sha256Hash"], "f".repeat(64), "o hash lido do script do leitor");
        assert_eq!(corpo["variables"]["uri"], "spotify:playlist:x");

        rede.respostas = vec![ok(json!({ "data": { "me": { "profile": {} } } }))];
        assert_eq!(correr(&mut rede, &mut atual, "profileAttributes", json!({}))["ok"], true);
        assert_eq!(rede.tokens, 1, "um token só para várias consultas");
        assert_eq!(rede.enviados[1].1["extensions"]["persistedQuery"]["sha256Hash"], CONSULTAS[0].1, "o hash guardado quando o script não o traz");

        rede.respostas = vec![estado(401), ok(json!({ "data": { "ok": 1 } }))];
        assert_eq!(correr(&mut rede, &mut atual, "libraryV3", json!({ "offset": 0 })), json!({ "ok": true, "dados": { "ok": 1 } }));
        assert_eq!(rede.tokens, 2, "401: um token novo, e a consulta repete-se");
        assert_eq!(rede.enviados.last().unwrap().0, "Bearer T2");

        rede.respostas = vec![estado(401), estado(401)];
        assert_eq!(correr(&mut rede, &mut atual, "libraryV3", json!({ "offset": 0 })), json!({ "ok": false, "falha": "desligado" }), "401 duas vezes: o login caducou");

        rede.respostas = vec![ok(json!({ "errors": [{ "message": "PersistedQueryNotFound" }] })), ok(json!({ "data": { "ok": 2 } }))];
        assert_eq!(correr(&mut rede, &mut atual, "fetchLibraryTracks", json!({ "offset": 0, "limit": 1 })), json!({ "ok": true, "dados": { "ok": 2 } }));
        rede.respostas = vec![ok(json!({ "errors": [{ "message": "PersistedQueryNotFound" }] })), ok(json!({ "errors": [{ "message": "PersistedQueryNotFound" }] }))];
        assert_eq!(correr(&mut rede, &mut atual, "fetchLibraryTracks", json!({ "offset": 0, "limit": 1 })), json!({ "ok": false, "falha": "mudou" }), "o leitor mudou: relê-se uma vez, e se continuar diz-se");

        rede.respostas = vec![ok(json!({ "errors": [{ "message": "User not authorized" }], "data": { "me": null } }))];
        assert_eq!(correr(&mut rede, &mut atual, "profileAttributes", json!({})), json!({ "ok": false, "falha": "desligado" }), "sem sessão o leitor abre como anónimo");

        rede.respostas = vec![ok(json!({ "errors": [{ "message": "Something else" }] }))];
        assert_eq!(correr(&mut rede, &mut atual, "libraryV3", json!({ "offset": 0 })), json!({ "ok": false, "falha": "recusado" }), "só erros, sem dados");

        rede.respostas = vec![estado(403)];
        assert_eq!(correr(&mut rede, &mut atual, "libraryV3", json!({ "offset": 0 })), json!({ "ok": false, "falha": "recusado" }), "um 403 seco");

        rede.respostas = vec![(503, Some(3.0), None), (429, None, None), ok(json!({ "data": { "ok": 3 } }))];
        assert_eq!(correr(&mut rede, &mut atual, "libraryV3", json!({ "offset": 0 })), json!({ "ok": true, "dados": { "ok": 3 } }), "ocupado: espera e repete");
        assert_eq!(rede.esperas, vec![Duration::from_secs(3), Duration::from_secs(4)], "o retry-after, e senão 2^n");
        assert!(rede.respostas.is_empty(), "nenhuma resposta ficou por usar");
    }

    #[test]
    fn as_esperas_e_os_limites() {
        assert_eq!(decidir(429, None, None, 6, false, false), Passo::Falhou(Falha::Ocupado), "à 6.ª desiste");
        assert_eq!(decidir(502, None, None, 6, false, false), Passo::Falhou(Falha::Ocupado));
        assert_eq!(decidir(500, Some(99.0), None, 1, false, false), Passo::Esperar(Duration::from_secs(30)), "no máximo 30 s");
        assert_eq!(decidir(200, None, None, 1, false, false), Passo::Falhou(Falha::Rede), "uma resposta que não é JSON");
        assert_eq!(decidir(200, None, Some(json!({ "errors": [{ "message": "Unauthorized" }], "data": { "me": { "id": 1 } } })), 1, false, false), Passo::Dados(json!({ "me": { "id": 1 } })), "com o `me`, os dados valem");
    }

    #[test]
    fn o_google_a_marca_e_o_pedido() {
        assert!(do_google("https://accounts.google.com/o/oauth2/auth?x=1"));
        assert!(do_google("HTTPS://accounts.google.co.uk/signin"));
        assert!(!do_google("https://accounts.spotify.com/login"));
        assert!(!do_google("https://accounts.google.evil.com.example.org"), "sem a barra a seguir ao anfitrião");
        assert!(!do_google("http://accounts.google.com/"));

        let agora = 1_000_000;
        assert!(conta_valida(&json!({ "entrou": 1, "ate": null }), agora));
        assert!(conta_valida(&json!({ "entrou": 1, "ate": agora + 1 }), agora));
        assert!(!conta_valida(&json!({ "entrou": 1, "ate": agora - 1 }), agora), "o cookie caducou");
        assert!(!conta_valida(&json!({}), agora));
        assert!(!conta_valida(&Value::Null, agora));

        assert!(pedido_valido("libraryV3", &json!({ "offset": 0 })));
        assert!(!pedido_valido("deleteThing", &json!({})));
        assert!(!pedido_valido("libraryV3", &json!([1, 2])), "um objeto, não uma lista");
        assert!(!pedido_valido("libraryV3", &json!({ "x": "a".repeat(4000) })), "no máximo 4000 caracteres");

        assert!(e_o_script_do_leitor("https://open.spotifycdn.com/cdn/build/web-player/web-player.4f2a9c.js"));
        assert!(e_o_script_do_leitor("https://open.spotifycdn.com/cdn/build/web-player/web-player.4f2a9c.js?x=1"));
        assert!(!e_o_script_do_leitor("https://open.spotifycdn.com/cdn/build/web-player/vendor~web-player.4f2a9c.js"));

        let mut lidos = HashMap::new();
        lidos.insert("authorization".to_string(), "Bearer T".to_string());
        lidos.insert("client-token".to_string(), "C".to_string());
        let c = cabecalhos_do_leitor(&lidos, "https://open.spotify.com/");
        let de = |k: &str| c.iter().find(|(n, _)| n == k).map(|(_, v)| v.as_str());
        assert_eq!(de("authorization"), Some("Bearer T"));
        assert_eq!(de("app-platform"), Some("WebPlayer"), "o de omissão do Electron");
        assert_eq!(de("origin"), Some("https://open.spotify.com"));
        assert_eq!(de("referer"), Some("https://open.spotify.com/"));
        assert_eq!(de("user-agent"), None, "vazio não vai");
    }
}
