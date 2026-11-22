//! O nome da Duotone no misturador de volume do Windows (22/11, na 7.0.0).
//!
//! O som da página sai do processo de áudio do WebView2 (`msedgewebview2.exe`, filho
//! do browser do WebView2, que é filho desta casca), e o misturador mostrava
//! "Microsoft Edge WebView2" com o ícone do Edge. No Electron o processo de áudio era
//! o próprio Duotone.exe, e o nome vinha sozinho.
//!
//! A sessão de áudio é desse processo, mas o Windows deixa OUTRO processo dar-lhe nome
//! e ícone (`IAudioSessionControl::SetDisplayName` / `SetIconPath`), e o nome fica
//! enquanto a sessão existir, mesmo depois de quem o deu largar o objeto. Ensaiado a
//! 22/11 neste PC: um PowerShell a tocar silêncio, nomeado por outro processo e lido
//! por um terceiro, antes e depois de o que nomeou sair.
//!
//! - **Só as nossas**: as sessões de processos `msedgewebview2.exe` que descendem
//!   desta casca. Nunca as de outra app (o Teams e o Outlook também são WebView2).
//! - **Quando**: ao passar a tocar (`barra::barra_estado`), três leituras nos segundos
//!   a seguir, porque a sessão nasce quando o som começa. Nenhum temporizador fora
//!   disso, e só uma procura de cada vez.
//! - Uma saída de som nova a meio de uma música abre outra sessão, que fica com o
//!   nome do WebView2 até à próxima vez que se carrega em tocar.

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use windows::core::{Interface, HSTRING, PWSTR};
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::Media::Audio::{
    eRender, IAudioSessionControl2, IAudioSessionManager2, IMMDeviceEnumerator, MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};

/// O processo do WebView2 (o browser, os renderers e o serviço de áudio).
const PROCESSO_DO_WEBVIEW2: &str = "msedgewebview2.exe";

/// Quando se procura, depois de passar a tocar (ms desde o "a tocar").
const LEITURAS_MS: [u64; 3] = [400, 1_500, 4_000];

static A_PROCURAR: AtomicBool = AtomicBool::new(false);

/// Passou a tocar: dá nome às sessões do nosso WebView2 que ainda não o têm.
pub fn ao_tocar() {
    if A_PROCURAR.swap(true, Ordering::SeqCst) {
        return;
    }
    let lancada = std::thread::Builder::new().name("mistura".into()).spawn(|| {
        let mut desde = 0;
        for ate in LEITURAS_MS {
            std::thread::sleep(Duration::from_millis(ate - desde));
            desde = ate;
            if let Err(e) = nomear() {
                crate::registo::linha(&format!("misturador: {e}"));
                break;
            }
        }
        A_PROCURAR.store(false, Ordering::SeqCst);
    });
    if lancada.is_err() {
        A_PROCURAR.store(false, Ordering::SeqCst);
    }
}

/// Os processos do WebView2 que descendem de `raiz`, numa lista de (pid, pai, exe).
/// Puro, para os testes: a árvore lê-se por inteiro, e só ficam os do WebView2.
pub fn webview2_descendentes(raiz: u32, processos: &[(u32, u32, String)]) -> HashSet<u32> {
    let mut filhos: HashMap<u32, Vec<u32>> = HashMap::new();
    let mut nomes: HashMap<u32, &str> = HashMap::new();
    for (pid, pai, exe) in processos {
        // Um pid que é pai de si próprio (o 0 do sistema) fazia um ciclo.
        if pid != pai {
            filhos.entry(*pai).or_default().push(*pid);
        }
        nomes.insert(*pid, exe.as_str());
    }
    let mut vistos = HashSet::new();
    let mut fila = vec![raiz];
    while let Some(p) = fila.pop() {
        for &f in filhos.get(&p).map(|v| v.as_slice()).unwrap_or(&[]) {
            if f != raiz && vistos.insert(f) {
                fila.push(f);
            }
        }
    }
    vistos
        .into_iter()
        .filter(|p| nomes.get(p).is_some_and(|n| n.eq_ignore_ascii_case(PROCESSO_DO_WEBVIEW2)))
        .collect()
}

/// A lista de processos do sistema (pid, pai, exe).
fn processos() -> Vec<(u32, u32, String)> {
    let mut lista = Vec::new();
    unsafe {
        let Ok(foto) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else { return lista };
        let mut e = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        if Process32FirstW(foto, &mut e).is_ok() {
            loop {
                let fim = e.szExeFile.iter().position(|&c| c == 0).unwrap_or(e.szExeFile.len());
                lista.push((e.th32ProcessID, e.th32ParentProcessID, String::from_utf16_lossy(&e.szExeFile[..fim])));
                if Process32NextW(foto, &mut e).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(foto);
    }
    lista
}

/// Dá o nome e o ícone da Duotone às sessões do nosso WebView2, em todas as saídas ativas.
fn nomear() -> windows::core::Result<()> {
    let nossos = webview2_descendentes(std::process::id(), &processos());
    if nossos.is_empty() {
        return Ok(());
    }
    let nome = crate::canal::NOME_NO_MISTURADOR;
    let icone = std::env::current_exe().ok().map(|p| format!("{},0", p.display()));
    unsafe {
        let com = CoInitializeEx(None, COINIT_MULTITHREADED);
        let feito = nomear_com_com(&nossos, nome, icone.as_deref());
        // Os objetos COM já saíram de cena dentro da função: só agora se desliga.
        if com.is_ok() {
            CoUninitialize();
        }
        feito
    }
}

unsafe fn nomear_com_com(nossos: &HashSet<u32>, nome: &str, icone: Option<&str>) -> windows::core::Result<()> {
    let enumerador: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
    let saidas = enumerador.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)?;
    for i in 0..saidas.GetCount()? {
        let Ok(saida) = saidas.Item(i) else { continue };
        let Ok(gestor) = saida.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) else { continue };
        let Ok(sessoes) = gestor.GetSessionEnumerator() else { continue };
        for j in 0..sessoes.GetCount().unwrap_or(0) {
            let Ok(sessao) = sessoes.GetSession(j) else { continue };
            let Ok(sessao) = sessao.cast::<IAudioSessionControl2>() else { continue };
            if !sessao.GetProcessId().is_ok_and(|pid| nossos.contains(&pid)) {
                continue;
            }
            // Só se ainda não o tem: o Windows avisa quem ouve a sessão a cada mudança.
            if sessao.GetDisplayName().map(texto).unwrap_or_default() != nome {
                sessao.SetDisplayName(&HSTRING::from(nome), std::ptr::null())?;
                if let Some(i) = icone {
                    let _ = sessao.SetIconPath(&HSTRING::from(i), std::ptr::null());
                }
            }
        }
    }
    Ok(())
}

/// Um texto do COM (de um `Get...` que o aloca), libertado depois de lido.
fn texto(p: PWSTR) -> String {
    unsafe {
        let s = p.to_string().unwrap_or_default();
        CoTaskMemFree(Some(p.0 as *const _));
        s
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    fn p(pid: u32, pai: u32, exe: &str) -> (u32, u32, String) {
        (pid, pai, exe.to_string())
    }

    #[test]
    fn so_os_webview2_que_descendem_da_casca() {
        let lista = vec![
            p(100, 1, "Duotone.exe"),
            p(200, 100, "msedgewebview2.exe"), // o browser do WebView2
            p(201, 200, "msedgewebview2.exe"), // o serviço de áudio
            p(202, 200, "msedgewebview2.exe"),
            p(300, 100, "conhost.exe"),
            p(400, 9, "msedgewebview2.exe"), // o WebView2 do Teams
            p(401, 400, "msedgewebview2.exe"),
        ];
        let nossos = webview2_descendentes(100, &lista);
        assert_eq!(nossos, HashSet::from([200, 201, 202]));
    }

    #[test]
    fn ciclos_e_o_processo_zero_nao_prendem() {
        let lista = vec![p(0, 0, "[System Process]"), p(100, 0, "Duotone.exe"), p(200, 100, "MsEdgeWebView2.exe"), p(100, 200, "x")];
        assert_eq!(webview2_descendentes(100, &lista), HashSet::from([200]));
    }
}
