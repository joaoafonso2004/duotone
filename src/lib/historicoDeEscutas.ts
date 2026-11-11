import type { PlayRow } from './listeningStats';

/**
 * O histórico de escutas da própria conta, guardado no aparelho (11/11).
 *
 * As estatísticas, o Resumo do mês e a retrospetiva liam o histórico INTEIRO a
 * cada abertura: 1000 escutas por pedido, com a faixa de cada uma. Na hora
 * medida a 11/11 isso foram 15 076 linhas numa só conta -- 45% de tudo o que a
 * API devolveu, e o egress é o limite do plano grátis que desliga a app.
 *
 * Uma escuta nunca muda depois de entrar (o `plays` só leva inserts), por isso
 * guarda-se o que já se leu e pede-se só o que é novo. Duas folgas:
 *   - as escutas ouvidas sem rede entram mais tarde, com a hora em que se
 *     ouviram: o que é novo pede-se desde a última leitura MENOS dois dias;
 *   - uma faixa pode mudar de capa ou ser corrigida no catálogo: ao fim de uma
 *     semana relê-se tudo.
 *
 * Sem imports que corram: `scripts/test-historico-de-escutas.ts`.
 */

/** Ao fim disto relê-se o período inteiro (capas e faixas corrigidas). */
export const RELER_TUDO_MS = 7 * 24 * 60 * 60_000;
/** O que é novo pede-se com esta folga para trás: escutas enviadas atrasadas. */
export const FOLGA_DAS_NOVAS_MS = 2 * 24 * 60 * 60_000;
/** Abrir as estatísticas e mudar de período logo a seguir não volta à rede. */
export const ACABADO_DE_LER_MS = 60_000;
/** Acima disto fica só em memória: o `localStorage` do PC tem pouco espaço. */
export const MAXIMO_NO_DISCO = 2_000_000;

type FaixaCompacta = [source: string, sourceId: string, title: string, artist: string | null, artworkUrl: string | null, durationSeconds: number | null];

export interface HistoricoGuardado {
  v: 1;
  conta: string;
  /** Quando se leu o período inteiro pela última vez. */
  lidoEm: number;
  /** Quando se foi à rede pela última vez (o período inteiro ou só o novo). */
  leituraEm: number;
  /** A escuta mais antiga que se pediu: `null` é o histórico todo. */
  desde: number | null;
  /** A leitura inteira bateu no teto de páginas: os mais antigos ficaram de fora. */
  truncado: boolean;
  /** Cada faixa uma vez; as escutas apontam para aqui. */
  faixas: FaixaCompacta[];
  /** `[hora em ms, índice da faixa]`, da mais recente para a mais antiga. */
  escutas: [number, number][];
}

export type PlanoDeLeitura =
  /** O que está guardado chega: não se vai à rede. */
  | { tipo: 'nada' }
  /** Só as escutas a partir de `desde` (ms), juntas às guardadas. */
  | { tipo: 'novas'; desde: number }
  /** O período inteiro a partir de `desde` (`null`: tudo), no lugar do guardado. */
  | { tipo: 'tudo'; desde: number | null };

const horaDe = (r: PlayRow) => Date.parse(r.playedAt);
const chaveDaEscuta = (em: number, r: PlayRow) => `${em}|${r.source}:${r.sourceId}`;

/** Cobre `inicio`? Um histórico pedido desde X serve qualquer período que comece depois. */
export function cobre(h: Pick<HistoricoGuardado, 'desde'>, inicio: number | null): boolean {
  return h.desde === null || (inicio !== null && inicio >= h.desde);
}

/** O que pedir à rede para responder a uma leitura desde `inicio`. */
export function planoDeLeitura(
  h: HistoricoGuardado | null,
  conta: string,
  inicio: number | null,
  agora: number,
): PlanoDeLeitura {
  if (!h || h.v !== 1 || h.conta !== conta || !cobre(h, inicio)
    || !(agora - h.lidoEm < RELER_TUDO_MS) || h.lidoEm > agora + 60_000) {
    return { tipo: 'tudo', desde: inicio };
  }
  if (agora - h.leituraEm < ACABADO_DE_LER_MS && h.leituraEm <= agora) return { tipo: 'nada' };
  return { tipo: 'novas', desde: Math.min(h.leituraEm, agora) - FOLGA_DAS_NOVAS_MS };
}

/**
 * Junta as escutas guardadas às que acabaram de chegar. A mesma escuta (a
 * mesma hora e a mesma faixa) conta uma vez, e fica a versão que chegou agora:
 * a faixa pode ter mudado de capa. Da mais recente para a mais antiga.
 */
export function juntarEscutas(guardadas: readonly PlayRow[], novas: readonly PlayRow[]): PlayRow[] {
  const porChave = new Map<string, { em: number; r: PlayRow }>();
  for (const lista of [guardadas, novas]) {
    for (const r of lista) {
      const em = horaDe(r);
      if (!Number.isFinite(em)) continue;
      porChave.set(chaveDaEscuta(em, r), { em, r });
    }
  }
  return [...porChave.values()].sort((a, b) => b.em - a.em).map((x) => x.r);
}

/** Só as escutas a partir de `inicio` (todas, com `null`). */
export function aPartirDe(rows: readonly PlayRow[], inicio: number | null): PlayRow[] {
  if (inicio === null) return [...rows];
  return rows.filter((r) => horaDe(r) >= inicio);
}

export function compactar(
  conta: string,
  rows: readonly PlayRow[],
  meta: { lidoEm: number; leituraEm: number; desde: number | null; truncado: boolean },
): HistoricoGuardado {
  const faixas: FaixaCompacta[] = [];
  const indice = new Map<string, number>();
  const escutas: [number, number][] = [];
  for (const r of rows) {
    const em = horaDe(r);
    if (!Number.isFinite(em)) continue;
    const chave = `${r.source}:${r.sourceId}`;
    let i = indice.get(chave);
    if (i === undefined) {
      i = faixas.length;
      indice.set(chave, i);
      faixas.push([r.source, r.sourceId, r.title, r.artist, r.artworkUrl, r.durationSeconds]);
    }
    escutas.push([em, i]);
  }
  return { v: 1, conta, ...meta, faixas, escutas };
}

export function descompactar(h: HistoricoGuardado): PlayRow[] {
  const rows: PlayRow[] = [];
  for (const [em, i] of h.escutas) {
    const f = h.faixas[i];
    if (!f || !Number.isFinite(em)) continue;
    rows.push({
      playedAt: new Date(em).toISOString(),
      source: f[0], sourceId: f[1], title: f[2], artist: f[3], artworkUrl: f[4], durationSeconds: f[5],
    });
  }
  return rows;
}

/** Lê o que veio do disco, recusando o que não tem a forma certa. */
export function lerGuardado(texto: string | null, conta: string): HistoricoGuardado | null {
  if (!texto) return null;
  try {
    const h = JSON.parse(texto) as HistoricoGuardado;
    if (!h || h.v !== 1 || h.conta !== conta || !Array.isArray(h.faixas) || !Array.isArray(h.escutas)) return null;
    if (!Number.isFinite(h.lidoEm) || !Number.isFinite(h.leituraEm)) return null;
    if (h.desde !== null && !Number.isFinite(h.desde)) return null;
    return h;
  } catch {
    return null;
  }
}
