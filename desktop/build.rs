use std::{env, fs, path::Path};

/// O `dist-web` (o `expo export` da app) para dentro do .exe (F9): o servidor
/// local serve-o da memória, e uma atualização troca o .exe e a app juntos.
/// Sem `dist-web` (os testes no CI), a tabela fica vazia e serve-se de uma pasta.
fn embutir_a_web() {
    let pasta = Path::new(&env::var("CARGO_MANIFEST_DIR").unwrap()).join("dist-web");
    println!("cargo:rerun-if-changed=dist-web");
    let mut ficheiros = Vec::new();
    if pasta.join("index.html").is_file() {
        recolher(&pasta, "", &mut ficheiros);
    }
    ficheiros.sort();
    let mut codigo = String::from("pub static FICHEIROS: &[(&str, &[u8])] = &[\n");
    for (nome, caminho) in &ficheiros {
        codigo += &format!("    ({nome:?}, include_bytes!({caminho:?})),\n");
    }
    codigo += "];\n";
    fs::write(Path::new(&env::var("OUT_DIR").unwrap()).join("web_embutida.rs"), codigo).unwrap();
}

/// Os ficheiros de uma pasta, com o caminho relativo em `/` (o do pedido HTTP).
fn recolher(pasta: &Path, prefixo: &str, ficheiros: &mut Vec<(String, String)>) {
    for entrada in fs::read_dir(pasta).unwrap().flatten() {
        let nome = entrada.file_name().to_string_lossy().to_string();
        let relativo = if prefixo.is_empty() { nome } else { format!("{prefixo}/{nome}") };
        let tipo = entrada.file_type().unwrap();
        if tipo.is_dir() {
            recolher(&entrada.path(), &relativo, ficheiros);
        } else if tipo.is_file() {
            ficheiros.push((relativo, entrada.path().to_string_lossy().to_string()));
        }
    }
}

fn main() {
    embutir_a_web();
    // Os comandos que a página (uma origem remota, http://localhost:<porta>) pode
    // chamar têm de ser declarados aqui e autorizados em capabilities/: sem isso o
    // Tauri recusa-os ("not allowed by ACL"). Visto na prova P9 do plano.
    const COMANDOS: &[&str] = &[
        "registo_da_pagina",
        "janela_minimizar", "janela_alternar_maximizar", "janela_fechar", "janela_maximizada",
        "fechar_para_tabuleiro_ler", "fechar_para_tabuleiro_definir",
        "arranque_ler", "arranque_definir", "barra_estado", "barra_tirar_acao", "notificacao_mensagem", "notificacao_por_ler", "atualizacao_procurar", "spotify_ligado", "sessao_de_media_definir", "spotify_entrar", "spotify_sair", "spotify_consultar", "atualizacao_descarga", "atualizacao_instalar", "saude_ler", "segundos_sem_interacao", "diagnostico_recursos",
        "mini_alternar", "mini_esta_aberto", "mini_estado", "mini_modo_limpo",
        "mini_pronto", "mini_pega", "mini_lista", "mini_ignorar_rato", "mini_comando",
        "yt_pesquisa", "ytmusic_pesquisa", "yt_mix", "yt_refrao", "ytmusic_artista", "ytmusic_radio", "ytmusic_letra",
        "catalogo_pedir", "supabase_pedir", "spotify_embed", "apple_playlist", "deezer_link",
        "innertube_pedir", "innertube_aquecer", "googlevideo_sondar", "audio_registar", "audio_adiantar", "audio_na_cache",
    ];
    // As capabilities da identidade desta build (canal.rs): a porta muda com ela.
    println!("cargo:rerun-if-changed=capabilities");
    let capabilities = if env::var_os("CARGO_FEATURE_PRODUCAO").is_some() { "./capabilities/producao/*.json" } else { "./capabilities/preview/*.json" };
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .capabilities_path_pattern(capabilities)
            .app_manifest(tauri_build::AppManifest::new().commands(COMANDOS)),
    )
    .expect("tauri-build");
}
