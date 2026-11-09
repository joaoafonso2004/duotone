/**
 * Escolher várias músicas de uma lista (9/11, maquete `docs/melhorias-de-uso-maquete.html`,
 * secção 1, opção B). As regras, sem React, para se testarem em Node:
 *
 * - Ctrl+clique (ou Cmd) junta ou tira uma, e passa a ser a âncora;
 * - Shift+clique junta tudo entre a âncora e esta (às que já estavam);
 * - Ctrl+A escolhe a lista toda;
 * - escolher noutra lista começa de novo: só há escolhidas numa lista de cada vez.
 *
 * As escolhidas guardam-se pela chave da música (`source:sourceId`) e não pelo
 * índice: uma lista que se reordena ou filtra não troca as escolhidas por outras.
 */
import type { Track } from '../types';

export interface EstadoDaSelecao {
  /** A lista com escolhidas (o `listKey` da tabela), ou nenhuma. */
  lista: string | null;
  chaves: string[];
  /** O índice do último Ctrl+clique (ou clique de Shift sem âncora): de onde parte o Shift. */
  ancora: number | null;
}

export const SEM_SELECAO: EstadoDaSelecao = { lista: null, chaves: [], ancora: null };

export const chaveDaFaixa = (t: Pick<Track, 'source' | 'sourceId'>) => `${t.source}:${t.sourceId}`;

/** Ctrl+clique: junta ou tira esta; noutra lista, começa ali. */
export function alternar(s: EstadoDaSelecao, lista: string, faixas: readonly Track[], i: number): EstadoDaSelecao {
  const faixa = faixas[i];
  if (!faixa) return s;
  const k = chaveDaFaixa(faixa);
  if (s.lista !== lista) return { lista, chaves: [k], ancora: i };
  const chaves = s.chaves.includes(k) ? s.chaves.filter((c) => c !== k) : [...s.chaves, k];
  return chaves.length ? { lista, chaves, ancora: i } : SEM_SELECAO;
}

/** Shift+clique: da âncora até esta, juntas às que já estavam. Sem âncora, é um Ctrl+clique. */
export function intervalo(s: EstadoDaSelecao, lista: string, faixas: readonly Track[], i: number): EstadoDaSelecao {
  if (s.lista !== lista || s.ancora === null || !faixas[s.ancora]) return alternar(SEM_SELECAO, lista, faixas, i);
  const [de, ate] = s.ancora <= i ? [s.ancora, i] : [i, s.ancora];
  const chaves = new Set(s.chaves);
  for (let j = de; j <= Math.min(ate, faixas.length - 1); j++) chaves.add(chaveDaFaixa(faixas[j]!));
  return { lista, chaves: [...chaves], ancora: s.ancora };
}

/** Ctrl+A: a lista toda. */
export function todas(lista: string, faixas: readonly Track[]): EstadoDaSelecao {
  if (!faixas.length) return SEM_SELECAO;
  return { lista, chaves: [...new Set(faixas.map(chaveDaFaixa))], ancora: 0 };
}

/** As escolhidas que ainda estão na lista, pela ordem dela (e não pela ordem em que se escolheram). */
export function escolhidasPorOrdem(s: EstadoDaSelecao, lista: string, faixas: readonly Track[]): Track[] {
  if (s.lista !== lista || !s.chaves.length) return [];
  const chaves = new Set(s.chaves);
  const vistas = new Set<string>();
  return faixas.filter((t) => {
    const k = chaveDaFaixa(t);
    if (!chaves.has(k) || vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}

/** O que o clique faz: as teclas decidem se é escolher ou tocar. */
export function acaoDoClique(teclas: { ctrl?: boolean; meta?: boolean; shift?: boolean }, haEscolhidas: boolean):
  'alternar' | 'intervalo' | 'limpar' | 'tocar' {
  if (teclas.shift) return 'intervalo';
  if (teclas.ctrl || teclas.meta) return 'alternar';
  // Com escolhidas, um clique simples limpa-as e não toca: escapar o Ctrl a meio
  // de escolher dez não pode deitar a fila fora.
  return haEscolhidas ? 'limpar' : 'tocar';
}
