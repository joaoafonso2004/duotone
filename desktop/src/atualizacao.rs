//! As atualizações (F9): o `electron/atualizacao.cjs` e o que o `main.cjs` faz com ele.
//!
//! - **De onde e o quê decide a casca:** o `versions.json` lê-se deste lado, e o
//!   instalador só é aceite se vier dos releases do próprio repositório, com a tag
//!   da versão anunciada, o nome do instalador do canal e o tamanho anunciado. Da
//!   página não vem nada (nem URL, nem versão).
//! - **O canal é da identidade** (`canal.rs`): a Preview procura `windowsPreview`,
//!   `win-preview-v<versão>/Duotone-Preview-Setup.exe`, e NUNCA corre o instalador da
//!   Duotone (Electron). Enquanto o `versions.json` não tiver essa entrada, a
//!   Preview está sempre "atual".
//! - **Sem perguntar (27/9):** em segundo plano descarrega para
//!   `<dados>/atualizacao`, escreve primeiro num `.parcial` e só o renomeia com o
//!   tamanho certo; deixa um `pendente.json`. Na abertura seguinte instala-o antes
//!   da janela; duas tentativas falhadas e desiste dessa versão.
//! - **Instalar já (11/11):** nada a tocar há 10 min, e a janela no tabuleiro ou o
//!   PC sem uso há 10 min, e só numa instalação por utilizador. A janela volta
//!   como estava (`reabrir.json`).
//! - **O relógio:** 5 s depois de abrir, depois de 15 em 15 min (1 min depois de
//!   um erro); voltar à app ou acordar o PC antecipa-o, sem um pedido por Alt+Tab.
//! - Só no .exe de release, como o `app.isPackaged` do Electron.

use std::{
    cmp::Ordering,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering as Atomica},
        Condvar, Mutex, OnceLock,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, WebviewWindow};

pub const VERSOES_URL: &str = "https://joaoafonso.vercel.app/ota/versions.json";
const CAMINHO_DOS_INSTALADORES: &str = "/joaoafonso2004/duotone/releases/download/";
const SEM_DADOS: Duration = Duration::from_secs(45);
const TENTATIVAS_DE_INSTALACAO: u64 = 2;
const PARADA_MINIMA: Duration = Duration::from_secs(10 * 60);
const SEM_USO_MINIMO_S: u64 = 10 * 60;
const MARCA_VALIDA_MS: u64 = 10 * 60_000;

/// O canal das atualizações desta identidade.
pub struct Canal {
    /// A entrada em `apps.duotone` do `versions.json`.
    pub entrada: &'static str,
    /// O prefixo da tag do release (`win-v`, `win-preview-v`).
    pub tag: &'static str,
    /// O nome do instalador publicado no release.
    pub instalador: &'static str,
}
const CANAL: Canal = Canal {
    entrada: crate::canal::ATUALIZACAO_ENTRADA,
    tag: crate::canal::ATUALIZACAO_TAG,
    instalador: crate::canal::ATUALIZACAO_INSTALADOR,
};

// --- as regras (puras, com os casos do scripts/test-atualizacao-windows.mjs) ---

/// Por números, não por texto ("3.10.0" > "3.9.9"); o "v" e o "-beta" não contam.
pub fn comparar_versoes(a: &str, b: &str) -> Ordering {
    let partes = |v: &str| -> Vec<u64> {
        let v = v.strip_prefix('v').unwrap_or(v);
        v.split('-').next().unwrap_or("").split('.').map(|n| n.chars().take_while(char::is_ascii_digit).collect::<String>().parse().unwrap_or(0)).collect()
    };
    let (x, y) = (partes(a), partes(b));
    (0..x.len().max(y.len())).map(|i| x.get(i).unwrap_or(&0).cmp(y.get(i).unwrap_or(&0))).find(|o| o.is_ne()).unwrap_or(Ordering::Equal)
}

fn versao_valida(v: &str) -> bool {
    let partes: Vec<&str> = v.split('.').collect();
    partes.len() == 3 && partes.iter().all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()))
}

#[derive(Debug, Clone, PartialEq)]
pub struct Alvo {
    pub versao: String,
    pub url: String,
    pub tamanho: u64,
}

/// O instalador a descarregar, ou nada: sem versão MAIS NOVA, ou quando o que o
/// `versions.json` diz não passa no crivo.
pub fn escolher_instalador(versoes: &Value, atual: &str, canal: &Canal) -> Option<Alvo> {
    let w = versoes.get("apps")?.get("duotone")?.get(canal.entrada)?;
    let versao = w.get("version")?.as_str()?;
    if !versao_valida(versao) || comparar_versoes(versao, atual) != Ordering::Greater {
        return None;
    }
    let asset = w.get("asset")?;
    // O `Url` resolve os `..`: o caminho que se compara é o verdadeiro.
    let url = reqwest::Url::parse(asset.get("url")?.as_str()?).ok()?;
    let esperado = format!("{CAMINHO_DOS_INSTALADORES}{}{versao}/{}", canal.tag, canal.instalador);
    if url.scheme() != "https" || url.host_str() != Some("github.com") || url.port().is_some() || !url.username().is_empty() || url.path() != esperado {
        return None;
    }
    let tamanho = asset.get("size").and_then(|t| t.as_u64().or_else(|| t.as_f64().filter(|f| f.fract() == 0.0 && *f >= 0.0).map(|f| f as u64)))?;
    if !(1_000_000..=2_000_000_000).contains(&tamanho) {
        return None;
    }
    Some(Alvo { versao: versao.to_string(), url: url.to_string(), tamanho })
}

#[derive(Debug, PartialEq)]
pub enum Decisao {
    Nada,
    Limpar,
    Desistir,
    Instalar,
}

/// Na abertura, o que fazer com o `pendente.json`.
pub fn decidir_ao_abrir(pendente: Option<&Value>, atual: &str, tamanho_no_disco: i64) -> Decisao {
    let Some(p) = pendente.filter(|p| p.is_object()) else { return Decisao::Nada };
    let Some(versao) = p.get("versao").and_then(Value::as_str) else { return Decisao::Nada };
    if p.get("desistiu").and_then(Value::as_bool) == Some(true) {
        return Decisao::Nada;
    }
    if comparar_versoes(versao, atual) != Ordering::Greater {
        return Decisao::Limpar;
    }
    let tamanho = p.get("tamanho").and_then(Value::as_u64);
    if p.get("caminho").and_then(Value::as_str).is_none() || tamanho.is_none() || tamanho.map(|t| t as i64) != Some(tamanho_no_disco) {
        return Decisao::Limpar;
    }
    if p.get("tentativas").and_then(Value::as_u64).unwrap_or(0) >= TENTATIVAS_DE_INSTALACAO {
        return Decisao::Desistir;
    }
    Decisao::Instalar
}

/// Em segundo plano: vale a pena descarregar? Não se já está inteiro nem se se desistiu.
pub fn precisa_de_descarregar(alvo: &Alvo, pendente: Option<&Value>, tamanho_no_disco: i64) -> bool {
    if let Some(p) = pendente.filter(|p| p.get("versao").and_then(Value::as_str) == Some(alvo.versao.as_str())) {
        if p.get("desistiu").and_then(Value::as_bool) == Some(true) || tamanho_no_disco == alvo.tamanho as i64 {
            return false;
        }
    }
    true
}

pub struct Condicoes {
    pub por_utilizador: bool,
    pub a_tocar: bool,
    pub parada_ha: Option<Duration>,
    /// "escondida" | "minimizada" | "visivel"
    pub janela: &'static str,
    pub sem_uso_ha_s: u64,
}

/// Instalar já, sem esperar por uma abertura de raiz?
pub fn pode_instalar_ja(c: &Condicoes) -> bool {
    if !c.por_utilizador || c.a_tocar || !c.parada_ha.is_some_and(|p| p >= PARADA_MINIMA) {
        return false;
    }
    c.janela == "escondida" || c.sem_uso_ha_s >= SEM_USO_MINIMO_S
}

/// O instalador por utilizador fica no %LOCALAPPDATA% (o "para todos" pede UAC).
pub fn instalacao_por_utilizador(exe: &str, local_app_data: &str) -> bool {
    if local_app_data.is_empty() {
        return false;
    }
    let pasta = format!("{}\\", local_app_data.trim_end_matches(['\\', '/']).replace('/', "\\").to_lowercase());
    exe.replace('/', "\\").to_lowercase().starts_with(&pasta)
}

/// Como volta a janela depois de uma instalação feita sozinha: escondida fica no
/// tabuleiro; o resto volta minimizada. Uma marca com mais de 10 min não conta.
pub fn como_reabrir(marca: Option<&Value>, agora_ms: u64) -> Option<&'static str> {
    let m = marca?;
    let janela = m.get("janela")?.as_str()?;
    if !["escondida", "minimizada", "visivel"].contains(&janela) {
        return None;
    }
    let em = m.get("em")?.as_u64()?;
    let idade = agora_ms.checked_sub(em)?;
    if idade > MARCA_VALIDA_MS {
        return None;
    }
    Some(if janela == "escondida" { "escondida" } else { "minimizada" })
}

/// O relógio da procura automática, sem tempo real (testado à parte).
pub struct Relogio {
    ativa: bool,
    proxima: Option<Instant>,
    ultima: Instant,
    em_curso: bool,
}

impl Relogio {
    pub fn new(agora: Instant) -> Self {
        Relogio { ativa: false, proxima: None, ultima: agora, em_curso: false }
    }
    pub fn iniciar(&mut self, agora: Instant) {
        if !self.ativa {
            self.ativa = true;
            self.marcar(agora, Duration::from_secs(5));
        }
    }
    /// Marca a próxima procura; eventos repetidos não a empurram para a frente.
    fn marcar(&mut self, agora: Instant, atraso: Duration) {
        if !self.ativa || self.em_curso {
            return;
        }
        let instante = agora + atraso;
        if self.proxima.is_some_and(|p| p <= instante) {
            return;
        }
        self.proxima = Some(instante);
    }
    /// Voltar à app ou acordar o PC: antecipa, mas nunca mais do que uma vez por minuto.
    pub fn retomar(&mut self, agora: Instant) {
        if agora.duration_since(self.ultima) >= Duration::from_secs(60) {
            self.marcar(agora, Duration::from_secs(1));
        }
    }
    pub fn vencida(&self, agora: Instant) -> bool {
        self.proxima.is_some_and(|p| agora >= p)
    }
    /// Começa uma procura (a do relógio ou a do botão), que substitui a marcada.
    pub fn comecar(&mut self) -> bool {
        if self.em_curso || !self.ativa {
            return false;
        }
        self.em_curso = true;
        self.proxima = None;
        true
    }
    pub fn acabar(&mut self, agora: Instant, erro: bool) {
        self.ultima = agora;
        self.em_curso = false;
        self.marcar(agora, Duration::from_secs(if erro { 60 } else { 15 * 60 }));
    }
    /// Sair cancela o relógio (a thread acaba com o processo; isto é para os testes).
    #[cfg(test)]
    pub fn parar(&mut self) {
        self.ativa = false;
        self.proxima = None;
    }
}

// --- o disco ---

static PASTA: OnceLock<PathBuf> = OnceLock::new();
static VERSAO: OnceLock<String> = OnceLock::new();
static REABRIR: Mutex<Option<&'static str>> = Mutex::new(None);

fn disponivel() -> bool {
    !cfg!(debug_assertions)
}

fn pasta() -> Option<&'static Path> {
    PASTA.get().map(PathBuf::as_path)
}

fn versao_atual() -> &'static str {
    VERSAO.get().map(String::as_str).unwrap_or("0.0.0")
}

fn agora_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn tamanho_de(caminho: &Path) -> i64 {
    fs::metadata(caminho).map(|m| m.len() as i64).unwrap_or(-1)
}

fn ficheiro_pendente() -> Option<PathBuf> {
    pasta().map(|p| p.join("pendente.json"))
}

fn ler_json(f: &Path) -> Option<Value> {
    serde_json::from_str(&fs::read_to_string(f).ok()?).ok()
}

fn ler_pendente() -> Option<Value> {
    ler_json(&ficheiro_pendente()?)
}

fn gravar_pendente(valor: &Value) -> Result<(), String> {
    let f = ficheiro_pendente().ok_or("sem pasta de dados")?;
    fs::create_dir_all(f.parent().unwrap_or(Path::new("."))).map_err(|e| e.to_string())?;
    fs::write(f, valor.to_string()).map_err(|e| e.to_string())
}

/// O nome do instalador descarregado: `Duotone-Preview-Setup-0.2.0.exe`.
fn nome_do_instalador(versao: &str) -> String {
    let base = CANAL.instalador.strip_suffix(".exe").unwrap_or(CANAL.instalador);
    format!("{base}-{versao}.exe")
}

/// Apaga os instaladores (e os parciais) que sobraram, menos `manter`.
fn apagar_instaladores(manter: Option<&Path>) {
    let Some(p) = pasta() else { return };
    let base = format!("{}-", CANAL.instalador.strip_suffix(".exe").unwrap_or(CANAL.instalador));
    for entrada in fs::read_dir(p).into_iter().flatten().flatten() {
        let nome = entrada.file_name().to_string_lossy().to_string();
        if nome.starts_with(&base) && (nome.ends_with(".exe") || nome.ends_with(".exe.parcial")) && Some(entrada.path().as_path()) != manter {
            let _ = fs::remove_file(entrada.path());
        }
    }
}

// --- a rede (só em threads próprias: o cliente bloqueante não corre dentro do tokio) ---

fn cliente() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        // No cliente bloqueante, o prazo conta em cada leitura: "45 s sem dados".
        .timeout(SEM_DADOS)
        .build()
        .map_err(|e| e.to_string())
}

fn buscar_versoes() -> Result<Value, String> {
    let r = cliente()?
        .get(VERSOES_URL)
        .header("Cache-Control", "no-store")
        .timeout(Duration::from_secs(15))
        .send()
        .map_err(|e| e.to_string())?;
    if !r.status().is_success() {
        return Err(format!("versions.json HTTP {}", r.status().as_u16()));
    }
    r.json().map_err(|e| e.to_string())
}

/// Descarrega para `destino` com o progresso de 0 a 1 (de ponto em ponto percentual).
/// Escreve num `.parcial` e só o renomeia com o tamanho CERTO.
fn descarregar(url: &str, destino: &Path, tamanho: u64, mut progresso: impl FnMut(f64)) -> Result<(), String> {
    let parcial = PathBuf::from(format!("{}.parcial", destino.display()));
    let resultado = (|| {
        let mut r = cliente()?.get(url).send().map_err(|e| e.to_string())?;
        if !r.status().is_success() {
            return Err(format!("HTTP {}", r.status().as_u16()));
        }
        let _ = fs::remove_file(&parcial);
        let mut ficheiro = fs::File::create(&parcial).map_err(|e| e.to_string())?;
        let mut bocado = vec![0u8; 64 * 1024];
        let (mut recebidos, mut ultimo_passo) = (0u64, u64::MAX);
        loop {
            let n = r.read(&mut bocado).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            recebidos += n as u64;
            if recebidos > tamanho {
                return Err("Maior do que o anunciado.".into());
            }
            ficheiro.write_all(&bocado[..n]).map_err(|e| e.to_string())?;
            let passo = recebidos * 100 / tamanho;
            if passo != ultimo_passo {
                ultimo_passo = passo;
                progresso(recebidos as f64 / tamanho as f64);
            }
        }
        ficheiro.sync_all().map_err(|e| e.to_string())?;
        drop(ficheiro);
        if recebidos != tamanho {
            return Err("Tamanho diferente do anunciado.".into());
        }
        // Uma tentativa anterior da mesma versão só sai depois de esta estar inteira.
        let _ = fs::remove_file(destino);
        fs::rename(&parcial, destino).map_err(|e| e.to_string())
    })();
    if resultado.is_err() {
        let _ = fs::remove_file(&parcial);
    }
    resultado
}

/// O NSIS fecha a app, instala por cima e (com `--force-run`) reabre-a.
fn lancar_instalador(instalador: &Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const DETACHED_PROCESS: u32 = 0x0000_0008;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    std::process::Command::new(instalador)
        .args(["/S", "--updated", "--force-run"])
        .creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

// --- a app ---

/// No arranque, antes de tudo: a pasta, a versão e a marca de reabrir.
pub fn preparar(app: &AppHandle) {
    if let Ok(dados) = app.path().app_data_dir() {
        let _ = PASTA.set(dados.join("atualizacao"));
    }
    let _ = VERSAO.set(app.package_info().version.to_string());
    let Some(f) = pasta().map(|p| p.join("reabrir.json")) else { return };
    let marca = ler_json(&f);
    let _ = fs::remove_file(&f); // lê-se uma vez; a idade trava o resto
    *REABRIR.lock().unwrap_or_else(|e| e.into_inner()) = como_reabrir(marca.as_ref(), agora_ms());
}

/// Reaberta pelo instalador de uma atualização feita sozinha: "escondida" ou "minimizada".
pub fn tirar_reabrir() -> Option<&'static str> {
    REABRIR.lock().unwrap_or_else(|e| e.into_inner()).take()
}

/// Na abertura: true quando o instalador arrancou e a app tem de sair já.
pub fn instalar_pendente_ao_abrir() -> bool {
    if !disponivel() {
        return false;
    }
    let pendente = ler_pendente();
    let caminho = pendente.as_ref().and_then(|p| p.get("caminho")).and_then(Value::as_str).map(PathBuf::from);
    let tamanho = caminho.as_deref().map(tamanho_de).unwrap_or(-1);
    match decidir_ao_abrir(pendente.as_ref(), versao_atual(), tamanho) {
        Decisao::Limpar => {
            apagar_instaladores(None);
            if let Some(f) = ficheiro_pendente() {
                let _ = fs::remove_file(f);
            }
            false
        }
        Decisao::Desistir => {
            apagar_instaladores(None);
            let versao = pendente.as_ref().and_then(|p| p.get("versao")).cloned().unwrap_or(Value::Null);
            let _ = gravar_pendente(&json!({ "versao": versao, "desistiu": true }));
            crate::registo::linha("atualização: desistiu desta versão (2 tentativas)");
            false
        }
        Decisao::Instalar => {
            // A tentativa conta ANTES de correr: se falhar, é esta contagem que deixa desistir.
            let (Some(mut p), Some(caminho)) = (pendente, caminho) else { return false };
            p["tentativas"] = json!(p.get("tentativas").and_then(Value::as_u64).unwrap_or(0) + 1);
            if gravar_pendente(&p).is_err() {
                return false;
            }
            match lancar_instalador(&caminho) {
                Ok(()) => {
                    crate::registo::linha("atualização: a instalar ao abrir");
                    true
                }
                Err(e) => {
                    crate::registo::linha(&format!("atualização: o instalador não arrancou ({e})"));
                    false
                }
            }
        }
        Decisao::Nada => false,
    }
}

/// O download em curso, para o About: { versao, fracao }, ou nada.
static DESCARGA: Mutex<Option<Value>> = Mutex::new(None);
static APP: OnceLock<AppHandle> = OnceLock::new();

fn avisar_descarga(estado: Option<Value>) {
    *DESCARGA.lock().unwrap_or_else(|e| e.into_inner()) = estado.clone();
    if let Some(j) = APP.get().and_then(|a| a.get_webview_window("main")) {
        crate::ponte::entregar(&j, "atualizacao:descarga", estado.unwrap_or(Value::Null));
    }
}

/// A procura em segundo plano: 'atual' | 'pronta' | 'desistiu' | 'erro', e a versão.
fn procurar() -> Value {
    if !disponivel() {
        return json!({ "estado": "atual" });
    }
    let resultado = (|| -> Result<Value, String> {
        let versoes = buscar_versoes()?;
        let Some(alvo) = escolher_instalador(&versoes, versao_atual(), &CANAL) else { return Ok(json!({ "estado": "atual" })) };
        let pasta = pasta().ok_or("sem pasta de dados")?;
        let pendente = ler_pendente();
        let instalador = pasta.join(nome_do_instalador(&alvo.versao));
        if !precisa_de_descarregar(&alvo, pendente.as_ref(), tamanho_de(&instalador)) {
            let desistiu = pendente.as_ref().is_some_and(|p| p.get("desistiu").and_then(Value::as_bool) == Some(true) && p.get("versao").and_then(Value::as_str) == Some(alvo.versao.as_str()));
            if !desistiu {
                vigiar_instalacao();
            }
            return Ok(json!({ "estado": if desistiu { "desistiu" } else { "pronta" }, "versao": alvo.versao }));
        }
        fs::create_dir_all(pasta).map_err(|e| e.to_string())?;
        avisar_descarga(Some(json!({ "versao": alvo.versao, "fracao": 0 })));
        let feito = descarregar(&alvo.url, &instalador, alvo.tamanho, |fracao| avisar_descarga(Some(json!({ "versao": alvo.versao, "fracao": fracao }))));
        avisar_descarga(None);
        feito?;
        apagar_instaladores(Some(&instalador));
        gravar_pendente(&json!({ "versao": alvo.versao, "caminho": instalador.display().to_string(), "tamanho": alvo.tamanho, "tentativas": 0 }))?;
        crate::registo::linha(&format!("atualização: {} descarregada", alvo.versao));
        vigiar_instalacao();
        Ok(json!({ "estado": "pronta", "versao": alvo.versao }))
    })();
    let resultado = resultado.unwrap_or_else(|e| {
        crate::registo::linha(&format!("atualização: a procura falhou ({e})"));
        json!({ "estado": "erro" })
    });
    // A 1.ª procura de cada arranque fica no registo (as seguintes só quando há novidade).
    static PRIMEIRA: AtomicBool = AtomicBool::new(true);
    if PRIMEIRA.swap(false, Atomica::SeqCst) {
        crate::registo::linha(&format!("atualização: 1.ª procura ({}, versão {}, canal {}): {}", VERSOES_URL, versao_atual(), CANAL.entrada, resultado["estado"]));
    }
    resultado
}

/// O relógio partilhado, e o resultado da última procura (para quem esperou por ela).
struct Fila {
    relogio: Relogio,
    ultimo: Value,
    geracao: u64,
}
static FILA: OnceLock<(Mutex<Fila>, Condvar)> = OnceLock::new();

fn fila() -> &'static (Mutex<Fila>, Condvar) {
    FILA.get_or_init(|| (Mutex::new(Fila { relogio: Relogio::new(Instant::now()), ultimo: json!({ "estado": "atual" }), geracao: 0 }), Condvar::new()))
}

/// Procura agora (o relógio ou o "Check for updates"). Uma procura em curso é
/// partilhada: quem chega a meio espera pelo resultado dela, não faz outra.
fn verificar() -> Value {
    let (trinco, sinal) = fila();
    let mut f = trinco.lock().unwrap_or_else(|e| e.into_inner());
    if f.relogio.em_curso {
        let geracao = f.geracao;
        while f.geracao == geracao {
            f = sinal.wait(f).unwrap_or_else(|e| e.into_inner());
        }
        return f.ultimo.clone();
    }
    if !f.relogio.comecar() {
        return procurar(); // sem relógio (desenvolvimento): procura direta, que diz "atual"
    }
    drop(f);
    let resultado = procurar();
    let mut f = trinco.lock().unwrap_or_else(|e| e.into_inner());
    f.relogio.acabar(Instant::now(), resultado["estado"] == "erro");
    f.ultimo = resultado.clone();
    f.geracao += 1;
    sinal.notify_all();
    resultado
}

/// Arranca o relógio (só no .exe de release).
pub fn iniciar(app: &AppHandle) {
    let _ = APP.set(app.clone());
    if !disponivel() {
        return;
    }
    let (trinco, sinal) = fila();
    trinco.lock().unwrap_or_else(|e| e.into_inner()).relogio.iniciar(Instant::now());
    std::thread::spawn(move || loop {
        let f = trinco.lock().unwrap_or_else(|e| e.into_inner());
        if !f.relogio.ativa {
            return;
        }
        let agora = Instant::now();
        if f.relogio.vencida(agora) && !f.relogio.em_curso {
            drop(f);
            let _ = verificar();
            continue;
        }
        let espera = f.relogio.proxima.map(|p| p.saturating_duration_since(agora)).unwrap_or(Duration::from_secs(3600));
        let _ = sinal.wait_timeout(f, espera.max(Duration::from_millis(50)));
    });
}

/// Voltar à app ou acordar o PC antecipa a procura.
pub fn retomar() {
    let (trinco, sinal) = fila();
    trinco.lock().unwrap_or_else(|e| e.into_inner()).relogio.retomar(Instant::now());
    sinal.notify_all();
}

/// Instalar já, se for altura: 'instalou' (a app sai), 'espera' ou 'nada'.
fn instalar_pronta_se_puder() -> &'static str {
    let Some(app) = APP.get() else { return "nada" };
    if !disponivel() {
        return "nada";
    }
    let pendente = ler_pendente();
    let caminho = pendente.as_ref().and_then(|p| p.get("caminho")).and_then(Value::as_str).map(PathBuf::from);
    let tamanho = caminho.as_deref().map(tamanho_de).unwrap_or(-1);
    if decidir_ao_abrir(pendente.as_ref(), versao_atual(), tamanho) != Decisao::Instalar {
        return "nada";
    }
    let janela = app.get_webview_window("main").map(|j| estado_da_janela(&j)).unwrap_or("visivel");
    let (a_tocar, parada_ha) = crate::barra::a_tocar_e_parada();
    let exe = std::env::current_exe().map(|e| e.display().to_string()).unwrap_or_default();
    let condicoes = Condicoes {
        por_utilizador: instalacao_por_utilizador(&exe, &std::env::var("LOCALAPPDATA").unwrap_or_default()),
        a_tocar,
        parada_ha,
        janela,
        sem_uso_ha_s: crate::ponte::segundos_sem_uso().unwrap_or(0),
    };
    if !pode_instalar_ja(&condicoes) {
        return "espera";
    }
    let (Some(mut p), Some(caminho)) = (pendente, caminho) else { return "nada" };
    p["tentativas"] = json!(p.get("tentativas").and_then(Value::as_u64).unwrap_or(0) + 1);
    let marca = pasta().map(|d| d.join("reabrir.json"));
    if gravar_pendente(&p).is_err() {
        return "nada";
    }
    if let Some(m) = &marca {
        let _ = fs::write(m, json!({ "janela": janela, "em": agora_ms() }).to_string());
    }
    match lancar_instalador(&caminho) {
        Ok(()) => {
            crate::registo::linha("atualização: a instalar em segundo plano");
            app.exit(0);
            "instalou"
        }
        Err(e) => {
            crate::registo::linha(&format!("atualização: o instalador não arrancou ({e})"));
            if let Some(m) = &marca {
                let _ = fs::remove_file(m);
            }
            "nada"
        }
    }
}

fn estado_da_janela(j: &WebviewWindow) -> &'static str {
    if !j.is_visible().unwrap_or(true) {
        "escondida"
    } else if j.is_minimized().unwrap_or(false) {
        "minimizada"
    } else {
        "visivel"
    }
}

/// Com uma versão pronta, de dez em dez minutos vê se já é altura. Só memória e o
/// tempo sem uso do Windows: nenhum pedido à rede.
static A_VIGIAR: AtomicBool = AtomicBool::new(false);
fn vigiar_instalacao() {
    if !disponivel() || A_VIGIAR.swap(true, Atomica::SeqCst) {
        return;
    }
    std::thread::spawn(|| {
        loop {
            std::thread::sleep(Duration::from_secs(10 * 60));
            if instalar_pronta_se_puder() != "espera" {
                break;
            }
        }
        A_VIGIAR.store(false, Atomica::SeqCst);
    });
}

/// Corre `f` numa thread própria e espera pelo resultado sem prender o tokio.
async fn noutra_thread<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(f());
    });
    tauri::async_runtime::spawn_blocking(move || rx.recv().map_err(|e| e.to_string())).await.map_err(|e| e.to_string())?
}

fn da_janela_principal(janela: &WebviewWindow) -> Result<(), String> {
    if janela.label() == "main" { Ok(()) } else { Err("Pedido inválido.".into()) }
}

/// "Check for updates": procura agora (partilha a procura em curso).
#[tauri::command]
pub async fn atualizacao_procurar(janela: WebviewWindow) -> Result<Value, String> {
    da_janela_principal(&janela)?;
    noutra_thread(verificar).await
}

/// O About aberto a meio de um download pergunta onde vai.
#[tauri::command]
pub fn atualizacao_descarga(janela: WebviewWindow) -> Result<Value, String> {
    da_janela_principal(&janela)?;
    Ok(DESCARGA.lock().unwrap_or_else(|e| e.into_inner()).clone().unwrap_or(Value::Null))
}

static A_INSTALAR: Mutex<()> = Mutex::new(());

/// "Update now": descarrega com progresso, corre o instalador e a app sai.
#[tauri::command]
pub async fn atualizacao_instalar(app: AppHandle, janela: WebviewWindow) -> Result<Value, String> {
    da_janela_principal(&janela)?;
    if !disponivel() {
        return Ok(json!({ "ok": false, "erro": "Updates install from the installed Windows app." }));
    }
    noutra_thread(move || {
        let _so_um = A_INSTALAR.lock().unwrap_or_else(|e| e.into_inner());
        let resultado = (|| -> Result<Value, String> {
            let versoes = buscar_versoes()?;
            let Some(alvo) = escolher_instalador(&versoes, versao_atual(), &CANAL) else {
                return Ok(json!({ "ok": false, "erro": "No newer version is available." }));
            };
            let pasta = std::env::temp_dir().join("duotone-atualizacao");
            fs::create_dir_all(&pasta).map_err(|e| e.to_string())?;
            let instalador = pasta.join(nome_do_instalador(&alvo.versao));
            descarregar(&alvo.url, &instalador, alvo.tamanho, |fracao| {
                if let Some(j) = app.get_webview_window("main") {
                    crate::ponte::entregar(&j, "atualizacao:progresso", json!(fracao));
                }
            })?;
            lancar_instalador(&instalador)?;
            crate::registo::linha(&format!("atualização: {} a instalar (Update now)", alvo.versao));
            // Sair a SÉRIO (não para o tabuleiro), para o instalador não encontrar a app aberta.
            let app_que_sai = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(400));
                app_que_sai.exit(0);
            });
            Ok(json!({ "ok": true, "versao": alvo.versao }))
        })();
        resultado.unwrap_or_else(|e| {
            crate::registo::linha(&format!("atualização: o Update now falhou ({e})"));
            json!({ "ok": false, "erro": "Could not download the update. Check your connection and try again." })
        })
    })
    .await
}

#[cfg(test)]
mod testes {
    use super::*;

    const ELECTRON: Canal = Canal { entrada: "windows", tag: "win-v", instalador: "Duotone-Setup.exe" };
    const URL: &str = "https://github.com/joaoafonso2004/duotone/releases/download/win-v3.3.0/Duotone-Setup.exe";

    fn versoes(windows: Value) -> Value {
        json!({ "apps": { "duotone": { "windows": windows } } })
    }
    fn bom() -> Value {
        json!({ "version": "3.3.0", "asset": { "url": URL, "size": 115820376u64 } })
    }
    fn com_asset(url: Option<&str>, size: Option<Value>) -> Value {
        let mut b = bom();
        if let Some(u) = url {
            b["asset"]["url"] = json!(u);
        }
        if let Some(s) = size {
            b["asset"]["size"] = s;
        }
        versoes(b)
    }

    #[test]
    fn a_versao() {
        assert_eq!(escolher_instalador(&versoes(bom()), "3.2.0", &ELECTRON), Some(Alvo { versao: "3.3.0".into(), url: URL.into(), tamanho: 115820376 }));
        assert_eq!(escolher_instalador(&versoes(bom()), "3.3.0", &ELECTRON), None, "a mesma versão não se reinstala");
        assert_eq!(escolher_instalador(&versoes(bom()), "3.4.0", &ELECTRON), None, "uma mais antiga não se instala");
        assert_eq!(comparar_versoes("3.10.0", "3.9.9"), Ordering::Greater, "por números, não por texto");
        assert_eq!(comparar_versoes("v6.1.2", "6.1.2-beta"), Ordering::Equal);
        assert_eq!(comparar_versoes("6.1", "6.1.0"), Ordering::Equal);
        assert_eq!(escolher_instalador(&versoes(bom()), "3.10.0", &ELECTRON), None);
    }

    #[test]
    fn de_onde_vem_o_instalador() {
        let nao = |v: Value, porque: &str| assert_eq!(escolher_instalador(&v, "3.2.0", &ELECTRON), None, "{porque}");
        nao(com_asset(Some("https://evil.test/Duotone-Setup.exe"), None), "outro servidor não");
        nao(com_asset(Some(&URL.replace("https:", "http:")), None), "sem HTTPS não");
        nao(com_asset(Some("https://github.com/outra-pessoa/duotone/releases/download/v1/Duotone-Setup.exe"), None), "outro repositório não");
        nao(com_asset(Some("https://github.com/joaoafonso2004/duotone/releases/download/../../../outra/x.exe"), None), "um caminho com .. não sai do repositório");
        nao(com_asset(Some(&URL.replace(".exe", ".zip")), None), "só um .exe");
        nao(com_asset(Some(&URL.replace("win-v3.3.0", "win-v3.2.0")), None), "a tag tem de ser a versão anunciada");
        nao(com_asset(Some(&URL.replace("Duotone-Setup.exe", "outro.exe")), None), "só o instalador publicado");
        nao(com_asset(Some(&URL.replace("github.com", "github.com:8443")), None), "nem outra porta");
        nao(com_asset(Some(&URL.replace("https://", "https://x@")), None), "nem credenciais no URL");
        nao(com_asset(None, Some(Value::Null)), "sem tamanho não se confirma o download");
        nao(com_asset(None, Some(json!(12))), "um tamanho absurdo não");
        let mut v = bom();
        v["version"] = json!("3.3");
        nao(versoes(v), "uma versão mal escrita não");
        nao(Value::Null, "sem versions.json");
    }

    #[test]
    fn a_preview_nunca_corre_o_instalador_da_duotone() {
        // O versions.json de hoje (21/11): só a entrada `windows`, a do Electron.
        let hoje = json!({ "apps": { "duotone": { "windows": { "version": "6.1.2", "asset": {
            "url": "https://github.com/joaoafonso2004/duotone/releases/download/win-v6.1.2/Duotone-Setup.exe", "size": 116491463u64 } } } } });
        assert_eq!(escolher_instalador(&hoje, "0.1.0", &CANAL), None, "sem a entrada do canal, a Preview está atual");
        // Mesmo que alguém pusesse o instalador do Electron na entrada da Preview.
        let trocado = json!({ "apps": { "duotone": { CANAL.entrada: { "version": "6.1.2", "asset": {
            "url": "https://github.com/joaoafonso2004/duotone/releases/download/win-v6.1.2/Duotone-Setup.exe", "size": 116491463u64 } } } } });
        assert_eq!(escolher_instalador(&trocado, "0.1.0", &CANAL), None, "o instalador tem de ser o do canal");
        let certo = format!("https://github.com/joaoafonso2004/duotone/releases/download/{}0.2.0/{}", CANAL.tag, CANAL.instalador);
        let preview = json!({ "apps": { "duotone": { CANAL.entrada: { "version": "0.2.0", "asset": { "url": certo, "size": 9_000_000u64 } } } } });
        assert_eq!(escolher_instalador(&preview, "0.1.0", &CANAL).map(|a| a.versao), Some("0.2.0".into()));
        assert_eq!(nome_do_instalador("0.2.0"), format!("{}-0.2.0.exe", CANAL.instalador.trim_end_matches(".exe")));
    }

    #[test]
    fn ao_abrir() {
        let pend = |extra: Value| {
            let mut p = json!({ "versao": "3.9.0", "caminho": "C:\\x\\Duotone-Setup-3.9.0.exe", "tamanho": 115820376u64, "tentativas": 0 });
            for (k, v) in extra.as_object().unwrap() {
                p[k] = v.clone();
            }
            p
        };
        assert_eq!(decidir_ao_abrir(None, "3.8.9", -1), Decisao::Nada);
        assert_eq!(decidir_ao_abrir(Some(&pend(json!({}))), "3.8.9", 115820376), Decisao::Instalar);
        assert_eq!(decidir_ao_abrir(Some(&pend(json!({}))), "3.9.0", 115820376), Decisao::Limpar, "já instalada");
        assert_eq!(decidir_ao_abrir(Some(&pend(json!({}))), "3.8.9", 1234), Decisao::Limpar, "um ficheiro cortado nunca corre");
        assert_eq!(decidir_ao_abrir(Some(&pend(json!({ "tentativas": 1 }))), "3.8.9", 115820376), Decisao::Instalar);
        assert_eq!(decidir_ao_abrir(Some(&pend(json!({ "tentativas": 2 }))), "3.8.9", 115820376), Decisao::Desistir);
        assert_eq!(decidir_ao_abrir(Some(&json!({ "versao": "3.9.0", "desistiu": true })), "3.8.9", -1), Decisao::Nada);
        let alvo = Alvo { versao: "3.9.0".into(), url: URL.into(), tamanho: 115820376 };
        assert!(precisa_de_descarregar(&alvo, None, -1));
        assert!(!precisa_de_descarregar(&alvo, Some(&pend(json!({}))), 115820376), "já inteira");
        assert!(precisa_de_descarregar(&alvo, Some(&pend(json!({}))), 10), "cortada");
        assert!(!precisa_de_descarregar(&alvo, Some(&json!({ "versao": "3.9.0", "desistiu": true })), -1));
        assert!(precisa_de_descarregar(&Alvo { versao: "3.9.1".into(), ..alvo }, Some(&json!({ "versao": "3.9.0", "desistiu": true })), -1));
    }

    #[test]
    fn instalar_ja() {
        let min = Duration::from_secs(60);
        let base = || Condicoes { por_utilizador: true, a_tocar: false, parada_ha: Some(20 * min), janela: "escondida", sem_uso_ha_s: 0 };
        assert!(pode_instalar_ja(&base()), "no tabuleiro e parada há dez minutos");
        assert!(!pode_instalar_ja(&Condicoes { a_tocar: true, ..base() }));
        assert!(!pode_instalar_ja(&Condicoes { parada_ha: Some(3 * min), ..base() }), "uma pausa curta não reinicia a app");
        assert!(pode_instalar_ja(&Condicoes { parada_ha: Some(PARADA_MINIMA), ..base() }));
        assert!(!pode_instalar_ja(&Condicoes { parada_ha: None, ..base() }));
        assert!(!pode_instalar_ja(&Condicoes { janela: "visivel", ..base() }));
        assert!(!pode_instalar_ja(&Condicoes { janela: "minimizada", sem_uso_ha_s: 30, ..base() }));
        assert!(pode_instalar_ja(&Condicoes { janela: "visivel", sem_uso_ha_s: SEM_USO_MINIMO_S, ..base() }));
        assert!(!pode_instalar_ja(&Condicoes { por_utilizador: false, ..base() }), "o \"para todos\" pede UAC");
        assert!(instalacao_por_utilizador(r"C:\Users\Ana\AppData\Local\Programs\Duotone\Duotone.exe", r"C:\Users\Ana\AppData\Local"));
        assert!(instalacao_por_utilizador("c:/users/ana/appdata/local/Programs/Duotone/Duotone.exe", "C:\\Users\\Ana\\AppData\\Local\\"));
        assert!(!instalacao_por_utilizador(r"C:\Program Files\Duotone\Duotone.exe", r"C:\Users\Ana\AppData\Local"));
        assert!(!instalacao_por_utilizador(r"C:\Users\Ana\AppData\LocalOutra\Duotone.exe", r"C:\Users\Ana\AppData\Local"));
        assert!(!instalacao_por_utilizador(r"C:\x\Duotone.exe", ""));
        let m = 60_000u64;
        assert_eq!(como_reabrir(Some(&json!({ "janela": "escondida", "em": 1000 })), 1000 + m), Some("escondida"));
        assert_eq!(como_reabrir(Some(&json!({ "janela": "visivel", "em": 1000 })), 1000 + m), Some("minimizada"), "não se põe à frente");
        assert_eq!(como_reabrir(Some(&json!({ "janela": "minimizada", "em": 1000 })), 1000 + m), Some("minimizada"));
        assert_eq!(como_reabrir(Some(&json!({ "janela": "escondida", "em": 1000 })), 1000 + 11 * m), None, "uma marca velha");
        assert_eq!(como_reabrir(Some(&json!({ "janela": "escondida", "em": 5000 })), 1000), None);
        assert_eq!(como_reabrir(Some(&json!({ "janela": "outra", "em": 1000 })), 1000), None);
        assert_eq!(como_reabrir(None, 1000), None);
    }

    #[test]
    fn o_relogio() {
        let t0 = Instant::now();
        let s = Duration::from_secs;
        let mut r = Relogio::new(t0);
        assert!(!r.vencida(t0 + s(3600)), "parado não procura");
        r.iniciar(t0);
        r.iniciar(t0 + s(1));
        assert!(!r.vencida(t0 + s(4)) && r.vencida(t0 + s(5)), "procura sozinha 5 s depois de abrir (e só um relógio)");
        assert!(r.comecar());
        assert!(!r.comecar(), "uma procura de cada vez");
        r.acabar(t0 + s(6), true);
        assert!(r.vencida(t0 + s(66)) && !r.vencida(t0 + s(65)), "sem rede repete ao fim de um minuto");
        assert!(r.comecar());
        r.acabar(t0 + s(70), false);
        assert!(!r.vencida(t0 + s(70 + 899)) && r.vencida(t0 + s(70 + 900)), "depois, de 15 em 15 min");
        r.retomar(t0 + s(100));
        assert!(!r.vencida(t0 + s(102)), "voltar à app logo a seguir não repete pedidos");
        r.retomar(t0 + s(200));
        assert!(r.vencida(t0 + s(201)), "voltar à app ou acordar o PC antecipa");
        r.retomar(t0 + s(300));
        assert!(r.vencida(t0 + s(201)), "e voltar outra vez não a adia");
        r.parar();
        assert!(!r.vencida(t0 + s(99999)), "sair cancela o relógio");
        assert!(!r.comecar());
    }

    #[test]
    fn descarregar_de_um_servidor_local() {
        // Um servidor de 3 respostas: inteiro, cortado e maior do que o anunciado.
        let bytes: Vec<u8> = (0..300_000u32).map(|i| (i % 251) as u8).collect();
        let servidor = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let porta = servidor.server_addr().to_ip().unwrap().port();
        let dados = bytes.clone();
        let fio = std::thread::spawn(move || {
            for (i, pedido) in servidor.incoming_requests().take(3).enumerate() {
                let corpo = match i { 0 => dados.clone(), 1 => dados[..1000].to_vec(), _ => [dados.clone(), vec![1, 2, 3]].concat() };
                let _ = pedido.respond(tiny_http::Response::from_data(corpo));
            }
        });
        let pasta = std::env::temp_dir().join(format!("duotone-teste-atualizacao-{}", std::process::id()));
        fs::create_dir_all(&pasta).unwrap();
        let url = format!("http://127.0.0.1:{porta}/x.exe");
        let destino = pasta.join("inteiro.exe");
        let mut passos = Vec::new();
        descarregar(&url, &destino, bytes.len() as u64, |f| passos.push(f)).unwrap();
        assert_eq!(fs::read(&destino).unwrap(), bytes);
        assert_eq!(*passos.last().unwrap(), 1.0, "o progresso acaba em 100%");
        assert!(passos.len() <= 101, "de ponto em ponto percentual");
        let cortado = pasta.join("cortado.exe");
        assert!(descarregar(&url, &cortado, bytes.len() as u64, |_| {}).is_err());
        assert!(!cortado.exists() && !pasta.join("cortado.exe.parcial").exists(), "um cortado nunca fica com o nome que se corre, e o parcial sai");
        let maior = pasta.join("maior.exe");
        assert!(descarregar(&url, &maior, bytes.len() as u64, |_| {}).is_err());
        assert!(!maior.exists() && !pasta.join("maior.exe.parcial").exists());
        fio.join().unwrap();
        let _ = fs::remove_dir_all(&pasta);
    }
}
