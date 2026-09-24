import type { Track } from '../types';

/**
 * As escutas que não chegaram ao Supabase (entrega 1 do
 * docs/PLANO-OFFLINE-SOCIAL-DESCOBERTA-PC.md).
 *
 * O `recordPlayInSupabase` fazia o insert e, sem rede, falhava e só escrevia
 * no log: uma tarde a ouvir os downloads no avião não existia para as
 * estatísticas, o top de artistas e as recomendações. O `user_play_counts` já
 * tinha a sua fila (lib/playCounts.ts); faltava o `plays`.
 *
 * Cada escuta leva a HORA a que passou o limiar, medida no aparelho: o
 * `played_at` por omissão é o `now()` do servidor, e reenviar mais tarde sem
 * ela punha a escuta na hora do envio. Leva também a hora a que começou, que é
 * a que o Last.fm pede (entrega 3d).
 *
 * Sem imports de runtime -- testado em scripts/test-escutas-pendentes.ts.
 */

export type EscutaPendente = {
  /** Identidade da escuta: a mesma faixa ouvida duas vezes são duas escutas. */
  id: string;
  faixa: Track;
  /** Quando passou o limiar (ISO, relógio do aparelho). */
  em: string;
  /** Quando começou (ISO). */
  comecouEm: string;
  /** Envios falhados. */
  tentativas: number;
};

/** Uma semana de escuta contínua a 4 min por faixa dá ~2500; isto chega e não cresce sem fim. */
export const MAX_PENDENTES = 2000;
/** Um lote que falha tantas vezes não é a rede: é a linha. Sai, para não travar as outras. */
export const MAX_TENTATIVAS = 8;
export const TAMANHO_DO_LOTE = 50;

export function novaEscutaPendente(faixa: Track, em: Date, comecouEm: Date): EscutaPendente {
  const iso = em.toISOString();
  return {
    id: `${iso}|${faixa.source}:${faixa.sourceId}`,
    faixa: {
      source: faixa.source, sourceId: faixa.sourceId, title: faixa.title, artist: faixa.artist ?? null,
      album: faixa.album ?? null, artworkUrl: faixa.artworkUrl ?? null, durationSeconds: faixa.durationSeconds ?? null,
    } as Track,
    em: iso,
    comecouEm: comecouEm.toISOString(),
    tentativas: 0,
  };
}

/** Acrescenta no fim; sem repetir a mesma escuta; sai a mais antiga acima do teto. */
export function acrescentarPendente(lista: readonly EscutaPendente[], e: EscutaPendente): EscutaPendente[] {
  if (lista.some((x) => x.id === e.id)) return [...lista];
  const nova = [...lista, e];
  return nova.length > MAX_PENDENTES ? nova.slice(nova.length - MAX_PENDENTES) : nova;
}

/** O próximo lote, pela ordem em que foram ouvidas. */
export function proximoLote(lista: readonly EscutaPendente[], tamanho = TAMANHO_DO_LOTE): EscutaPendente[] {
  return lista.slice(0, Math.max(0, tamanho));
}

/**
 * A lista depois de um envio. Tira-se por IDENTIDADE e não por posição: entre
 * ler e gravar entram escutas novas, e cortar os primeiros N apagava-as.
 * Um lote falhado sobe as tentativas; quem passa do máximo sai.
 */
export function depoisDoEnvio(
  lista: readonly EscutaPendente[],
  lote: readonly EscutaPendente[],
  correu: boolean,
): EscutaPendente[] {
  const ids = new Set(lote.map((e) => e.id));
  if (correu) return lista.filter((e) => !ids.has(e.id));
  return lista
    .map((e) => (ids.has(e.id) ? { ...e, tentativas: e.tentativas + 1 } : e))
    .filter((e) => e.tentativas < MAX_TENTATIVAS);
}

/** Lê o que está guardado; o que não tem a forma certa não entra. */
export function lerPendentes(bruto: string | null): EscutaPendente[] {
  if (!bruto) return [];
  try {
    const v = JSON.parse(bruto);
    if (!Array.isArray(v)) return [];
    return v.filter((e) => e && typeof e.id === 'string' && typeof e.em === 'string'
      && e.faixa && typeof e.faixa.sourceId === 'string' && typeof e.faixa.source === 'string')
      .map((e) => ({ ...e, comecouEm: typeof e.comecouEm === 'string' ? e.comecouEm : e.em,
        tentativas: Number.isFinite(e.tentativas) ? e.tentativas : 0 }));
  } catch {
    return [];
  }
}
