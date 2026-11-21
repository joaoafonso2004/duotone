fn main() {
    // Os comandos que a página (uma origem remota, http://localhost:<porta>) pode
    // chamar têm de ser declarados aqui e autorizados em capabilities/: sem isso o
    // Tauri recusa-os ("not allowed by ACL"). Visto na prova P9 do plano.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["registo_da_pagina"])),
    )
    .expect("tauri-build");
}
