//! A identidade desta build: a Preview (por omissão) ou a Duotone de produção
//! (`--features producao`, só no CI de uma tag `win-v*` em Tauri).
//!
//! - **A Preview** corre AO LADO da Duotone instalada (Electron, `com.joao.duotone.desktop`,
//!   porta 18081) sem lhe tocar: outro identificador (outra pasta de dados e outro
//!   trinco de instância), outra porta, outro AUMID e outro canal de atualizações.
//! - **A de produção** É a Duotone: o mesmo identificador, a mesma porta (a origem do
//!   `localStorage` que a passagem repõe, `migracao.rs`) e o AUMID do Electron, e o
//!   canal de sempre (`windows` / `win-v` / `Duotone-Setup.exe`). NUNCA se corre no PC
//!   do João: abria na porta da Duotone dele e fazia a passagem a sério.
//!
//! Têm de dizer o mesmo que aqui: o `identifier` do tauri.conf.json (e do
//! tauri.producao.conf.json), e a porta de capabilities/preview|producao (o build.rs
//! escolhe a pasta pela feature). O `scripts/test-ponte-tauri.mjs` confere-o.

use windows::core::{w, HSTRING};
use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;
use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};

#[cfg(not(feature = "producao"))]
mod identidade {
    pub const IDENTIFICADOR: &str = "com.joao.duotone.desktop.preview";
    pub const PORTA: u16 = 18082;
    /// A Preview não faz o que só a app instalada faz (ligar o arranque com o Windows
    /// de origem, a passagem do Electron).
    pub const E_A_PREVIEW: bool = true;
    /// O canal das atualizações (F9, `atualizacao.rs`): a entrada de `apps.duotone` no
    /// versions.json, o prefixo da tag e o instalador do release. A Preview tem o seu
    /// e NUNCA corre o instalador da Duotone.
    pub const ATUALIZACAO_ENTRADA: &str = "windowsPreview";
    pub const ATUALIZACAO_TAG: &str = "win-preview-v";
    pub const ATUALIZACAO_INSTALADOR: &str = "Duotone-Preview-Setup.exe";
}

#[cfg(feature = "producao")]
mod identidade {
    pub const IDENTIFICADOR: &str = "com.joao.duotone.desktop";
    pub const PORTA: u16 = 18081;
    pub const E_A_PREVIEW: bool = false;
    pub const ATUALIZACAO_ENTRADA: &str = "windows";
    pub const ATUALIZACAO_TAG: &str = "win-v";
    pub const ATUALIZACAO_INSTALADOR: &str = "Duotone-Setup.exe";
}

pub use identidade::*;

/// O AUMID é o identificador (o do atalho do instalador, `SetLnkAppUserModelId`).
pub fn definir_aumid() {
    unsafe {
        let _ = SetCurrentProcessExplicitAppUserModelID(&HSTRING::from(IDENTIFICADOR));
    }
}

pub fn caixa_de_erro(texto: &str) {
    unsafe {
        MessageBoxW(None, &HSTRING::from(texto), w!("Duotone"), MB_OK | MB_ICONERROR);
    }
}
