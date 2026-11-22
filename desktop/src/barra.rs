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
use windows::Win32::System::Variant::VT_LPWSTR;
use windows::Win32::UI::HiDpi::{GetDpiForWindow, GetSystemMetricsForDpi};
use windows::Win32::UI::Shell::Common::{IObjectArray, IObjectCollection};
use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
use windows::Win32::UI::Shell::{
    DefSubclassProc, DestinationList, EnumerableObjectCollection, ICustomDestinationList, IShellLinkW, ITaskbarList3, SHStrDupW, SetWindowSubclass,
    ShellLink, TaskbarList, THBF_DISABLED, THBF_ENABLED, THBN_CLICKED, THB_FLAGS, THB_ICON, THB_TOOLTIP, THUMBBUTTON,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateIconIndirect, DestroyIcon, FlashWindowEx, RegisterWindowMessageW, FLASHWINFO, FLASHW_STOP, FLASHW_TRAY, HICON, ICONINFO, SM_CXSMICON, WM_COMMAND, WM_DPICHANGED, WM_SETTINGCHANGE, WM_THEMECHANGED,
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

/// O número das mensagens por ler (`electron/messageBadge.cjs`): um círculo vermelho
/// de 32 px com os algarismos brancos, "99+" acima de 99. BGRA de alfa direto.
fn desenhar_por_ler(n: u32) -> (Vec<u8>, String) {
    const LADO: usize = 32;
    fn algarismo(c: char) -> [&'static str; 5] {
        match c {
            '0' => ["111", "101", "101", "101", "111"],
            '1' => ["010", "110", "010", "010", "111"],
            '2' => ["111", "001", "111", "100", "111"],
            '3' => ["111", "001", "111", "001", "111"],
            '4' => ["101", "101", "111", "001", "001"],
            '5' => ["111", "100", "111", "001", "111"],
            '6' => ["111", "100", "111", "101", "111"],
            '7' => ["111", "001", "010", "010", "010"],
            '8' => ["111", "101", "111", "101", "111"],
            '9' => ["111", "101", "111", "001", "111"],
            _ => ["000", "010", "111", "010", "000"], // o "+"
        }
    }
    let rotulo = if n > 99 { "99+".to_string() } else { n.to_string() };
    let escala = if rotulo.len() > 2 { 2 } else { 3 };
    let mut buf = vec![0u8; LADO * LADO * 4];
    let mut pixel = |x: usize, y: usize, bgra: [u8; 4]| {
        if x < LADO && y < LADO {
            buf[(y * LADO + x) * 4..][..4].copy_from_slice(&bgra);
        }
    };
    for y in 0..LADO {
        for x in 0..LADO {
            let a = (16.0 - (x as f64 - 15.5).hypot(y as f64 - 15.5)).clamp(0.0, 1.0);
            let a = (255.0 * a).round() as u8;
            if a > 0 {
                pixel(x, y, [72, 64, 225, a]);
            }
        }
    }
    let largura = (rotulo.len() * 4 - 1) * escala;
    let (esquerda, topo) = ((LADO - largura) / 2, (LADO - 5 * escala) / 2);
    for (n, c) in rotulo.chars().enumerate() {
        for (y, linha) in algarismo(c).iter().enumerate() {
            for (x, ligado) in linha.chars().enumerate() {
                if ligado == '1' {
                    for dy in 0..escala {
                        for dx in 0..escala {
                            pixel(esquerda + (n * 4 + x) * escala + dx, topo + y * escala + dy, [255, 255, 255, 255]);
                        }
                    }
                }
            }
        }
    }
    (buf, rotulo)
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
    /// As mensagens por ler (o número no ícone da barra).
    por_ler: u32,
}
static ESTADO: Mutex<Estado> = Mutex::new(Estado { a_tocar: false, tem_faixa: false, postos: false, acao_pendente: None, por_ler: 0 });
static APP: OnceLock<AppHandle> = OnceLock::new();
/// Desde quando nada toca (nada a tocar): a atualização só se instala sozinha
/// passados dez minutos parada (F9, `atualizacao.rs`). Começa parada no arranque.
static PARADA_DESDE: Mutex<Option<std::time::Instant>> = Mutex::new(None);
static BOTAO_CRIADO: OnceLock<u32> = OnceLock::new();
/// Os ids dos três botões (longe dos do menu, que também chegam por WM_COMMAND).
const ID_BASE: u32 = 0x4D00;
const WM_POWERBROADCAST: u32 = 0x0218;
const PBT_APMRESUMEAUTOMATIC: usize = 0x0012;

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
    crate::chaves::ler_dword(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize", "SystemUsesLightTheme") != Some(1)
}

/// O ícone do botão, feito uma vez por forma, tema e tamanho (e nunca destruído:
/// a barra pode ainda estar a mostrá-lo).
unsafe fn icone(nome: &'static str, escura: bool, lado: i32) -> Option<HICON> {
    if let Some(h) = ICONES.with(|c| c.borrow().get(&(nome, escura, lado)).copied()) {
        return Some(h);
    }
    let h = hicon_de(&desenhar_icone(nome, lado as usize, cor_dos_icones(escura)), lado)?;
    ICONES.with(|c| c.borrow_mut().insert((nome, escura, lado), h));
    Some(h)
}

/// Um HICON de um quadrado BGRA de alfa direto, `lado` x `lado`.
unsafe fn hicon_de(pixeis: &[u8], lado: i32) -> Option<HICON> {
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
    h.ok()
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

/// Põe (ou tira) o número das mensagens por ler no ícone da barra. Só na thread da janela.
unsafe fn por_numero(h: HWND) {
    let n = estado().por_ler;
    let Some(lista) = taskbar() else { return };
    let r = if n == 0 {
        lista.SetOverlayIcon(h, HICON::default(), &HSTRING::new())
    } else {
        let (pixeis, _) = desenhar_por_ler(n);
        let Some(icone) = hicon_de(&pixeis, 32) else { return };
        // A barra fica com uma cópia (como no Chromium): o nosso destrói-se já.
        let r = lista.SetOverlayIcon(h, icone, &HSTRING::from(format!("{n} unread messages")));
        let _ = DestroyIcon(icone);
        r
    };
    if let Err(e) = r {
        crate::registo::linha(&format!("barra: o número das mensagens falhou ({e})"));
    }
}

/// Pisca o botão da barra (4 vezes, e fica aceso), ou para (o `flashFrame` do Electron).
fn piscar(janela: &WebviewWindow, ligar: bool) {
    let Some(h) = hwnd(janela) else { return };
    let info = FLASHWINFO {
        cbSize: std::mem::size_of::<FLASHWINFO>() as u32,
        hwnd: h,
        dwFlags: if ligar { FLASHW_TRAY } else { FLASHW_STOP },
        uCount: if ligar { 4 } else { 0 },
        dwTimeout: 0,
    };
    unsafe {
        let _ = FlashWindowEx(&info);
    }
}

/// A janela ganhou o foco: deixa de piscar.
pub fn parar_de_piscar(janela: &WebviewWindow) {
    piscar(janela, false);
}

/// As mensagens por ler (`setMessageAttention`): o número quando muda; pisca quando
/// chega uma com `atencao` e a janela não tem o foco; sem nenhuma, para.
pub fn mensagens_por_ler(app: &AppHandle, janela: &WebviewWindow, n: u32, atencao: bool) {
    let mudou = {
        let mut e = estado();
        let mudou = e.por_ler != n;
        e.por_ler = n;
        mudou && e.postos // sem botão na barra, o TaskbarButtonCreated põe-no
    };
    if mudou {
        if let Some(h) = hwnd(janela) {
            let h = h.0 as usize;
            let _ = app.run_on_main_thread(move || unsafe { por_numero(HWND(h as *mut _)) });
        }
    }
    if n == 0 || janela.is_focused().unwrap_or(false) {
        piscar(janela, false);
    } else if atencao {
        piscar(janela, true);
    }
}

unsafe extern "system" fn subclasse(h: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM, _id: usize, _dados: usize) -> LRESULT {
    if Some(&msg) == BOTAO_CRIADO.get() {
        estado().postos = false;
        por_botoes(h);
        // O número das mensagens também se perde com o botão da barra.
        if estado().por_ler > 0 {
            por_numero(h);
        }
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
    } else if msg == WM_POWERBROADCAST && wparam.0 == PBT_APMRESUMEAUTOMATIC {
        // O PC acordou: a procura de atualizações adianta-se (F9), como o `resume` do Electron.
        crate::atualizacao::retomar();
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
    *PARADA_DESDE.lock().unwrap_or_else(|e| e.into_inner()) = Some(std::time::Instant::now());
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
        if e.a_tocar != a_tocar {
            let mut parada = PARADA_DESDE.lock().unwrap_or_else(|e| e.into_inner());
            if a_tocar {
                *parada = None;
                // O som do WebView2 aparece no misturador como "Duotone" (mistura.rs).
                crate::mistura::ao_tocar();
            } else if parada.is_none() {
                *parada = Some(std::time::Instant::now());
            }
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

/// A tocar? E há quanto tempo está parada (nada se está a tocar)?
pub fn a_tocar_e_parada() -> (bool, Option<std::time::Duration>) {
    let a_tocar = estado().a_tocar;
    let parada = PARADA_DESDE.lock().unwrap_or_else(|e| e.into_inner()).map(|t| t.elapsed());
    (a_tocar, if a_tocar { None } else { parada })
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

    #[test]
    fn o_numero_das_mensagens_e_o_do_electron() {
        let px = |buf: &[u8], x: usize, y: usize| <[u8; 4]>::try_from(&buf[(y * 32 + x) * 4..][..4]).unwrap();
        assert_eq!(desenhar_por_ler(7).1, "7");
        assert_eq!(desenhar_por_ler(42).1, "42");
        assert_eq!(desenhar_por_ler(100).1, "99+");
        let (um, _) = desenhar_por_ler(1);
        assert_eq!(um.len(), 32 * 32 * 4);
        assert_eq!(px(&um, 0, 0)[3], 0, "canto fora do círculo");
        assert_eq!(px(&um, 3, 15), [72, 64, 225, 255], "o vermelho do Electron (BGRA)");
        // O "1" (3 px por ponto, centrado): a coluna do meio é branca.
        assert_eq!(px(&um, 16, 16), [255, 255, 255, 255]);
        // A borda suaviza: alfa a meio caminho.
        let borda = px(&um, 15, 0)[3];
        assert!(borda > 0 && borda < 255, "alfa {borda}");
        // Três algarismos cabem (escala 2).
        let (cheio, _) = desenhar_por_ler(150);
        assert!(cheio.chunks_exact(4).filter(|p| p == &[255, 255, 255, 255]).count() > 40);
    }
}
