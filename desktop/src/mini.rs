//! O mini leitor (F6), porta do `electron/miniLeitor.cjs` (a geometria, pura e
//! testada com os casos do `scripts/test-mini-leitor.mjs`) e da parte do
//! `main.cjs` que gere a janela. É um COMANDO À DISTÂNCIA: a música continua na
//! janela principal; o mini recebe um resumo e manda comandos de uma lista fechada.
//!
//! As contas são em PÍXEIS FÍSICOS (os monitores e a janela do Tauri): os
//! tamanhos de base (360x88, ...) são lógicos e multiplicam-se pela escala do
//! monitor onde o mini está.

use std::{
    fs,
    path::PathBuf,
    sync::Mutex,
    time::{Duration, Instant},
};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

// ------------------------------------------------------------------ a geometria

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Tam { pub w: f64, pub h: f64 }
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Pos { pub x: f64, pub y: f64 }
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Area { pub x: f64, pub y: f64, pub w: f64, pub h: f64 }

pub const ALTURA_DA_LISTA: f64 = 280.0;
pub const ESPACO_DA_LISTA: f64 = 6.0;
pub const COMPACTO: Tam = Tam { w: 360.0, h: 88.0 };
pub const EXPANDIDO: Tam = Tam { w: 320.0, h: 400.0 };
pub const COM_LISTA: Tam = Tam { w: 360.0, h: 88.0 + ESPACO_DA_LISTA + ALTURA_DA_LISTA };
pub const MARGEM: f64 = 16.0;
const ENCOSTAR: f64 = 12.0;
pub const ESCALA_MINIMA: f64 = 0.8;
pub const ESCALA_MAXIMA: f64 = 1.8;
pub const NA_LISTA: usize = 50;
const COMANDOS: &[&str] = &["tocar-pausa", "seguinte", "anterior", "guardar", "procurar", "expandir", "encolher", "fechar", "abrir-duotone", "alternar-duotone", "tocar-da-fila"];

/// O `Math.round` do JS (as metades sobem), para as contas darem o mesmo.
fn arred(x: f64) -> f64 { (x + 0.5).floor() }

/// A chave de um monitor: as medidas dele. Os ids mudam entre arranques.
pub fn chave_do_monitor(a: &Area) -> String {
    format!("{},{},{}x{}", a.x, a.y, a.w, a.h)
}

/// Canto de baixo à direita da área (acima da barra de tarefas, na de trabalho).
pub fn posicao_inicial(area: &Area, t: Tam) -> Pos {
    Pos { x: arred(area.x + area.w - t.w - MARGEM), y: arred(area.y + area.h - t.h - MARGEM) }
}

/// A área que contém o centro da janela; sem nenhuma, a mais próxima.
pub fn area_de(pos: Pos, t: Tam, areas: &[Area]) -> Option<Area> {
    let (cx, cy) = (pos.x + t.w / 2.0, pos.y + t.h / 2.0);
    if let Some(a) = areas.iter().find(|a| cx >= a.x && cx < a.x + a.w && cy >= a.y && cy < a.y + a.h) {
        return Some(*a);
    }
    areas.iter().copied().min_by(|a, b| {
        let d = |a: &Area| {
            let dx = (a.x - cx).max(0.0).max(cx - (a.x + a.w));
            let dy = (a.y - cy).max(0.0).max(cy - (a.y + a.h));
            dx * dx + dy * dy
        };
        d(a).partial_cmp(&d(b)).unwrap_or(std::cmp::Ordering::Equal)
    })
}

/// A janela inteira dentro da área (um monitor desligado não a deixa perdida).
pub fn prender(pos: Pos, t: Tam, area: &Area) -> Pos {
    let x = pos.x.max(area.x).min(area.x + area.w - t.w);
    let y = pos.y.max(area.y).min(area.y + area.h - t.h);
    Pos { x: arred(x), y: arred(y) }
}

/// A menos de 12 px de uma borda, encosta à margem dela.
pub fn encostar(pos: Pos, t: Tam, area: &Area) -> Pos {
    let (esquerda, direita) = (area.x + MARGEM, area.x + area.w - t.w - MARGEM);
    let (cima, baixo) = (area.y + MARGEM, area.y + area.h - t.h - MARGEM);
    let mut p = pos;
    if (p.x - esquerda).abs() <= ENCOSTAR { p.x = esquerda } else if (p.x - direita).abs() <= ENCOSTAR { p.x = direita }
    if (p.y - cima).abs() <= ENCOSTAR { p.y = cima } else if (p.y - baixo).abs() <= ENCOSTAR { p.y = baixo }
    prender(p, t, area)
}

/// Onde abrir: a posição guardada para um destes monitores, se ainda cabe;
/// senão o canto de baixo à direita da área de trabalho principal. `tam` dá o
/// tamanho em cada monitor (a escala de cada um).
pub fn onde_abrir(guardado: &Value, tam: impl Fn(&Area) -> Tam, areas: &[Area], principal: Option<Area>) -> Pos {
    for area in areas {
        let p = &guardado["porMonitor"][chave_do_monitor(area)];
        if let (Some(x), Some(y)) = (p["x"].as_f64(), p["y"].as_f64()) {
            return prender(Pos { x, y }, tam(area), area);
        }
    }
    let area = principal.or_else(|| areas.first().copied()).unwrap_or(Area { x: 0.0, y: 0.0, w: 1280.0, h: 720.0 });
    posicao_inicial(&area, tam(&area))
}

/// Mudar de tamanho mantendo o canto mais perto de uma borda.
pub fn mudar_de_tamanho(pos: Pos, de: Tam, para: Tam, area: &Area) -> Pos {
    let direita = pos.x + de.w / 2.0 > area.x + area.w / 2.0;
    let baixo = pos.y + de.h / 2.0 > area.y + area.h / 2.0;
    let x = if direita { pos.x + de.w - para.w } else { pos.x };
    let y = if baixo { pos.y + de.h - para.h } else { pos.y };
    prender(Pos { x, y }, para, area)
}

/// Para que lado a barra recolhida se encosta: encostado em baixo abre para cima.
pub fn ancora_do_mini(pos: Pos, t: Tam, area: Option<&Area>) -> &'static str {
    match area {
        Some(a) if pos.y + t.h / 2.0 <= a.y + a.h / 2.0 => "cima",
        _ => "baixo",
    }
}

/// Abrir a lista: a janela cresce para longe da borda e o cartão não se mexe.
pub fn com_a_lista(pos: Pos, compacto: Tam, grande: Tam, area: Option<&Area>) -> (&'static str, Pos) {
    let ancora = ancora_do_mini(pos, compacto, area);
    let y = if ancora == "baixo" { pos.y + compacto.h - grande.h } else { pos.y };
    let p = Pos { x: pos.x, y };
    (ancora, area.map(|a| prender(p, grande, a)).unwrap_or(p))
}

/// Fechar a lista: a janela volta ao tamanho do cartão, que fica onde está.
pub fn sem_a_lista(pos: Pos, compacto: Tam, grande: Tam, ancora: &str) -> Pos {
    Pos { x: pos.x, y: if ancora == "baixo" { pos.y + grande.h - compacto.h } else { pos.y } }
}

pub fn escala_valida(v: f64) -> f64 {
    if !v.is_finite() { return 1.0; }
    arred(v.clamp(ESCALA_MINIMA, ESCALA_MAXIMA) * 100.0) / 100.0
}
pub fn com_escala(t: Tam, e: f64) -> Tam {
    Tam { w: arred(t.w * e), h: arred(t.h * e) }
}

/// Os lados que ficam PARADOS a mudar de tamanho: os mais perto das bordas.
pub fn lados_fixos(pos: Pos, t: Tam, area: Option<&Area>) -> (bool, bool) {
    match area {
        None => (true, true),
        Some(a) => (pos.x + t.w / 2.0 > a.x + a.w / 2.0, pos.y + t.h / 2.0 > a.y + a.h / 2.0),
    }
}

/// Arrastar a pega: a escala sai da largura entre o canto parado e o rato.
pub fn arrastar_pega(fixo: Pos, rato: Pos, base: Tam, lados: (bool, bool)) -> (f64, Pos, Tam) {
    let largura = if lados.0 { fixo.x - rato.x } else { rato.x - fixo.x };
    let escala = escala_valida(largura / base.w);
    let t = com_escala(base, escala);
    let p = Pos { x: if lados.0 { fixo.x - t.w } else { fixo.x }, y: if lados.1 { fixo.y - t.h } else { fixo.y } };
    (escala, p, t)
}

/// O que se grava depois de mexer: a posição, por monitor.
pub fn lembrar(guardado: &Value, pos: Pos, area: &Area) -> Value {
    let mut base = if guardado.is_object() { guardado.clone() } else { json!({}) };
    if !base["porMonitor"].is_object() { base["porMonitor"] = json!({}); }
    base["porMonitor"][chave_do_monitor(area)] = json!({ "x": pos.x, "y": pos.y });
    base
}

/// Os comandos que a janela do mini pode mandar: uma lista fechada.
pub fn comando_valido(c: &Value) -> Option<Value> {
    let tipo = c.get("tipo")?.as_str()?;
    if !COMANDOS.contains(&tipo) { return None; }
    match tipo {
        "procurar" => {
            let ms = c.get("ms")?.as_f64()?;
            (ms.is_finite() && (0.0..24.0 * 3_600_000.0).contains(&ms)).then(|| json!({ "tipo": "procurar", "ms": arred(ms) as u64 }))
        }
        "tocar-da-fila" => {
            let chave = c.get("chave")?.as_str().filter(|s| !s.is_empty() && s.chars().count() <= 300)?;
            let posicao = c.get("posicao")?.as_f64()?;
            (posicao.fract() == 0.0 && posicao >= 0.0 && (posicao as usize) < NA_LISTA).then(|| json!({ "tipo": tipo, "chave": chave, "posicao": posicao as u64 }))
        }
        _ => Some(json!({ "tipo": tipo })),
    }
}

/// O resumo que a janela principal publica: só estes campos passam para o mini.
pub fn resumo_valido(r: &Value) -> Option<Value> {
    if !r.is_object() { return None; }
    let texto = |v: &Value, max: usize| v.as_str().map(|s| s.chars().take(max).collect::<String>());
    let numero = |v: &Value| v.as_f64().filter(|n| n.is_finite() && *n >= 0.0).map(|n| arred(n) as u64).unwrap_or(0);
    let so_https = |v: &Value| texto(v, 500).filter(|s| s.starts_with("https://"));
    let fila: Vec<Value> = r["fila"].as_array().map(|l| {
        l.iter().take(NA_LISTA)
            .filter(|f| f["chave"].as_str().map(|c| !c.is_empty() && c.chars().count() <= 300).unwrap_or(false))
            .map(|f| json!({ "titulo": texto(&f["titulo"], 200), "artista": texto(&f["artista"], 200), "capa": so_https(&f["capa"]), "chave": f["chave"] }))
            .collect()
    }).unwrap_or_default();
    Some(json!({
        "titulo": texto(&r["titulo"], 200),
        "artista": texto(&r["artista"], 200),
        "capa": so_https(&r["capa"]),
        "aTocar": r["aTocar"] == json!(true),
        "guardada": r["guardada"] == json!(true),
        "posicaoMs": numero(&r["posicaoMs"]),
        "duracaoMs": numero(&r["duracaoMs"]),
        "fila": fila,
        "filaSoDeVer": r["filaSoDeVer"] == json!(true),
        "sentido": if r["sentido"].as_f64() == Some(-1.0) { -1 } else { 1 },
    }))
}

// ------------------------------------------------------------------ a janela

struct Estado {
    expandido: bool,
    com_lista: bool,
    ancora_da_lista: &'static str,
    escala: f64,
    ultimo_resumo: Option<Value>,
    escondido_pelo_modo_limpo: bool,
    ignorando: bool,
    /// A pega: os lados parados e o canto fixo (físico).
    pega: Option<((bool, bool), Pos)>,
    /// O último `Moved` vindo da pessoa (um arrasto), para o fim do arrasto.
    movido_em: Option<Instant>,
    /// Até quando os `Moved` são nossos (`set_position`/`set_size`) e não contam.
    nosso_ate: Option<Instant>,
}

static ESTADO: Mutex<Estado> = Mutex::new(Estado {
    expandido: false, com_lista: false, ancora_da_lista: "baixo", escala: 1.0, ultimo_resumo: None,
    escondido_pelo_modo_limpo: false, ignorando: false, pega: None, movido_em: None, nosso_ate: None,
});

fn estado() -> std::sync::MutexGuard<'static, Estado> {
    ESTADO.lock().unwrap_or_else(|e| e.into_inner())
}

fn ficheiro() -> Option<PathBuf> {
    let base = std::env::var_os("LOCALAPPDATA")?;
    let p = PathBuf::from(base).join(crate::canal::IDENTIFICADOR);
    fs::create_dir_all(&p).ok()?;
    Some(p.join("mini-leitor.json"))
}
fn ler_gravado() -> Value {
    ficheiro().and_then(|f| fs::read_to_string(f).ok()).and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(json!({}))
}
fn gravar(v: &Value) {
    if let Some(f) = ficheiro() { let _ = fs::write(f, v.to_string()); }
}

/// Os monitores: o ecrã INTEIRO de cada um (o mini pode ficar por cima da barra
/// de tarefas) e a escala dele.
fn monitores(app: &AppHandle) -> Vec<(Area, f64)> {
    app.available_monitors().unwrap_or_default().iter().map(|m| {
        let (p, s) = (m.position(), m.size());
        (Area { x: p.x as f64, y: p.y as f64, w: s.width as f64, h: s.height as f64 }, m.scale_factor())
    }).collect()
}
fn escala_do_monitor(lista: &[(Area, f64)], area: &Area) -> f64 {
    lista.iter().find(|(a, _)| a == area).map(|(_, e)| *e).unwrap_or(1.0)
}
fn fisico(t: Tam, escala: f64, monitor: f64) -> Tam {
    let l = com_escala(t, escala);
    Tam { w: arred(l.w * monitor), h: arred(l.h * monitor) }
}

fn janela(app: &AppHandle) -> Option<WebviewWindow> { app.get_webview_window("mini") }
fn principal(app: &AppHandle) -> Option<WebviewWindow> { app.get_webview_window("main") }

fn caixa(j: &WebviewWindow) -> Option<(Pos, Tam)> {
    let p = j.outer_position().ok()?;
    let s = j.outer_size().ok()?;
    Some((Pos { x: p.x as f64, y: p.y as f64 }, Tam { w: s.width as f64, h: s.height as f64 }))
}

/// Mexe na janela; os `Moved` dos próximos 300 ms são nossos.
fn por_caixa(j: &WebviewWindow, pos: Pos, t: Option<Tam>) {
    estado().nosso_ate = Some(Instant::now() + Duration::from_millis(300));
    if let Some(t) = t {
        let _ = j.set_size(tauri::PhysicalSize::new(t.w as u32, t.h as u32));
    }
    let _ = j.set_position(tauri::PhysicalPosition::new(pos.x as i32, pos.y as i32));
}

fn avisar_principal(app: &AppHandle) {
    if let Some(m) = principal(app) {
        crate::ponte::entregar(&m, "mini:aberto", json!(janela(app).is_some()));
    }
}

/// Diz ao mini se a janela principal está à vista (o botão ao lado do X).
pub fn avisar_janela(app: &AppHandle) {
    let (Some(j), Some(m)) = (janela(app), principal(app)) else { return };
    let visivel = m.is_visible().unwrap_or(false) && !m.is_minimized().unwrap_or(false);
    crate::ponte::entregar(&j, "mini:janela", json!(visivel));
}

fn avisar_ancora(app: &AppHandle) {
    let Some(j) = janela(app) else { return };
    if estado().com_lista { return; }
    let Some((p, t)) = caixa(&j) else { return };
    let mons = monitores(app);
    let areas: Vec<Area> = mons.iter().map(|m| m.0).collect();
    let area = area_de(p, t, &areas);
    let (direita, _) = lados_fixos(p, t, area.as_ref());
    crate::ponte::entregar(&j, "mini:ancora", json!({ "vertical": ancora_do_mini(p, t, area.as_ref()), "horizontal": if direita { "direita" } else { "esquerda" } }));
}

/// Por cima de TUDO (jogos sem margens incluídos): reafirma o topo sem tirar o foco.
fn manter_por_cima(j: &WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER, SWP_NOSIZE};
    if let Ok(h) = j.hwnd() {
        unsafe {
            let _ = SetWindowPos(HWND(h.0 as *mut _), Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER);
        }
    }
}

fn cursor() -> Option<Pos> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    let mut p = POINT::default();
    unsafe { GetCursorPos(&mut p).ok()?; }
    Some(Pos { x: p.x as f64, y: p.y as f64 })
}
fn botao_esquerdo_em_baixo() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
    unsafe { (GetAsyncKeyState(VK_LBUTTON.0 as i32) as u16 & 0x8000) != 0 }
}

pub fn alternar(app: &AppHandle) {
    match janela(app) {
        Some(j) => { let _ = j.close(); }
        None => abrir(app),
    }
}

pub fn abrir(app: &AppHandle) {
    if let Some(j) = janela(app) {
        let _ = j.show();
        return;
    }
    let gravado = ler_gravado();
    let escala = escala_valida(gravado["escala"].as_f64().unwrap_or(1.0));
    {
        let mut e = estado();
        e.expandido = false;
        e.com_lista = false;
        e.escala = escala;
        e.ignorando = false;
        e.pega = None;
        e.movido_em = None;
    }
    let mons = monitores(app);
    let areas: Vec<Area> = mons.iter().map(|m| m.0).collect();
    let trabalho = app.primary_monitor().ok().flatten().map(|m| {
        let r = m.work_area();
        Area { x: r.position.x as f64, y: r.position.y as f64, w: r.size.width as f64, h: r.size.height as f64 }
    });
    let escala_principal = app.primary_monitor().ok().flatten().map(|m| m.scale_factor()).unwrap_or(1.0);
    let tam_em = |a: &Area| fisico(COMPACTO, escala, if trabalho.as_ref() == Some(a) { escala_principal } else { escala_do_monitor(&mons, a) });
    let pos = onde_abrir(&gravado, tam_em, &areas, trabalho);
    let area = area_de(pos, fisico(COMPACTO, escala, escala_principal), &areas);
    let tam = fisico(COMPACTO, escala, area.map(|a| escala_do_monitor(&mons, &a)).unwrap_or(escala_principal));
    let url = format!("http://localhost:{}/index.html?janela=mini", crate::canal::PORTA);
    let criada = WebviewWindowBuilder::new(app, "mini", WebviewUrl::External(url.parse().unwrap()))
        // Os mesmos da janela principal: partilham a pasta do WebView2, e o WebView2
        // recusa dois ambientes com opções diferentes na mesma pasta.
        .additional_browser_args(crate::webview::ARGUMENTOS)
        .title("Duotone mini player")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focusable(false)
        .focused(false)
        .visible(false)
        .initialization_script(script())
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .on_navigation(crate::webview::navegacao_da_app)
        .on_page_load(|j, carga| {
            if carga.event() == tauri::webview::PageLoadEvent::Finished && !estado().escondido_pelo_modo_limpo {
                let _ = j.show();
                manter_por_cima(&j);
            }
        })
        .build();
    match criada {
        Ok(j) => {
            por_caixa(&j, pos, Some(tam));
            vigiar(app.clone());
            avisar_principal(app);
            crate::registo::linha("mini leitor aberto");
        }
        Err(e) => crate::registo::linha(&format!("mini leitor falhou: {e}")),
    }
}

/// O mini fechou: o estado volta ao início e a janela principal fica a saber.
pub fn fechado(app: &AppHandle) {
    {
        let mut e = estado();
        e.com_lista = false;
        e.pega = None;
        e.movido_em = None;
    }
    avisar_principal(app);
}

/// Um `Moved` do mini: se for da pessoa, conta para o fim do arrasto.
pub fn movido(app: &AppHandle) {
    let mut e = estado();
    if e.nosso_ate.map(|t| Instant::now() < t).unwrap_or(false) { return; }
    e.movido_em = Some(Instant::now());
    drop(e);
    // Arrastado com a lista aberta: ela fecha (o que se grava é o cartão).
    if estado().com_lista {
        mudar_lista(app, false);
        if let Some(j) = janela(app) { crate::ponte::entregar(&j, "mini:lista-fechada", json!(null)); }
    }
}

/// Largado: encosta perto de uma borda e fica lembrado neste monitor.
fn fim_do_arrasto(app: &AppHandle) {
    let Some(j) = janela(app) else { return };
    let Some((p, t)) = caixa(&j) else { return };
    let areas: Vec<Area> = monitores(app).iter().map(|m| m.0).collect();
    let Some(area) = area_de(p, t, &areas) else { return };
    let novo = encostar(p, t, &area);
    if novo != p { por_caixa(&j, novo, None); }
    gravar(&lembrar(&ler_gravado(), novo, &area));
    avisar_ancora(app);
}

/// O rato, o topo e o fim de um arrasto, enquanto o mini existir.
fn vigiar(app: AppHandle) {
    std::thread::spawn(move || {
        let mut dentro_antes: Option<bool> = None;
        let mut ultima_posicao: Option<(i64, i64)> = None;
        let mut topo = Instant::now();
        loop {
            let Some(j) = janela(&app) else { break };
            let mut depressa = false;
            if j.is_visible().unwrap_or(false) {
                if let (Some(c), Some((p, t))) = (cursor(), caixa(&j)) {
                    let dentro = c.x >= p.x && c.x < p.x + t.w && c.y >= p.y && c.y < p.y + t.h;
                    if Some(dentro) != dentro_antes {
                        dentro_antes = Some(dentro);
                        crate::ponte::entregar(&j, "mini:rato", json!(dentro));
                    }
                    // Com a janela a deixar passar os cliques, os movimentos vão à
                    // página por aqui (o `forward` do Electron): é por eles que a barra abre.
                    if dentro && estado().ignorando {
                        depressa = true;
                        let esc = j.scale_factor().unwrap_or(1.0);
                        let ip = j.inner_position().map(|q| (q.x as f64, q.y as f64)).unwrap_or((p.x, p.y));
                        let (x, y) = (((c.x - ip.0) / esc).round() as i64, ((c.y - ip.1) / esc).round() as i64);
                        if ultima_posicao != Some((x, y)) {
                            ultima_posicao = Some((x, y));
                            crate::ponte::entregar(&j, "mini:rato-em", json!({ "x": x, "y": y }));
                        }
                    }
                }
                if topo.elapsed() >= Duration::from_secs(2) {
                    manter_por_cima(&j);
                    topo = Instant::now();
                }
                let largado = estado().movido_em.map(|t| t.elapsed() > Duration::from_millis(300)).unwrap_or(false) && !botao_esquerdo_em_baixo();
                if largado {
                    estado().movido_em = None;
                    fim_do_arrasto(&app);
                }
            }
            std::thread::sleep(Duration::from_millis(if depressa { 50 } else { 120 }));
        }
    });
}

fn mudar_lista(app: &AppHandle, abrir: bool) {
    let Some(j) = janela(app) else { return };
    let (expandido, com_lista, escala, ancora_antes) = { let e = estado(); (e.expandido, e.com_lista, e.escala, e.ancora_da_lista) };
    if expandido || com_lista == abrir { return; }
    let Some((p, _)) = caixa(&j) else { return };
    let mons = monitores(app);
    let areas: Vec<Area> = mons.iter().map(|m| m.0).collect();
    let mon = area_de(p, COMPACTO, &areas).map(|a| escala_do_monitor(&mons, &a)).unwrap_or(1.0);
    let compacto = fisico(COMPACTO, escala, mon);
    let grande = fisico(COM_LISTA, escala, mon);
    if abrir {
        let Some(area) = area_de(p, compacto, &areas) else { return };
        let (ancora, pos) = com_a_lista(p, compacto, grande, Some(&area));
        estado().ancora_da_lista = ancora;
        por_caixa(&j, pos, Some(grande));
    } else {
        por_caixa(&j, sem_a_lista(p, compacto, grande, ancora_antes), Some(compacto));
    }
    estado().com_lista = abrir;
}

fn redimensionar(app: &AppHandle, expandir: bool) {
    let Some(j) = janela(app) else { return };
    if estado().expandido == expandir { return; }
    if estado().com_lista { mudar_lista(app, false); }
    let Some((p, de)) = caixa(&j) else { return };
    let mons = monitores(app);
    let areas: Vec<Area> = mons.iter().map(|m| m.0).collect();
    let Some(area) = area_de(p, de, &areas) else { return };
    let escala = estado().escala;
    let para = fisico(if expandir { EXPANDIDO } else { COMPACTO }, escala, escala_do_monitor(&mons, &area));
    por_caixa(&j, mudar_de_tamanho(p, de, para, &area), Some(para));
    estado().expandido = expandir;
    // O grande não recolhe: recebe o rato em toda a parte.
    if expandir {
        estado().ignorando = false;
        let _ = j.set_ignore_cursor_events(false);
    }
    crate::ponte::entregar(&j, "mini:tamanho", json!(expandir));
    avisar_ancora(app);
}

// ------------------------------------------------------------------ os comandos

fn do_mini(j: &WebviewWindow) -> Result<(), String> {
    if j.label() == "mini" { Ok(()) } else { Err("Pedido inválido.".into()) }
}
fn da_principal(j: &WebviewWindow) -> Result<(), String> {
    if j.label() == "main" { Ok(()) } else { Err("Pedido inválido.".into()) }
}

#[tauri::command]
pub fn mini_alternar(app: AppHandle, janela: WebviewWindow) -> Result<(), String> {
    da_principal(&janela)?;
    alternar(&app);
    Ok(())
}

#[tauri::command]
pub fn mini_esta_aberto(app: AppHandle, janela: WebviewWindow) -> Result<bool, String> {
    da_principal(&janela)?;
    Ok(self::janela(&app).is_some())
}

#[tauri::command]
pub fn mini_estado(app: AppHandle, janela: WebviewWindow, resumo: Value) -> Result<(), String> {
    da_principal(&janela)?;
    let Some(r) = resumo_valido(&resumo) else { return Ok(()) };
    estado().ultimo_resumo = Some(r.clone());
    if let Some(m) = self::janela(&app) { crate::ponte::entregar(&m, "mini:estado", r); }
    Ok(())
}

/// O modo limpo (F11) é ecrã inteiro com a capa e mais nada: o mini sai da frente.
#[tauri::command]
pub fn mini_modo_limpo(app: AppHandle, janela: WebviewWindow, ligado: bool) -> Result<(), String> {
    da_principal(&janela)?;
    estado().escondido_pelo_modo_limpo = ligado;
    if let Some(m) = self::janela(&app) {
        let _ = if ligado { m.hide() } else { m.show() };
    }
    Ok(())
}

#[tauri::command]
pub fn mini_pronto(app: AppHandle, janela: WebviewWindow) -> Result<(), String> {
    do_mini(&janela)?;
    // A página voltou a carregar e começa com a lista fechada.
    if estado().com_lista { mudar_lista(&app, false); }
    avisar_janela(&app);
    let (resumo, expandido, escala) = { let e = estado(); (e.ultimo_resumo.clone(), e.expandido, e.escala) };
    if let Some(r) = resumo { crate::ponte::entregar(&janela, "mini:estado", r); }
    crate::ponte::entregar(&janela, "mini:tamanho", json!(expandido));
    crate::ponte::entregar(&janela, "mini:escala", json!(escala));
    avisar_ancora(&app);
    avisar_principal(&app);
    Ok(())
}

/// A pega do tamanho: a página só diz a FASE; onde está o rato sabe-o a casca.
#[tauri::command]
pub fn mini_pega(app: AppHandle, janela: WebviewWindow, fase: String) -> Result<(), String> {
    do_mini(&janela)?;
    if estado().com_lista || !["inicio", "mover", "fim"].contains(&fase.as_str()) { return Ok(()); }
    let Some((p, t)) = caixa(&janela) else { return Ok(()) };
    let mons = monitores(&app);
    let areas: Vec<Area> = mons.iter().map(|m| m.0).collect();
    let area = area_de(p, t, &areas);
    if fase == "inicio" {
        let lados = lados_fixos(p, t, area.as_ref());
        let fixo = Pos { x: if lados.0 { p.x + t.w } else { p.x }, y: if lados.1 { p.y + t.h } else { p.y } };
        estado().pega = Some((lados, fixo));
        return Ok(());
    }
    let Some((lados, fixo)) = estado().pega else { return Ok(()) };
    let mon = area.map(|a| escala_do_monitor(&mons, &a)).unwrap_or(1.0);
    let base = if estado().expandido { EXPANDIDO } else { COMPACTO };
    let base_fisica = Tam { w: base.w * mon, h: base.h * mon };
    if let Some(rato) = cursor() {
        let (escala, pos, tam) = arrastar_pega(fixo, rato, base_fisica, lados);
        if escala != estado().escala {
            estado().escala = escala;
            por_caixa(&janela, pos, Some(tam));
            crate::ponte::entregar(&janela, "mini:escala", json!(escala));
        }
    }
    if fase == "fim" {
        estado().pega = None;
        let mut g = ler_gravado();
        g["escala"] = json!(estado().escala);
        gravar(&g);
        avisar_ancora(&app);
    }
    Ok(())
}

#[tauri::command]
pub fn mini_lista(app: AppHandle, janela: WebviewWindow, abrir: bool) -> Result<(), String> {
    do_mini(&janela)?;
    mudar_lista(&app, abrir);
    Ok(())
}

/// Com a barra recolhida, a parte transparente deixa passar os cliques.
#[tauri::command]
pub fn mini_ignorar_rato(janela: WebviewWindow, sim: bool) -> Result<(), String> {
    do_mini(&janela)?;
    let ignorar = sim && !estado().expandido;
    estado().ignorando = ignorar;
    janela.set_ignore_cursor_events(ignorar).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mini_comando(app: AppHandle, janela: WebviewWindow, comando: Value) -> Result<(), String> {
    do_mini(&janela)?;
    let Some(c) = comando_valido(&comando) else { return Ok(()) };
    match c["tipo"].as_str().unwrap_or("") {
        "fechar" => { let _ = janela.close(); }
        "abrir-duotone" => crate::mostrar_janela(&app),
        // O botão ao lado do X é um interruptor: à vista vai para o tabuleiro, escondida volta.
        "alternar-duotone" => {
            let visivel = principal(&app).map(|m| m.is_visible().unwrap_or(false) && !m.is_minimized().unwrap_or(false)).unwrap_or(false);
            if visivel { crate::esconder_no_tabuleiro(&app) } else { crate::mostrar_janela(&app) }
            avisar_janela(&app);
        }
        "expandir" => redimensionar(&app, true),
        "encolher" => redimensionar(&app, false),
        _ => {
            if let Some(m) = principal(&app) { crate::ponte::entregar(&m, "mini:comando", c); }
        }
    }
    Ok(())
}

/// A ponte `window.duotoneMini` (o `preloadMini.cjs`), só na janela do mini.
pub fn script() -> String {
    include_str!("ponteMini.js").replace("__ORIGEM__", &format!("http://localhost:{}", crate::canal::PORTA))
}

#[cfg(test)]
mod testes {
    use super::*;

    // Um 1080p com a barra de tarefas em baixo (48 px) e um segundo monitor à direita.
    const PRINCIPAL: Area = Area { x: 0.0, y: 0.0, w: 1920.0, h: 1032.0 };
    const SEGUNDO: Area = Area { x: 1920.0, y: 0.0, w: 1280.0, h: 1024.0 };
    fn c(_: &Area) -> Tam { COMPACTO }
    fn p(x: f64, y: f64) -> Pos { Pos { x, y } }

    #[test]
    fn abrir() {
        assert_eq!(onde_abrir(&json!(null), c, &[PRINCIPAL, SEGUNDO], Some(PRINCIPAL)), p(1920.0 - 360.0 - 16.0, 1032.0 - 88.0 - 16.0), "a 1.ª vez: em baixo à direita");
        let g = lembrar(&json!(null), p(2000.0, 100.0), &SEGUNDO);
        assert_eq!(onde_abrir(&g, c, &[PRINCIPAL, SEGUNDO], Some(PRINCIPAL)), p(2000.0, 100.0), "onde ficou");
        assert_eq!(onde_abrir(&g, c, &[PRINCIPAL], Some(PRINCIPAL)), posicao_inicial(&PRINCIPAL, COMPACTO), "monitor desligado");
        let g = lembrar(&json!(null), p(1900.0, 1020.0), &PRINCIPAL);
        assert_eq!(onde_abrir(&g, c, &[PRINCIPAL], Some(PRINCIPAL)), p(1920.0 - 360.0, 1032.0 - 88.0), "fora do ecrã: para dentro");
    }

    #[test]
    fn a_barra_recolhida() {
        assert_eq!(ancora_do_mini(posicao_inicial(&PRINCIPAL, COMPACTO), COMPACTO, Some(&PRINCIPAL)), "baixo");
        assert_eq!(ancora_do_mini(p(100.0, 16.0), COMPACTO, Some(&PRINCIPAL)), "cima");
        assert_eq!(ancora_do_mini(p(0.0, 0.0), COMPACTO, None), "baixo");
    }

    #[test]
    fn a_pega() {
        assert_eq!(escala_valida(0.2), ESCALA_MINIMA);
        assert_eq!(escala_valida(9.0), ESCALA_MAXIMA);
        assert_eq!(escala_valida(f64::NAN), 1.0);
        assert_eq!(com_escala(COMPACTO, 1.5), Tam { w: 540.0, h: 132.0 });
        let pos = posicao_inicial(&PRINCIPAL, COMPACTO);
        let lados = lados_fixos(pos, COMPACTO, Some(&PRINCIPAL));
        assert_eq!(lados, (true, true));
        let fixo = p(pos.x + COMPACTO.w, pos.y + COMPACTO.h);
        let (e, b, t) = arrastar_pega(fixo, p(fixo.x - 540.0, 0.0), COMPACTO, lados);
        assert_eq!(e, 1.5);
        assert_eq!((b, t), (p(fixo.x - 540.0, fixo.y - 132.0), Tam { w: 540.0, h: 132.0 }));
        let lados = lados_fixos(p(20.0, 20.0), COMPACTO, Some(&PRINCIPAL));
        let (e, b, t) = arrastar_pega(p(20.0, 20.0), p(20.0 + 288.0, 0.0), COMPACTO, lados);
        assert_eq!(e, 0.8);
        assert_eq!((b, t), (p(20.0, 20.0), Tam { w: 288.0, h: 70.0 }));
    }

    #[test]
    fn mexer() {
        assert_eq!(encostar(p(1920.0 - 360.0 - 16.0 - 7.0, 400.0), COMPACTO, &PRINCIPAL), p(1920.0 - 360.0 - 16.0, 400.0));
        assert_eq!(encostar(p(20.0, 25.0), COMPACTO, &PRINCIPAL), p(16.0, 16.0));
        assert_eq!(encostar(p(700.0, 400.0), COMPACTO, &PRINCIPAL), p(700.0, 400.0), "longe das bordas fica");
        assert_eq!(encostar(p(-200.0, 2000.0), COMPACTO, &PRINCIPAL), p(0.0, 1032.0 - 88.0), "fora do ecrã volta");
        assert_eq!(area_de(p(1900.0, 100.0), COMPACTO, &[PRINCIPAL, SEGUNDO]), Some(SEGUNDO));
        assert_eq!(area_de(p(1500.0, 100.0), COMPACTO, &[PRINCIPAL, SEGUNDO]), Some(PRINCIPAL));
        assert_eq!(area_de(p(5000.0, 100.0), COMPACTO, &[PRINCIPAL, SEGUNDO]), Some(SEGUNDO), "fora de todos: o mais perto");
    }

    #[test]
    fn expandir() {
        let pos = posicao_inicial(&PRINCIPAL, COMPACTO);
        let novo = mudar_de_tamanho(pos, COMPACTO, EXPANDIDO, &PRINCIPAL);
        assert_eq!(novo.x + EXPANDIDO.w, pos.x + COMPACTO.w);
        assert_eq!(novo.y + EXPANDIDO.h, pos.y + COMPACTO.h);
        assert_eq!(mudar_de_tamanho(p(16.0, 16.0), COMPACTO, EXPANDIDO, &PRINCIPAL), p(16.0, 16.0));
    }

    #[test]
    fn entre_as_janelas() {
        assert_eq!(comando_valido(&json!({ "tipo": "seguinte", "extra": "x" })), Some(json!({ "tipo": "seguinte" })));
        assert_eq!(comando_valido(&json!({ "tipo": "alternar-duotone" })), Some(json!({ "tipo": "alternar-duotone" })));
        assert_eq!(comando_valido(&json!({ "tipo": "procurar", "ms": 61234.6 })), Some(json!({ "tipo": "procurar", "ms": 61235 })));
        assert_eq!(comando_valido(&json!({ "tipo": "procurar", "ms": -1 })), None);
        assert_eq!(comando_valido(&json!({ "tipo": "eval" })), None);
        assert_eq!(comando_valido(&json!("seguinte")), None);
        let r = resumo_valido(&json!({ "titulo": "Boondocks", "artista": "Juice WRLD", "capa": "https://i.ytimg.com/vi/x/mqdefault.jpg",
            "aTocar": true, "guardada": false, "posicaoMs": 1000.4, "duracaoMs": 182000, "sessao": "segredo" })).unwrap();
        let mut chaves: Vec<&String> = r.as_object().unwrap().keys().collect();
        chaves.sort();
        assert_eq!(chaves, ["aTocar", "artista", "capa", "duracaoMs", "fila", "filaSoDeVer", "guardada", "posicaoMs", "sentido", "titulo"]);
        assert_eq!(r["fila"], json!([]));
        assert_eq!(r["posicaoMs"], json!(1000));
        assert_eq!(resumo_valido(&json!({ "capa": "file:///C:/x.png" })).unwrap()["capa"], json!(null));
        assert_eq!(resumo_valido(&json!({ "capa": "javascript:alert(1)" })).unwrap()["capa"], json!(null));
        assert_eq!(resumo_valido(&json!(null)), None);
    }

    #[test]
    fn a_lista_das_proximas() {
        let pos = posicao_inicial(&PRINCIPAL, COMPACTO);
        let (ancora, r) = com_a_lista(pos, COMPACTO, COM_LISTA, Some(&PRINCIPAL));
        assert_eq!(ancora, "baixo");
        assert_eq!(r, p(pos.x, pos.y + COMPACTO.h - COM_LISTA.h), "o fundo fica onde estava");
        assert_eq!(sem_a_lista(r, COMPACTO, COM_LISTA, ancora), pos, "fechar devolve o cartão ao sítio");
        let (ancora, r) = com_a_lista(p(100.0, 16.0), COMPACTO, COM_LISTA, Some(&PRINCIPAL));
        assert_eq!((ancora, r), ("cima", p(100.0, 16.0)));
        assert_eq!(sem_a_lista(r, COMPACTO, COM_LISTA, "cima"), p(100.0, 16.0));
        let (cc, gg) = (com_escala(COMPACTO, 1.5), com_escala(COM_LISTA, 1.5));
        let pos = p(500.0, 1032.0 - cc.h - 16.0);
        let (_, r) = com_a_lista(pos, cc, gg, Some(&PRINCIPAL));
        assert_eq!(r.y + gg.h, pos.y + cc.h, "com a escala, as mesmas contas");
        assert_eq!(COM_LISTA.h, COMPACTO.h + ESPACO_DA_LISTA + ALTURA_DA_LISTA);
        assert_eq!(COM_LISTA.w, COMPACTO.w);
        assert_eq!(comando_valido(&json!({ "tipo": "tocar-da-fila", "chave": "youtube:abc", "posicao": 3, "x": 1 })), Some(json!({ "tipo": "tocar-da-fila", "chave": "youtube:abc", "posicao": 3 })));
        assert_eq!(comando_valido(&json!({ "tipo": "tocar-da-fila", "chave": "", "posicao": 0 })), None);
        assert_eq!(comando_valido(&json!({ "tipo": "tocar-da-fila", "chave": "youtube:abc", "posicao": NA_LISTA })), None);
        assert_eq!(comando_valido(&json!({ "tipo": "tocar-da-fila", "chave": "youtube:abc", "posicao": 1.5 })), None);
        assert_eq!(comando_valido(&json!({ "tipo": "tocar-da-fila", "chave": "x".repeat(301), "posicao": 0 })), None);
        let mut fila: Vec<Value> = vec![json!(null), json!({ "titulo": "sem chave" })];
        fila.extend((0..70).map(|i| json!({ "titulo": format!("T{i}"), "artista": "A", "capa": if i > 0 { "https://x/y.jpg" } else { "file:///c.jpg" }, "chave": format!("youtube:{i}"), "sessao": "s" })));
        let r = resumo_valido(&json!({ "fila": fila, "filaSoDeVer": true })).unwrap();
        assert_eq!(r["fila"].as_array().unwrap().len(), NA_LISTA - 2, "corta antes de filtrar");
        let mut chaves: Vec<&String> = r["fila"][0].as_object().unwrap().keys().collect();
        chaves.sort();
        assert_eq!(chaves, ["artista", "capa", "chave", "titulo"]);
        assert_eq!(r["fila"][0]["capa"], json!(null));
        assert_eq!(r["filaSoDeVer"], json!(true));
        assert_eq!(resumo_valido(&json!({ "fila": "x" })).unwrap()["fila"], json!([]));
    }
}
