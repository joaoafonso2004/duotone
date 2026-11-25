import React, { useEffect, useRef } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { pedirFluidez } from '../state/fluidez';

/** Os tempos da maquete da pesquisa (`docs/maquetes-da-lista-2026-11-25.html#m16`). */
export const ENTRADA_EM_CASCATA = { atrasoMs: 120, passoMs: 35, duracaoMs: 420, desvio: 10 } as const;

/**
 * Uma linha que entra ao aparecer (25/11, item 16 do plano de melhorias): sobe
 * `desvio` pt e acende, com o atraso do lugar dela, para que uma lista que aparece
 * de repente (as pesquisas recentes) chegue uma a uma. Só ao montar; no driver
 * nativo; com Reduzir movimento, já no sítio.
 */
export function EntradaEmCascata({ indice, children, style }: { indice: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduzido = useReducedMotion();
  const v = useRef(new Animated.Value(reduzido ? 1 : 0)).current;
  useEffect(() => {
    if (reduzido) { v.setValue(1); return undefined; }
    const atraso = ENTRADA_EM_CASCATA.atrasoMs + Math.min(indice, 12) * ENTRADA_EM_CASCATA.passoMs;
    if (indice === 0) pedirFluidez(atraso + ENTRADA_EM_CASCATA.duracaoMs + 12 * ENTRADA_EM_CASCATA.passoMs);
    const a = Animated.timing(v, {
      toValue: 1, duration: ENTRADA_EM_CASCATA.duracaoMs, delay: atraso,
      easing: Easing.bezier(0.2, 0.9, 0.25, 1), useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
    // Só ao montar: uma linha que já entrou não volta a entrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View style={[style, {
      opacity: v,
      transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [ENTRADA_EM_CASCATA.desvio, 0] }) }],
    }]}>
      {children}
    </Animated.View>
  );
}

/**
 * O "Cancel" da pesquisa a entrar pela direita (item 16): desliza 24 pt e acende
 * com a mola ENTRADA, em vez de aparecer de repente ao lado da caixa.
 */
export function EntradaPelaDireita({ children }: { children: React.ReactNode }) {
  const reduzido = useReducedMotion();
  const v = useRef(new Animated.Value(reduzido ? 1 : 0)).current;
  useEffect(() => {
    if (reduzido) return undefined;
    pedirFluidez(600);
    const a = Animated.spring(v, { toValue: 1, stiffness: 190, damping: 22, mass: 1, useNativeDriver: true });
    a.start();
    return () => a.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View style={{ opacity: v, transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}
