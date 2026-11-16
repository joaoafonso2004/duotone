/**
 * O Radio nunca devolve a mesma fila (16/11, João: "se eu der clear e clicar de
 * novo no radio a queue vem igual, e isso nunca pode acontecer").
 *
 * Porque vinha igual: a memória de sugestões (a do Smart Shuffle) só guarda as
 * músicas que NÃO são da biblioteca, e as tentativas de recurso do Radio (sem
 * memória, com repetidas) são deterministas: a mesma semente dava a mesma
 * ordem. Aqui fica, por semente (a música de onde o Radio partiu, ou o Mix), o
 * que os últimos lotes levaram -- todas, as tuas incluídas. Ao ligar outra vez:
 *
 * - o que os lotes anteriores levaram vai para o fim (como as sugeridas há
 *   pouco), e as fontes seguintes enchem o lote com outras;
 * - se mesmo assim o lote sair quase o mesmo (uma semente com poucas parecidas),
 *   baralha-se (Fisher-Yates) até a ordem ser outra.
 *
 * Só no aparelho (AsyncStorage, `state/memoriaDoRadio.ts`): nenhum pedido ao
 * Supabase. ~60 sementes, três lotes cada, uma semana.
 *
 * Puro: `scripts/test-radio-sem-repetir.ts`.
 */

export type LoteLembrado = {
  /** ms */
  em: number;
  /** As chaves das músicas (`source:sourceId`), pela ordem do lote. */
  faixas: string[];
  /** As identidades (lib/identidadeDaMusica.ts): o upload e as variantes da mesma música. */
  identidades: string[];
};
export type MemoriaDoRadio = Record<string, LoteLembrado[]>;

export const LOTES_POR_SEMENTE = 3;
export const SEMENTES_LEMBRADAS = 60;
export const VALE_MS = 7 * 24 * 60 * 60 * 1000;
const MAXIMO_POR_LOTE = 60;

const textos = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 400).slice(0, max) : [];

/** O que vem do disco, limpo (um JSON estragado é uma memória vazia). */
export function lerMemoriaDoRadio(bruto: unknown, agora = Date.now()): MemoriaDoRadio {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return {};
  const fora: MemoriaDoRadio = {};
  for (const [semente, lotes] of Object.entries(bruto as Record<string, unknown>)) {
    if (!semente || !Array.isArray(lotes)) continue;
    const limpos = lotes.flatMap((l): LoteLembrado[] => {
      if (!l || typeof l !== 'object') return [];
      const r = l as Record<string, unknown>;
      const em = typeof r.em === 'number' && Number.isFinite(r.em) ? r.em : 0;
      if (agora - em > VALE_MS) return [];
      const faixas = textos(r.faixas, MAXIMO_POR_LOTE);
      return faixas.length ? [{ em, faixas, identidades: textos(r.identidades, MAXIMO_POR_LOTE * 4) }] : [];
    }).slice(-LOTES_POR_SEMENTE);
    if (limpos.length) fora[semente] = limpos;
  }
  return fora;
}

/** Junta o lote de agora: os três últimos por semente, e as sementes mais recentes primeiro a ficar. */
export function lembrarLote(
  m: MemoriaDoRadio, semente: string, faixas: readonly string[], identidades: readonly string[], agora = Date.now(),
): MemoriaDoRadio {
  if (!semente || !faixas.length) return m;
  const lote: LoteLembrado = {
    em: agora, faixas: faixas.slice(0, MAXIMO_POR_LOTE), identidades: identidades.slice(0, MAXIMO_POR_LOTE * 4),
  };
  const nova: MemoriaDoRadio = { ...m, [semente]: [...(m[semente] ?? []), lote].slice(-LOTES_POR_SEMENTE) };
  const sementes = Object.keys(nova);
  if (sementes.length <= SEMENTES_LEMBRADAS) return nova;
  // Fora as que se usaram há mais tempo.
  const ultima = (s: string) => Math.max(...(nova[s] ?? []).map((l) => l.em));
  const ficam = new Set(sementes.sort((a, b) => ultima(b) - ultima(a)).slice(0, SEMENTES_LEMBRADAS));
  return Object.fromEntries(Object.entries(nova).filter(([s]) => ficam.has(s)));
}

/** O que os lotes anteriores desta semente levaram (as identidades), para ir para o fim. */
export function aEvitar(m: MemoriaDoRadio, semente: string, agora = Date.now()): Set<string> {
  const fora = new Set<string>();
  for (const l of m[semente] ?? []) {
    if (agora - l.em > VALE_MS) continue;
    for (const k of l.identidades) fora.add(k);
    for (const k of l.faixas) fora.add(k);
  }
  return fora;
}

/** As músicas do último lote desta semente, pela ordem. */
export function ultimoLote(m: MemoriaDoRadio, semente: string): string[] {
  return m[semente]?.at(-1)?.faixas ?? [];
}

/** Quanto do lote novo já estava no anterior, de 0 a 1. */
export function sobreposicao(novo: readonly string[], anterior: readonly string[]): number {
  if (!novo.length || !anterior.length) return 0;
  const antes = new Set(anterior);
  return novo.filter((k) => antes.has(k)).length / novo.length;
}

/**
 * A garantia: um lote quase igual ao anterior (três quartos das mesmas músicas
 * ou mais) sai baralhado, numa ordem que não é a de antes. Um lote de uma
 * música só não tem outra ordem: fica como está.
 */
export function naoRepetir<T>(
  lote: readonly T[], anterior: readonly string[], chave: (t: T) => string, aleatorio: () => number = Math.random,
): T[] {
  const chaves = lote.map(chave);
  if (lote.length < 2 || sobreposicao(chaves, anterior) < 0.75) return lote.slice();
  const igualAntes = (l: readonly T[]) => l.map(chave).join('\n') === anterior.slice(0, l.length).join('\n');
  let c = lote.slice();
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    c = lote.slice();
    for (let i = c.length - 1; i > 0; i--) {
      const j = Math.floor(aleatorio() * (i + 1));
      [c[i], c[j]] = [c[j]!, c[i]!];
    }
    if (!igualAntes(c) && c.map(chave).join('\n') !== chaves.join('\n')) return c;
  }
  // Um aleatório teimoso (nos testes): roda uma posição, que muda sempre a ordem.
  return [...lote.slice(1), lote[0]!];
}
