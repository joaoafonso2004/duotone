//! O áudio do motor só de áudio (F4), servido pela casca em `/audio/<id>`.
//!
//! A página resolve a música (o `ytstream.ts`, igual ao do iPhone) e regista aqui
//! o URL do googlevideo (`audio_registar`). O `<audio>` da página pede
//! `/audio/<id>` ao servidor local, com `Range`, como a qualquer ficheiro. Este
//! módulo vai buscar esses bytes ao googlevideo em bocados pequenos e entrega-os à
//! medida que chegam, por isso o som começa sem esperar por um bocado inteiro. Um
//! salto para a frente é outro `Range`, e o Chromium pede-o sozinho.
//!
//! Porque é o Rust e não a página: a prova PB (21/11) mostrou que o googlevideo
//! recusa `fetch` da página (CORS). E porque há bocados: pedidos grandes sem PO
//! Token levam 403 (25/8, memória `duotone-potoken-mobile-data`).
//!
//! Uma leitura que começa no 0 e vai até ao fim fica guardada em disco
//! (`<pasta>/audio/<id>.<ext>`), e a seguinte toca daí, sem rede. A cache tem um
//! limite e só se poda no arranque, como no iPhone.

use std::{
    collections::HashMap,
    fs,
    io::{self, Read, Seek, SeekFrom, Write},
    path::PathBuf,
    sync::{atomic::{AtomicU64, Ordering}, LazyLock, Mutex},
    time::Duration,
};

use serde_json::{json, Value};
use tauri::WebviewWindow;

/// O 1.º bocado é pequeno, para o som começar depressa; os seguintes são de 1 MB.
pub const PRIMEIRO_BOCADO: u64 = 256 * 1024;
pub const BOCADO: u64 = 1_000_000;
pub const MAX_AUDIO: u64 = 256 * 1024 * 1024;
pub const LIMITE_DA_CACHE: u64 = 300 * 1024 * 1024;

#[derive(Clone, Debug)]
pub struct Fonte {
    pub url: String,
    pub tamanho: u64,
    pub mime: String,
    /// O googlevideo recusou este URL (403 a meio, ou já à partida). Até a página
    /// registar outro, o servidor responde 403 logo: sem isto o Chromium voltava a
    /// pedir o mesmo intervalo, e o erro do `<audio>` (que dispara a renovação na
    /// página) demorava.
    pub expirada: bool,
}

/// O que servir para um id registado: a fonte, ou o estado HTTP a responder.
pub fn fonte_para_servir(id: &str) -> Result<Fonte, u16> {
    match FONTES.lock().unwrap().get(id) {
        None => Err(404),
        Some(f) if f.expirada => Err(403),
        Some(f) => Ok(f.clone()),
    }
}

/// Os 1.ºs bocados adiantados (21/11): a página pede-os com o rato parado em
/// cima de uma música, e o clique toca daqui sem esperar pelo googlevideo (o
/// 1.º bocado chegou a levar 980 ms só em cabeçalhos). Poucos e em memória: o
/// mais antigo sai primeiro, e cada um serve uma vez, ao mesmo URL.
const ADIANTADOS_MAX: usize = 6;
/// (id, url, bytes)
type Adiantado = (String, String, Vec<u8>);
static ADIANTADOS: LazyLock<Mutex<Vec<Adiantado>>> = LazyLock::new(|| Mutex::new(Vec::new()));
static A_ADIANTAR: LazyLock<Mutex<std::collections::HashSet<String>>> = LazyLock::new(|| Mutex::new(Default::default()));

pub fn guardar_adiantado(id: &str, url: &str, bytes: Vec<u8>) {
    let mut lista = ADIANTADOS.lock().unwrap();
    lista.retain(|(i, _, _)| i != id);
    lista.push((id.to_string(), url.to_string(), bytes));
    while lista.len() > ADIANTADOS_MAX {
        lista.remove(0);
    }
}

pub fn tirar_adiantado(id: &str, url: &str) -> Option<Vec<u8>> {
    let mut lista = ADIANTADOS.lock().unwrap();
    let i = lista.iter().position(|(i, u, _)| i == id && u == url)?;
    Some(lista.remove(i).2)
}

fn ja_adiantado(id: &str, url: &str) -> bool {
    ADIANTADOS.lock().unwrap().iter().any(|(i, u, _)| i == id && u == url)
}

/// O googlevideo recusou `url`: marca a fonte, se ainda for essa (a página pode já ter renovado).
pub fn marcar_expirada(id: &str, url: &str) {
    if let Some(f) = FONTES.lock().unwrap().get_mut(id) {
        if f.url == url {
            f.expirada = true;
        }
    }
}

static FONTES: LazyLock<Mutex<HashMap<String, Fonte>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
static CLIENTE: LazyLock<reqwest::blocking::Client> = LazyLock::new(|| {
    reqwest::blocking::Client::builder().timeout(Duration::from_secs(30)).build().expect("cliente http")
});
static TEMPORARIOS: AtomicU64 = AtomicU64::new(0);

pub fn id_valido(id: &str) -> bool {
    id.len() == 11 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}
fn extensao(mime: &str) -> &'static str {
    if mime.starts_with("audio/webm") { "webm" } else { "m4a" }
}
fn tipo_da_extensao(ext: &str) -> &'static str {
    if ext == "webm" { "audio/webm" } else { "audio/mp4" }
}

pub fn pasta_da_cache() -> Option<PathBuf> {
    let base = std::env::var_os("LOCALAPPDATA")?;
    let pasta = PathBuf::from(base).join(crate::canal::IDENTIFICADOR).join("audio");
    fs::create_dir_all(&pasta).ok()?;
    Some(pasta)
}
fn na_cache(id: &str) -> Option<PathBuf> {
    let pasta = pasta_da_cache()?;
    ["webm", "m4a"].iter().map(|e| pasta.join(format!("{id}.{e}"))).find(|p| p.is_file())
}

/// Valida o que a página regista: um id, um URL https do googlevideo, um tamanho e um tipo de áudio.
pub fn validar(id: &str, url: &str, tamanho: u64, mime: &str) -> Result<Fonte, String> {
    if !id_valido(id) {
        return Err("id inválido".into());
    }
    let u = reqwest::Url::parse(url).map_err(|_| "URL inválido")?;
    let anfitriao = u.host_str().unwrap_or("");
    if u.scheme() != "https" || !anfitriao.ends_with(".googlevideo.com") {
        return Err("só o googlevideo".into());
    }
    if tamanho == 0 || tamanho > MAX_AUDIO {
        return Err("tamanho inválido".into());
    }
    if !(mime.starts_with("audio/webm") || mime.starts_with("audio/mp4")) {
        return Err("tipo inválido".into());
    }
    Ok(Fonte { url: url.to_string(), tamanho, mime: mime.to_string(), expirada: false })
}

/// `Range: bytes=N-` ou `bytes=N-M` contra o tamanho. `None` = sem Range; `Err` = 416.
pub fn intervalo(range: Option<&str>, total: u64) -> Result<Option<(u64, u64)>, ()> {
    let Some(r) = range else { return Ok(None) };
    let r = r.trim().strip_prefix("bytes=").ok_or(())?;
    if r.contains(',') {
        return Err(());
    }
    let (a, b) = r.split_once('-').ok_or(())?;
    let (inicio, fim) = if a.is_empty() {
        let n: u64 = b.parse().map_err(|_| ())?; // os últimos n bytes
        (total.saturating_sub(n), total.saturating_sub(1))
    } else {
        let i: u64 = a.parse().map_err(|_| ())?;
        let f: u64 = if b.is_empty() { total.saturating_sub(1) } else { b.parse::<u64>().map_err(|_| ())?.min(total.saturating_sub(1)) };
        (i, f)
    };
    if total == 0 || inicio > fim || inicio >= total {
        return Err(());
    }
    Ok(Some((inicio, fim)))
}

/// O próximo bocado a pedir ao googlevideo, a partir de `pos` até `fim` (inclusive).
pub fn proximo_bocado(pos: u64, fim: u64, primeiro: bool) -> (u64, u64) {
    let tamanho = if primeiro { PRIMEIRO_BOCADO } else { BOCADO };
    (pos, (pos + tamanho - 1).min(fim))
}

/// Lê do googlevideo aos bocados e, se começou no 0, copia para um ficheiro temporário
/// que passa a cache quando chega ao fim.
struct DoGooglevideo {
    id: String,
    fonte: Fonte,
    pos: u64,
    fim: u64,
    primeiro: bool,
    buffer: Vec<u8>,
    lido: usize,
    copia: Option<(fs::File, PathBuf, PathBuf)>,
}

impl DoGooglevideo {
    fn novo(id: &str, fonte: Fonte, inicio: u64, fim: u64) -> Self {
        let copia = if inicio == 0 && fim + 1 == fonte.tamanho {
            pasta_da_cache().and_then(|pasta| {
                let final_ = pasta.join(format!("{id}.{}", extensao(&fonte.mime)));
                let n = TEMPORARIOS.fetch_add(1, Ordering::Relaxed);
                let temp = pasta.join(format!("{id}.{n}.parcial"));
                fs::File::create(&temp).ok().map(|f| (f, temp, final_))
            })
        } else {
            None
        };
        Self { id: id.to_string(), fonte, pos: inicio, fim, primeiro: true, buffer: Vec::new(), lido: 0, copia }
    }

    fn encher(&mut self) -> io::Result<()> {
        let (a, b) = proximo_bocado(self.pos, self.fim, self.primeiro);
        self.primeiro = false;
        // O 1.º bocado já adiantado (o rato parado em cima da música): sai da memória.
        if a == 0 {
            if let Some(bytes) = tirar_adiantado(&self.id, &self.fonte.url).filter(|v| v.len() as u64 == b + 1) {
                crate::registo::linha(&format!("áudio: 1.º bocado de {} KB da memória (adiantado)", bytes.len() / 1024));
                self.buffer = bytes;
                self.lido = 0;
                self.pos += self.buffer.len() as u64;
                if let Some((f, _, _)) = self.copia.as_mut() {
                    if f.write_all(&self.buffer).is_err() {
                        self.copia = None;
                    }
                }
                return Ok(());
            }
        }
        let t0 = std::time::Instant::now();
        let r = CLIENTE.get(&self.fonte.url).header("Range", format!("bytes={a}-{b}")).send().map_err(io::Error::other)?;
        let cabecalhos_ms = t0.elapsed().as_millis();
        let estado = r.status().as_u16();
        if estado != 206 && estado != 200 {
            crate::registo::linha(&format!("áudio: googlevideo HTTP {estado} no byte {a}"));
            // Um 4xx não passa com outra tentativa ao mesmo URL: a página tem de renovar.
            if (400..500).contains(&estado) {
                marcar_expirada(&self.id, &self.fonte.url);
            }
            return Err(io::Error::other(format!("googlevideo HTTP {estado}")));
        }
        self.buffer = r.bytes().map_err(io::Error::other)?.to_vec();
        self.lido = 0;
        // A medida do "resto" do clique ao som (21/11: 200 a 1 578 ms depois de resolver).
        if a == 0 {
            crate::registo::linha(&format!("áudio: 1.º bocado de {} KB: cabeçalhos aos {cabecalhos_ms} ms, inteiro aos {} ms", self.buffer.len() / 1024, t0.elapsed().as_millis()));
        }
        if self.buffer.is_empty() {
            return Err(io::Error::other("bocado vazio"));
        }
        self.pos += self.buffer.len() as u64;
        if let Some((f, _, _)) = self.copia.as_mut() {
            if f.write_all(&self.buffer).is_err() {
                self.copia = None;
            }
        }
        Ok(())
    }
}

impl Read for DoGooglevideo {
    fn read(&mut self, saida: &mut [u8]) -> io::Result<usize> {
        if self.lido >= self.buffer.len() {
            if self.pos > self.fim {
                // Chegou ao fim: a cópia inteira passa a cache.
                if let Some((f, temp, final_)) = self.copia.take() {
                    drop(f);
                    if fs::metadata(&temp).map(|m| m.len()).unwrap_or(0) == self.fonte.tamanho && fs::rename(&temp, &final_).is_ok() {
                        crate::registo::linha(&format!("áudio: na cache {}", final_.display()));
                    } else {
                        let _ = fs::remove_file(&temp);
                    }
                }
                return Ok(0);
            }
            self.encher()?;
        }
        let n = (self.buffer.len() - self.lido).min(saida.len());
        saida[..n].copy_from_slice(&self.buffer[self.lido..self.lido + n]);
        self.lido += n;
        Ok(n)
    }
}

impl Drop for DoGooglevideo {
    fn drop(&mut self) {
        // Interrompida a meio (um salto, outra música): a cópia incompleta sai.
        if let Some((f, temp, _)) = self.copia.take() {
            drop(f);
            let _ = fs::remove_file(temp);
        }
    }
}

/// O que o servidor local responde a `GET /audio/<id>` (com ou sem Range).
pub fn responder(caminho: &str, range: Option<&str>) -> tiny_http::ResponseBox {
    let id = caminho.trim_start_matches("/audio/").split(['?', '/']).next().unwrap_or("");
    let vazio = |estado: u16| tiny_http::Response::empty(estado).boxed();
    if !id_valido(id) {
        return vazio(404);
    }
    let cabecalho = |k: &str, v: &str| tiny_http::Header::from_bytes(k.as_bytes(), v.as_bytes()).unwrap();
    // Da cache, se lá estiver inteira.
    if let Some(ficheiro) = na_cache(id) {
        let Ok(mut f) = fs::File::open(&ficheiro) else { return vazio(500) };
        let total = f.metadata().map(|m| m.len()).unwrap_or(0);
        let tipo = tipo_da_extensao(ficheiro.extension().and_then(|e| e.to_str()).unwrap_or(""));
        return match intervalo(range, total) {
            Err(()) => vazio(416),
            Ok(None) => tiny_http::Response::new(200.into(), vec![cabecalho("Content-Type", tipo), cabecalho("Accept-Ranges", "bytes")], f, Some(total as usize), None).boxed(),
            Ok(Some((a, b))) => {
                if f.seek(SeekFrom::Start(a)).is_err() {
                    return vazio(500);
                }
                let corpo = f.take(b - a + 1);
                tiny_http::Response::new(206.into(), vec![cabecalho("Content-Type", tipo), cabecalho("Accept-Ranges", "bytes"), cabecalho("Content-Range", &format!("bytes {a}-{b}/{total}"))], corpo, Some((b - a + 1) as usize), None).boxed()
            }
        };
    }
    let fonte = match fonte_para_servir(id) {
        Ok(f) => f,
        Err(estado) => return vazio(estado),
    };
    let total = fonte.tamanho;
    let tipo = fonte.mime.split(';').next().unwrap_or("audio/webm").to_string();
    match intervalo(range, total) {
        Err(()) => vazio(416),
        Ok(None) => {
            let leitor = DoGooglevideo::novo(id, fonte, 0, total - 1);
            tiny_http::Response::new(200.into(), vec![cabecalho("Content-Type", &tipo), cabecalho("Accept-Ranges", "bytes")], leitor, Some(total as usize), None).boxed()
        }
        Ok(Some((a, b))) => {
            let leitor = DoGooglevideo::novo(id, fonte, a, b);
            tiny_http::Response::new(206.into(), vec![cabecalho("Content-Type", &tipo), cabecalho("Accept-Ranges", "bytes"), cabecalho("Content-Range", &format!("bytes {a}-{b}/{total}"))], leitor, Some((b - a + 1) as usize), None).boxed()
        }
    }
}

/// No arranque, a cache volta abaixo do limite, saindo primeiro as mais antigas.
/// Só aqui: podar a meio de uma música já fez a app do iPhone cair.
pub fn podar_cache() {
    let Some(pasta) = pasta_da_cache() else { return };
    let Ok(entradas) = fs::read_dir(&pasta) else { return };
    let mut ficheiros: Vec<(PathBuf, u64, std::time::SystemTime)> = Vec::new();
    for e in entradas.flatten() {
        let caminho = e.path();
        if caminho.extension().and_then(|x| x.to_str()) == Some("parcial") {
            let _ = fs::remove_file(&caminho);
            continue;
        }
        if let Ok(m) = e.metadata() {
            ficheiros.push((caminho, m.len(), m.modified().unwrap_or(std::time::UNIX_EPOCH)));
        }
    }
    ficheiros.sort_by_key(|f| std::cmp::Reverse(f.2));
    let mut total = 0;
    for (caminho, tamanho, _) in ficheiros {
        total += tamanho;
        if total > LIMITE_DA_CACHE {
            let _ = fs::remove_file(caminho);
        }
    }
}

/// A página regista o URL de uma música que resolveu; devolve o caminho a pôr no `<audio>`.
#[tauri::command]
pub fn audio_registar(janela: WebviewWindow, id: String, url: String, tamanho: u64, mime: String) -> Result<String, String> {
    if janela.label() != "main" {
        return Err("Pedido inválido.".into());
    }
    let fonte = validar(&id, &url, tamanho, &mime)?;
    FONTES.lock().unwrap().insert(id.clone(), fonte);
    Ok(format!("/audio/{id}"))
}

/// O rato parado em cima de uma música já resolvida: regista-a e vai buscar o 1.º
/// bocado em segundo plano. Não espera por nada; uma falha só deixa o clique ir à
/// rede como sempre (e um 4xx marca a fonte, para a renovação).
#[tauri::command]
pub fn audio_adiantar(janela: WebviewWindow, id: String, url: String, tamanho: u64, mime: String) -> Result<(), String> {
    if janela.label() != "main" {
        return Err("Pedido inválido.".into());
    }
    let fonte = validar(&id, &url, tamanho, &mime)?;
    FONTES.lock().unwrap().insert(id.clone(), fonte);
    if na_cache(&id).is_some() || ja_adiantado(&id, &url) || !A_ADIANTAR.lock().unwrap().insert(id.clone()) {
        return Ok(());
    }
    std::thread::spawn(move || {
        let fim = PRIMEIRO_BOCADO.min(tamanho) - 1;
        let t0 = std::time::Instant::now();
        let resposta = CLIENTE.get(&url).header("Range", format!("bytes=0-{fim}")).send();
        match resposta {
            Ok(r) if r.status().as_u16() == 206 || r.status().as_u16() == 200 => {
                if let Ok(bytes) = r.bytes() {
                    if bytes.len() as u64 == fim + 1 {
                        crate::registo::linha(&format!("áudio: 1.º bocado de {id} adiantado em {} ms", t0.elapsed().as_millis()));
                        guardar_adiantado(&id, &url, bytes.to_vec());
                    }
                }
            }
            Ok(r) => {
                let estado = r.status().as_u16();
                crate::registo::linha(&format!("áudio: adiantar {id}: googlevideo HTTP {estado}"));
                if (400..500).contains(&estado) {
                    marcar_expirada(&id, &url);
                }
            }
            Err(_) => {}
        }
        A_ADIANTAR.lock().unwrap().remove(&id);
    });
    Ok(())
}

/// Está inteira no disco? Então toca já, sem resolver nada.
#[tauri::command]
pub fn audio_na_cache(janela: WebviewWindow, id: String) -> Result<Value, String> {
    if janela.label() != "main" || !id_valido(&id) {
        return Err("Pedido inválido.".into());
    }
    Ok(match na_cache(&id) {
        Some(f) => json!({ "caminho": format!("/audio/{id}"), "bytes": fs::metadata(f).map(|m| m.len()).unwrap_or(0) }),
        None => Value::Null,
    })
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn os_intervalos() {
        assert_eq!(intervalo(None, 100), Ok(None));
        assert_eq!(intervalo(Some("bytes=0-"), 100), Ok(Some((0, 99))));
        assert_eq!(intervalo(Some("bytes=10-19"), 100), Ok(Some((10, 19))));
        assert_eq!(intervalo(Some("bytes=90-500"), 100), Ok(Some((90, 99))), "o fim encolhe ao tamanho");
        assert_eq!(intervalo(Some("bytes=-10"), 100), Ok(Some((90, 99))), "os últimos 10");
        assert_eq!(intervalo(Some("bytes=100-"), 100), Err(()), "depois do fim");
        assert_eq!(intervalo(Some("bytes=5-1"), 100), Err(()));
        assert_eq!(intervalo(Some("bytes=0-1,5-6"), 100), Err(()), "vários intervalos não");
        assert_eq!(intervalo(Some("items=0-1"), 100), Err(()));
    }

    #[test]
    fn os_bocados() {
        assert_eq!(proximo_bocado(0, 10_000_000, true), (0, PRIMEIRO_BOCADO - 1), "o 1.º é pequeno");
        assert_eq!(proximo_bocado(PRIMEIRO_BOCADO, 10_000_000, false), (PRIMEIRO_BOCADO, PRIMEIRO_BOCADO + BOCADO - 1));
        assert_eq!(proximo_bocado(3_000_000, 3_433_754, false), (3_000_000, 3_433_754), "o último encolhe");
    }

    #[test]
    fn o_que_se_regista() {
        let bom = "https://rr1---sn-abc.googlevideo.com/videoplayback?id=1";
        assert!(validar("dQw4w9WgXcQ", bom, 3_433_755, "audio/webm; codecs=\"opus\"").is_ok());
        assert!(validar("dQw4w9WgXcQ", bom, 3_433_755, "audio/mp4; codecs=\"mp4a.40.2\"").is_ok());
        assert!(validar("curto", bom, 10, "audio/webm").is_err());
        assert!(validar("dQw4w9WgXcQ", "http://rr1---sn-abc.googlevideo.com/x", 10, "audio/webm").is_err(), "só https");
        assert!(validar("dQw4w9WgXcQ", "https://evil.com/googlevideo.com", 10, "audio/webm").is_err());
        assert!(validar("dQw4w9WgXcQ", "https://googlevideo.com.evil.com/x", 10, "audio/webm").is_err());
        assert!(validar("dQw4w9WgXcQ", bom, 0, "audio/webm").is_err());
        assert!(validar("dQw4w9WgXcQ", bom, MAX_AUDIO + 1, "audio/webm").is_err());
        assert!(validar("dQw4w9WgXcQ", bom, 10, "video/mp4").is_err(), "só áudio");
    }

    #[test]
    fn os_adiantados_servem_uma_vez_ao_mesmo_url() {
        let (url, outro) = ("https://rr1---sn-a.googlevideo.com/v?a=1", "https://rr1---sn-a.googlevideo.com/v?a=2");
        guardar_adiantado("adiantadoA1", url, vec![1, 2, 3]);
        assert_eq!(tirar_adiantado("adiantadoA1", outro), None, "outro URL (renovado) não serve");
        assert_eq!(tirar_adiantado("adiantadoA1", url), Some(vec![1, 2, 3]));
        assert_eq!(tirar_adiantado("adiantadoA1", url), None, "só uma vez");
        // Só os últimos ADIANTADOS_MAX ficam.
        for i in 0..ADIANTADOS_MAX + 2 {
            guardar_adiantado(&format!("adiantadoB{i}"), url, vec![i as u8]);
        }
        assert_eq!(tirar_adiantado("adiantadoB0", url), None, "o mais antigo saiu");
        assert!(tirar_adiantado(&format!("adiantadoB{}", ADIANTADOS_MAX + 1), url).is_some());
    }

    #[test]
    fn a_fonte_recusada_responde_403_ate_se_renovar() {
        let id = "expiradaXyZ";
        let velho = "https://rr1---sn-abc.googlevideo.com/videoplayback?id=velho";
        let novo = "https://rr2---sn-abc.googlevideo.com/videoplayback?id=novo";
        assert_eq!(fonte_para_servir(id).err(), Some(404));
        FONTES.lock().unwrap().insert(id.into(), validar(id, velho, 1000, "audio/webm").unwrap());
        assert!(fonte_para_servir(id).is_ok());
        marcar_expirada(id, velho);
        assert_eq!(fonte_para_servir(id).err(), Some(403), "recusada: 403 logo");
        // A renovação regista outro URL: volta a servir-se.
        FONTES.lock().unwrap().insert(id.into(), validar(id, novo, 1000, "audio/webm").unwrap());
        assert!(fonte_para_servir(id).is_ok());
        // Um 403 atrasado do URL antigo não estraga o novo.
        marcar_expirada(id, velho);
        assert!(fonte_para_servir(id).is_ok());
    }
}
