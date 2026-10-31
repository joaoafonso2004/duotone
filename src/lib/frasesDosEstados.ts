/**
 * As frases dos estados (vazio, nada a tocar, sem músicas), as mesmas no PC e
 * no iPhone (A8 da auditoria de 31/10).
 *
 * Havia duas frases para o mesmo estado ("Nothing playing" no painel e
 * "Silent" no Now Playing do PC; a playlist vazia dizia uma coisa em cada
 * plataforma), sítios que não existem ("Go back to Search" para a Home, uma
 * "Library" que não há), títulos que eram frases com ponto final, e uma frase
 * em português na interface inglesa. Como o `FRASES_DA_PESQUISA`.
 *
 * Sem imports: `scripts/test-frases-dos-estados.ts`.
 */
export const FRASES_DOS_ESTADOS = {
  /** Nada a tocar: o painel da direita e o Now Playing do PC. */
  nadaATocar: { titulo: 'Nothing playing', corpo: 'Play a song and it shows up here.' },
  /** Uma playlist sem músicas, para quem lhe pode juntar músicas e para quem não pode. */
  playlistVazia: {
    titulo: 'This playlist is empty',
    corpo: 'Add songs from Home, Search or Liked Songs with the ••• menu.',
    semPoder: "The owner hasn't added any songs yet.",
  },
  /** Uma mistura que já não existe (refazem-se com o que se ouve). */
  misturaQueSaiu: { titulo: 'This mix is gone', corpo: "Mixes are rebuilt as you listen. Go back to Home and pick one of today's mixes." },
  /** Um artista de quem não se encontrou nenhuma música. */
  artistaSemMusicas: { titulo: 'No songs yet', corpo: "We couldn't find songs by this artist." },
  /** O perfil mudou noutro aparelho enquanto se editava (o conflito de versão). */
  perfilMudou: 'Your profile changed on another device. Close and reopen the editor.',
} as const;
