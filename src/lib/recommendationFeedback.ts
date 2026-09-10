/**
 * O que o utilizador diz sobre as sugestões — e o que isso faz.
 *
 * ## Um botão de volume por artista
 *
 * O sistema já tinha o mecanismo todo, e só sabia usá-lo num sentido: cada
 * artista tem um PESO, e esse peso multiplica-se em três sítios do
 * `escolherAlvos` (o retrato de quem se ouve, os vizinhos, e a afinidade). Um
 * artista "a menos" valia 0,25 e por isso era quatro vezes menos provável que
 * fosse escolhido como âncora de uma descoberta.
 *
 * O "mais destas" é o mesmo botão para o outro lado. Nada no resto do caminho
 * precisa de saber que ele existe.
 *
 * ## Porque é que não é simétrico
 *
 * Tirar e pôr não custam o mesmo. Um artista a 0,25 continua a poder aparecer;
 * um artista a 4 esmagava o retrato inteiro, porque o peso normal é a RAIZ das
 * escutas -- 4 vezes bate um artista com dezasseis vezes mais reproduções. Dois
 * e meio chega para ele entrar sempre na conversa sem passar a ser a conversa.
 *
 * ## O caso que dá sentido a isto
 *
 * O peso multiplica o que já lá está, e um artista que não está na biblioteca
 * vale zero -- 2,5 vezes zero continua a ser zero. É por isso que o
 * `preferidos` existe e é INJECTADO no retrato: ouves uma descoberta, dizes
 * "mais destas", e o artista entra no teu circuito sem teres de guardar as
 * músicas dele. É a mesma decisão (e a mesma razão) das sementes do primeiro
 * dia -- ver `lib/artistasSemente.ts`.
 *
 * Sem imports de runtime: `scripts/test-preferencias.ts` corre em Node puro.
 */

/**
 * `artist` é "menos deste"; `artist_more` é "mais deste". Nomes assim porque o
 * `artist` já está escrito na base de dados e renomeá-lo era uma migração de
 * dados para não ganhar nada.
 */
export type Feedback = { kind: 'track' | 'artist' | 'artist_more'; key: string; label: string };

/** Quanto vale um artista que se pediu para ouvir menos. */
export const PESO_A_MENOS = 0.25;
/** E um que se pediu para ouvir mais. Ver o cabeçalho para o porquê de 2,5. */
export const PESO_A_MAIS = 2.5;
/**
 * O peso de partida de um preferido que ainda não está na biblioteca.
 *
 * A raiz de nove: o mesmo que um artista com nove reproduções -- alguém que se
 * ouve, mas não todos os dias. Entra na corrida a meio da tabela, e o
 * `PESO_A_MAIS` faz o resto.
 */
export const ESCUTAS_DE_UM_PREFERIDO = 9;

/** O multiplicador deste artista, pela chave canónica. */
export function pesoDoArtista(prefs: readonly Feedback[], chave: string): number {
  for (const p of prefs) {
    if (p.key !== chave) continue;
    if (p.kind === 'artist') return PESO_A_MENOS;
    if (p.kind === 'artist_more') return PESO_A_MAIS;
  }
  return 1;
}

/** Os artistas que se pediu para ouvir mais, com o nome como está escrito. */
export function preferidos(prefs: readonly Feedback[]): { chave: string; nome: string }[] {
  return prefs.filter((p) => p.kind === 'artist_more').map((p) => ({ chave: p.key, nome: p.label }));
}

/**
 * Lógica pura: só se aplica a sugestões, nunca à biblioteca ou à fila manual.
 *
 * Três montes, e a ordem entre eles é a resposta: os preferidos à frente, o
 * normal a seguir, e os reduzidos no fim. Não se inventa nada que não estivesse
 * na lista -- só se muda por que ordem ela é lida.
 */
export function ajustarSugestoes<T>(
  tracks: readonly T[],
  prefs: readonly Feedback[],
  trackKey: (t: T) => string,
  artistKey: (t: T) => string,
): T[] {
  const blocked = new Set(prefs.filter((p) => p.kind === 'track').map((p) => p.key));
  const less = new Set(prefs.filter((p) => p.kind === 'artist').map((p) => p.key));
  const more = new Set(prefs.filter((p) => p.kind === 'artist_more').map((p) => p.key));
  const preferido: T[] = [], normal: T[] = [], reduced: T[] = [];
  // No máximo uma candidata por artista reduzido, depois das alternativas.
  // As restantes não regressam só por faltarem alternativas.
  const allowed = tracks.filter((t) => !blocked.has(trackKey(t)));
  const kept = new Map<string, number>();
  for (const t of allowed) {
    const k = artistKey(t);
    if (more.has(k)) { preferido.push(t); continue; }
    if (!less.has(k)) { normal.push(t); continue; }
    const n = kept.get(k) ?? 0;
    if (n < 1) { reduced.push(t); kept.set(k, n + 1); }
  }
  return [...preferido, ...normal, ...reduced];
}
