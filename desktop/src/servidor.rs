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

use std::{
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

#[derive(Debug, PartialEq)]
pub enum Resolvido {
    Ficheiro(PathBuf),
    Malformado,
    Proibido,
}

/// Que ficheiro um pedido quer, dentro de `raiz`. Igual ao `resolverFicheiroLocal`.
pub fn resolver_ficheiro(url: &str, raiz: &Path) -> Resolvido {
    let caminho = url.split('?').next().unwrap_or("/");
    let Ok(descodificado) = percent_encoding::percent_decode_str(caminho).decode_utf8() else {
        return Resolvido::Malformado;
    };
    let descodificado = if descodificado == "/" { "/index.html".into() } else { descodificado };
    let mut partes: Vec<&str> = Vec::new();
    for parte in descodificado.split(['/', '\\']) {
        match parte {
            "" | "." => {}
            ".." => {
                if partes.pop().is_none() {
                    return Resolvido::Proibido;
                }
            }
            // Uma letra de disco ou um fluxo alternativo (C:, ficheiro:fluxo) nunca é da app.
            p if p.contains(':') => return Resolvido::Proibido,
            p => partes.push(p),
        }
    }
    let mut destino = raiz.to_path_buf();
    for p in partes {
        destino.push(p);
    }
    Resolvido::Ficheiro(destino)
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
    raiz: PathBuf,
    etags: Mutex<HashMap<PathBuf, String>>,
}

impl Servidor {
    pub fn new(raiz: PathBuf) -> Self {
        Self { raiz, etags: Mutex::new(HashMap::new()) }
    }

    fn responder(&self, caminho: &Path, dados: Vec<u8>, if_none_match: Option<&str>) -> Resposta {
        let etag = {
            let mut etags = self.etags.lock().unwrap();
            etags.entry(caminho.to_path_buf()).or_insert_with(|| etag_de(&dados)).clone()
        };
        let cache = if tem_hash_no_nome(caminho) { PARA_SEMPRE } else { PERGUNTAR_SEMPRE };
        let cabecalhos = vec![("ETag", etag.clone()), ("Cache-Control", cache.to_string())];
        if nao_mudou(if_none_match, &etag) {
            return Resposta { estado: 304, cabecalhos, corpo: Vec::new() };
        }
        let mut cabecalhos = cabecalhos;
        cabecalhos.insert(0, ("Content-Type", tipo_de(caminho).to_string()));
        Resposta { estado: 200, cabecalhos, corpo: dados }
    }

    /// O que um GET recebe. Igual ao tratador do `servirFicheiros`.
    pub fn servir(&self, url: &str, if_none_match: Option<&str>) -> Resposta {
        match resolver_ficheiro(url, &self.raiz) {
            Resolvido::Malformado => Resposta { estado: 400, cabecalhos: vec![], corpo: b"Bad Request".to_vec() },
            Resolvido::Proibido => Resposta { estado: 403, cabecalhos: vec![], corpo: b"Forbidden".to_vec() },
            Resolvido::Ficheiro(caminho) => match fs::read(&caminho) {
                Ok(dados) if caminho.is_file() => self.responder(&caminho, dados, if_none_match),
                _ => {
                    let indice = self.raiz.join("index.html");
                    match fs::read(&indice) {
                        Ok(dados) => self.responder(&indice, dados, if_none_match),
                        Err(_) => Resposta { estado: 404, cabecalhos: vec![], corpo: b"Not Found".to_vec() },
                    }
                }
            },
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
pub fn arrancar(raiz: PathBuf, porta: u16) -> Result<(), String> {
    let servidor = Arc::new(Servidor::new(raiz));
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
        assert_eq!(resolver_ficheiro("/%E0%A4%A", &raiz), Resolvido::Malformado, "URL malformada");
        assert_eq!(resolver_ficheiro("/..%5Csegredo.txt", &raiz), Resolvido::Proibido, "não sai da pasta");
        assert_eq!(resolver_ficheiro("/../segredo.txt", &raiz), Resolvido::Proibido);
        assert_eq!(resolver_ficheiro("/C:/Windows/win.ini", &raiz), Resolvido::Proibido);
        assert_eq!(resolver_ficheiro("/assets/app.js", &raiz), Resolvido::Ficheiro(raiz.join("assets").join("app.js")));
        assert_eq!(resolver_ficheiro("/", &raiz), Resolvido::Ficheiro(raiz.join("index.html")));
        assert_eq!(resolver_ficheiro("/a/../b.js?x=1", &raiz), Resolvido::Ficheiro(raiz.join("b.js")));
    }

    #[test]
    fn as_respostas_e_a_cache() {
        let raiz = pasta();
        let s = Servidor::new(raiz.clone());
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
        let _ = fs::remove_dir_all(raiz);
    }
}
