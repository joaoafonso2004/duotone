/**
 * Segunda tentativa para pesquisas que a YouTube Data API suprime.
 *
 * A API devolve ZERO resultados a queries curtas que lhe parecem procura de
 * conteúdo adulto, mesmo quando existe uma música com esse nome. Não é um
 * erro — vem 200 OK com a lista vazia — e `safeSearch=none` não a destrava.
 *
 * Medido contra a API a sério, com repetição para confirmar que é estável:
 *
 *   "EDEN sex"                                    ->  0
 *   "EDEN - sex"                                  ->  0
 *   "EDEN sex official audio"                     ->  0
 *   "EDEN sex song"                               -> 25  (1º: o vídeo oficial)
 *   "EDEN sex music"                              -> 25  (1º: o vídeo oficial)
 *   "EDEN sex i think you think too much of me"   -> 25  (1º: o vídeo oficial)
 *   "Salt-N-Pepa Lets Talk About Sex"             -> 25
 *
 * Repare-se que "official audio" NÃO destrava apesar de acrescentar duas
 * palavras, e "song" destrava com uma só: não é o comprimento da query, é a
 * presença de uma palavra que a situe em música. E o Salt-N-Pepa mostra que a
 * palavra sozinha não é o gatilho — queries já específicas passam à primeira.
 */

/** Palavra que situa a pesquisa em música e destrava a supressão. */
const CONTEXT_WORD = 'music';

/**
 * Acima disto não vale a pena repetir.
 *
 * Cada `search.list` custa 100 unidades de um tecto diário de 10.000, e a
 * causa comum de zero resultados não é a supressão — é o utilizador ter
 * escrito algo que mesmo não existe. A supressão só apanha queries curtas,
 * por isso limitar a repetição a essas evita duplicar o custo de todas as
 * pesquisas falhadas para cobrir um caso que só acontece nas curtas.
 */
const MAX_WORDS = 5;

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * Consultas a tentar, por ordem, até uma devolver resultados.
 *
 * Devolve sempre pelo menos a query original. A segunda só aparece quando
 * compensa: query curta e que ainda não fala de música.
 */
export function searchAttempts(query: string): string[] {
  const q = query.trim();
  if (!q) return [];

  if (wordCount(q) > MAX_WORDS) return [q];

  // Só as duas palavras que verifiquei destravarem a supressão contam como
  // contexto já presente. "audio" parecia servir e não serve: a query
  // "EDEN sex official audio" continua a devolver zero.
  if (/\b(music|song)\b/i.test(q)) return [q];

  return [q, `${q} ${CONTEXT_WORD}`];
}
