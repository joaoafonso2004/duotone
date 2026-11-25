//! O ecrã ambiente (25/11, pedido do João): com a música a tocar e ninguém a mexer
//! na app, a janela passa sozinha ao modo limpo em ecrã inteiro; ao passar o rato
//! por cima, volta ao que era. A página decide (`src/lib/ecraAmbiente.ts`); o Rust
//! diz-lhe como está a janela e põe ou tira o ecrã inteiro.
//!
//! Só entra em dois casos, e é a página que os junta:
//! - a janela está noutro monitor e quem está a trabalhar está no outro (a janela
//!   da frente é de outro programa e está noutro monitor), e nada a tapa;
//! - a janela é a da frente e o computador está parado (o rato e o teclado).
//!
//! Nunca rouba o foco: quem escreve noutro monitor continua a escrever. O ecrã
//! inteiro é o do tao (o mesmo do F11, que trata da janela maximizada), por cima
//! de tudo enquanto dura (senão a barra de tarefas desse monitor ficava à frente),
//! e se o Windows der a frente a esta janela, devolve-se a quem a tinha.

use std::{
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

use serde_json::{json, Value};
use tauri::WebviewWindow;
use windows::Win32::{
    Foundation::{HWND, RECT},
    Graphics::{
        Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED},
        Gdi::{MonitorFromWindow, MONITOR_DEFAULTTONEAREST},
    },
    System::Threading::GetCurrentProcessId,
    UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindow, GetWindowLongPtrW, GetWindowRect, GetWindowThreadProcessId, IsIconic,
        IsWindowVisible, SetForegroundWindow, SetWindowPos, GWL_EXSTYLE, GW_HWNDPREV, HWND_NOTOPMOST, HWND_TOPMOST,
        SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER, SWP_NOSIZE, WS_EX_TRANSPARENT,
    },
};

/// Se o ecrã ambiente está posto: tirar só faz alguma coisa depois de pôr (a
/// página tira-o ao arrancar, para uma recarga a meio não deixar a janela presa).
static POSTO: AtomicBool = AtomicBool::new(false);

/// Uma janela por cima desta que lhe tapa pelo menos esta fração conta como "tapada".
const TAPA: i64 = 4; // 1/4

fn da_janela_principal(janela: &WebviewWindow) -> Result<(), String> {
    if janela.label() == "main" { Ok(()) } else { Err("Pedido inválido.".into()) }
}

fn hwnd(janela: &WebviewWindow) -> Result<HWND, String> {
    janela.hwnd().map(|h| HWND(h.0 as *mut _)).map_err(|e| e.to_string())
}

fn processo_de(h: HWND) -> u32 {
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(h, Some(&mut pid)) };
    pid
}

fn area(r: &RECT) -> i64 {
    ((r.right - r.left).max(0) as i64) * ((r.bottom - r.top).max(0) as i64)
}

fn em_comum(a: &RECT, b: &RECT) -> i64 {
    let r = RECT { left: a.left.max(b.left), top: a.top.max(b.top), right: a.right.min(b.right), bottom: a.bottom.min(b.bottom) };
    area(&r)
}

/// À vista de verdade: visível, não minimizada, não "escondida" pelo DWM (as
/// janelas das apps da Store ficam visíveis mas invisíveis) e não transparente
/// aos cliques (as camadas por cima de tudo dos jogos e das placas gráficas).
fn a_vista(h: HWND) -> bool {
    unsafe {
        if !IsWindowVisible(h).as_bool() || IsIconic(h).as_bool() {
            return false;
        }
        if (GetWindowLongPtrW(h, GWL_EXSTYLE) as u32) & WS_EX_TRANSPARENT.0 != 0 {
            return false;
        }
        let mut escondida = 0u32;
        let ok = DwmGetWindowAttribute(h, DWMWA_CLOAKED, &mut escondida as *mut u32 as *mut _, std::mem::size_of::<u32>() as u32);
        !(ok.is_ok() && escondida != 0)
    }
}

/// Outra janela, de outro programa, por cima desta e a tapar-lhe um bom bocado.
fn tapada(nossa: HWND, pid: u32) -> bool {
    let mut r = RECT::default();
    if unsafe { GetWindowRect(nossa, &mut r) }.is_err() {
        return false;
    }
    let toda = area(&r);
    if toda <= 0 {
        return false;
    }
    let mut h = nossa;
    // As de cima, pela ordem do ecrã (as "topmost" também: a barra de tarefas é
    // uma, e tapa pouco).
    for _ in 0..1024 {
        h = match unsafe { GetWindow(h, GW_HWNDPREV) } {
            Ok(x) if !x.is_invalid() => x,
            _ => break,
        };
        if processo_de(h) == pid || !a_vista(h) {
            continue;
        }
        let mut o = RECT::default();
        if unsafe { GetWindowRect(h, &mut o) }.is_err() {
            continue;
        }
        if em_comum(&r, &o) * TAPA >= toda {
            return true;
        }
    }
    false
}

/// Como está a janela, para a página decidir se entra no ecrã ambiente.
#[tauri::command]
pub fn ambiente_ler(janela: WebviewWindow) -> Result<Value, String> {
    da_janela_principal(&janela)?;
    let nossa = hwnd(&janela)?;
    let pid = unsafe { GetCurrentProcessId() };
    let visivel = unsafe { IsWindowVisible(nossa).as_bool() };
    let minimizada = unsafe { IsIconic(nossa).as_bool() };
    let frente = unsafe { GetForegroundWindow() };
    // O mini leitor é deste programa: com ele à frente, a app conta como da frente.
    let em_primeiro_plano = !frente.is_invalid() && processo_de(frente) == pid;
    let outro_monitor = !frente.is_invalid()
        && !em_primeiro_plano
        && unsafe { MonitorFromWindow(frente, MONITOR_DEFAULTTONEAREST).0 != MonitorFromWindow(nossa, MONITOR_DEFAULTTONEAREST).0 };
    Ok(json!({
        "visivel": visivel,
        "minimizada": minimizada,
        "emPrimeiroPlano": em_primeiro_plano,
        "outroMonitor": outro_monitor,
        "tapada": visivel && !minimizada && tapada(nossa, pid),
        "segundosSemUso": crate::ponte::segundos_sem_uso().unwrap_or(0),
        "posto": POSTO.load(Ordering::SeqCst),
    }))
}

/// Se o Windows deu a frente a esta janela ao mudar de tamanho, devolve-a a quem a
/// tinha (só se ainda for desta janela: um clique a sério do utilizador fica).
fn devolver_a_frente(nossa: HWND, antes: HWND) {
    if antes.is_invalid() || antes == nossa || processo_de(antes) == unsafe { GetCurrentProcessId() } {
        return;
    }
    let (n, a) = (nossa.0 as isize, antes.0 as isize);
    std::thread::spawn(move || {
        for espera in [30u64, 120, 350] {
            std::thread::sleep(Duration::from_millis(espera));
            unsafe {
                if GetForegroundWindow().0 as isize == n {
                    let _ = SetForegroundWindow(HWND(a as *mut _));
                }
            }
        }
    });
}

/// Põe ou tira o ecrã inteiro do ecrã ambiente, sem roubar o foco.
#[tauri::command]
pub fn ambiente_ecra(janela: WebviewWindow, ligado: bool) -> Result<(), String> {
    da_janela_principal(&janela)?;
    let nossa = hwnd(&janela)?;
    if !ligado && !POSTO.load(Ordering::SeqCst) {
        return Ok(());
    }
    let antes = unsafe { GetForegroundWindow() };
    let por_cima = if ligado { HWND_TOPMOST } else { HWND_NOTOPMOST };
    let flags = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER;
    if ligado {
        janela.set_fullscreen(true).map_err(|e| e.to_string())?;
        unsafe { let _ = SetWindowPos(nossa, Some(por_cima), 0, 0, 0, 0, flags); }
    } else {
        unsafe { let _ = SetWindowPos(nossa, Some(por_cima), 0, 0, 0, 0, flags); }
        janela.set_fullscreen(false).map_err(|e| e.to_string())?;
    }
    POSTO.store(ligado, Ordering::SeqCst);
    devolver_a_frente(nossa, antes);
    crate::registo::linha(if ligado { "ecrã ambiente: entra" } else { "ecrã ambiente: sai" });
    Ok(())
}
