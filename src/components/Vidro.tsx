import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { fundoDoVidro } from '../lib/vidroDaBase';
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
 * Uma peça de vidro: o fundo de quem a usa (os filhos vão por cima).
 *
 * O vidro é o `clear`, o transparente, como na maquete
 * (`docs/personalizar-ao-vivo-maquete.html`), e em modo CLARO (28/11, depois da
 * 7.3.2: "continua baço"): no iOS 26 o vidro em modo escuro sai cinzento e
 * lamacento no aparelho (um relato nos fóruns da Apple, que a Apple reproduziu), e
 * a 7.3.0 a 7.3.2 tinham-no escuro. O quanto se vê através é do João: a opacidade
 * da Customise põe um fundo escuro POR BAIXO do vidro (`fundoDoVidro`), a camada
 * que a Apple recomenda por baixo do vidro transparente, e o vidro mostra-o com o
 * rebordo e a refração por cima. Por baixo e não por cima: por cima tapava o rebordo.
 *
 * O raio vai no próprio vidro e no fundo, nunca numa vista de fora com `overflow`
 * (cortado, o vidro perde o rebordo).
 */
export function Vidro({ style, children, interativo = false }: {
  style?: StyleProp<ViewStyle>; children?: React.ReactNode; interativo?: boolean;
}) {
  const opacidade = useAparencia((s) => s.opacidadeDoVidro);
  if (!temLiquidGlass) return <View style={style}>{children}</View>;
  const raio = StyleSheet.flatten(style)?.borderRadius;
  const forma = { borderRadius: raio, borderCurve: 'continuous' as const };
  const fundo = fundoDoVidro(opacidade);
  return (
    <View style={style}>
      {fundo ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, forma, { backgroundColor: fundo }]} /> : null}
      <GlassView glassEffectStyle="clear" colorScheme="light" isInteractive={interativo} style={[StyleSheet.absoluteFill, forma]} />
      {children}
    </View>
  );
}
