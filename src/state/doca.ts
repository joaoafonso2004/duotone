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

type Separadores = Pick<MaterialTopTabBarProps, 'state' | 'navigation'>;

export const useDoca = create<{ modo: ModoDaDoca; separadores: Separadores | null; alturaDosSeparadores: number }>(() => ({
  modo: 'separadores',
  separadores: null,
  alturaDosSeparadores: ALTURA_DOS_SEPARADORES,
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
