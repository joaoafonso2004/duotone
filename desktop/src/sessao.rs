//! A Duotone nos controlos de média do Windows (F5, a P4 do plano): o cartão do
//! Win+A, o ecrã bloqueado, as teclas de média e os botões dos auscultadores. O
//! contrato é o do `electron/sessaoDeMedia.cjs`: a página manda a sessão
//! (`definirSessaoDeMedia`, a cada música, pausa e salto) e as ações do Windows
//! voltam a ela pelos `navigator.mediaSession.setActionHandler` que ela já liga
//! (a ponte guarda-os, `ponte.js`).
//!
//! - **A sessão é a da janela da app** (`SystemMediaTransportControls` pelo HWND),
//!   com o AUMID do processo (`canal::definir_aumid`): o Windows mostra-a com o
//!   nome da app, e não "msedgewebview2.exe" (o que se viu na P4 com a sessão do
//!   próprio WebView2).
//! - **O WebView2 não tem sessão própria:** `--disable-features=HardwareMediaKeyHandling`
//!   (`webview::ARGUMENTOS`). Sem isto havia duas sessões, e a do WebView2 não
//!   recebia o "tocar" depois da pausa.
//! - **Cria-se à 1.ª sessão que a página manda**, na thread da janela (o comando é
//!   síncrono: corre lá), e nunca no arranque: na P4, criada no `setup`, a página
//!   pendurou.
//! - O estado acompanha a página: depois de uma pausa fica "Paused", e é isso que
//!   deixa o Windows mandar o "tocar" (a ponta solta (1) da P4).

use std::sync::{Mutex, OnceLock};

use serde_json::{json, Value};
use tauri::WebviewWindow;
use windows::core::HSTRING;
use windows::Foundation::{TimeSpan, TypedEventHandler, Uri};
use windows::Media::{
    MediaPlaybackStatus, MediaPlaybackType, PlaybackPositionChangeRequestedEventArgs, SystemMediaTransportControls,
    SystemMediaTransportControlsButton, SystemMediaTransportControlsButtonPressedEventArgs, SystemMediaTransportControlsTimelineProperties,
};
use windows::Storage::Streams::RandomAccessStreamReference;

/// O pedido da página, validado (o `validarSessao` do Electron).
#[derive(Debug, Clone, PartialEq)]
pub struct Sessao {
    pub titulo: String,
    pub artista: String,
    pub album: String,
    pub capa: String,
    pub estado: &'static str,
    pub duracao: Option<f64>,
    pub posicao: Option<f64>,
}

fn texto(v: &Value, max: usize) -> String {
    v.as_str().map(|s| s.trim().chars().take(max).collect()).unwrap_or_default()
}

fn numero(v: &Value) -> Option<f64> {
    v.as_f64().filter(|n| n.is_finite() && *n >= 0.0)
}

/// As mesmas regras do Electron: um objeto; o estado de uma lista fechada; sem
/// título só com "none"; a capa só https; a posição dentro da duração.
pub fn validar(pedido: &Value) -> Option<Sessao> {
    if !pedido.is_object() {
        return None;
    }
    let estado = match pedido["estado"].as_str() {
        Some("playing") => "playing",
        Some("paused") => "paused",
        _ => "none",
    };
    let titulo = texto(&pedido["titulo"], 300);
    if titulo.is_empty() && estado != "none" {
        return None;
    }
    let capa = texto(&pedido["capa"], 2048);
    let duracao = numero(&pedido["duracao"]).filter(|d| *d > 0.0);
    let posicao = match (duracao, numero(&pedido["posicao"])) {
        (Some(d), Some(p)) => Some(p.min(d)),
        _ => None,
    };
    Some(Sessao {
        titulo,
        artista: texto(&pedido["artista"], 300),
        album: texto(&pedido["album"], 300),
        capa: if capa.to_ascii_lowercase().starts_with("https://") { capa } else { String::new() },
        estado,
        duracao,
        posicao,
    })
}

/// A ação da página para um botão do Windows.
pub fn acao_do_botao(botao: SystemMediaTransportControlsButton) -> Option<&'static str> {
    match botao {
        SystemMediaTransportControlsButton::Play => Some("play"),
        SystemMediaTransportControlsButton::Pause => Some("pause"),
        SystemMediaTransportControlsButton::Next => Some("nexttrack"),
        SystemMediaTransportControlsButton::Previous => Some("previoustrack"),
        SystemMediaTransportControlsButton::Stop => Some("stop"),
        _ => None,
    }
}

fn tempo(segundos: f64) -> TimeSpan {
    TimeSpan { Duration: (segundos * 10_000_000.0) as i64 }
}

static CONTROLOS: OnceLock<SystemMediaTransportControls> = OnceLock::new();
/// A capa que está lá (pô-la outra vez faz o Windows ir buscá-la de novo).
static CAPA: Mutex<String> = Mutex::new(String::new());

/// A entrega de uma ação à página (ou, no ensaio, ao registo).
type Entrega = Box<dyn Fn(&'static str, Option<f64>) + Send + Sync>;
static ENTREGA: OnceLock<Entrega> = OnceLock::new();

/// Os controlos da janela, criados na 1.ª vez (na thread da janela).
fn controlos(janela: &WebviewWindow) -> Result<&'static SystemMediaTransportControls, String> {
    if let Some(c) = CONTROLOS.get() {
        return Ok(c);
    }
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::WinRT::ISystemMediaTransportControlsInterop;
    let h = janela.hwnd().map_err(|e| e.to_string())?;
    let c: SystemMediaTransportControls = unsafe {
        let interop = windows::core::factory::<SystemMediaTransportControls, ISystemMediaTransportControlsInterop>().map_err(|e| e.to_string())?;
        interop.GetForWindow(HWND(h.0 as *mut _)).map_err(|e| e.to_string())?
    };
    let ligar = || -> windows::core::Result<()> {
        c.SetIsEnabled(true)?;
        c.SetIsPlayEnabled(true)?;
        c.SetIsPauseEnabled(true)?;
        c.SetIsNextEnabled(true)?;
        c.SetIsPreviousEnabled(true)?;
        c.SetIsStopEnabled(true)?;
        c.DisplayUpdater()?.SetType(MediaPlaybackType::Music)?;
        c.ButtonPressed(&TypedEventHandler::<SystemMediaTransportControls, SystemMediaTransportControlsButtonPressedEventArgs>::new(|_, args| {
            if let (Some(args), Some(entregar)) = (args.as_ref(), ENTREGA.get()) {
                if let Some(acao) = acao_do_botao(args.Button()?) {
                    entregar(acao, None);
                }
            }
            Ok(())
        }))?;
        c.PlaybackPositionChangeRequested(&TypedEventHandler::<SystemMediaTransportControls, PlaybackPositionChangeRequestedEventArgs>::new(|_, args| {
            if let (Some(args), Some(entregar)) = (args.as_ref(), ENTREGA.get()) {
                let posicao = args.RequestedPlaybackPosition()?.Duration as f64 / 10_000_000.0;
                entregar("seekto", Some(posicao.max(0.0)));
            }
            Ok(())
        }))?;
        Ok(())
    };
    ligar().map_err(|e| e.to_string())?;
    let _ = CONTROLOS.set(c);
    crate::registo::linha("sessão de média: ligada à janela");
    Ok(CONTROLOS.get().expect("acabou de se pôr"))
}

/// Põe a sessão no Windows: os metadados, a capa, o estado e a linha do tempo.
fn aplicar(c: &SystemMediaTransportControls, s: &Sessao) -> windows::core::Result<()> {
    let ecra = c.DisplayUpdater()?;
    if s.estado == "none" {
        ecra.ClearAll()?;
        ecra.SetType(MediaPlaybackType::Music)?;
        ecra.Update()?;
        c.SetPlaybackStatus(MediaPlaybackStatus::Closed)?;
        CAPA.lock().unwrap_or_else(|e| e.into_inner()).clear();
        return Ok(());
    }
    let musica = ecra.MusicProperties()?;
    musica.SetTitle(&HSTRING::from(&s.titulo))?;
    musica.SetArtist(&HSTRING::from(&s.artista))?;
    musica.SetAlbumTitle(&HSTRING::from(&s.album))?;
    {
        let mut capa = CAPA.lock().unwrap_or_else(|e| e.into_inner());
        if *capa != s.capa {
            if s.capa.is_empty() {
                ecra.SetThumbnail(None)?;
            } else if let Ok(uri) = Uri::CreateUri(&HSTRING::from(&s.capa)) {
                ecra.SetThumbnail(&RandomAccessStreamReference::CreateFromUri(&uri)?)?;
            }
            *capa = s.capa.clone();
        }
    }
    ecra.Update()?;
    c.SetPlaybackStatus(if s.estado == "playing" { MediaPlaybackStatus::Playing } else { MediaPlaybackStatus::Paused })?;
    let linha = SystemMediaTransportControlsTimelineProperties::new()?;
    let fim = s.duracao.unwrap_or(0.0);
    linha.SetStartTime(tempo(0.0))?;
    linha.SetMinSeekTime(tempo(0.0))?;
    linha.SetEndTime(tempo(fim))?;
    linha.SetMaxSeekTime(tempo(fim))?;
    linha.SetPosition(tempo(s.posicao.unwrap_or(0.0)))?;
    c.UpdateTimelineProperties(&linha)?;
    Ok(())
}

/// `definirSessaoDeMedia`: a sessão da música que toca. Síncrono de propósito: o
/// Tauri corre-o na thread da janela, que é onde os controlos se criam.
#[tauri::command]
pub fn sessao_de_media_definir(janela: WebviewWindow, sessao: Value) -> Result<bool, String> {
    if janela.label() != "main" {
        return Err("Pedido inválido.".into());
    }
    let Some(s) = validar(&sessao) else { return Ok(false) };
    // No ensaio, a sessão é a do ensaio: a da página não a pisa (nem recebe comandos).
    #[cfg(debug_assertions)]
    if std::env::var_os("DUOTONE_ENSAIO_SESSAO").is_some() {
        return Ok(true);
    }
    if s.estado == "none" && CONTROLOS.get().is_none() {
        return Ok(true); // nada a tocar e ainda nada no Windows: não se cria por isto
    }
    let _ = ENTREGA.set(Box::new({
        let janela = janela.clone();
        move |acao, segundos| crate::ponte::entregar(&janela, "media:acao", json!({ "acao": acao, "segundos": segundos }))
    }));
    let c = controlos(&janela)?;
    aplicar(c, &s).map_err(|e| e.to_string())?;
    Ok(true)
}

/// O ensaio sem a página (só em desenvolvimento, `DUOTONE_ENSAIO_SESSAO`): uma sessão
/// "Duotone QA" a tocar, e cada comando do Windows no registo, com o estado a
/// acompanhar (a pausa deixa-a "Paused", o tocar "Playing"), como a página faria.
/// O `ferramentas/preview-tauri/sessoes.ps1` manda os comandos só a esta sessão.
#[cfg(debug_assertions)]
pub fn ensaio(janela: &WebviewWindow) {
    if std::env::var_os("DUOTONE_ENSAIO_SESSAO").is_none() {
        return;
    }
    let base = Sessao { titulo: "Duotone QA".into(), artista: "Ensaio da sessão".into(), album: "Duotone".into(), capa: String::new(), estado: "playing", duracao: Some(200.0), posicao: Some(10.0) };
    let _ = ENTREGA.set(Box::new({
        let base = base.clone();
        let janela = janela.clone();
        move |acao, segundos| {
            crate::registo::linha(&format!("ensaio sessão: o Windows mandou {acao}{}", segundos.map(|s| format!(" ({s:.0} s)")).unwrap_or_default()));
            let mut s = base.clone();
            s.estado = if acao == "pause" || acao == "stop" { "paused" } else { "playing" };
            if let Some(p) = segundos {
                s.posicao = Some(p);
            }
            let _ = janela.run_on_main_thread(move || {
                if let Some(c) = CONTROLOS.get() {
                    let _ = aplicar(c, &s);
                }
            });
        }
    }));
    let j = janela.clone();
    let _ = janela.run_on_main_thread(move || match controlos(&j).and_then(|c| aplicar(c, &base).map_err(|e| e.to_string())) {
        Ok(()) => crate::registo::linha("ensaio sessão: \"Duotone QA\" a tocar"),
        Err(e) => crate::registo::linha(&format!("ensaio sessão: falhou ({e})")),
    });
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn as_regras_do_electron() {
        let boa = validar(&json!({ "titulo": "  Song  ", "artista": "A", "album": "B", "capa": "https://x/c.jpg", "estado": "playing", "duracao": 200, "posicao": 250 })).unwrap();
        assert_eq!(boa.titulo, "Song");
        assert_eq!(boa.estado, "playing");
        assert_eq!(boa.posicao, Some(200.0), "a posição fica dentro da duração");
        assert_eq!(validar(&json!({ "titulo": "S", "capa": "http://x/c.jpg", "estado": "paused" })).unwrap().capa, "", "só https na capa");
        assert_eq!(validar(&json!({ "titulo": "", "estado": "playing" })), None, "sem título só com none");
        assert_eq!(validar(&json!({ "estado": "qualquer" })).unwrap().estado, "none");
        assert_eq!(validar(&json!([1])), None);
        let s = validar(&json!({ "titulo": "S", "estado": "playing", "duracao": 0, "posicao": 5 })).unwrap();
        assert_eq!((s.duracao, s.posicao), (None, None), "sem duração não há posição");
        assert_eq!(validar(&json!({ "titulo": "x".repeat(400), "estado": "paused" })).unwrap().titulo.chars().count(), 300);
    }

    #[test]
    fn os_botoes_do_windows() {
        assert_eq!(acao_do_botao(SystemMediaTransportControlsButton::Play), Some("play"));
        assert_eq!(acao_do_botao(SystemMediaTransportControlsButton::Pause), Some("pause"));
        assert_eq!(acao_do_botao(SystemMediaTransportControlsButton::Next), Some("nexttrack"));
        assert_eq!(acao_do_botao(SystemMediaTransportControlsButton::Previous), Some("previoustrack"));
        assert_eq!(acao_do_botao(SystemMediaTransportControlsButton::Stop), Some("stop"));
        assert_eq!(acao_do_botao(SystemMediaTransportControlsButton::FastForward), None);
        assert_eq!(tempo(1.5).Duration, 15_000_000);
    }
}
