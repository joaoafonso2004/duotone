import React from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useAparencia } from '../state/aparencia';

/**
 * O Liquid Glass do iOS 26 (27/11, pedido do João: "o liquid glass do iOS 26 para
 * a app, como opção na Customise; de origem vem como está").
 *
 * É o vidro do sistema (`UIGlassEffect`, pelo `expo-glass-effect`), e não uma
 * imitação: refrata o que está por baixo e reage ao toque. Só existe no iOS 26 com
 * um binário compilado com o SDK dele (o CI usa o Xcode 26); noutro sítio, ou num
 * binário sem o módulo, `temLiquidGlass` é falso, a opção não aparece na Customise,
 * e tudo fica como estava.
 */
export const temLiquidGlass: boolean = (() => {
  if (Platform.OS !== 'ios') return false;
  try { return isLiquidGlassAvailable(); } catch { return false; }
})();

/** A opção ligada E o vidro disponível neste iPhone. */
export function useVidro(): boolean {
  const ligado = useAparencia((s) => s.vidro);
  return ligado && temLiquidGlass;
}

/**
 * Uma peça de vidro: o fundo de quem a usa (os filhos vão por cima). `clear`, o
 * vidro transparente: vê-se o que passa por baixo, como na maquete
 * (`docs/personalizar-ao-vivo-maquete.html`). A 7.3.0 usava o `regular`, que no
 * escuro fica fosco e cinzento ("é suposto não ser transparente?", 28/11). O
 * `dark` só o escurece um pouco, para os nomes se lerem por cima das capas.
 */
export function Vidro({ style, children, interativo = false }: {
  style?: StyleProp<ViewStyle>; children?: React.ReactNode; interativo?: boolean;
}) {
  if (!temLiquidGlass) return <View style={style}>{children}</View>;
  return <GlassView glassEffectStyle="clear" colorScheme="dark" isInteractive={interativo} style={style}>{children}</GlassView>;
}
