fn main() {
    // Os comandos que a página (uma origem remota, http://localhost:<porta>) pode
    // chamar têm de ser declarados aqui e autorizados em capabilities/: sem isso o
    // Tauri recusa-os ("not allowed by ACL"). Visto na prova P9 do plano.
    const COMANDOS: &[&str] = &[
        "registo_da_pagina",
        "janela_minimizar", "janela_alternar_maximizar", "janela_fechar", "janela_maximizada",
        "fechar_para_tabuleiro_ler", "fechar_para_tabuleiro_definir",
        "arranque_ler", "saude_ler", "segundos_sem_interacao",
    ];
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMANDOS)),
    )
    .expect("tauri-build");
}
