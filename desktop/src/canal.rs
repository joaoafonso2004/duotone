//! A identidade desta build. Enquanto for a Preview corre AO LADO da Duotone
//! instalada (Electron, `com.joao.duotone.desktop`, porta 18081) sem lhe tocar:
//! outro identificador (e por isso outra pasta de dados e outro trinco de
//! instância), outra porta e outro AUMID. O `identifier` do tauri.conf.json e a
//! porta de capabilities/default.json têm de dizer o mesmo que aqui.
//! A identidade de produção (`com.joao.duotone.desktop`, 18081) entra na F9.

use windows::core::{w, HSTRING};
use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;
use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};

pub const IDENTIFICADOR: &str = "com.joao.duotone.desktop.preview";
pub const PORTA: u16 = 18082;
/// A Preview não faz o que só a app instalada faz (ligar o arranque com o Windows
/// de origem, por exemplo). Muda com o IDENTIFICADOR na F9.
pub const E_A_PREVIEW: bool = true;

pub fn definir_aumid() {
    unsafe {
        let _ = SetCurrentProcessExplicitAppUserModelID(w!("com.joao.duotone.desktop.preview"));
    }
}

pub fn caixa_de_erro(texto: &str) {
    unsafe {
        MessageBoxW(None, &HSTRING::from(texto), w!("Duotone"), MB_OK | MB_ICONERROR);
    }
}
