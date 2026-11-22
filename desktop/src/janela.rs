//! A janela volta com o tamanho e o sítio em que estava (22/11, pedido do João na 7.0.0:
//! "não memoriza o tamanho nem a posição da janela em que foi desligado").
//!
//! - **O que se guarda**: a posição e o tamanho da janela normal (em píxeis físicos, os
//!   do monitor onde estava) e se estava maximizada. Maximizada, guarda-se só a marca:
//!   o tamanho fica o de antes, para "restaurar" voltar a ele. Minimizada, nada.
//! - **Quando**: cada `Moved`/`Resized` só muda a memória; o disco escreve-se 1,5 s
//!   depois da última mudança (`janela.json` na pasta de dados da app). Assim sobrevive
//!   ao "Quit" do tabuleiro e a desligar o PC, sem uma escrita por cada píxel arrastado.
//! - **Ao abrir**: antes de a janela se mostrar, volta ao sítio e ao tamanho, e maximiza
//!   se estava. Se o sítio já não cabe em nenhum monitor (um monitor que saiu), fica a
//!   de origem.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, Window};

const FICHEIRO: &str = "janela.json";
const ESPERA_DA_ESCRITA: Duration = Duration::from_millis(1_500);
/// Quanto da janela (a faixa de cima, por onde se arrasta) tem de estar num monitor.
const VISIVEL_MINIMO: (i64, i64) = (120, 40);

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Geometria {
    pub x: i32,
    pub y: i32,
    pub largura: u32,
    pub altura: u32,
    pub maximizada: bool,
}

static ATUAL: Mutex<Option<Geometria>> = Mutex::new(None);
static ESCRITA_MARCADA: AtomicBool = AtomicBool::new(false);
static PASTA: Mutex<Option<PathBuf>> = Mutex::new(None);

/// O que está no ficheiro, se fizer sentido.
pub fn ler(v: &Value) -> Option<Geometria> {
    let n = |k: &str| v.get(k)?.as_i64();
    let (x, y, largura, altura) = (n("x")?, n("y")?, n("largura")?, n("altura")?);
    if !(200..=20_000).contains(&largura) || !(150..=20_000).contains(&altura) {
        return None;
    }
    Some(Geometria {
        x: i32::try_from(x).ok()?,
        y: i32::try_from(y).ok()?,
        largura: largura as u32,
        altura: altura as u32,
        maximizada: v.get("maximizada").and_then(Value::as_bool).unwrap_or(false),
    })
}

pub fn escrever(g: &Geometria) -> Value {
    json!({ "x": g.x, "y": g.y, "largura": g.largura, "altura": g.altura, "maximizada": g.maximizada })
}

/// A faixa de cima da janela fica, pelo menos em parte, dentro de algum monitor
/// (x, y, largura, altura de cada um)? Sem isso não havia por onde a arrastar de volta.
pub fn cabe(g: &Geometria, monitores: &[(i32, i32, u32, u32)]) -> bool {
    let (jx0, jy0) = (g.x as i64, g.y as i64);
    let (jx1, jy1) = (jx0 + g.largura as i64, jy0 + VISIVEL_MINIMO.1);
    monitores.iter().any(|&(mx, my, ml, ma)| {
        let (mx0, my0) = (mx as i64, my as i64);
        let (mx1, my1) = (mx0 + ml as i64, my0 + ma as i64);
        let largura = jx1.min(mx1) - jx0.max(mx0);
        let altura = jy1.min(my1) - jy0.max(my0);
        largura >= VISIVEL_MINIMO.0 && altura >= VISIVEL_MINIMO.1
    })
}

fn caminho(app: &AppHandle) -> Option<PathBuf> {
    let mut pasta = PASTA.lock().unwrap_or_else(|e| e.into_inner());
    if pasta.is_none() {
        *pasta = app.path().app_data_dir().ok();
    }
    pasta.as_ref().map(|p| p.join(FICHEIRO))
}

/// Antes de a janela se mostrar: o sítio, o tamanho e o maximizado da última vez.
pub fn restaurar(janela: &WebviewWindow) {
    let Some(ficheiro) = caminho(janela.app_handle()) else { return };
    let Some(g) = std::fs::read_to_string(&ficheiro).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()).and_then(|v| ler(&v)) else {
        return;
    };
    let monitores: Vec<(i32, i32, u32, u32)> = janela
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| (m.position().x, m.position().y, m.size().width, m.size().height))
        .collect();
    if !cabe(&g, &monitores) {
        crate::registo::linha("janela: o sítio guardado já não cabe em nenhum monitor; fica a de origem");
        return;
    }
    let _ = janela.set_size(PhysicalSize::new(g.largura, g.altura));
    let _ = janela.set_position(PhysicalPosition::new(g.x, g.y));
    // Maximizar uma janela escondida mostrava-a antes da página (e no arranque para o
    // tabuleiro não se mostra nada): maximiza-se quando se mostra (`ao_mostrar`).
    MAXIMIZAR_AO_MOSTRAR.store(g.maximizada, Ordering::SeqCst);
    *ATUAL.lock().unwrap_or_else(|e| e.into_inner()) = Some(g);
}

static MAXIMIZAR_AO_MOSTRAR: AtomicBool = AtomicBool::new(false);

/// Logo depois de a janela se mostrar pela primeira vez: maximiza, se estava.
pub fn ao_mostrar(janela: &WebviewWindow) {
    if MAXIMIZAR_AO_MOSTRAR.swap(false, Ordering::SeqCst) {
        let _ = janela.maximize();
    }
}

/// A janela mexeu-se ou mudou de tamanho: guarda-se na memória, e o disco a seguir.
pub fn mudou(janela: &Window) {
    if janela.is_minimized().unwrap_or(false) {
        return;
    }
    let maximizada = janela.is_maximized().unwrap_or(false);
    {
        let mut atual = ATUAL.lock().unwrap_or_else(|e| e.into_inner());
        if maximizada {
            // Maximizada, o tamanho é o do ecrã: fica o de antes, para restaurar voltar a ele.
            match atual.as_mut() {
                Some(g) => g.maximizada = true,
                None => return,
            }
        } else {
            let (Ok(p), Ok(t)) = (janela.outer_position(), janela.inner_size()) else { return };
            if t.width == 0 || t.height == 0 {
                return;
            }
            *atual = Some(Geometria { x: p.x, y: p.y, largura: t.width, altura: t.height, maximizada: false });
        }
    }
    marcar_escrita(janela.app_handle().clone());
}

/// Escreve 1,5 s depois da última mudança, uma escrita de cada vez.
fn marcar_escrita(app: AppHandle) {
    if ESCRITA_MARCADA.swap(true, Ordering::SeqCst) {
        return;
    }
    let lancada = std::thread::Builder::new().name("janela".into()).spawn(move || {
        std::thread::sleep(ESPERA_DA_ESCRITA);
        ESCRITA_MARCADA.store(false, Ordering::SeqCst);
        let g = *ATUAL.lock().unwrap_or_else(|e| e.into_inner());
        if let (Some(g), Some(ficheiro)) = (g, caminho(&app)) {
            if let Some(pasta) = ficheiro.parent() {
                let _ = std::fs::create_dir_all(pasta);
            }
            if let Err(e) = std::fs::write(&ficheiro, escrever(&g).to_string()) {
                crate::registo::linha(&format!("janela: não se guardou ({e})"));
            }
        }
    });
    if lancada.is_err() {
        ESCRITA_MARCADA.store(false, Ordering::SeqCst);
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    const UM_ECRA: [(i32, i32, u32, u32); 1] = [(0, 0, 2560, 1440)];

    fn g(x: i32, y: i32, largura: u32, altura: u32) -> Geometria {
        Geometria { x, y, largura, altura, maximizada: false }
    }

    #[test]
    fn ida_e_volta_pelo_ficheiro() {
        let a = Geometria { x: -1200, y: 80, largura: 1600, altura: 1000, maximizada: true };
        assert_eq!(ler(&escrever(&a)), Some(a));
    }

    #[test]
    fn um_ficheiro_estragado_nao_serve() {
        assert_eq!(ler(&json!({ "x": 0, "y": 0, "largura": 10, "altura": 900 })), None);
        assert_eq!(ler(&json!({ "x": 0, "y": 0 })), None);
        assert_eq!(ler(&json!("lixo")), None);
    }

    #[test]
    fn cabe_no_ecra_ou_noutro_monitor() {
        assert!(cabe(&g(100, 100, 1440, 900), &UM_ECRA));
        // Metade fora pela direita: a faixa de cima ainda se agarra.
        assert!(cabe(&g(2000, 100, 1440, 900), &UM_ECRA));
        // Num segundo monitor à esquerda que já não está ligado.
        assert!(!cabe(&g(-1800, 100, 1440, 900), &UM_ECRA));
        assert!(cabe(&g(-1800, 100, 1440, 900), &[(0, 0, 2560, 1440), (-1920, 0, 1920, 1080)]));
        // A faixa de cima acima do ecrã: não havia por onde a puxar.
        assert!(!cabe(&g(100, -200, 1440, 900), &UM_ECRA));
    }
}
