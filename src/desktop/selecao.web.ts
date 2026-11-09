import { create } from 'zustand';
import { SEM_SELECAO, type EstadoDaSelecao } from '../lib/selecaoDeFaixas';
import type { Track } from '../types';
import type { PontoNoEcra } from './MenuDeContexto.web';

/** Tirar as escolhidas de onde estão (as Liked Songs, uma playlist tua): só as listas que podem. */
export type RemoverVarias = { rotulo: string; fazer: (faixas: Track[]) => Promise<void> };

/**
 * As músicas escolhidas no PC (9/11): numa lista de cada vez. A tabela
 * (`TrackTable`) escreve aqui; a barra flutuante (`BarraDaSelecao`) e o menu do
 * botão direito leem. As regras estão em `lib/selecaoDeFaixas.ts`.
 */
export const useSelecao = create<EstadoDaSelecao & {
  /** As escolhidas, pela ordem da lista. */
  faixas: Track[];
  /** Se a lista deixa tirá-las (as Liked Songs, uma playlist tua). */
  remover: RemoverVarias | null;
  /** O botão direito numa escolhida: o menu para todas, onde está o rato. */
  menu: PontoNoEcra | null;
  /** As Liked Songs não oferecem "Like". */
  saoGostadas: boolean;
  definir: (s: EstadoDaSelecao, faixas: Track[], extra: { remover: RemoverVarias | null; saoGostadas: boolean }) => void;
  abrirMenu: (onde: PontoNoEcra) => void;
  fecharMenu: () => void;
  limpar: () => void;
}>((set) => ({
  ...SEM_SELECAO,
  faixas: [],
  remover: null,
  menu: null,
  saoGostadas: false,
  definir: (s, faixas, extra) => set(s.chaves.length && faixas.length
    ? { ...s, faixas, ...extra }
    : { ...SEM_SELECAO, faixas: [], remover: null, menu: null, saoGostadas: false }),
  abrirMenu: (onde) => set({ menu: onde }),
  fecharMenu: () => set({ menu: null }),
  limpar: () => set({ ...SEM_SELECAO, faixas: [], remover: null, menu: null, saoGostadas: false }),
}));
