import type React from 'react';
import { AnimatedLegendList } from '@legendapp/list/animated';

/**
 * A Legend List animada (16/11, @legendapp/list), com o tipo das linhas.
 *
 * Porque esta e não a FlatList nas listas longas do iPhone (as Liked Songs, uma
 * playlist): reaproveita os contentores das linhas em vez de montar e desmontar
 * a cada ecrã rolado, mede o cabeçalho ela própria, e a rolar depressa não deixa
 * espaços em branco. É JavaScript puro: não pede uma build nova.
 *
 * A versão animada é a de sempre do React Native (`createAnimatedComponent`),
 * por isso o `Animated.event` nativo do título que encolhe continua a funcionar
 * (a lista expõe o `getScrollableNode`). O `createAnimatedComponent` perde o
 * tipo genérico das linhas: devolve-se aqui.
 */
type Props<T> = Omit<React.ComponentProps<typeof AnimatedLegendList>, 'data' | 'renderItem' | 'keyExtractor' | 'getFixedItemSize'> & {
  data: readonly T[];
  renderItem: (info: { item: T; index: number }) => React.ReactNode;
  keyExtractor?: (item: T, index: number) => string;
  /** Todas da mesma altura: posições exatas sem medir. */
  getFixedItemSize?: (item: T, index: number) => number | undefined;
  ref?: React.Ref<any>;
};

export const ListaAnimada = AnimatedLegendList as unknown as <T>(props: Props<T>) => React.ReactElement;
