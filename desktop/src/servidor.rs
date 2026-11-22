//! O servidor local da janela (http://localhost:<porta>), porta do
//! `electron/servidorLocal.cjs`: as MESMAS regras e os mesmos casos de teste
//! (`scripts/test-servidor-local.mjs`).
//!
//! - Nome com o hash do conteúdo (32 hexadecimais antes da extensão) -> um ano,
//!   `immutable`. O resto (index.html, favicon, metadata.json, as rotas) ->
//!   `no-cache` com ETag e 304. Uma resposta 200 apaga a cache do código
//!   compilado do V8; um 304 ou uma leitura da cache HTTP mantêm-na (21/11:
//!   672 -> 544 ms do processo à app montada, no Electron).
//! - URL malformada -> 400; um caminho que sai da pasta -> 403; um que não existe
//!   -> o index.html (é uma rota da app).
//! - Dois loopbacks (127.0.0.1 e ::1): o `localhost` resolve muitas vezes para ::1
//!   primeiro, e outro processo nessa porta seria carregado como se fosse a app.
//! - A app vem de dentro do .exe (o `dist-web` embutido pelo build.rs, F9): uma
//!   atualização troca o .exe e a app juntos, sem ficheiros velhos ao lado. Uma
//!   pasta (`DUOTONE_WEB`, ou `desktop/dist-web` sem nada embutido) só em desenvolvimento.

use std::{
    borrow::Cow,
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use sha1::{Digest, Sha1};

pub const PARA_SEMPRE: &str = "public, max-age=31536000, immutable";
pub const PERGUNTAR_SEMPRE: &str = "no-cache";

/// Um pedido recusado: a URL não se lê (400) ou o caminho sai da raiz (403).
#[derive(Debug, PartialEq)]
pub enum Recusa {
    Malformado,
    Proibido,
}

/// O `dist-web` embutido no .exe (gerado pelo build.rs): o caminho com `/` e os bytes.
/// Vazio quando a build não tinha o `dist-web` (os testes no CI, por exemplo).
pub mod embutida {
    include!(concat!(env!("OUT_DIR"), "/web_embutida.rs"));
}

/// De onde vêm os ficheiros da app.
pub enum Fonte {
    Pasta(PathBuf),
    Embutida(&'static [(&'static str, &'static [u8])]),
}

/// As partes do caminho que um pedido quer, já sem `.` nem `..`. Igual ao
/// `resolverFicheiroLocal`: malformado ou a sair da raiz é recusado.
fn partes_do_pedido(url: &str) -> Result<Vec<String>, Recusa> {
    let caminho = url.split('?').next().unwrap_or("/");
    let Ok(descodificado) = percent_encoding::percent_decode_str(caminho).decode_utf8() else {
        return Err(Recusa::Malformado);
    };
    let descodificado = if descodificado == "/" { "/index.html".into() } else { descodificado };
    let mut partes: Vec<String> = Vec::new();
    for parte in descodificado.split(['/', '\\']) {
        match parte {
            "" | "." => {}
            ".." => {
                if partes.pop().is_none() {
                    return Err(Recusa::Proibido);
                }
            }
            // Uma letra de disco ou um fluxo alternativo (C:, ficheiro:fluxo) nunca é da app.
            p if p.contains(':') => return Err(Recusa::Proibido),
            p => partes.push(p.to_string()),
        }
    }
    Ok(partes)
}

/// O ficheiro destas partes do caminho, dentro de `raiz`.
fn na_pasta(raiz: &Path, partes: &[String]) -> PathBuf {
    partes.iter().fold(raiz.to_path_buf(), |c, p| c.join(p))
}

/// Que ficheiro um pedido quer, dentro de `raiz`. Igual ao `resolverFicheiroLocal`
/// (os casos do `test-servidor-local.mjs`).
#[cfg(test)]
fn resolver_ficheiro(url: &str, raiz: &Path) -> Result<PathBuf, Recusa> {
    partes_do_pedido(url).map(|partes| na_pasta(raiz, &partes))
}

/// `index-7b00...ca.js`, `archivo-latin.cd56...24.woff2`: 32 hexadecimais antes da extensão.
pub fn tem_hash_no_nome(caminho: &Path) -> bool {
    let Some(nome) = caminho.file_name().and_then(|n| n.to_str()) else { return false };
    let Some((antes, ext)) = nome.rsplit_once('.') else { return false };
    if ext.is_empty() || !ext.chars().all(|c| c.is_ascii_alphanumeric()) || antes.len() < 33 {
        return false;
    }
    let (resto, hash) = antes.split_at(antes.len() - 32);
    hash.chars().all(|c| c.is_ascii_hexdigit()) && (resto.ends_with('.') || resto.ends_with('-'))
}

pub fn etag_de(dados: &[u8]) -> String {
    format!("\"{}\"", URL_SAFE_NO_PAD.encode(Sha1::digest(dados)))
}

/// O `If-None-Match` aceita o ETag que temos? `*` ou uma lista; comparação fraca.
pub fn nao_mudou(if_none_match: Option<&str>, etag: &str) -> bool {
    let Some(valor) = if_none_match.map(str::trim).filter(|v| !v.is_empty()) else { return false };
    let sem_w = |t: &str| t.trim().trim_start_matches("W/").to_string();
    let alvo = sem_w(etag);
    valor.split(',').any(|t| t.trim() == "*" || sem_w(t) == alvo)
}

fn tipo_de(caminho: &Path) -> &'static str {
    match caminho.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase).as_deref() {
        Some("html") => "text/html; charset=utf-8",
        Some("js") => "application/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") => "application/json; charset=utf-8",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml; charset=utf-8",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    }
}

/// A resposta a um pedido: estado, cabeçalhos e corpo. Separada do tiny_http para os testes.
pub struct Resposta {
    pub estado: u16,
    pub cabecalhos: Vec<(&'static str, String)>,
    pub corpo: Vec<u8>,
}

pub struct Servidor {
    fonte: Fonte,
    etags: Mutex<HashMap<PathBuf, String>>,
}

impl Servidor {
    pub fn new(fonte: Fonte) -> Self {
        Self { fonte, etags: Mutex::new(HashMap::new()) }
    }

    fn responder(&self, caminho: &Path, dados: Cow<'static, [u8]>, if_none_match: Option<&str>) -> Resposta {
        let etag = {
            let mut etags = self.etags.lock().unwrap_or_else(|e| e.into_inner());
            etags.entry(caminho.to_path_buf()).or_insert_with(|| etag_de(&dados)).clone()
        };
        let cache = if tem_hash_no_nome(caminho) { PARA_SEMPRE } else { PERGUNTAR_SEMPRE };
        let cabecalhos = vec![("ETag", etag.clone()), ("Cache-Control", cache.to_string())];
        if nao_mudou(if_none_match, &etag) {
            return Resposta { estado: 304, cabecalhos, corpo: Vec::new() };
        }
        let mut cabecalhos = cabecalhos;
        cabecalhos.insert(0, ("Content-Type", tipo_de(caminho).to_string()));
        Resposta { estado: 200, cabecalhos, corpo: dados.into_owned() }
    }

    /// O ficheiro destas partes do caminho (o caminho para a cache e os bytes), se existir.
    fn ler(&self, partes: &[String]) -> Option<(PathBuf, Cow<'static, [u8]>)> {
        match &self.fonte {
            Fonte::Pasta(raiz) => {
                let caminho = na_pasta(raiz, partes);
                let dados = fs::read(&caminho).ok().filter(|_| caminho.is_file())?;
                Some((caminho, Cow::Owned(dados)))
            }
            Fonte::Embutida(ficheiros) => {
                let chave = partes.join("/");
                let (nome, dados) = ficheiros.iter().find(|(nome, _)| *nome == chave)?;
                Some((PathBuf::from(nome), Cow::Borrowed(*dados)))
            }
        }
    }

    /// O que um GET recebe. Igual ao tratador do `servirFicheiros`.
    pub fn servir(&self, url: &str, if_none_match: Option<&str>) -> Resposta {
        let partes = match partes_do_pedido(url) {
            Ok(partes) if partes.is_empty() => vec!["index.html".to_string()],
            Ok(partes) => partes,
            Err(Recusa::Malformado) => return Resposta { estado: 400, cabecalhos: vec![], corpo: b"Bad Request".to_vec() },
            Err(Recusa::Proibido) => return Resposta { estado: 403, cabecalhos: vec![], corpo: b"Forbidden".to_vec() },
        };
        // Um caminho que não existe é uma rota da app: o index.html.
        match self.ler(&partes).or_else(|| self.ler(&["index.html".to_string()])) {
            Some((caminho, dados)) => self.responder(&caminho, dados, if_none_match),
            None => Resposta { estado: 404, cabecalhos: vec![], corpo: b"Not Found".to_vec() },
        }
    }
}

fn atender(servidor: Arc<Servidor>, escuta: tiny_http::Server) {
    for pedido in escuta.incoming_requests() {
        // O áudio do motor (audio.rs): cada pedido numa thread, porque lê da rede
        // enquanto entrega, e o `<audio>` abre vários (um salto é outro pedido).
        if pedido.url().starts_with("/audio/") {
            let range = pedido.headers().iter().find(|h| h.field.equiv("Range")).map(|h| h.value.as_str().to_string());
            thread::spawn(move || {
                let resposta = crate::audio::responder(pedido.url(), range.as_deref());
                let _ = pedido.respond(resposta);
            });
            continue;
        }
        let inm = pedido.headers().iter().find(|h| h.field.equiv("If-None-Match")).map(|h| h.value.as_str().to_string());
        let r = servidor.servir(pedido.url(), inm.as_deref());
        let mut resposta = tiny_http::Response::from_data(r.corpo).with_status_code(r.estado);
        for (nome, valor) in r.cabecalhos {
            if let Ok(h) = tiny_http::Header::from_bytes(nome.as_bytes(), valor.as_bytes()) {
                resposta = resposta.with_header(h);
            }
        }
        let _ = pedido.respond(resposta);
    }
}

/// Abre a porta nos dois loopbacks. Sem o 127.0.0.1 é erro (a porta está ocupada);
/// sem pilha IPv6 no sistema não há ::1 para ninguém ocupar, e segue-se.
pub fn arrancar(fonte: Fonte, porta: u16) -> Result<(), String> {
    let servidor = Arc::new(Servidor::new(fonte));
    let v4 = tiny_http::Server::http(("127.0.0.1", porta)).map_err(|e| format!("127.0.0.1:{porta}: {e}"))?;
    match tiny_http::Server::http(format!("[::1]:{porta}")) {
        Ok(v6) => {
            let s = servidor.clone();
            thread::spawn(move || atender(s, v6));
        }
        Err(e) => {
            let texto = e.to_string().to_lowercase();
            // Só a falta de IPv6 é aceitável; outro processo na ::1 é um perigo.
            if !(texto.contains("10049") || texto.contains("10047") || texto.contains("not available") || texto.contains("not supported")) {
                return Err(format!("[::1]:{porta}: {e}"));
            }
        }
    }
    thread::spawn(move || atender(servidor, v4));
    Ok(())
}

#[cfg(test)]
mod testes {
    use super::*;

    fn pasta() -> PathBuf {
        let raiz = std::env::temp_dir().join(format!("duotone-servidor-rs-{}", std::process::id()));
        let js = raiz.join("_expo/static/js/web");
        fs::create_dir_all(&js).unwrap();
        fs::write(raiz.join("index.html"), "<!doctype html><script src=\"/_expo/static/js/web/index-7b007d07186d29978e25254bd8bcc9ca.js\" defer></script>").unwrap();
        fs::write(js.join("index-7b007d07186d29978e25254bd8bcc9ca.js"), "console.log(\"duotone\")").unwrap();
        fs::write(raiz.join("metadata.json"), "{}").unwrap();
        raiz
    }
    fn cabecalho<'a>(r: &'a Resposta, nome: &str) -> Option<&'a str> {
        r.cabecalhos.iter().find(|(n, _)| n.eq_ignore_ascii_case(nome)).map(|(_, v)| v.as_str())
    }

    #[test]
    fn as_pecas_puras() {
        assert!(tem_hash_no_nome(Path::new("/_expo/static/js/web/index-7b007d07186d29978e25254bd8bcc9ca.js")));
        assert!(tem_hash_no_nome(Path::new(r"C:\app\dist-web\assets\fonts\archivo-latin.cd56e2ec63d7a63df092f824f981253c.woff2")));
        assert!(!tem_hash_no_nome(Path::new("/index.html")));
        assert!(!tem_hash_no_nome(Path::new("/favicon.ico")));
        assert!(!tem_hash_no_nome(Path::new("/assets/logo-7b007d07.png")), "um hash curto não conta");
        let etag = etag_de(b"ola");
        assert_ne!(etag_de(b"ola"), etag_de("olá".as_bytes()));
        assert!(nao_mudou(Some(&etag), &etag));
        assert!(nao_mudou(Some(&format!("W/{etag}")), &etag), "comparação fraca");
        assert!(nao_mudou(Some(&format!("\"outro\", {etag}")), &etag), "uma lista");
        assert!(nao_mudou(Some("*"), &etag));
        assert!(!nao_mudou(Some("\"outro\""), &etag));
        assert!(!nao_mudou(Some(""), &etag));
        assert!(!nao_mudou(None, &etag));
    }

    #[test]
    fn as_defesas_de_antes() {
        let raiz = PathBuf::from(r"C:\app\dist");
        assert_eq!(resolver_ficheiro("/%E0%A4%A", &raiz), Err(Recusa::Malformado), "URL malformada");
        assert_eq!(resolver_ficheiro("/..%5Csegredo.txt", &raiz), Err(Recusa::Proibido), "não sai da pasta");
        assert_eq!(resolver_ficheiro("/../segredo.txt", &raiz), Err(Recusa::Proibido));
        assert_eq!(resolver_ficheiro("/C:/Windows/win.ini", &raiz), Err(Recusa::Proibido));
        assert_eq!(resolver_ficheiro("/assets/app.js", &raiz), Ok(raiz.join("assets").join("app.js")));
        assert_eq!(resolver_ficheiro("/", &raiz), Ok(raiz.join("index.html")));
        assert_eq!(resolver_ficheiro("/a/../b.js?x=1", &raiz), Ok(raiz.join("b.js")));
    }

    #[test]
    fn as_respostas_e_a_cache() {
        let raiz = pasta();
        as_respostas_de(&Servidor::new(Fonte::Pasta(raiz.clone())));
        let _ = fs::remove_dir_all(raiz);
    }

    /// A mesma conversa, com a app de dentro do .exe (F9).
    #[test]
    fn a_app_embutida_responde_igual() {
        static FICHEIROS: &[(&str, &[u8])] = &[
            ("index.html", b"<!doctype html><script src=\"/_expo/static/js/web/index-7b007d07186d29978e25254bd8bcc9ca.js\" defer></script>"),
            ("_expo/static/js/web/index-7b007d07186d29978e25254bd8bcc9ca.js", b"console.log(\"duotone\")"),
            ("metadata.json", b"{}"),
        ];
        let s = Servidor::new(Fonte::Embutida(FICHEIROS));
        as_respostas_de(&s);
        assert_eq!(s.servir("/_expo/static/js/web/../web/./index-7b007d07186d29978e25254bd8bcc9ca.js", None).corpo, FICHEIROS[1].1);
        assert_eq!(s.servir("/_expo%5Cstatic%5Cjs%5Cweb%5Cindex-7b007d07186d29978e25254bd8bcc9ca.js", None).corpo, FICHEIROS[1].1, "a barra do Windows também separa");
        assert_eq!(s.servir("/C:/Windows/win.ini", None).estado, 403);
        assert_eq!(Servidor::new(Fonte::Embutida(&[])).servir("/", None).estado, 404, "sem app nenhuma");
    }

    /// O `dist-web` desta build, se veio: o index.html e o bundle que ele pede estão lá.
    #[test]
    fn o_dist_web_embutido_esta_inteiro() {
        let ficheiros = embutida::FICHEIROS;
        if ficheiros.is_empty() {
            return; // a build sem dist-web (os testes no CI)
        }
        let indice = ficheiros.iter().find(|(n, _)| *n == "index.html").expect("o index.html");
        let html = String::from_utf8_lossy(indice.1);
        let bundle = regex::Regex::new(r#"src="/(_expo/static/js/web/[^"]+\.js)""#).unwrap();
        let pedido = bundle.captures(&html).expect("o index.html pede um bundle")[1].to_string();
        assert!(ficheiros.iter().any(|(n, _)| *n == pedido), "o bundle {pedido} veio com o index.html");
        assert!(ficheiros.iter().all(|(n, _)| !n.contains('\\') && !n.starts_with('/')), "caminhos com /");
    }

    fn as_respostas_de(s: &Servidor) {
        let indice = s.servir("/", None);
        assert_eq!(indice.estado, 200);
        assert_eq!(cabecalho(&indice, "Content-Type"), Some("text/html; charset=utf-8"));
        assert_eq!(cabecalho(&indice, "Cache-Control"), Some(PERGUNTAR_SEMPRE), "o index.html diz que bundle carregar");
        let etag = cabecalho(&indice, "ETag").unwrap().to_string();
        let igual = s.servir("/index.html", Some(&etag));
        assert_eq!(igual.estado, 304);
        assert!(igual.corpo.is_empty(), "um 304 não leva corpo");
        assert_eq!(cabecalho(&igual, "ETag"), Some(etag.as_str()));

        let bundle = s.servir("/_expo/static/js/web/index-7b007d07186d29978e25254bd8bcc9ca.js", None);
        assert_eq!(bundle.estado, 200);
        assert_eq!(cabecalho(&bundle, "Content-Type"), Some("application/javascript; charset=utf-8"));
        assert_eq!(cabecalho(&bundle, "Cache-Control"), Some(PARA_SEMPRE), "com o hash no nome, um ano");
        let etag_do_bundle = cabecalho(&bundle, "ETag").unwrap().to_string();
        assert_ne!(etag_do_bundle, etag);
        assert_eq!(s.servir("/_expo/static/js/web/index-7b007d07186d29978e25254bd8bcc9ca.js", Some(&format!("W/{etag_do_bundle}"))).estado, 304);
        assert_eq!(s.servir("/_expo/static/js/web/index-7b007d07186d29978e25254bd8bcc9ca.js", Some("\"velho\"")).estado, 200);

        let meta = s.servir("/metadata.json", None);
        assert_eq!(cabecalho(&meta, "Content-Type"), Some("application/json; charset=utf-8"));
        assert_eq!(cabecalho(&meta, "Cache-Control"), Some(PERGUNTAR_SEMPRE));

        let rota = s.servir("/settings?x=1", None);
        assert_eq!(rota.estado, 200, "uma rota da app dá o index.html");
        assert_eq!(cabecalho(&rota, "ETag"), Some(etag.as_str()));
        let velho = s.servir("/_expo/static/js/web/index-00000000000000000000000000000000.js", None);
        assert_eq!(cabecalho(&velho, "Cache-Control"), Some(PERGUNTAR_SEMPRE), "um hash que não existe não leva o index.html para a cache um ano");
        assert_eq!(s.servir("/settings", Some(&etag)).estado, 304);

        assert_eq!(s.servir("/%E0%A4%A", None).estado, 400);
        assert_eq!(s.servir("/..%5Csegredo.txt", None).estado, 403);
    }
}
