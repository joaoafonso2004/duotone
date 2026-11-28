import type { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { Animated } from 'react-native';
import { create } from 'zustand';
import { ALTURA_DOS_SEPARADORES, medidaNova, modoDaDoca, rotasEmFoco, type ModoDaDoca } from '../lib/doca';

/**
 * A base de baixo do iPhone (3/10): o vidro e os separadores vivem no
 * `components/Doca.tsx`, a linha da música no `PlayerRoot`, e os dois leem
 * daqui o modo e as deslocações -- tudo no motor nativo.
 */

/** Quanto a linha da música desce (o PlayerRoot soma-o à dele). */
export const desvioDaMusica = new Animated.Value(0);
/** Quanto o vidro desce: com a música fechada, fica só a altura dos separadores. */
export const desvioDoVidro = new Animated.Value(0);
/** Quanto os separadores descem: saem nos ecrãs abertos por cima das secções. */
export const desvioDosIcones = new Animated.Value(0);

/**
 * O mini-player a deslizar para a direita para fechar (3/10, o PlayerRoot): o que
 * fica depois de largar (`deslizeDoMini`) e o dedo (`dedoDoMini`, escrito pelo
 * Gesture Handler no motor nativo). Aqui, e não no PlayerRoot, desde 28/11: a
 * cápsula de vidro da música (`components/Doca.tsx`) vai com a linha (o João:
 * "a barra do Liquid Glass deve ir também"); ficava vazia no sítio até a música sair.
 */
export const deslizeDoMini = new Animated.Value(0);
export const dedoDoMini = new Animated.Value(0);
/** O que se vê: os dois somados, só para a direita (era o `Math.max(0, dx)`). */
export const deslizeDoMiniVisto = Animated.add(deslizeDoMini, dedoDoMini).interpolate({
  inputRange: [0, 1], outputRange: [0, 1], extrapolateLeft: 'clamp', extrapolateRight: 'extend',
});

/** `position`: onde vai o pager, com o dedo (a cápsula do escolhido no Liquid Glass segue-o). */
type Separadores = Pick<MaterialTopTabBarProps, 'state' | 'navigation'> & Partial<Pick<MaterialTopTabBarProps, 'position'>>;

export const useDoca = create<{
  modo: ModoDaDoca;
  separadores: Separadores | null;
  alturaDosSeparadores: number;
  /**
   * A música está a sair (o deslize do mini-player, 3/10): o vidro desce JÁ,
   * ao mesmo tempo que a linha, e não depois de o fecho acabar.
   */
  aFechar: boolean;
}>(() => ({
  modo: 'separadores',
  separadores: null,
  alturaDosSeparadores: ALTURA_DOS_SEPARADORES,
  aFechar: false,
}));

/**
 * A altura dos separadores, MEDIDA na base (3/10, auditoria 1.3). Quem precisa
 * do espaço de baixo (o leitor, os avisos, o fim das listas) lê-a daqui em vez
 * de um 49 escrito à mão: com o texto grande, a barra cresce.
 */
export const useAlturaDosSeparadores = () => useDoca((s) => s.alturaDosSeparadores);

export function definirAlturaDosSeparadores(altura: number): void {
  const nova = medidaNova(useDoca.getState().alturaDosSeparadores, altura);
  if (nova !== null) useDoca.setState({ alturaDosSeparadores: nova });
}

/** Chamado a cada mudança da navegação (RootNavigator). */
export function atualizarDoca(estado: Parameters<typeof rotasEmFoco>[0]): void {
  const modo = modoDaDoca(rotasEmFoco(estado));
  if (useDoca.getState().modo !== modo) useDoca.setState({ modo });
}

/**
 * Os separadores são desenhados pela base e não pelo navegador: o vidro está
 * por cima dos ecrãs, e os botões têm de estar por cima do vidro. O navegador
 * dá-lhes o estado e a navegação por aqui (`BarraDeSeparadores`).
 */
export function publicarSeparadores(separadores: Separadores | null): void {
  useDoca.setState({ separadores });
}
