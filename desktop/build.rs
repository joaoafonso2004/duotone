fn main() {
    // Os comandos que a página (uma origem remota, http://localhost:<porta>) pode
    // chamar têm de ser declarados aqui e autorizados em capabilities/: sem isso o
    // Tauri recusa-os ("not allowed by ACL"). Visto na prova P9 do plano.
    const COMANDOS: &[&str] = &[
        "registo_da_pagina",
        "janela_minimizar", "janela_alternar_maximizar", "janela_fechar", "janela_maximizada",
        "fechar_para_tabuleiro_ler", "fechar_para_tabuleiro_definir",
        "arranque_ler", "saude_ler", "segundos_sem_interacao",
        "yt_pesquisa", "ytmusic_pesquisa", "yt_mix", "yt_refrao", "ytmusic_artista", "ytmusic_radio", "ytmusic_letra",
        "catalogo_pedir", "supabase_pedir", "spotify_embed", "apple_playlist", "deezer_link",
        "innertube_pedir", "googlevideo_sondar", "audio_registar", "audio_na_cache",
    ];
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMANDOS)),
    )
    .expect("tauri-build");
}
