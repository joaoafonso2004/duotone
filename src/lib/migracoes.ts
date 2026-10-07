/**
 * Que ficheiros de `supabase/` já correram na base de dados (29/9).
 *
 * As migrações correm-se à mão no SQL Editor, e nada guardava quais já
 * correram: uma funcionalidade cujo SQL faltava morria em silêncio. Cada
 * ficheiro tem aqui uma MARCA -- um objeto que só existe depois de ele correr --
 * e a função `marcas_em_falta` (supabase/estado-das-migracoes.sql) diz quais
 * não encontrou. As formas das marcas estão descritas nesse ficheiro.
 *
 * Quem lê: a secção "server updates" do relatório de reprodução e o
 * `scripts/verificar-migracoes.ts`. Ficheiro NOVO em `supabase/`: entra aqui
 * (ou em `FORA_DA_LISTA`, com a razão) -- o `test-migracoes.ts` falha sem isso,
 * e confere que cada marca está mesmo no ficheiro dela.
 *
 * Sem imports de runtime: testado em Node puro.
 */

export type Migracao = {
  ficheiro: string;
  /** O objeto que só existe depois de o ficheiro correr. */
  marca: string;
  /** O que deixa de funcionar sem ele, em inglês (vai para o relatório). */
  efeito: string;
};

export const MIGRACOES: readonly Migracao[] = [
  { ficheiro: 'social-conversation-summaries.sql', marca: 'fn:conversation_summaries', efeito: 'Compact latest messages in Social Chats' },
  { ficheiro: 'sincronizacao-economica.sql', marca: 'fn:get_play_count_changes', efeito: 'Incremental playlist and listening-history sync' },
  { ficheiro: 'schema.sql', marca: 'tab:library_tracks', efeito: 'Base tables' },
  { ficheiro: 'funcoes-existentes.sql', marca: 'fn:get_flow_mix', efeito: 'Flow, Heavy Rotation and profile stats' },
  { ficheiro: 'security-hardening.sql', marca: 'rev:tracks:INSERT', efeito: 'Security hardening' },
  { ficheiro: 'user-prefs.sql', marca: 'tab:user_prefs', efeito: 'Settings sync between devices' },
  { ficheiro: 'cross-device-profile.sql', marca: 'tab:user_play_counts', efeito: 'Play counts across devices' },
  { ficheiro: 'listening-stats.sql', marca: 'pol:plays:plays: ler as próprias', efeito: 'Listening stats' },
  { ficheiro: 'contar-so-o-ouvido.sql', marca: 'tab:faixas_comecadas', efeito: 'Only songs actually heard count as plays' },
  { ficheiro: 'top-artists.sql', marca: "txt:get_top_artists~180 days", efeito: 'Top artists weigh recent listening' },
  { ficheiro: 'track-catalog.sql', marca: 'tab:track_catalog', efeito: 'Track catalog' },
  { ficheiro: 'metadados-genero-e-ano.sql', marca: 'col:track_catalog.genero', efeito: 'Genre and year' },
  { ficheiro: 'sem-edicao-comercial.sql', marca: 'col:track_catalog.sem_edicao', efeito: 'Explicit versions in imports' },
  { ficheiro: 'track-adjustments.sql', marca: 'tab:user_track_adjustments', efeito: 'Speed and EQ per song' },
  { ficheiro: 'eq-padrao-sincronizado.sql', marca: 'con:user_track_adjustments.user_track_adjustments_source_check~padrao', efeito: 'Default speed and EQ sync' },
  { ficheiro: 'escritas-atomicas.sql', marca: 'fn:guardar_ajuste_da_faixa', efeito: 'Group and adjustment writes in one trip' },
  { ficheiro: 'eq-presets.sql', marca: 'tab:user_eq_presets', efeito: 'Equalizer presets sync' },
  { ficheiro: 'recommendation-feedback.sql', marca: 'tab:recommendation_feedback', efeito: 'Recommendation feedback' },
  { ficheiro: 'gosto-de-mais.sql', marca: 'con:recommendation_feedback.recommendation_feedback_kind_check~artist_more', efeito: 'More from this artist' },
  { ficheiro: 'search-history.sql', marca: 'tab:search_history', efeito: 'Search history' },
  { ficheiro: 'events.sql', marca: 'tab:app_events', efeito: 'App health and analytics' },
  { ficheiro: 'uma-musica-por-dia.sql', marca: 'tab:daily_picks', efeito: 'Song of the day' },
  { ficheiro: 'a-semana.sql', marca: 'fn:a_semana', efeito: 'Your week' },
  { ficheiro: 'voces-os-dois.sql', marca: 'fn:voces_os_dois', efeito: 'You two (mix with a friend)' },
  { ficheiro: 'higiene-da-biblioteca.sql', marca: 'fn:juntar_na_biblioteca', efeito: 'Library check' },
  { ficheiro: 'remover-no-library-check.sql', marca: 'fn:remover_da_biblioteca', efeito: 'Remove in Library check' },

  { ficheiro: 'social-setup.sql', marca: 'tab:friendships', efeito: 'Friends and sharing' },
  { ficheiro: 'social-profiles.sql', marca: 'tab:profile_appearance', efeito: 'Social profiles' },
  { ficheiro: 'friend-avatars.sql', marca: 'pol:profiles:profiles: leitura autenticada', efeito: "Friends' avatars" },
  { ficheiro: 'profile-media.sql', marca: 'fn:profile_media_readable', efeito: 'Profile photos' },
  { ficheiro: 'profile-highlights.sql', marca: 'col:profile_appearance.pinned_playlist_ids', efeito: 'Profile highlights' },
  { ficheiro: 'profile-playlists.sql', marca: 'col:playlists.visible_on_profile', efeito: 'Playlists on the profile' },
  { ficheiro: 'shared-playlists-read.sql', marca: 'pol:playlists:playlists: ler partilhadas comigo', efeito: 'Open playlists sent to you' },
  { ficheiro: 'guardar-playlist-partilhada.sql', marca: 'txt:set_profile_playlist_copy~shared_items', efeito: 'Save a playlist sent to you' },
  { ficheiro: 'username-login.sql', marca: 'fn:username_available', efeito: 'Sign in with a username' },
  { ficheiro: 'username-login-seguro.sql', marca: 'tab:login_attempts', efeito: 'Username sign-in protection' },
  { ficheiro: 'username-fixo-e-ordem-das-conversas.sql', marca: 'fn:conversation_activity', efeito: 'Fixed username and conversation order' },
  { ficheiro: 'social-presence.sql', marca: 'tab:social_presence', efeito: 'Online now' },
  { ficheiro: 'presenca-online-so-em-primeiro-plano.sql', marca: 'col:social_presence_sessions.active_until', efeito: 'Online only while the app is open' },
  { ficheiro: 'presenca-com-posicao.sql', marca: 'txt:publish_social_presence~positionMs', efeito: "Friends' progress bars" },
  { ficheiro: 'presenca-com-fila.sql', marca: 'txt:publish_social_presence~aSeguir', efeito: "Listen along shows the friend's Up next" },
  { ficheiro: 'presenca-mais-longa.sql', marca: 'txt:publish_social_presence~300 seconds', efeito: 'Fewer presence updates' },
  { ficheiro: 'inbox-archive.sql', marca: 'col:shared_items.archived_at', efeito: 'Archive inbox items' },
  { ficheiro: 'message-notifications.sql', marca: 'pub:shared_items', efeito: 'Messages arrive live' },
  { ficheiro: 'chat-reads.sql', marca: 'tab:chat_reads', efeito: 'Read receipts' },
  { ficheiro: 'group-chats.sql', marca: 'tab:chat_groups', efeito: 'Group chats' },
  { ficheiro: 'ordem-das-conversas-com-grupos.sql', marca: 'txt:conversation_activity~chat_group_members', efeito: 'Groups ordered by last message' },
  { ficheiro: 'reactions.sql', marca: 'tab:item_reactions', efeito: 'Message reactions' },
  { ficheiro: 'responder-mensagens.sql', marca: 'col:shared_items.reply_to_id', efeito: 'Reply to a message' },

  { ficheiro: 'player-sessions.sql', marca: 'tab:player_sessions', efeito: 'Continue on another device' },
  { ficheiro: 'handoff-ao-vivo.sql', marca: 'col:player_sessions.idade_da_amostra_ms', efeito: 'Handoff position measured by the server' },
  { ficheiro: 'handoff-leve.sql', marca: 'tab:player_sessions_avisos', efeito: 'Lighter handoff (less data)' },
  { ficheiro: 'duotone-connect.sql', marca: 'tab:pedidos_ao_aparelho', efeito: 'Duotone Connect' },

  { ficheiro: 'ouvir-juntos.sql', marca: 'tab:listening_sessions', efeito: 'Jam' },
  { ficheiro: 'jam-solido.sql', marca: 'fn:avancar_fila_da_sessao', efeito: 'Jam queue advances reliably' },
  { ficheiro: 'tocar-a-seguir-no-jam.sql', marca: 'fn:juntar_a_fila(uuid,jsonb,boolean)', efeito: 'Play next in a Jam' },
  { ficheiro: 'passa-o-aux.sql', marca: 'col:listening_sessions.aux_de', efeito: 'Pass the aux' },
  { ficheiro: 'retrato-da-sessao.sql', marca: 'fn:retrato_da_sessao', efeito: 'Jam queue fills itself' },
  { ficheiro: 'entrar-na-sessao-do-amigo.sql', marca: 'fn:sessoes_dos_amigos', efeito: "Join a friend's Jam" },
  { ficheiro: 'jam-passa-o-anfitriao.sql', marca: 'fn:passar_ou_fechar_sessao', efeito: 'Jam continues when the host leaves' },
  { ficheiro: 'fechar-jams-abandonadas.sql', marca: 'fn:fechar_jams_abandonadas', efeito: 'Abandoned Jams close on their own' },
  { ficheiro: 'radio-no-jam.sql', marca: 'col:listening_sessions.radio', efeito: 'Radio in a Jam' },
  { ficheiro: 'painel-de-saude.sql', marca: 'fn:painel_de_saude', efeito: 'App health panel' },

  { ficheiro: 'estado-das-migracoes.sql', marca: 'fn:marcas_em_falta', efeito: 'This check' },
];

/** Ficheiros de `supabase/` que não são migrações, e porquê. */
export const FORA_DA_LISTA: Readonly<Record<string, string>> = {
  'diagnostico-social.sql': 'consultas de diagnóstico, não mudam nada',
  'exportar-funcoes.sql': 'consulta para exportar funções para o funcoes-existentes.sql',
  'limpar-aparelhos-fantasma.sql': 'limpeza de uma vez; não deixa marca',
};

export type EstadoDasMigracoes =
  | { tipo: 'ok'; emFalta: Migracao[] }
  /** A própria verificação não está na base: falta correr o estado-das-migracoes.sql. */
  | { tipo: 'sem-verificador' }
  | { tipo: 'erro'; mensagem: string };

/** As migrações cujas marcas a base diz que faltam, pela ordem da lista. */
export function migracoesEmFalta(marcasEmFalta: readonly string[]): Migracao[] {
  const falta = new Set(marcasEmFalta);
  return MIGRACOES.filter((m) => falta.has(m.marca));
}

/** A secção inteira, pronta a juntar ao relatório de reprodução. */
export function textoDasMigracoes(estado: EstadoDasMigracoes): string {
  return ['== server updates (SQL files in supabase/) ==', ...linhasDoEstado(estado)].join('\n');
}

/** As linhas da secção "server updates" do relatório. */
export function linhasDoEstado(estado: EstadoDasMigracoes): string[] {
  if (estado.tipo === 'sem-verificador') {
    return ['Unknown: run supabase/estado-das-migracoes.sql once in the SQL Editor to enable this check.'];
  }
  if (estado.tipo === 'erro') return [`Could not check: ${estado.mensagem}`];
  if (!estado.emFalta.length) return [`All ${MIGRACOES.length} SQL files are applied.`];
  return [
    `${estado.emFalta.length} of ${MIGRACOES.length} SQL files are missing. Run them in the SQL Editor:`,
    ...estado.emFalta.map((m) => `- supabase/${m.ficheiro} (${m.efeito})`),
  ];
}
