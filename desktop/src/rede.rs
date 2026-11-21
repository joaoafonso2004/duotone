//! Os pedidos que a página não pode fazer por causa do CORS (F3). Porta dos
//! `ipcMain.handle` de rede do `electron/main.cjs`, com as MESMAS validações:
//! da página vem só a pergunta (um id, um caminho, uma consulta); o endereço,
//! o cliente e os filtros vivem deste lado. Nunca um proxy por onde a página
//! alcance o que quiser.
//!
//! Um erro volta como texto (a ponte transforma-o em `Error`), e os que no
//! Electron devolviam `null` (catálogo, letra, Apple, Deezer, Spotify) devolvem
//! `null` aqui também.

use std::{sync::LazyLock, time::Duration};

use regex::Regex;
use serde_json::{json, Value};
use tauri::WebviewWindow;

const UA_DO_CHROME: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const VERSAO_WEB: &str = "2.20260114.08.00";
const VERSAO_REMIX: &str = "1.20260914.01.00";
const VERSAO_ANDROID: &str = "7.27.52";

pub static CLIENTE: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36 Edg/157.0.0.0")
        // 10 min em vez dos 90 s do reqwest: entre duas músicas passam ~3 min, e
        // cada `/player` pagava de novo o TLS ao www.youtube.com. Sem PINGs: se o
        // servidor fechar a ligação antes, a seguinte abre-se como sempre.
        .pool_idle_timeout(Duration::from_secs(600))
        .build()
        .expect("cliente http")
});

macro_rules! re {
    ($nome:ident, $padrao:expr) => {
        static $nome: LazyLock<Regex> = LazyLock::new(|| Regex::new($padrao).unwrap());
    };
}
re!(VERSAO, r"^[A-Za-z0-9_.]{1,32}$");
re!(CONTINUACAO_PESQUISA, r"^[A-Za-z0-9_%=.-]{1,4096}$");
re!(PARAMS_PESQUISA, r"^[A-Za-z0-9_%=-]{0,64}$");
re!(CANAL, r"^UC[A-Za-z0-9_-]{22}$");
re!(LISTA_DO_ARTISTA, r"^VL(OLAK5uy_|PL|RDCLAK5uy_)[A-Za-z0-9_-]{10,80}$");
re!(CONTINUACAO_ARTISTA, r"^[A-Za-z0-9_%=-]{16,4000}$");
re!(MIX, r"^RD[A-Za-z0-9_-]{2,80}$");
re!(VIDEO, r"^[A-Za-z0-9_-]{11}$");
re!(PARAMS_RADIO, r"^[A-Za-z0-9_%=-]{1,40}$");
re!(LETRA, r"^MPLY[A-Za-z0-9_-]{3,60}$");
re!(VERSAO_DO_ANDROID, r"^[0-9.]{1,16}$");
re!(LINK_DA_APPLE, r"(?i)^https://music\.apple\.com/[a-z]{2}/playlist/[^\s/?#]{1,200}/pl\.[A-Za-z0-9.-]{5,80}$");
re!(LINK_CURTO_DO_DEEZER, r"^https://(?:link\.deezer\.com/s/[A-Za-z0-9]{4,40}|deezer\.page\.link/[A-Za-z0-9]{4,40})$");
re!(SPOTIFY_ID, r"^[A-Za-z0-9]{22}$");
re!(SUPABASE, r"^https://[a-z0-9]{20}\.supabase\.co/(rest|auth)/v1/");
static CAMINHOS_DO_CATALOGO: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    [
        r"^/search/artist\?q=[A-Za-z0-9%._~!*'()-]{1,500}&limit=[0-9]{1,3}$",
        r"^/search\?q=[A-Za-z0-9%._~!*'()-]{1,500}&limit=[0-9]{1,3}$",
        r"^/search\?limit=[0-9]{1,3}&q=[A-Za-z0-9%._~!*'()-]{1,500}$",
        r"^/artist/[0-9]{1,20}/related\?limit=[0-9]{1,3}$",
        r"^/artist/[0-9]{1,20}/top\?limit=[0-9]{1,3}$",
        r"^/album/[0-9]{1,20}$",
        r"^/chart/0/artists\?limit=[0-9]{1,3}$",
        r"^/playlist/[0-9]{1,20}$",
        r"^/playlist/[0-9]{1,20}/tracks\?index=[0-9]{1,5}&limit=[0-9]{1,3}$",
    ]
    .iter()
    .map(|p| Regex::new(p).unwrap())
    .collect()
});

pub fn caminho_do_catalogo_valido(caminho: &str) -> bool {
    CAMINHOS_DO_CATALOGO.iter().any(|r| r.is_match(caminho))
}
pub fn supabase_valido(url: &str) -> bool {
    url.len() <= 16384 && SUPABASE.is_match(url)
}

fn da_janela_principal(janela: &WebviewWindow) -> Result<(), String> {
    if janela.label() == "main" { Ok(()) } else { Err("Pedido invalido.".into()) }
}
fn texto(v: &Value, chave: &str) -> String {
    v.get(chave).and_then(Value::as_str).unwrap_or("").to_string()
}
fn versao(v: &Value, chave: &str, por_omissao: &str) -> String {
    let s = texto(v, chave);
    if VERSAO.is_match(&s) { s } else { por_omissao.to_string() }
}
fn cortar(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

async fn post_json(url: &str, cabecalhos: &[(&str, &str)], corpo: Value, prazo: Option<u64>) -> Result<reqwest::Response, String> {
    let mut pedido = CLIENTE.post(url).header("Content-Type", "application/json").body(corpo.to_string());
    for (k, v) in cabecalhos {
        pedido = pedido.header(*k, *v);
    }
    if let Some(s) = prazo {
        pedido = pedido.timeout(Duration::from_secs(s));
    }
    pedido.send().await.map_err(|e| e.to_string())
}
async fn json_ou_erro(r: reqwest::Response, nome: &str) -> Result<Value, String> {
    if !r.status().is_success() {
        return Err(format!("{nome} HTTP {}", r.status().as_u16()));
    }
    r.json::<Value>().await.map_err(|e| e.to_string())
}

/// `yt:pesquisa`: a pesquisa do InnerTube WEB, ou a página seguinte (só o token).
#[tauri::command]
pub async fn yt_pesquisa(janela: WebviewWindow, pedido: Value) -> Result<Value, String> {
    da_janela_principal(&janela)?;
    let query = texto(&pedido, "query").trim().to_string();
    let continuacao = Some(texto(&pedido, "continuation")).filter(|c| CONTINUACAO_PESQUISA.is_match(c)).unwrap_or_default();
    if query.is_empty() && continuacao.is_empty() {
        return Err("Pesquisa vazia.".into());
    }
    let v = versao(&pedido, "clientVersion", VERSAO_WEB);
    let params = Some(texto(&pedido, "params")).filter(|p| PARAMS_PESQUISA.is_match(p)).unwrap_or_default();
    let contexto = json!({ "client": { "clientName": "WEB", "clientVersion": v, "hl": "en", "gl": "US" } });
    let corpo = if !continuacao.is_empty() { json!({ "context": contexto, "continuation": continuacao }) } else { json!({ "context": contexto, "query": cortar(&query, 300), "params": params }) };
    let r = post_json("https://www.youtube.com/youtubei/v1/search", &[("Origin", "https://www.youtube.com"), ("X-YouTube-Client-Name", "1"), ("X-YouTube-Client-Version", &v)], corpo, None).await?;
    json_ou_erro(r, "InnerTube").await
}

const FILTROS_DO_YTMUSIC: &[(&str, &str)] = &[
    ("cancoes", "EgWKAQIIAWoKEAkQBRAKEAMQBA=="),
    ("artistas", "EgWKAQIgAWoMEA4QChADEAQQCRAF"),
    ("albuns", "EgWKAQIYAWoMEA4QChADEAQQCRAF"),
    ("playlists", "EgeKAQQoAEABagwQDhAKEAMQBBAJEAU="),
    ("playlistsEditoriais", "EgeKAQQoADgBagwQDhAKEAMQBBAJEAU="),
];

/// `ytmusic:pesquisa`: só o NOME do tipo vem da página; o filtro escolhe-se aqui.
#[tauri::command]
pub async fn ytmusic_pesquisa(janela: WebviewWindow, pedido: Value) -> Result<Value, String> {
    da_janela_principal(&janela)?;
    let query = cortar(texto(&pedido, "query").trim(), 300);
    if query.is_empty() {
        return Err("Pesquisa vazia.".into());
    }
    let tipo = texto(&pedido, "tipo");
    let filtro = FILTROS_DO_YTMUSIC.iter().find(|(n, _)| *n == tipo).unwrap_or(&FILTROS_DO_YTMUSIC[0]).1;
    let v = versao(&pedido, "clientVersion", VERSAO_REMIX);
    let corpo = json!({ "context": { "client": { "clientName": "WEB_REMIX", "clientVersion": v, "hl": "en", "gl": "US" } }, "query": query, "params": filtro });
    let r = post_json("https://music.youtube.com/youtubei/v1/search?prettyPrint=false", &[], corpo, None).await?;
    json_ou_erro(r, "YouTube Music").await
}

/// `ytmusic:artista`: o canal (`UC` + 22), a lista com todas as músicas dele, ou a página seguinte.
#[tauri::command]
pub async fn ytmusic_artista(janela: WebviewWindow, pedido: Value) -> Result<Value, String> {
    da_janela_principal(&janela)?;
    let browse = texto(&pedido, "browseId");
    let continuacao = texto(&pedido, "continuation");
    let valido = if !continuacao.is_empty() { CONTINUACAO_ARTISTA.is_match(&continuacao) } else { CANAL.is_match(&browse) || LISTA_DO_ARTISTA.is_match(&browse) };
    if !valido {
        return Err("Pagina invalida.".into());
    }
    let v = versao(&pedido, "clientVersion", VERSAO_REMIX);
    let mut corpo = json!({ "context": { "client": { "clientName": "WEB_REMIX", "clientVersion": v, "hl": "en", "gl": "US" } } });
    if !continuacao.is_empty() { corpo["continuation"] = json!(continuacao); } else { corpo["browseId"] = json!(browse); }
    let r = post_json("https://music.youtube.com/youtubei/v1/browse?prettyPrint=false", &[], corpo, Some(15)).await?;
    json_ou_erro(r, "YouTube Music").await
}

/// `ytmusic:radio`: o Mix de um artista (`RD...`), a partir de um vídeo.
#[tauri::command]
pub async fn ytmusic_radio(janela: WebviewWindow, pedido: Value) -> Result<Value, String> {
    da_janela_principal(&janela)?;
    let (lista, video, params) = (texto(&pedido, "playlistId"), texto(&pedido, "videoId"), texto(&pedido, "params"));
    if !MIX.is_match(&lista) || !VIDEO.is_match(&video) || (!params.is_empty() && !PARAMS_RADIO.is_match(&params)) {
        return Err("Mix invalido.".into());
    }
    let v = versao(&pedido, "clientVersion", VERSAO_REMIX);
    let mut corpo = json!({ "context": { "client": { "clientName": "WEB_REMIX", "clientVersion": v, "hl": "en", "gl": "US" } }, "playlistId": lista, "videoId": video });
    if !params.is_empty() { corpo["params"] = json!(params); }
    let r = post_json("https://music.youtube.com/youtubei/v1/next?prettyPrint=false", &[], corpo, Some(15)).await?;
    json_ou_erro(r, "YouTube Music").await
}

/// `ytmusic:letra`: o `next` de um vídeo ou o `browse` de um `MPLY...`; só os dois clientes da app.
#[tauri::command]
pub async fn ytmusic_letra(janela: WebviewWindow, pedido: Value) -> Result<Value, String> {
    da_janela_principal(&janela)?;
    let (tipo, id, cliente) = (texto(&pedido, "tipo"), texto(&pedido, "id"), texto(&pedido, "cliente"));
    let ok = ((tipo == "next" && VIDEO.is_match(&id)) || (tipo == "letra" && LETRA.is_match(&id))) && (cliente == "web" || cliente == "android");
    if !ok {
        return Err("Letra invalida.".into());
    }
    let cliente_json = if cliente == "android" {
        let va = Some(texto(&pedido, "versaoDoAndroid")).filter(|s| VERSAO_DO_ANDROID.is_match(s)).unwrap_or_else(|| VERSAO_ANDROID.into());
        json!({ "clientName": "ANDROID_MUSIC", "clientVersion": va, "androidSdkVersion": 34, "hl": "en", "gl": "US" })
    } else {
        json!({ "clientName": "WEB_REMIX", "clientVersion": versao(&pedido, "clientVersion", VERSAO_REMIX), "hl": "en", "gl": "US" })
    };
    let mut corpo = json!({ "context": { "client": cliente_json } });
    if tipo == "next" { corpo["videoId"] = json!(id); } else { corpo["browseId"] = json!(id); }
    let url = format!("https://music.youtube.com/youtubei/v1/{}?prettyPrint=false", if tipo == "next" { "next" } else { "browse" });
    let r = post_json(&url, &[], corpo, Some(15)).await?;
    if !r.status().is_success() {
        return Ok(Value::Null);
    }
    r.json::<Value>().await.map_err(|e| e.to_string())
}

/// `yt:mix`: as músicas de um Mix (`RD...`), e as voltas seguintes a partir de um vídeo.
#[tauri::command]
pub async fn yt_mix(janela: WebviewWindow, pedido: Value) -> Result<Value, String> {
    da_janela_principal(&janela)?;
    let (lista, video) = (texto(&pedido, "playlistId"), texto(&pedido, "videoId"));
    if !MIX.is_match(&lista) {
        return Err("Mix invalido.".into());
    }
    if !video.is_empty() && !VIDEO.is_match(&video) {
        return Err("Video invalido.".into());
    }
    let v = versao(&pedido, "clientVersion", VERSAO_WEB);
    let mut corpo = json!({ "context": { "client": { "clientName": "WEB", "clientVersion": v, "hl": "en", "gl": "US" } }, "playlistId": lista });
    if !video.is_empty() { corpo["videoId"] = json!(video); }
    let r = post_json("https://www.youtube.com/youtubei/v1/next?prettyPrint=false", &[("X-YouTube-Client-Name", "1"), ("X-YouTube-Client-Version", &v)], corpo, Some(15)).await?;
    json_ou_erro(r, "YouTube").await
}

/// `yt:refrao`: o `next` de uma música, para a curva "Most replayed".
#[tauri::command]
pub async fn yt_refrao(janela: WebviewWindow, pedido: Value) -> Result<Value, String> {
    da_janela_principal(&janela)?;
    let video = texto(&pedido, "videoId");
    if !VIDEO.is_match(&video) {
        return Err("Video invalido.".into());
    }
    let v = versao(&pedido, "clientVersion", VERSAO_WEB);
    let corpo = json!({ "context": { "client": { "clientName": "WEB", "clientVersion": v, "hl": "en", "gl": "US" } }, "videoId": video });
    let r = post_json("https://www.youtube.com/youtubei/v1/next?prettyPrint=false", &[("X-YouTube-Client-Name", "1"), ("X-YouTube-Client-Version", &v)], corpo, Some(15)).await?;
    json_ou_erro(r, "YouTube").await
}

/// `catalogo:pedir`: só os caminhos que o `src/api/catalogo.ts` usa; `null` num HTTP mau.
#[tauri::command]
pub async fn catalogo_pedir(janela: WebviewWindow, caminho: String) -> Result<Value, String> {
    da_janela_principal(&janela)?;
    if !caminho_do_catalogo_valido(&caminho) {
        return Err("Caminho de catalogo invalido.".into());
    }
    let r = CLIENTE.get(format!("https://api.deezer.com{caminho}")).timeout(Duration::from_secs(8)).send().await.map_err(|e| e.to_string())?;
    if !r.status().is_success() {
        return Ok(Value::Null);
    }
    r.json::<Value>().await.map_err(|e| e.to_string())
}

/// `supabase:pedir`: REST e autenticação sem o preflight do CORS (cada OPTIONS era
/// uma linha de log no Supabase). Uma falha de rede volta como `{ falhou }`.
#[tauri::command]
pub async fn supabase_pedir(janela: WebviewWindow, pedido: Value) -> Result<Value, String> {
    da_janela_principal(&janela)?;
    let url = texto(&pedido, "url");
    if !supabase_valido(&url) {
        return Err("Endereco invalido.".into());
    }
    let metodo = texto(&pedido, "method");
    if !["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"].contains(&metodo.as_str()) {
        return Err("Metodo invalido.".into());
    }
    let corpo = match pedido.get("body") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) => Some(s.clone()),
        _ => return Err("Corpo invalido.".into()),
    };
    let cabecalhos = pedido.get("headers").and_then(Value::as_array).ok_or("Cabecalhos invalidos.")?;
    if cabecalhos.len() > 64 {
        return Err("Cabecalhos invalidos.".into());
    }
    let mut p = CLIENTE.request(metodo.parse().map_err(|_| "Metodo invalido.")?, &url).timeout(Duration::from_secs(120));
    for h in cabecalhos {
        let par = h.as_array().filter(|a| a.len() == 2).ok_or("Cabecalhos invalidos.")?;
        let (Some(k), Some(v)) = (par[0].as_str(), par[1].as_str()) else { return Err("Cabecalhos invalidos.".into()) };
        p = p.header(k, v);
    }
    if let Some(c) = corpo.filter(|_| metodo != "GET" && metodo != "HEAD") {
        p = p.body(c);
    }
    match p.send().await {
        Ok(r) => {
            let estado = r.status();
            let cabecalhos: Vec<Value> = r.headers().iter().map(|(k, v)| json!([k.as_str(), v.to_str().unwrap_or("")])).collect();
            let corpo = r.text().await.unwrap_or_default();
            Ok(json!({ "status": estado.as_u16(), "statusText": estado.canonical_reason().unwrap_or(""), "headers": cabecalhos, "corpo": corpo }))
        }
        Err(e) => Ok(json!({ "falhou": e.to_string() })),
    }
}

/// `apple:playlist`: a página pública de uma playlist do Apple Music (só esse link).
#[tauri::command]
pub async fn apple_playlist(janela: WebviewWindow, url: String) -> Result<Value, String> {
    da_janela_principal(&janela)?;
    if !LINK_DA_APPLE.is_match(&url) {
        return Err("Playlist invalida.".into());
    }
    let r = CLIENTE.get(&url).header("User-Agent", UA_DO_CHROME).timeout(Duration::from_secs(15)).send().await.map_err(|e| e.to_string())?;
    if !r.status().is_success() || r.url().host_str() != Some("music.apple.com") {
        return Ok(Value::Null);
    }
    Ok(json!(r.text().await.map_err(|e| e.to_string())?))
}

/// `deezer:link`: segue o link curto e devolve o endereço final mais o princípio da página.
#[tauri::command]
pub async fn deezer_link(janela: WebviewWindow, url: String) -> Result<Value, String> {
    da_janela_principal(&janela)?;
    if !LINK_CURTO_DO_DEEZER.is_match(&url) {
        return Err("Link invalido.".into());
    }
    let r = CLIENTE.get(&url).header("User-Agent", UA_DO_CHROME).timeout(Duration::from_secs(10)).send().await.map_err(|e| e.to_string())?;
    let final_ = r.url().clone();
    let anfitriao = final_.host_str().unwrap_or("");
    let deezer = anfitriao == "deezer.com" || anfitriao.ends_with(".deezer.com") || anfitriao == "deezer.page.link" || anfitriao.ends_with(".deezer.page.link");
    if !deezer {
        return Ok(Value::Null);
    }
    let corpo = if r.status().is_success() { r.text().await.unwrap_or_default() } else { String::new() };
    Ok(json!(format!("{} {}", final_, cortar(&corpo, 200_000))))
}

/// `spotify:embed`: a página de embed de uma playlist PÚBLICA; da página só vem o id.
#[tauri::command]
pub async fn spotify_embed(janela: WebviewWindow, id: String) -> Result<Value, String> {
    da_janela_principal(&janela)?;
    if !SPOTIFY_ID.is_match(&id) {
        return Err("Playlist invalida.".into());
    }
    let r = CLIENTE.get(format!("https://open.spotify.com/embed/playlist/{id}")).header("User-Agent", UA_DO_CHROME).timeout(Duration::from_secs(15)).send().await.map_err(|e| e.to_string())?;
    if !r.status().is_success() {
        return Ok(Value::Null);
    }
    Ok(json!(r.text().await.map_err(|e| e.to_string())?))
}

re!(INNERTUBE_DO_MOTOR, r"^https://www\.youtube\.com/youtubei/v1/(player|visitor_id)(\?[A-Za-z0-9_=&%.-]{0,200})?$");
const CABECALHOS_DO_MOTOR: &[&str] = &["content-type", "x-youtube-client-name", "x-youtube-client-version", "origin", "accept-language", "user-agent", "x-goog-visitor-id"];

pub fn innertube_do_motor_valido(url: &str) -> bool {
    INNERTUBE_DO_MOTOR.is_match(url)
}

/// O resolvedor do motor (o `ytstream.ts`, partilhado com o iPhone) fala com o
/// InnerTube por aqui: só o `player` e o `visitor_id`, só POST, e só os cabeçalhos
/// que ele usa. Devolve o estado e o corpo; quem interpreta é o `ytstream.ts`.
#[tauri::command]
pub async fn innertube_pedir(janela: WebviewWindow, url: String, corpo: String, cabecalhos: Vec<(String, String)>) -> Result<Value, String> {
    da_janela_principal(&janela)?;
    if !innertube_do_motor_valido(&url) || corpo.len() > 64 * 1024 || cabecalhos.len() > 16 {
        return Err("Pedido invalido.".into());
    }
    let mut p = CLIENTE.post(&url).body(corpo).timeout(Duration::from_secs(20));
    for (k, v) in &cabecalhos {
        if !CABECALHOS_DO_MOTOR.contains(&k.to_ascii_lowercase().as_str()) {
            return Err(format!("Cabecalho recusado: {k}"));
        }
        p = p.header(k.as_str(), v.as_str());
    }
    let r = p.send().await.map_err(|e| e.to_string())?;
    let estado = r.status().as_u16();
    Ok(json!({ "status": estado, "corpo": r.text().await.unwrap_or_default() }))
}

/// Abre a ligação ao www.youtube.com antes do primeiro clique (o `aquecerOMotor`
/// da página, uma vez por arranque): o `/player` desse clique já não paga o TLS.
/// Um pedido só, ao `generate_204` (sem corpo). Devolve os ms, ou 0 se falhou.
#[tauri::command]
pub async fn innertube_aquecer(janela: WebviewWindow) -> Result<u64, String> {
    da_janela_principal(&janela)?;
    let t0 = std::time::Instant::now();
    let ok = CLIENTE.get("https://www.youtube.com/generate_204").timeout(Duration::from_secs(10)).send().await.is_ok();
    let ms = t0.elapsed().as_millis() as u64;
    crate::registo::linha(&format!("rede: ligação ao YouTube aquecida em {ms} ms{}", if ok { "" } else { " (falhou)" }));
    Ok(if ok { ms } else { 0 })
}

/// A sonda de 2 bytes do `ytstream.ts` (o `probeMediaUrl`): o CDN aceita o URL?
/// Só https do googlevideo. Devolve o estado HTTP, ou 0 se a rede falhou.
#[tauri::command]
pub async fn googlevideo_sondar(janela: WebviewWindow, url: String) -> Result<u16, String> {
    da_janela_principal(&janela)?;
    let u = reqwest::Url::parse(&url).map_err(|_| "URL invalido")?;
    if u.scheme() != "https" || !u.host_str().unwrap_or("").ends_with(".googlevideo.com") {
        return Err("Pedido invalido.".into());
    }
    match CLIENTE.get(u).header("Range", "bytes=0-1").timeout(Duration::from_secs(10)).send().await {
        Ok(r) => Ok(r.status().as_u16()),
        Err(_) => Ok(0),
    }
}

#[cfg(test)]
mod testes {
    #[test]
    fn o_innertube_do_motor_so_aceita_player_e_visitor_id() {
        assert!(super::innertube_do_motor_valido("https://www.youtube.com/youtubei/v1/player?prettyPrint=false"));
        assert!(super::innertube_do_motor_valido("https://www.youtube.com/youtubei/v1/visitor_id?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8&prettyPrint=false"));
        assert!(!super::innertube_do_motor_valido("https://www.youtube.com/youtubei/v1/search"));
        assert!(!super::innertube_do_motor_valido("https://www.youtube.com.evil.com/youtubei/v1/player"));
        assert!(!super::innertube_do_motor_valido("https://www.youtube.com/youtubei/v1/player/../search"));
    }

    use super::*;

    /// TODOS os padrões compilam. Um `\w` (Unicode no Rust) repetido 4096 vezes
    /// passava o teto de 10 MB do `regex`, rebentava no primeiro uso e envenenava
    /// o `LazyLock`: a pesquisa da Preview parou toda (21/11). Por isso as classes
    /// são ASCII, como o `\w` do JS do Electron.
    #[test]
    fn todos_os_padroes_compilam() {
        for r in [&VERSAO, &CONTINUACAO_PESQUISA, &PARAMS_PESQUISA, &CANAL, &LISTA_DO_ARTISTA, &CONTINUACAO_ARTISTA, &MIX, &VIDEO,
            &PARAMS_RADIO, &LETRA, &VERSAO_DO_ANDROID, &LINK_DA_APPLE, &LINK_CURTO_DO_DEEZER, &SPOTIFY_ID, &SUPABASE, &INNERTUBE_DO_MOTOR] {
            let _ = r.is_match("");
        }
        assert_eq!(CAMINHOS_DO_CATALOGO.len(), 9);
        assert!(CONTINUACAO_PESQUISA.is_match(&"a%3D_-.".repeat(585)[..4095]));
        assert!(!CONTINUACAO_PESQUISA.is_match(&"a".repeat(4097)));
        assert!(CONTINUACAO_ARTISTA.is_match(&"Ab_-%=".repeat(700)[..4000]));
        assert!(!CONTINUACAO_ARTISTA.is_match(&"a".repeat(4001)));
        // O mesmo que o `\w` do JS: sem letras acentuadas.
        assert!(!VIDEO.is_match("dQw4w9WgXcé") && !PARAMS_PESQUISA.is_match("ção"));
        assert!(VERSAO_DO_ANDROID.is_match("7.27.52") && !VERSAO_DO_ANDROID.is_match("٧.٢"));
    }

    #[test]
    fn o_catalogo_so_aceita_os_caminhos_da_app() {
        for bom in ["/search/artist?q=kendrick%20lamar&limit=5", "/search?q=abc&limit=10", "/search?limit=10&q=abc", "/artist/123/related?limit=20",
            "/artist/123/top?limit=50", "/album/302127", "/chart/0/artists?limit=30", "/playlist/908622995", "/playlist/908622995/tracks?index=100&limit=100"] {
            assert!(caminho_do_catalogo_valido(bom), "{bom}");
        }
        for mau in ["/user/1", "/search?q=a b&limit=1", "/album/1?x=1", "//evil.com/x", "/search?q=a&limit=1&x=2", "/playlist/1/tracks?index=1"] {
            assert!(!caminho_do_catalogo_valido(mau), "{mau}");
        }
    }

    #[test]
    fn o_supabase_so_aceita_rest_e_auth_de_um_projeto() {
        assert!(supabase_valido("https://abcdefghijklmnopqrst.supabase.co/rest/v1/tracks?select=*"));
        assert!(supabase_valido("https://abcdefghijklmnopqrst.supabase.co/auth/v1/token?grant_type=refresh_token"));
        assert!(!supabase_valido("https://abcdefghijklmnopqrst.supabase.co/storage/v1/object"));
        assert!(!supabase_valido("https://abcdefghijklmnopqrst.supabase.co.evil.com/rest/v1/"));
        assert!(!supabase_valido("http://abcdefghijklmnopqrst.supabase.co/rest/v1/"));
        assert!(!supabase_valido(&format!("https://abcdefghijklmnopqrst.supabase.co/rest/v1/{}", "a".repeat(16400))));
    }

    #[test]
    fn os_links_e_os_ids() {
        assert!(LINK_DA_APPLE.is_match("https://music.apple.com/pt/playlist/top-100-global/pl.d25f5d1181894928af76c85c967f8f31"));
        assert!(!LINK_DA_APPLE.is_match("https://music.apple.com.evil.com/pt/playlist/x/pl.abcde"));
        assert!(LINK_CURTO_DO_DEEZER.is_match("https://link.deezer.com/s/31abcDEF"));
        assert!(!LINK_CURTO_DO_DEEZER.is_match("https://link.deezer.com/s/31abcDEF/../x"));
        assert!(SPOTIFY_ID.is_match("37i9dQZF1DXcBWIGoYBM5M"));
        assert!(!SPOTIFY_ID.is_match("37i9dQZF1DXcBWIGoYBM5"));
        assert!(CANAL.is_match("UCiGm_E4ZwYSHV3bcW1pnSeQ") && !CANAL.is_match("UCx"));
        assert!(LISTA_DO_ARTISTA.is_match("VLOLAK5uy_abcdefghijklmnop"));
        assert!(MIX.is_match("RDCLAK5uy_abc") && !MIX.is_match("PL123"));
        assert!(VIDEO.is_match("dQw4w9WgXcQ") && !VIDEO.is_match("dQw4w9WgXc"));
        assert!(LETRA.is_match("MPLYt_abc123") && !LETRA.is_match("MPLY"));
        assert!(VERSAO.is_match("2.20260114.08.00") && !VERSAO.is_match("2; DROP"));
    }
}
