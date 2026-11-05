import { useSyncExternalStore } from 'react';
import { useFotoDoArtista } from '../hooks/useVizinhancaDoArtista';
import { displayArtist } from '../lib/artistName';
import { fotoNoTamanho } from '../lib/catalogo';
import { fotoDoFundo, type DisposicaoEscolhida, type FundoDoLeitor } from '../lib/leitorDoPc';
import type { Track } from '../types';

/**
 * O layout e o fundo do Now Playing do PC (5/11, "Now Playing layout" e "Now
 * Playing background" nas Definições, em Appearance). De origem: o Classic e a
 * capa desfocada, como sempre foi. A casca lê as preferências ao arrancar
 * (`RootNavigator.web.tsx`) e as Definições mudam-nas ao vivo, no mesmo
 * processo: é a mesma pequena store dos dois tons e da capa de metal.
 */
let disposicao: DisposicaoEscolhida = 'classico';
let fundo: FundoDoLeitor = 'capa';
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());
const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };

export function definirDisposicaoDoLeitor(v: DisposicaoEscolhida): void {
  if (v === disposicao) return;
  disposicao = v;
  avisar();
}
export function definirFundoDoLeitor(v: FundoDoLeitor): void {
  if (v === fundo) return;
  fundo = v;
  avisar();
}
const lerDisposicao = () => disposicao;
const lerFundo = () => fundo;
export function useDisposicaoDoLeitor(): DisposicaoEscolhida {
  return useSyncExternalStore(assinar, lerDisposicao, lerDisposicao);
}
export function useFundoDoLeitor(): FundoDoLeitor {
  return useSyncExternalStore(assinar, lerFundo, lerFundo);
}

/**
 * A foto do artista para o fundo, já num tamanho que enche a janela, ou `null`
 * (fica a capa desfocada). É a mesma foto da página do artista, do catálogo.
 * Só se procura com "Artist photo" escolhido: com a capa, o nome vai vazio e
 * não há pedido nenhum (`fotoDoArtista('')` responde logo).
 */
export function useFotoDoFundo(track: Track | null | undefined): string | null {
  const escolhido = useFundoDoLeitor();
  const nome = escolhido === 'artista' && track ? displayArtist(track) : '';
  const foto = useFotoDoArtista(nome && nome !== 'Unknown artist' ? nome : '');
  const usada = fotoDoFundo(escolhido, foto);
  return usada ? fotoNoTamanho(usada, 1000) : null;
}
