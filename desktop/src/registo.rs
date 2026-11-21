//! O registo da casca: `%LOCALAPPDATA%\<identificador>\logs\duotone.log`.
//! Uma linha por acontecimento, com a hora. Um pânico fica lá escrito (com o
//! sítio) antes de a app sair, como o `uncaughtException` do Electron.

use std::{fs, io::Write, path::PathBuf, time::SystemTime};

fn ficheiro() -> Option<PathBuf> {
    let base = std::env::var_os("LOCALAPPDATA")?;
    let pasta = PathBuf::from(base).join(crate::canal::IDENTIFICADOR).join("logs");
    fs::create_dir_all(&pasta).ok()?;
    Some(pasta.join("duotone.log"))
}

pub fn linha(texto: &str) {
    let Some(f) = ficheiro() else { return };
    let segundos = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(f) {
        let _ = writeln!(f, "{segundos} {texto}");
    }
}

pub fn instalar_panico() {
    let anterior = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        linha(&format!("PÂNICO: {info}"));
        anterior(info);
    }));
}
