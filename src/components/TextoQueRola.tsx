import React, { useEffect, useMemo } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { bocadosDoTexto, duracaoDoRolar, ROLAR } from '../lib/textoQueRola';
import { pedirFluidez } from '../state/fluidez';

const CURVA = Easing.bezier(0.16, 1, 0.3, 1);
const ALGARISMOS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Um número que rola como um conta-quilómetros (25/11, item 5 do plano): cada
 * algarismo roda do 0 até ao dele, da direita para a esquerda, e assenta devagar.
 * Serve qualquer texto com algarismos ("≈ 213 h 7 min", "87%", "1,204"): só os
 * algarismos rolam. Uma coluna de 0 a 9 por algarismo, com `translateY` no driver
 * nativo; volta a rolar quando o texto muda. Com Reduzir movimento, o texto parado.
 *
 * O `style` é o de um `Text`; a altura da linha sai do `lineHeight` dele (ou 1,2× a
 * letra), e os algarismos ficam de largura fixa (`tabular-nums`) para nada saltar.
 */
export function TextoQueRola({ texto, style }: { texto: string; style?: StyleProp<TextStyle> }) {
  const reduzido = useReducedMotion();
  const plano = StyleSheet.flatten(style) ?? {};
  const linha = plano.lineHeight ?? Math.round((plano.fontSize ?? 17) * 1.2);
  const bocados = useMemo(() => bocadosDoTexto(texto), [texto]);
  const valores = useMemo(() => bocados.map(() => new Animated.Value(0)), [bocados]);

  useEffect(() => {
    if (reduzido) return undefined;
    const colunas = bocados.map((b, i) => ({ b, v: valores[i] })).filter(({ b }) => b.algarismo !== null);
    pedirFluidez(duracaoDoRolar(texto) + 100);
    const animacoes = colunas.reverse().map(({ b, v }, k) => Animated.timing(v, {
      toValue: -(b.algarismo ?? 0) * linha,
      duration: ROLAR.duracaoMs,
      delay: k * ROLAR.atrasoPorAlgarismoMs,
      easing: CURVA,
      useNativeDriver: true,
    }));
    animacoes.forEach((a) => a.start());
    return () => { animacoes.forEach((a) => a.stop()); };
  }, [bocados, valores, linha, reduzido, texto]);

  if (reduzido) return <Text style={style}>{texto}</Text>;
  // As margens e o alinhamento são da linha inteira; a letra é de cada bocado.
  const { margin, marginTop, marginBottom, marginLeft, marginRight, marginVertical, marginHorizontal, alignSelf, textAlign: _alinhar, ...letra } = plano;
  const comNumeros: StyleProp<TextStyle> = [letra, { lineHeight: linha, fontVariant: ['tabular-nums'] }];
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={texto}
      style={[estilos.linha, { margin, marginTop, marginBottom, marginLeft, marginRight, marginVertical, marginHorizontal, alignSelf }]}>
      {bocados.map((b, i) => (b.algarismo === null
        ? <Text key={i} style={comNumeros} importantForAccessibility="no">{b.ch}</Text>
        : (
          <View key={i} style={{ height: linha, overflow: 'hidden' }} importantForAccessibility="no-hide-descendants">
            <Animated.View style={{ transform: [{ translateY: valores[i] }] }}>
              {ALGARISMOS.map((d) => <Text key={d} style={comNumeros}>{d}</Text>)}
            </Animated.View>
          </View>
        )))}
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'flex-start' },
});
