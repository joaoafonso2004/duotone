//! O registo do Windows (HKCU), para o arranque, o tema da barra e o nome das
//! notificações. A subchave vai por parâmetro: os testes escrevem numa chave
//! própria e nunca no `Run` nem nas `Classes` a sério.

use windows::core::HSTRING;
use windows::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS};
use windows::Win32::System::Registry::{
    RegDeleteKeyValueW, RegGetValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_ROUTINE_FLAGS, REG_SZ, RRF_RT_REG_DWORD, RRF_RT_REG_SZ,
};

pub use windows::Win32::System::Registry::{REG_BINARY, RRF_RT_REG_BINARY};

/// Os bytes de um valor do tipo pedido, ou nada.
pub fn ler_valor(subchave: &str, nome: &str, tipo: REG_ROUTINE_FLAGS) -> Option<Vec<u8>> {
    let (sub, nome) = (HSTRING::from(subchave), HSTRING::from(nome));
    let mut tamanho = 0u32;
    unsafe {
        if RegGetValueW(HKEY_CURRENT_USER, &sub, &nome, tipo, None, None, Some(&mut tamanho)) != ERROR_SUCCESS || tamanho == 0 {
            return None;
        }
        let mut dados = vec![0u8; tamanho as usize];
        if RegGetValueW(HKEY_CURRENT_USER, &sub, &nome, tipo, None, Some(dados.as_mut_ptr().cast()), Some(&mut tamanho)) != ERROR_SUCCESS {
            return None;
        }
        dados.truncate(tamanho as usize);
        Some(dados)
    }
}

pub fn ler_texto(subchave: &str, nome: &str) -> Option<String> {
    let dados = ler_valor(subchave, nome, RRF_RT_REG_SZ)?;
    let largos: Vec<u16> = dados.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).take_while(|&c| c != 0).collect();
    Some(String::from_utf16_lossy(&largos))
}

pub fn ler_dword(subchave: &str, nome: &str) -> Option<u32> {
    let dados = ler_valor(subchave, nome, RRF_RT_REG_DWORD)?;
    Some(u32::from_le_bytes(dados.get(..4)?.try_into().ok()?))
}

/// Escreve um valor (cria a subchave se faltar).
pub fn escrever(subchave: &str, nome: &str, tipo: u32, dados: &[u8]) -> Result<(), String> {
    let r = unsafe { RegSetKeyValueW(HKEY_CURRENT_USER, &HSTRING::from(subchave), &HSTRING::from(nome), tipo, Some(dados.as_ptr().cast()), dados.len() as u32) };
    if r == ERROR_SUCCESS { Ok(()) } else { Err(format!("registo: erro {}", r.0)) }
}

pub fn escrever_texto(subchave: &str, nome: &str, texto: &str) -> Result<(), String> {
    let dados: Vec<u8> = texto.encode_utf16().chain(std::iter::once(0)).flat_map(u16::to_le_bytes).collect();
    escrever(subchave, nome, REG_SZ.0, &dados)
}

/// Apaga um valor; o que já não existe não é erro.
pub fn apagar(subchave: &str, nome: &str) -> Result<(), String> {
    let r = unsafe { RegDeleteKeyValueW(HKEY_CURRENT_USER, &HSTRING::from(subchave), &HSTRING::from(nome)) };
    if r == ERROR_SUCCESS || r == ERROR_FILE_NOT_FOUND { Ok(()) } else { Err(format!("registo: erro {}", r.0)) }
}
