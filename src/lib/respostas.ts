/**
 * Responder a uma mensagem específica, como no Instagram.
 *
 * Pedido a 14/9. A mensagem guarda só o id da original (`reply_to_id`, ver
 * supabase/responder-mensagens.sql); tudo o que se mostra -- de quem era e o
 * começo do que dizia -- sai daqui. Sem imports de runtime, testado em
 * `scripts/test-respostas.ts`.
 */

export const TAMANHO_DO_EXCERTO = 90;

type MensagemCitada = { itemType: string; message: string | null; playlistId: string | null };

/**
 * Uma linha que diz de que mensagem se trata, sem a repetir inteira.
 *
 * As mensagens de texto são `itemType: 'track'` sem faixa (é assim que a tabela
 * as guarda), por isso quem decide que é uma música é a `faixa`, e não o tipo.
 */
export function excertoDaMensagem(
  m: MensagemCitada,
  extra: { faixa?: { titulo: string; artista: string } | null; playlist?: string | null } = {},
): string {
  if (m.itemType === 'sessao') return 'Listening session invite';
  if (extra.faixa) return `♫ ${extra.faixa.titulo} · ${extra.faixa.artista}`;
  if (m.playlistId) return extra.playlist ? `Playlist · ${extra.playlist}` : 'Playlist';
  const texto = (m.message ?? '').replace(/\s+/g, ' ').trim();
  if (!texto) return 'Message';
  return texto.length > TAMANHO_DO_EXCERTO
    ? `${texto.slice(0, TAMANHO_DO_EXCERTO - 1).trimEnd()}…`
    : texto;
}

/** Quem é citado, como se lê por cima da citação. */
export function quemECitado(autorId: string, eu: string | null | undefined, nome: string): string {
  return eu && autorId === eu ? 'You' : nome;
}

/** A original entre as mensagens carregadas, ou null. */
export function acharOriginal<T extends { id: string }>(
  mensagens: readonly T[],
  id: string | null | undefined,
): T | null {
  if (!id) return null;
  return mensagens.find((m) => m.id === id) ?? null;
}

/**
 * As originais que ficaram FORA do que está carregado -- a conversa vem às
 * páginas de 100, e uma resposta pode citar uma mensagem mais antiga.
 */
export function citadasPorCarregar(mensagens: readonly { id: string; replyToId?: string | null }[]): string[] {
  const carregadas = new Set(mensagens.map((m) => m.id));
  const fora = new Set<string>();
  for (const m of mensagens) if (m.replyToId && !carregadas.has(m.replyToId)) fora.add(m.replyToId);
  return [...fora].sort();
}

/**
 * A base de dados ainda não tem a coluna (a migração não correu).
 *
 * O PostgREST responde PGRST204 ("Could not find the 'reply_to_id' column") e o
 * Postgres 42703. Nesse caso manda-se a mensagem sem a citação: perdê-la por
 * causa de um extra seria pior.
 */
export function faltaAColunaDeResposta(erro: { code?: string; message?: string } | null | undefined): boolean {
  if (!erro) return false;
  return (erro.code === 'PGRST204' || erro.code === '42703') && /reply_to_id/.test(erro.message ?? '');
}
