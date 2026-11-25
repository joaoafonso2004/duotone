import type { ReactNode } from 'react';
import type { Retangulo } from '../lib/vooDoQuadrado';

/**
 * Segurar e levantar (25/11, item 2 do plano de melhorias,
 * `docs/premium-ios-maquete.html#levantar`): quem se segura (uma linha) deixa
 * aqui onde está e uma cópia de si, mesmo antes de abrir o menu; o
 * `MenuFlutuante` que abre a seguir levanta essa cópia por cima do desfoque.
 *
 * Só vale para o menu que abre JÁ a seguir (`VALIDADE_MS`): uma cópia esquecida
 * não pode aparecer num menu que se abra mais tarde por outra porta.
 */
export type PreviaDoMenu = { ret: Retangulo; conteudo: ReactNode; em: number };

const VALIDADE_MS = 800;
let pendente: PreviaDoMenu | null = null;

export function mostrarPrevia(ret: Retangulo, conteudo: ReactNode): void {
  pendente = { ret, conteudo, em: Date.now() };
}

/** O menu que abre leva a cópia (uma vez); depois dele, ninguém. */
export function levarPrevia(agora: number = Date.now()): PreviaDoMenu | null {
  const p = pendente;
  pendente = null;
  return p && agora - p.em <= VALIDADE_MS ? p : null;
}
