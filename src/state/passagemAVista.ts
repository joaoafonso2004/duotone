import { useSyncExternalStore } from 'react';
import type { AutomixAVista } from '../lib/duasLuas';
import type { Track } from '../types';

/**
 * A passagem que o motor anunciou, para quem a desenha (as Duas luas, C9). O motor só
 * diz quando começa, quanto dura e quando é desfeita: as luas andam sozinhas, no
 * motor nativo (iPhone) ou no compositor (PC), e não há nada a correr por fotograma.
 * Com o ecrã bloqueado ou o leitor fechado, isto é escrever um objeto e mais nada.
 */
export type PassagemAVista = {
  id: number;
  /** A faixa que sai. */
  de: string;
  para: Track;
  /** `Date.now()` do instante em que os volumes começam a cruzar. */
  comecaEm: number;
  duracaoMs: number;
  automix: AutomixAVista | null;
};

let atual: PassagemAVista | null = null;
let contador = 0;
let noEcra = false;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());
const ouvir = (f: () => void) => {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
};

export function anunciarPassagem(p: Omit<PassagemAVista, 'id'>): void {
  atual = { ...p, id: ++contador };
  avisar();
}

/** A passagem foi desfeita: um seek, uma pausa no AutoMix, outra música. */
export function desfazerPassagem(): void {
  if (!atual) return;
  atual = null;
  avisar();
}

/** As luas acabaram de se desenhar. */
export function esquecerPassagem(id: number): void {
  if (atual?.id !== id) return;
  atual = null;
  avisar();
}

export function usePassagemAVista(): PassagemAVista | null {
  return useSyncExternalStore(ouvir, () => atual);
}

/**
 * Há luas no ecrã. Quem anima a troca de música (o recuo da capa no iPhone, a
 * Ocultação no PC) fica quieto: a música já chegou à vista de todos.
 */
export const luasNoEcra = (): boolean => noEcra;

export function marcarLuasNoEcra(v: boolean): void {
  noEcra = v;
}
