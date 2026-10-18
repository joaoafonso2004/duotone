import type { AncoraDoDia } from './misturaDoDia';

/**
 * O Radio "Mix" (18/10, pedido do João: "um rádio de tudo o que eu ouço").
 *
 * O Radio de sempre parte da música que está a tocar ("Songs like this one").
 * O Mix parte de TUDO o que se ouve: os artistas da semana (as escutas
 * recentes pesam mais) e os de sempre (o perfil), os mesmos de que a Daily mix
 * parte (`ancorasDoDia`). A diferença é que nunca acaba: cada lote usa
 * `ANCORAS_POR_LOTE` desses artistas e o seguinte passa aos próximos, por isso
 * o Mix vai rodando por tudo o que se ouve em vez de ficar num só lado.
 *
 * Em cada lote, metade conhecidas (o que se ouviu desses artistas, as Liked
 * Songs, a Heavy Rotation) e metade novas parecidas (os vizinhos do catálogo,
 * os mesmos do Smart Shuffle). As regras do Radio valem: nada do que se ouviu
 * nas últimas 24 h, as novas não voltam durante 30 dias, artistas espalhados.
 * Não é o Flow geral que saiu do Radio a 15/10: esse continua fora do Radio
 * de uma música; o Mix é a escolha explícita de "tudo o que eu ouço".
 *
 * Sem imports de rede: `scripts/test-mix-do-radio.ts`.
 */

/** Quantos artistas há na roda do Mix. */
export const ANCORAS_DA_MIX = 12;
/** Quantos entram em cada lote. */
export const ANCORAS_POR_LOTE = 4;
/** Metade tuas, metade novas. */
export const FRACAO_DE_NOVAS_NO_MIX = 0.5;
/** As entradas (escutas, perfil, favoritas) leem-se no máximo de meia em meia hora. */
export const ENTRADAS_DO_MIX_VALEM_MS = 30 * 60_000;

/**
 * Os artistas do lote número `volta`: `porLote` seguidos da roda, a começar
 * onde o anterior acabou (e a dar a volta). As fatias voltam a somar 1.
 */
export function ancorasDoLote(
  todas: readonly AncoraDoDia[],
  volta: number,
  porLote: number = ANCORAS_POR_LOTE,
): AncoraDoDia[] {
  if (!todas.length) return [];
  const n = Math.min(porLote, todas.length);
  const inicio = ((volta * n) % todas.length + todas.length) % todas.length;
  const escolhidas = Array.from({ length: n }, (_, i) => todas[(inicio + i) % todas.length]);
  const soma = escolhidas.reduce((s, a) => s + a.peso, 0);
  return escolhidas.map((a) => ({ ...a, peso: soma > 0 ? a.peso / soma : 1 / n }));
}

/** Uma linha do histórico de escutas do aparelho (`lib/playCounts.ts`). */
export type ContagemDoAparelho<T> = { faixa: T; count: number; lastPlayed: number };

const SEMANA_MS = 7 * 24 * 60 * 60_000;
/** Uma música muito repetida não vale mais do que isto na roda (nem nas conhecidas). */
const TETO_DE_REPETICOES = 5;
const FAVORITAS = 60;

/**
 * As entradas do Mix a partir do histórico de escutas do APARELHO, que já
 * cá está e viaja entre os dois: zero pedidos ao Supabase (16/10, a mesma
 * decisão do Smart Shuffle). Eram três leituras por lote -- as escutas da
 * semana, o perfil e a Heavy Rotation.
 *
 *  - `recentes`: cada música ouvida esta semana, à hora da última escuta,
 *    repetida pelas vezes que se ouviu (até `TETO_DE_REPETICOES`);
 *  - `perfil`: os artistas de sempre, pela soma das escutas;
 *  - `daSemana`: as músicas desta semana, repetidas da mesma maneira (as
 *    conhecidas de cada artista começam pelas mais ouvidas);
 *  - `favoritas`: as mais ouvidas de sempre.
 */
export function entradasDoAparelho<T>(
  contagens: readonly ContagemDoAparelho<T>[],
  artistaDe: (t: T) => { chave: string; nome: string },
  agora: number,
): {
  recentes: { chave: string; nome: string; em: number }[];
  perfil: { chave: string; nome: string; escutas: number }[];
  daSemana: T[];
  favoritas: T[];
} {
  const recentes: { chave: string; nome: string; em: number }[] = [];
  const daSemana: T[] = [];
  const porArtista = new Map<string, { nome: string; escutas: number }>();
  for (const c of contagens) {
    const a = artistaDe(c.faixa);
    if (!a.chave || !(c.count > 0)) continue;
    const p = porArtista.get(a.chave) ?? { nome: a.nome, escutas: 0 };
    p.escutas += c.count;
    porArtista.set(a.chave, p);
    if (agora - c.lastPlayed <= SEMANA_MS) {
      for (let i = 0; i < Math.min(c.count, TETO_DE_REPETICOES); i++) {
        recentes.push({ chave: a.chave, nome: a.nome, em: c.lastPlayed });
        daSemana.push(c.faixa);
      }
    }
  }
  const favoritas = [...contagens].filter((c) => c.count > 0)
    .sort((x, y) => y.count - x.count || y.lastPlayed - x.lastPlayed)
    .slice(0, FAVORITAS).map((c) => c.faixa);
  const perfil = [...porArtista].map(([chave, v]) => ({ chave, nome: v.nome, escutas: v.escutas }));
  return { recentes, perfil, daSemana, favoritas };
}

/** Fisher-Yates com o `aleatorio` de quem chama (os testes passam um fixo). */
export function baralhado<T>(lista: readonly T[], aleatorio: () => number = Math.random): T[] {
  const saida = [...lista];
  for (let i = saida.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [saida[i], saida[j]] = [saida[j], saida[i]];
  }
  return saida;
}

/**
 * As conhecidas de cada artista do lote, pela chave do artista: primeiro o que
 * se ouviu dele esta semana (o mais repetido primeiro), depois as Liked Songs
 * (baralhadas, para não virem sempre as mesmas) e a Heavy Rotation. Só as que
 * `podeEntrar` deixa (as das últimas 24 h e as que já estão na fila não).
 */
export function conhecidasDoLote<T>(
  chaves: ReadonlySet<string>,
  ouvidasDaSemana: readonly T[],
  biblioteca: readonly T[],
  favoritas: readonly T[],
  artistaDe: (t: T) => string,
  chaveDaFaixa: (t: T) => string,
  podeEntrar: (t: T) => boolean,
  aleatorio: () => number = Math.random,
): Map<string, T[]> {
  const vezes = new Map<string, { t: T; n: number }>();
  for (const t of ouvidasDaSemana) {
    const k = chaveDaFaixa(t);
    const v = vezes.get(k);
    if (v) v.n++; else vezes.set(k, { t, n: 1 });
  }
  const saida = new Map<string, T[]>();
  const vistas = new Set<string>();
  const juntar = (t: T) => {
    const artista = artistaDe(t);
    const k = chaveDaFaixa(t);
    if (!chaves.has(artista) || vistas.has(k) || !podeEntrar(t)) return;
    vistas.add(k);
    const lista = saida.get(artista) ?? [];
    lista.push(t);
    saida.set(artista, lista);
  };
  [...vezes.values()].sort((a, b) => b.n - a.n).forEach((v) => juntar(v.t));
  baralhado(biblioteca, aleatorio).forEach(juntar);
  favoritas.forEach(juntar);
  return saida;
}
