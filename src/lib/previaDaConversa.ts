/**
 * A linha de baixo de uma conversa na lista do Social (9/10, docs/PLANO-SOCIAL-IOS.md).
 *
 * O `previewText` escrevia a frase de quem RECEBE e punha "You:" à frente
 * quando a mensagem era nossa: "You: Invited you to a Jam", "You: Added you to
 * this playlist...". Aqui cada lado tem a sua frase, e uma música diz-se pelo
 * título limpo e pelo artista (quem chama passa as duas funções da app, para
 * isto continuar puro e testável em Node).
 *
 * Sem imports de runtime.
 */

export type ItemDaPrevia = 'track' | 'playlist' | 'sessao' | string;

export interface PreviaDeEntrada {
  senderId: string;
  itemType: ItemDaPrevia;
  message: string | null;
  trackTitle: string | null;
  trackArtist: string | null;
  trackArtwork?: string | null;
}

export interface Previa {
  texto: string;
  /** É uma música: a linha leva a mini-capa (ou a nota, sem capa). */
  musica: boolean;
  capa: string | null;
}

/** A mensagem que o convite para uma playlist colaborativa leva (lib/playlistColaborativa.ts). */
export const TEXTO_DO_CONVITE_PARA_PLAYLIST = 'Added you to this playlist. You can add songs too.';

export function previaDaConversa(
  p: PreviaDeEntrada,
  eu: string | undefined,
  opcoes: {
    /** Com quem é a conversa (para "You invited nuno to a Jam"). Num grupo, nada. */
    outro?: string | null;
    /** Num grupo, quem mandou a mensagem: "inês: hoje há jam". */
    nomeDe?: (id: string) => string | null;
    titulo?: (t: { title: string; artist: string | null }) => string;
    artista?: (t: { title: string; artist: string | null }) => string;
  } = {},
): Previa {
  const minha = !!eu && p.senderId === eu;
  const mensagem = p.message?.trim() || '';
  const quem = !minha && opcoes.nomeDe ? opcoes.nomeDe(p.senderId) : null;
  const prefixo = minha ? 'You: ' : quem ? `${quem}: ` : '';
  const semMusica = (texto: string): Previa => ({ texto, musica: false, capa: null });

  if (p.itemType === 'sessao') {
    if (minha) return semMusica(opcoes.outro ? `You invited ${opcoes.outro} to a Jam` : 'You started a Jam');
    return semMusica(quem ? `${quem} started a Jam` : 'Invited you to a Jam');
  }

  if (p.itemType === 'playlist') {
    if (mensagem === TEXTO_DO_CONVITE_PARA_PLAYLIST) {
      if (minha) return semMusica(opcoes.outro ? `You added ${opcoes.outro} to a playlist` : 'You shared a playlist');
      return semMusica('Added you to a playlist');
    }
    if (mensagem) return semMusica(`${prefixo}${mensagem}`);
    return semMusica(minha ? 'You shared a playlist' : `${prefixo}Shared a playlist`);
  }

  if (p.trackTitle) {
    const faixa = { title: p.trackTitle, artist: p.trackArtist };
    const titulo = opcoes.titulo ? opcoes.titulo(faixa) : p.trackTitle;
    const artista = opcoes.artista ? opcoes.artista(faixa) : (p.trackArtist ?? '');
    const capa = p.trackArtwork ?? null;
    // Com texto (uma reação "🔥", uma frase), o texto à frente e a música a seguir.
    if (mensagem) return { texto: `${prefixo}${mensagem} · ${titulo}`, musica: true, capa };
    if (minha) return { texto: `You sent ${titulo}`, musica: true, capa };
    return { texto: `${prefixo}${titulo}${artista ? ` · ${artista}` : ''}`, musica: true, capa };
  }

  if (mensagem) return semMusica(`${prefixo}${mensagem}`);
  return semMusica(minha ? 'You sent a song' : `${prefixo}Sent a song`);
}
