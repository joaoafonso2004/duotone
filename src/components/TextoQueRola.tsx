import React, { useEffect, useMemo, useRef } from 'react';
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
export function TextoQueRola({ texto, style, atrasoMs = 0, rolarAoMontar = true }: {
  texto: string;
  style?: StyleProp<TextStyle>;
  /** Espera antes de rolar (a página do resumo entra primeiro). */
  atrasoMs?: number;
  /** `false`: ao aparecer já está no número, e só rola quando ele muda (a contagem de uma playlist). */
  rolarAoMontar?: boolean;
}) {
  const reduzido = useReducedMotion();
  const plano = StyleSheet.flatten(style) ?? {};
  const linha = plano.lineHeight ?? Math.round((plano.fontSize ?? 17) * 1.2);
  const bocados = useMemo(() => bocadosDoTexto(texto), [texto]);
  const algarismos = bocados.filter((b) => b.algarismo !== null);
  // Uma coluna por casa, a contar da direita, que dura entre textos: um número
  // que muda (18 → 19) roda a partir do que estava, e não do zero (25/11).
  const casas = useRef<Animated.Value[]>([]).current;
  const primeira = useRef(true);
  // Sem rolar ao montar, cada coluna nasce já no algarismo dela (27/11): nascia no
  // 0 e só o efeito a punha no sítio, depois de pintar -- um fotograma com "00 songs".
  const noSitio = primeira.current && !rolarAoMontar;
  while (casas.length < algarismos.length) {
    const k = casas.length;
    casas.push(new Animated.Value(noSitio ? -(algarismos[algarismos.length - 1 - k]?.algarismo ?? 0) * linha : 0));
  }

  useEffect(() => {
    if (reduzido) return undefined;
    const n = algarismos.length;
    const alvos = algarismos.map((b) => -(b.algarismo ?? 0) * linha);
    const semRolar = primeira.current && !rolarAoMontar;
    primeira.current = false;
    if (semRolar) { alvos.forEach((a, j) => casas[n - 1 - j].setValue(a)); return undefined; }
    pedirFluidez(duracaoDoRolar(texto) + atrasoMs + 100);
    // A casa das unidades (k = 0) parte primeiro; as da esquerda, depois.
    const animacoes = alvos.map((a, j) => {
      const k = n - 1 - j;
      return Animated.timing(casas[k], {
        toValue: a, duration: ROLAR.duracaoMs, delay: atrasoMs + k * ROLAR.atrasoPorAlgarismoMs, easing: CURVA, useNativeDriver: true,
      });
    });
    animacoes.forEach((a) => a.start());
    return () => { animacoes.forEach((a) => a.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, linha, reduzido]);

  if (reduzido) return <Text style={style}>{texto}</Text>;
  // As margens e o alinhamento são da linha inteira; a letra é de cada bocado.
  const { margin, marginTop, marginBottom, marginLeft, marginRight, marginVertical, marginHorizontal, alignSelf, textAlign: _alinhar, ...letra } = plano;
  const comNumeros: StyleProp<TextStyle> = [letra, { lineHeight: linha, fontVariant: ['tabular-nums'] }];
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={texto}
      style={[estilos.linha, { margin, marginTop, marginBottom, marginLeft, marginRight, marginVertical, marginHorizontal, alignSelf }]}>
      {bocados.map((b, i) => {
        if (b.algarismo === null) return <Text key={i} style={comNumeros} importantForAccessibility="no">{b.ch}</Text>;
        // A casa deste algarismo, a contar da direita.
        const k = algarismos.length - 1 - bocados.slice(0, i).filter((x) => x.algarismo !== null).length;
        return (
          <View key={`c${k}`} style={{ height: linha, overflow: 'hidden' }} importantForAccessibility="no-hide-descendants">
            <Animated.View style={{ transform: [{ translateY: casas[k] }] }}>
              {ALGARISMOS.map((d) => <Text key={d} style={comNumeros}>{d}</Text>)}
            </Animated.View>
          </View>
        );
      })}
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'flex-start' },
});
