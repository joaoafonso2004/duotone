//! A barra de tarefas do Windows (F5): o `electron/barraDeTarefas.cjs` e o que o
//! `main.cjs` faz com ele.
//!
//! - **A miniatura:** três botões (anterior, tocar/pausa, seguinte), sempre lá;
//!   sem música ficam apagados. Os ícones são desenhados aqui, com as formas do
//!   Electron, no tamanho que o Windows pede para o DPI do monitor (o Electron
//!   tinha só 16 e 32 px) e na cor do tema da BARRA (o do sistema, que pode não
//!   ser o das apps). O clique entra na página como um atalho (`onAtalho`).
//! - **O Windows esquece os botões** quando a janela se esconde: voltam a pôr-se
//!   a cada `TaskbarButtonCreated` (que chega também no 1.º mostrar).
//! - **A lista de saltos do ícone:** Resume, Daily mix, Shuffle Liked Songs (os
//!   atalhos do ícone do iPhone). Abrem a app com `--duotone-acao=<acao>`; a ação
//!   fica à espera até a página a tirar (`tirarAcaoDaBarra`, só com conta).
//!
//! O COM e a janela são da thread principal (o tao inicia-a em STA): tudo o que
//! lhes toca corre lá (`run_on_main_thread`), e nunca com o trinco do estado na mão
//! (uma chamada ao Explorer pode bombear mensagens e reentrar na subclasse).

use std::{
    cell::RefCell,
    collections::HashMap,
    sync::{Mutex, OnceLock},
};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, WebviewWindow};
use windows::core::{Interface, HSTRING};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::Graphics::Gdi::{CreateBitmap, CreateDIBSection, DeleteObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS};
use windows::Win32::Storage::EnhancedStorage::PKEY_Title;
use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};
use windows::Win32::System::Variant::VT_LPWSTR;
use windows::Win32::UI::HiDpi::{GetDpiForWindow, GetSystemMetricsForDpi};
use windows::Win32::UI::Shell::Common::{IObjectArray, IObjectCollection};
use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
use windows::Win32::UI::Shell::{
    DefSubclassProc, DestinationList, EnumerableObjectCollection, ICustomDestinationList, IShellLinkW, ITaskbarList3, SHStrDupW, SetWindowSubclass,
    ShellLink, TaskbarList, THBF_DISABLED, THBF_ENABLED, THBN_CLICKED, THB_FLAGS, THB_ICON, THB_TOOLTIP, THUMBBUTTON,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateIconIndirect, RegisterWindowMessageW, HICON, ICONINFO, SM_CXSMICON, WM_COMMAND, WM_DPICHANGED, WM_SETTINGCHANGE, WM_THEMECHANGED,
};

/// O argumento com que a lista de saltos abre a app (ou a segunda instância).
pub const ARGUMENTO: &str = "--duotone-acao=";

/// As tarefas da lista de saltos: (ação do iPhone, título, descrição).
pub const TAREFAS: [(&str, &str, &str); 3] = [
    ("continuar", "Resume", "Resume what you were listening to"),
    ("mistura-do-dia", "Daily mix", "Play your Daily mix"),
    ("baralhar-gostadas", "Shuffle Liked Songs", "Shuffle your Liked Songs"),
];

/// A ação pedida nos argumentos, ou nada. Só uma das três, e nada colado a outra coisa.
pub fn acao_dos_argumentos<S: AsRef<str>>(argv: &[S]) -> Option<&'static str> {
    argv.iter().find_map(|a| {
        let acao = a.as_ref().strip_prefix(ARGUMENTO)?;
        TAREFAS.iter().find(|t| t.0 == acao).map(|t| t.0)
    })
}

/// O estado que a página manda, validado: (a tocar, tem faixa).
fn estado_valido(e: &Value) -> Option<(bool, bool)> {
    Some((e.get("aTocar")?.as_bool()?, e.get("temFaixa")?.as_bool()?))
}

#[derive(Debug, PartialEq)]
struct Botao {
    icone: &'static str,
    dica: &'static str,
    /// A ação de `electron/atalhos.cjs` que o clique executa.
    atalho: &'static str,
    apagado: bool,
}

/// Os três botões, por ordem. Sem música ficam lá, apagados: a miniatura não muda de forma.
fn botoes_da_miniatura(a_tocar: bool, tem_faixa: bool) -> [Botao; 3] {
    let apagado = !tem_faixa;
    [
        Botao { icone: "anterior", dica: "Previous", atalho: "anterior", apagado },
        if a_tocar {
            Botao { icone: "pausa", dica: "Pause", atalho: "tocar-pausa", apagado }
        } else {
            Botao { icone: "tocar", dica: "Play", atalho: "tocar-pausa", apagado }
        },
        Botao { icone: "seguinte", dica: "Next", atalho: "seguinte", apagado },
    ]
}

// As formas do Electron, numa grelha de 16: triângulos e retângulos, todos convexos.
type Poligono = &'static [(f64, f64)];
fn formas(nome: &str) -> Option<&'static [Poligono]> {
    const TOCAR: &[Poligono] = &[&[(5.0, 3.0), (13.0, 8.0), (5.0, 13.0)]];
    const PAUSA: &[Poligono] = &[&[(4.0, 3.0), (7.0, 3.0), (7.0, 13.0), (4.0, 13.0)], &[(9.0, 3.0), (12.0, 3.0), (12.0, 13.0), (9.0, 13.0)]];
    const SEGUINTE: &[Poligono] = &[&[(3.0, 3.0), (10.5, 8.0), (3.0, 13.0)], &[(11.0, 3.0), (13.0, 3.0), (13.0, 13.0), (11.0, 13.0)]];
    const ANTERIOR: &[Poligono] = &[&[(3.0, 3.0), (5.0, 3.0), (5.0, 13.0), (3.0, 13.0)], &[(13.0, 3.0), (13.0, 13.0), (5.5, 8.0)]];
    match nome {
        "tocar" => Some(TOCAR),
        "pausa" => Some(PAUSA),
        "seguinte" => Some(SEGUINTE),
        "anterior" => Some(ANTERIOR),
        _ => None,
    }
}

/// O ponto está dentro do polígono convexo (vértices por qualquer ordem de volta)?
fn dentro(px: f64, py: f64, poligono: &[(f64, f64)]) -> bool {
    let mut sinal = 0.0;
    for i in 0..poligono.len() {
        let (ax, ay) = poligono[i];
        let (bx, by) = poligono[(i + 1) % poligono.len()];
        let c = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
        if c == 0.0 {
            continue;
        }
        let s = c.signum();
        if sinal == 0.0 {
            sinal = s;
        } else if s != sinal {
            return false;
        }
    }
    true
}

/// O ícone em BGRA de alfa direto (o dos ícones do Windows), `lado` x `lado`, com
/// 4x4 amostras por píxel para as arestas saírem suaves.
fn desenhar_icone(nome: &str, lado: usize, cor: [u8; 3]) -> Vec<u8> {
    const AMOSTRAS: usize = 4;
    let formas = formas(nome).unwrap_or(&[]);
    let escala = 16.0 / lado as f64;
    let mut buf = vec![0u8; lado * lado * 4];
    for y in 0..lado {
        for x in 0..lado {
            let mut cheias = 0;
            for sy in 0..AMOSTRAS {
                for sx in 0..AMOSTRAS {
                    let px = (x as f64 + (sx as f64 + 0.5) / AMOSTRAS as f64) * escala;
                    let py = (y as f64 + (sy as f64 + 0.5) / AMOSTRAS as f64) * escala;
                    if formas.iter().any(|f| dentro(px, py, f)) {
                        cheias += 1;
                    }
                }
            }
            let a = (255.0 * cheias as f64 / (AMOSTRAS * AMOSTRAS) as f64).round() as u8;
            let i = (y * lado + x) * 4;
            if a > 0 {
                buf[i..i + 4].copy_from_slice(&[cor[2], cor[1], cor[0], a]);
            }
        }
    }
    buf
}

/// Ícones claros numa barra escura, escuros numa clara.
fn cor_dos_icones(barra_escura: bool) -> [u8; 3] {
    if barra_escura { [255, 255, 255] } else { [32, 32, 36] }
}

// --- o Windows ---

struct Estado {
    a_tocar: bool,
    tem_faixa: bool,
    /// Os botões já estão no botão da barra de agora (volta a falso a cada `TaskbarButtonCreated`).
    postos: bool,
    acao_pendente: Option<&'static str>,
}
static ESTADO: Mutex<Estado> = Mutex::new(Estado { a_tocar: false, tem_faixa: false, postos: false, acao_pendente: None });
static APP: OnceLock<AppHandle> = OnceLock::new();
static BOTAO_CRIADO: OnceLock<u32> = OnceLock::new();
/// Os ids dos três botões (longe dos do menu, que também chegam por WM_COMMAND).
const ID_BASE: u32 = 0x4D00;

thread_local! {
    static TASKBAR: RefCell<Option<ITaskbarList3>> = const { RefCell::new(None) };
    static ICONES: RefCell<HashMap<(&'static str, bool, i32), HICON>> = RefCell::new(HashMap::new());
}

fn estado() -> std::sync::MutexGuard<'static, Estado> {
    ESTADO.lock().unwrap_or_else(|e| e.into_inner())
}

fn hwnd(janela: &WebviewWindow) -> Option<HWND> {
    janela.hwnd().ok().map(|h| HWND(h.0 as *mut _))
}

/// A barra do Windows está escura? (`SystemUsesLightTheme`: 1 é clara.)
fn barra_escura() -> bool {
    let mut valor = 0u32;
    let mut tamanho = 4u32;
    let r = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            &HSTRING::from(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"),
            &HSTRING::from("SystemUsesLightTheme"),
            RRF_RT_REG_DWORD,
            None,
            Some((&mut valor as *mut u32).cast()),
            Some(&mut tamanho),
        )
    };
    !(r.is_ok() && valor == 1)
}

/// O ícone do botão, feito uma vez por forma, tema e tamanho (e nunca destruído:
/// a barra pode ainda estar a mostrá-lo).
unsafe fn icone(nome: &'static str, escura: bool, lado: i32) -> Option<HICON> {
    if let Some(h) = ICONES.with(|c| c.borrow().get(&(nome, escura, lado)).copied()) {
        return Some(h);
    }
    let pixeis = desenhar_icone(nome, lado as usize, cor_dos_icones(escura));
    let info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: lado,
            biHeight: -lado, // de cima para baixo, como o desenho
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut bits = std::ptr::null_mut();
    let cor = CreateDIBSection(None, &info, DIB_RGB_COLORS, &mut bits, None, 0).ok()?;
    std::ptr::copy_nonoverlapping(pixeis.as_ptr(), bits.cast::<u8>(), pixeis.len());
    // A máscara a zeros: quem manda é o alfa. As linhas de 1 bit alinham a 16 bits.
    let mascara_bytes = vec![0u8; (lado as usize).div_ceil(16) * 2 * lado as usize];
    let mascara = CreateBitmap(lado, lado, 1, 1, Some(mascara_bytes.as_ptr().cast()));
    let h = CreateIconIndirect(&ICONINFO { fIcon: true.into(), xHotspot: 0, yHotspot: 0, hbmMask: mascara, hbmColor: cor });
    let _ = DeleteObject(cor.into());
    let _ = DeleteObject(mascara.into());
    let h = h.ok()?;
    ICONES.with(|c| c.borrow_mut().insert((nome, escura, lado), h));
    Some(h)
}

unsafe fn taskbar() -> Option<ITaskbarList3> {
    TASKBAR.with(|t| {
        if t.borrow().is_none() {
            let lista: ITaskbarList3 = CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER).ok()?;
            lista.HrInit().ok()?;
            *t.borrow_mut() = Some(lista);
        }
        t.borrow().clone()
    })
}

/// Põe (ou atualiza) os três botões. Só na thread da janela.
unsafe fn por_botoes(h: HWND) {
    let (a_tocar, tem_faixa, postos) = {
        let e = estado();
        (e.a_tocar, e.tem_faixa, e.postos)
    };
    let Some(lista) = taskbar() else { return };
    let escura = barra_escura();
    let lado = GetSystemMetricsForDpi(SM_CXSMICON, GetDpiForWindow(h).max(96));
    let lado = if lado > 0 { lado } else { 16 };
    let botoes = botoes_da_miniatura(a_tocar, tem_faixa);
    let mut feitos = [THUMBBUTTON::default(), THUMBBUTTON::default(), THUMBBUTTON::default()];
    for (i, b) in botoes.iter().enumerate() {
        let t = &mut feitos[i];
        t.dwMask = THB_ICON | THB_TOOLTIP | THB_FLAGS;
        t.iId = ID_BASE + i as u32;
        t.hIcon = icone(b.icone, escura, lado).unwrap_or_default();
        for (j, c) in b.dica.encode_utf16().take(259).enumerate() {
            t.szTip[j] = c;
        }
        t.dwFlags = if b.apagado { THBF_DISABLED } else { THBF_ENABLED };
    }
    let r = if postos { lista.ThumbBarUpdateButtons(h, &feitos) } else { lista.ThumbBarAddButtons(h, &feitos) };
    match r {
        Ok(()) => {
            if !postos {
                crate::registo::linha(&format!("barra: botões na miniatura postos ({lado} px, barra {})", if escura { "escura" } else { "clara" }));
            }
            estado().postos = true;
        }
        // Uma janela sem botão na barra (ainda escondida) recusa: o TaskbarButtonCreated volta a pôr.
        Err(e) => crate::registo::linha(&format!("barra: os botões da miniatura falharam ({e})")),
    }
}

unsafe extern "system" fn subclasse(h: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM, _id: usize, _dados: usize) -> LRESULT {
    if Some(&msg) == BOTAO_CRIADO.get() {
        estado().postos = false;
        por_botoes(h);
    } else if msg == WM_COMMAND && ((wparam.0 >> 16) & 0xffff) as u32 == THBN_CLICKED {
        let indice = (wparam.0 & 0xffff) as u32;
        if (ID_BASE..ID_BASE + 3).contains(&indice) {
            let (a_tocar, tem_faixa) = {
                let e = estado();
                (e.a_tocar, e.tem_faixa)
            };
            let atalho = botoes_da_miniatura(a_tocar, tem_faixa)[(indice - ID_BASE) as usize].atalho;
            if let Some(j) = APP.get().and_then(|a| a.get_webview_window("main")) {
                crate::ponte::entregar(&j, "atalho", json!(atalho));
            }
            return LRESULT(0);
        }
    } else if (msg == WM_SETTINGCHANGE || msg == WM_THEMECHANGED || msg == WM_DPICHANGED) && estado().postos {
        // O tema da barra ou a escala do monitor mudaram: os ícones refazem-se.
        por_botoes(h);
    }
    DefSubclassProc(h, msg, wparam, lparam)
}

/// A lista de saltos do ícone, com o AUMID da identidade. Como o Electron, só no
/// .exe de release (em desenvolvimento o .exe muda de sítio).
unsafe fn por_lista_de_saltos() -> windows::core::Result<()> {
    let exe = HSTRING::from(std::env::current_exe().map_err(|_| windows::core::Error::empty())?.as_os_str());
    let lista: ICustomDestinationList = CoCreateInstance(&DestinationList, None, CLSCTX_INPROC_SERVER)?;
    lista.SetAppID(&HSTRING::from(crate::canal::IDENTIFICADOR))?;
    let mut lugares = 0u32;
    let _tirados: IObjectArray = lista.BeginList(&mut lugares)?;
    let colecao: IObjectCollection = CoCreateInstance(&EnumerableObjectCollection, None, CLSCTX_INPROC_SERVER)?;
    for (acao, titulo, descricao) in TAREFAS {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
        link.SetPath(&exe)?;
        link.SetArguments(&HSTRING::from(format!("{ARGUMENTO}{acao}")))?;
        link.SetIconLocation(&exe, 0)?;
        link.SetDescription(&HSTRING::from(descricao))?;
        // O título vai como VT_LPWSTR (o que a barra lê); o Drop do PROPVARIANT liberta-o.
        let mut valor = PROPVARIANT::default();
        let texto = SHStrDupW(&HSTRING::from(titulo))?;
        (*valor.Anonymous.Anonymous).vt = VT_LPWSTR;
        (*valor.Anonymous.Anonymous).Anonymous.pwszVal = texto;
        let propriedades: IPropertyStore = link.cast()?;
        propriedades.SetValue(&PKEY_Title, &valor)?;
        propriedades.Commit()?;
        colecao.AddObject(&link)?;
    }
    lista.AddUserTasks(&colecao.cast::<IObjectArray>()?)?;
    lista.CommitList()
}

/// Na janela principal, ainda escondida: a subclasse (antes do 1.º botão na barra),
/// a ação dos argumentos e a lista de saltos.
pub fn instalar(app: &AppHandle, janela: &WebviewWindow) {
    let _ = APP.set(app.clone());
    estado().acao_pendente = acao_dos_argumentos(&std::env::args().collect::<Vec<_>>());
    let _ = BOTAO_CRIADO.set(unsafe { RegisterWindowMessageW(&HSTRING::from("TaskbarButtonCreated")) });
    let Some(h) = hwnd(janela) else { return };
    unsafe {
        if !SetWindowSubclass(h, Some(subclasse), 0x4475_6f74, 0).as_bool() {
            crate::registo::linha("barra: sem subclasse, sem botões na miniatura");
        }
        if !cfg!(debug_assertions) {
            if let Err(e) = por_lista_de_saltos() {
                crate::registo::linha(&format!("barra: a lista de saltos falhou ({e})"));
            }
        }
    }
}

/// A 2.ª instância (ou a lista de saltos com a app aberta): a ação fica à espera e a página é avisada.
pub fn pedir_acao(app: &AppHandle, argv: &[String]) {
    let Some(acao) = acao_dos_argumentos(argv) else { return };
    estado().acao_pendente = Some(acao);
    if let Some(j) = app.get_webview_window("main") {
        crate::ponte::entregar(&j, "barra:acao", Value::Null);
    }
}

fn da_janela_principal(janela: &WebviewWindow) -> Result<(), String> {
    if janela.label() == "main" { Ok(()) } else { Err("Pedido inválido.".into()) }
}

/// A página diz se há música e se está a tocar (só quando muda).
#[tauri::command]
pub fn barra_estado(app: AppHandle, janela: WebviewWindow, estado: Value) -> Result<(), String> {
    da_janela_principal(&janela)?;
    let (a_tocar, tem_faixa) = estado_valido(&estado).ok_or("Pedido inválido.")?;
    {
        let mut e = self::estado();
        if e.a_tocar == a_tocar && e.tem_faixa == tem_faixa {
            return Ok(());
        }
        e.a_tocar = a_tocar;
        e.tem_faixa = tem_faixa;
        if !e.postos {
            return Ok(()); // o TaskbarButtonCreated põe-nos já com este estado
        }
    }
    let Some(h) = hwnd(&janela) else { return Ok(()) };
    let h = h.0 as usize;
    let _ = app.run_on_main_thread(move || unsafe { por_botoes(HWND(h as *mut _)) });
    Ok(())
}

/// A ação da lista de saltos à espera, ou nada (tirada uma vez só).
#[tauri::command]
pub fn barra_tirar_acao(janela: WebviewWindow) -> Result<Option<String>, String> {
    da_janela_principal(&janela)?;
    Ok(estado().acao_pendente.take().map(str::to_string))
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn as_tarefas_sao_as_do_electron_e_do_iphone() {
        let electron = include_str!("../../electron/barraDeTarefas.cjs").replace("\r\n", "\n");
        let iphone = include_str!("../../src/lib/atalhosDoIcone.ts").replace("\r\n", "\n");
        assert!(electron.contains(&format!("const ARGUMENTO = '{ARGUMENTO}'")));
        for (acao, titulo, descricao) in TAREFAS {
            assert!(electron.contains(&format!("{{ acao: '{acao}', titulo: '{titulo}', descricao: '{descricao}' }}")), "{acao} igual ao Electron");
            assert!(iphone.contains(&format!("acao: '{acao}', titulo: '{titulo}'")), "{acao} igual ao iPhone");
        }
    }

    #[test]
    fn os_argumentos() {
        assert_eq!(acao_dos_argumentos(&["Duotone.exe", "--duotone-acao=mistura-do-dia"]), Some("mistura-do-dia"));
        assert_eq!(acao_dos_argumentos(&["Duotone.exe", "--duotone-acao=apagar-tudo"]), None);
        assert_eq!(acao_dos_argumentos(&["Duotone.exe", "x--duotone-acao=continuar"]), None);
        assert_eq!(acao_dos_argumentos(&["Duotone.exe"]), None);
        assert_eq!(acao_dos_argumentos::<&str>(&[]), None);
        assert_eq!(estado_valido(&json!({ "aTocar": "sim", "temFaixa": true })), None);
        assert_eq!(estado_valido(&json!({ "aTocar": true, "temFaixa": true, "extra": 1 })), Some((true, true)));
    }

    #[test]
    fn os_botoes() {
        let a_tocar = botoes_da_miniatura(true, true);
        assert_eq!(a_tocar.iter().map(|b| b.atalho).collect::<Vec<_>>(), ["anterior", "tocar-pausa", "seguinte"]);
        assert_eq!((a_tocar[1].icone, a_tocar[1].dica), ("pausa", "Pause"));
        assert_eq!(botoes_da_miniatura(false, true)[1].icone, "tocar");
        assert!(botoes_da_miniatura(false, false).iter().all(|b| b.apagado), "sem música ficam apagados");
        assert!(botoes_da_miniatura(true, true).iter().all(|b| !b.apagado));
        let atalhos = include_str!("../../electron/atalhos.cjs");
        for b in &a_tocar {
            assert!(atalhos.contains(&format!("'{}'", b.atalho)), "{} é uma ação dos atalhos", b.atalho);
        }
    }

    #[test]
    fn os_icones() {
        let alfa = |buf: &[u8], lado: usize, x: usize, y: usize| buf[(y * lado + x) * 4 + 3];
        for lado in [16, 20, 24, 32, 40] {
            for nome in ["tocar", "pausa", "seguinte", "anterior"] {
                let buf = desenhar_icone(nome, lado, [255, 255, 255]);
                assert_eq!(buf.len(), lado * lado * 4);
                assert_eq!(alfa(&buf, lado, 0, 0), 0, "{nome}: canto vazio");
                assert_eq!(alfa(&buf, lado, lado - 1, lado - 1), 0);
                if nome != "pausa" {
                    assert!(alfa(&buf, lado, lado / 2, lado / 2) > 0, "{nome}: cheio ao meio");
                }
                // Alfa direto: a cor não escurece nas arestas.
                for p in buf.chunks_exact(4).filter(|p| p[3] > 0) {
                    assert_eq!(&p[..3], &[255, 255, 255]);
                }
            }
            let pausa = desenhar_icone("pausa", lado, [255, 255, 255]);
            assert_eq!(alfa(&pausa, lado, lado / 2, lado / 2), 0, "a pausa tem o vão entre as barras");
            assert_eq!(alfa(&pausa, lado, lado * 5 / 16, lado / 2), 255, "e as barras cheias");
        }
        assert_eq!(&desenhar_icone("tocar", 16, cor_dos_icones(false))[(8 * 16 + 7) * 4..][..3], &[36, 32, 32], "BGRA, escuro na barra clara");
    }
}
