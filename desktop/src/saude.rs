//! A saúde da casca (F8), porta do `electron/saude.cjs`: os incidentes (o
//! processo da página que morreu, a GPU, a página presa, um pânico do Rust, os
//! crashes nativos contados pelo Crashpad do WebView2) ficam num ficheiro, a
//! página lê-os (`lerSaude`, que os apaga) e manda-os para a analítica como no
//! Electron. E a página que morre recarrega-se, no máximo 3 vezes em 5 min: um
//! ciclo de recargas é pior do que uma página parada.
//!
//! Também os recursos (`lerRecursos`): a memória e o CPU de cada processo da
//! app (a casca e os do WebView2, pelo `GetProcessInfos`), para o relatório de
//! reprodução, como o `app.getAppMetrics` do Electron.

use std::{fs, path::PathBuf, sync::Mutex, time::{Duration, SystemTime, UNIX_EPOCH}};

use serde_json::{json, Value};
use tauri::WebviewWindow;

pub const MAX_INCIDENTES: usize = 20;
pub const MAX_RECARGAS: usize = 3;
pub const JANELA_DAS_RECARGAS_MS: u64 = 5 * 60 * 1000;
const REPETIDO_MS: u64 = 60_000;

static RECARGAS: Mutex<Vec<u64>> = Mutex::new(Vec::new());
static ESCRITA: Mutex<()> = Mutex::new(());

pub fn agora() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn pasta() -> Option<PathBuf> {
    let base = std::env::var_os("LOCALAPPDATA")?;
    let p = PathBuf::from(base).join(crate::canal::IDENTIFICADOR);
    fs::create_dir_all(&p).ok()?;
    Some(p)
}
fn ler_json(f: &PathBuf) -> Value {
    fs::read_to_string(f).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(Value::Null)
}

/// Junta um incidente: o mesmo (tipo, motivo e mensagem) em menos de 1 min só
/// soma uma vez (`vezes`), e ficam os últimos `MAX_INCIDENTES`.
pub fn juntar(mut lista: Vec<Value>, novo: Value) -> Vec<Value> {
    if let Some(ultimo) = lista.last_mut() {
        let igual = ["tipo", "motivo", "mensagem"].iter().all(|k| ultimo.get(k) == novo.get(k));
        let perto = novo["quando"].as_u64().unwrap_or(0).saturating_sub(ultimo["quando"].as_u64().unwrap_or(0)) < REPETIDO_MS;
        if igual && perto {
            let vezes = ultimo["vezes"].as_u64().unwrap_or(1) + 1;
            ultimo["quando"] = novo["quando"].clone();
            ultimo["vezes"] = json!(vezes);
            return lista;
        }
    }
    lista.push(novo);
    let n = lista.len();
    if n > MAX_INCIDENTES {
        lista.drain(0..n - MAX_INCIDENTES);
    }
    lista
}

/// Guarda um incidente. Nunca entra em pânico (é chamado também do gancho de pânico).
pub fn registar(mut incidente: Value) {
    let Ok(_vez) = ESCRITA.try_lock() else { return };
    let Some(p) = pasta() else { return };
    if incidente.get("quando").is_none() {
        incidente["quando"] = json!(agora());
    }
    if incidente.get("versao").is_none() {
        incidente["versao"] = json!(format!("tauri {}", env!("CARGO_PKG_VERSION")));
    }
    let f = p.join("saude-incidentes.json");
    let lista = ler_json(&f).as_array().cloned().unwrap_or_default();
    let _ = fs::write(&f, Value::Array(juntar(lista, incidente)).to_string());
}

/// Os `.dmp` do Crashpad do WebView2 mais novos do que `desde` (até 4 pastas abaixo).
pub fn contar_dumps(pasta: &PathBuf, desde: u64) -> (u64, u64) {
    fn visitar(dir: &PathBuf, fundo: u8, desde: u64, n: &mut u64, recente: &mut u64) {
        if fundo > 4 {
            return;
        }
        let Ok(entradas) = fs::read_dir(dir) else { return };
        for e in entradas.flatten() {
            let caminho = e.path();
            if caminho.is_dir() {
                visitar(&caminho, fundo + 1, desde, n, recente);
            } else if caminho.extension().and_then(|x| x.to_str()).map(|x| x.eq_ignore_ascii_case("dmp")).unwrap_or(false) {
                let quando = e.metadata().and_then(|m| m.modified()).ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
                if quando > desde {
                    *n += 1;
                    *recente = (*recente).max(quando);
                }
            }
        }
    }
    let (mut n, mut recente) = (0, desde);
    visitar(pasta, 0, desde, &mut n, &mut recente);
    (n, recente)
}

/// O que a página pede: os incidentes guardados (e apaga-os) e os crashes nativos novos.
pub fn ler(processo_comecou_em: u128) -> Value {
    let _vez = ESCRITA.lock().unwrap_or_else(|e| e.into_inner());
    let Some(p) = pasta() else { return json!({ "incidentes": [], "processoComecouEm": processo_comecou_em }) };
    let f = p.join("saude-incidentes.json");
    let mut incidentes = ler_json(&f).as_array().cloned().unwrap_or_default();
    let _ = fs::write(&f, "[]");
    let fd = p.join("saude-dumps.json");
    match ler_json(&fd)["desde"].as_u64() {
        Some(desde) => {
            let (n, recente) = contar_dumps(&p.join("EBWebView").join("Crashpad"), desde);
            if n > 0 {
                incidentes.push(json!({ "tipo": "crash-nativo", "quando": recente, "onde": "crashpad", "vezes": n, "versao": format!("tauri {}", env!("CARGO_PKG_VERSION")) }));
            }
            let _ = fs::write(&fd, json!({ "desde": desde.max(recente) }).to_string());
        }
        None => {
            let _ = fs::write(&fd, json!({ "desde": agora() }).to_string());
        }
    }
    json!({ "incidentes": incidentes, "processoComecouEm": processo_comecou_em })
}

/// Pode recarregar-se mais uma vez? No máximo `MAX_RECARGAS` em `JANELA_DAS_RECARGAS_MS`.
pub fn pode_recarregar(recargas: &mut Vec<u64>, t: u64) -> bool {
    recargas.retain(|&r| t.saturating_sub(r) <= JANELA_DAS_RECARGAS_MS);
    if recargas.len() >= MAX_RECARGAS {
        return false;
    }
    recargas.push(t);
    true
}

/// O processo da página morreu: regista, e diz se se recarrega.
pub fn renderer_morreu(motivo: &str, codigo: i32) -> bool {
    registar(json!({ "tipo": "renderer", "fatal": true, "onde": "renderer", "motivo": motivo, "codigo": codigo }));
    let recarregar = pode_recarregar(&mut RECARGAS.lock().unwrap_or_else(|e| e.into_inner()), agora());
    crate::registo::linha(&format!("saúde: a página morreu ({motivo}, {codigo}){}", if recarregar { ", a recarregar" } else { ", sem recarregar (em ciclo)" }));
    recarregar
}

// ------------------------------------------------------------------ os recursos

/// O nome de cada tipo de processo do WebView2, nos nomes do `getAppMetrics` do
/// Electron, para os relatórios das duas cascas se lerem da mesma maneira.
pub fn nome_do_tipo(kind: i32) -> &'static str {
    match kind {
        0 => "Browser",
        1 => "Tab",
        4 => "GPU",
        _ => "Utility",
    }
}

#[derive(Clone, Copy)]
struct Medida {
    cpu_100ns: u64,
    memoria: u64,
    privada: u64,
}

fn medir(pid: u32) -> Option<Medida> {
    use windows::Win32::Foundation::{CloseHandle, FILETIME};
    use windows::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX};
    use windows::Win32::System::Threading::{GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_VM_READ};
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ, false, pid).ok()?;
        let (mut c, mut e, mut k, mut u) = (FILETIME::default(), FILETIME::default(), FILETIME::default(), FILETIME::default());
        let tempos = GetProcessTimes(h, &mut c, &mut e, &mut k, &mut u);
        let mut mem = PROCESS_MEMORY_COUNTERS_EX::default();
        let memoria = GetProcessMemoryInfo(h, &mut mem as *mut _ as *mut PROCESS_MEMORY_COUNTERS, std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32);
        let _ = CloseHandle(h);
        tempos.ok()?;
        memoria.ok()?;
        let ft = |f: FILETIME| ((f.dwHighDateTime as u64) << 32) | f.dwLowDateTime as u64;
        Some(Medida { cpu_100ns: ft(k) + ft(u), memoria: mem.WorkingSetSize as u64, privada: mem.PrivateUsage as u64 })
    }
}

/// Duas leituras com 2 s de intervalo: a memória da segunda, e o CPU entre as
/// duas em percentagem da máquina inteira (como o Gestor de Tarefas).
fn amostrar(processos: &[(u32, &'static str, &'static str)]) -> Vec<Value> {
    let antes: Vec<Option<Medida>> = processos.iter().map(|p| medir(p.0)).collect();
    let t0 = std::time::Instant::now();
    std::thread::sleep(Duration::from_secs(2));
    let decorrido_100ns = t0.elapsed().as_nanos() as f64 / 100.0;
    let nucleos = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1) as f64;
    let mb = |b: u64| (b as f64 / 1_048_576.0 * 10.0).round() / 10.0;
    processos.iter().zip(antes).filter_map(|((pid, tipo, nome), antes)| {
        let depois = medir(*pid)?;
        let cpu = antes.map(|a| depois.cpu_100ns.saturating_sub(a.cpu_100ns) as f64 / (decorrido_100ns * nucleos) * 100.0).unwrap_or(0.0);
        Some(json!({ "tipo": tipo, "nome": nome, "cpu": (cpu * 10.0).round() / 10.0, "memoriaMB": mb(depois.memoria), "privadaMB": mb(depois.privada) }))
    }).collect()
}

/// `lerRecursos`: a casca e os processos do WebView2, com o estado da janela.
#[tauri::command]
pub async fn diagnostico_recursos(janela: WebviewWindow) -> Result<Value, String> {
    if janela.label() != "main" {
        return Err("Pedido inválido.".into());
    }
    let (tx, rx) = std::sync::mpsc::channel::<Vec<(u32, i32)>>();
    janela.with_webview(move |w| unsafe {
        use webview2_com::Microsoft::Web::WebView2::Win32::*;
        use windows::core::Interface;
        let mut lista = Vec::new();
        let colecao = w.controller().CoreWebView2()
            .and_then(|n| n.cast::<ICoreWebView2_2>())
            .and_then(|n2| n2.Environment())
            .and_then(|e| e.cast::<ICoreWebView2Environment8>())
            .and_then(|e8| e8.GetProcessInfos());
        if let Ok(colecao) = colecao {
            let mut n = 0u32;
            let _ = colecao.Count(&mut n);
            for i in 0..n {
                if let Ok(info) = colecao.GetValueAtIndex(i) {
                    let (mut pid, mut kind) = (0i32, COREWEBVIEW2_PROCESS_KIND::default());
                    if info.ProcessId(&mut pid).is_ok() && info.Kind(&mut kind).is_ok() {
                        lista.push((pid as u32, kind.0));
                    }
                }
            }
        }
        let _ = tx.send(lista);
    }).map_err(|e| e.to_string())?;
    let estado = if !janela.is_visible().unwrap_or(true) { "hidden" } else if janela.is_minimized().unwrap_or(false) { "minimized" } else { "visible" };
    let processos = tauri::async_runtime::spawn_blocking(move || {
        let do_webview = rx.recv_timeout(Duration::from_secs(3)).unwrap_or_default();
        let mut todos: Vec<(u32, &'static str, &'static str)> = vec![(std::process::id(), "Shell", "duotone-desktop")];
        todos.extend(do_webview.into_iter().map(|(pid, k)| (pid, nome_do_tipo(k), if k == 0 { "WebView2" } else { "" })));
        amostrar(&todos)
    }).await.map_err(|e| e.to_string())?;
    Ok(json!({ "janela": estado, "processos": processos, "youtube": [] }))
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn o_mesmo_incidente_seguido_soma_vezes() {
        let a = json!({ "tipo": "renderer", "motivo": "x", "quando": 1_000 });
        let lista = juntar(vec![], a.clone());
        let lista = juntar(lista, json!({ "tipo": "renderer", "motivo": "x", "quando": 30_000 }));
        assert_eq!(lista.len(), 1);
        assert_eq!(lista[0]["vezes"], json!(2));
        assert_eq!(lista[0]["quando"], json!(30_000));
        // Mais de 1 min depois, ou outro motivo: outro incidente.
        let lista = juntar(lista, json!({ "tipo": "renderer", "motivo": "x", "quando": 200_000 }));
        let lista = juntar(lista, json!({ "tipo": "gpu", "motivo": "x", "quando": 200_001 }));
        assert_eq!(lista.len(), 3);
        let mut grande = vec![];
        for i in 0..(MAX_INCIDENTES as u64 + 5) {
            grande = juntar(grande, json!({ "tipo": "bloqueio", "motivo": format!("m{i}"), "quando": i * 100_000 }));
        }
        assert_eq!(grande.len(), MAX_INCIDENTES, "só os últimos");
    }

    #[test]
    fn as_recargas_param_ao_fim_de_3_em_5_minutos() {
        let mut r = vec![];
        assert!(pode_recarregar(&mut r, 0));
        assert!(pode_recarregar(&mut r, 1_000));
        assert!(pode_recarregar(&mut r, 2_000));
        assert!(!pode_recarregar(&mut r, 3_000), "a 4.ª em 5 min é um ciclo");
        assert!(pode_recarregar(&mut r, JANELA_DAS_RECARGAS_MS + 1_001), "passados 5 min, volta a poder");
    }

    #[test]
    fn os_tipos_tem_os_nomes_do_electron() {
        assert_eq!(nome_do_tipo(0), "Browser");
        assert_eq!(nome_do_tipo(1), "Tab");
        assert_eq!(nome_do_tipo(4), "GPU");
        assert_eq!(nome_do_tipo(2), "Utility");
    }

    #[test]
    fn a_propria_casca_mede_se() {
        let m = medir(std::process::id()).expect("o próprio processo mede-se");
        assert!(m.memoria > 0 && m.privada > 0);
    }
}
