import type { ReactNode } from 'react';
import type { View } from 'react-native';
import { mostrarPrevia } from '../state/previaDoMenu';
import { medirJa } from '../state/vooDoQuadrado';

/**
 * Segurar e levantar (25/11, item 2 do plano de melhorias): mede quem se segurou
 * (uma vista, ou o `currentTarget` do toque longo) e deixa a cópia dele para o
 * `MenuFlutuante` que abre a seguir a levantar. Sem medida (um binário sem o
 * `getBoundingClientRect`), o menu abre como sempre.
 *
 * `semFundo`: os cartões levantam-se como são (a capa e o nome), sem a placa das
 * linhas por trás.
 */
export function levantar(alvo: unknown, conteudo: ReactNode, opcoes?: { semFundo?: boolean }): void {
  const ret = medirJa((alvo ?? null) as View | null);
  if (ret) mostrarPrevia(ret, conteudo, opcoes);
}
