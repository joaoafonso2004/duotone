import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { hapticNotification, hapticSelection } from '../lib/haptics';
import { useTheme } from '../state/theme';
import { pedirFluidez } from '../state/fluidez';

/** Quanto é preciso puxar para a direita para pôr na fila. */
export const LIMIAR_DA_FILA = 88;
/** Mais largo do que qualquer ecrã: a faixa de cor desliza atrás da linha. */
const LARGURA_DA_FAIXA = 640;

/**
 * Deslizar uma música para a DIREITA põe-na na fila (29/9), o gesto que quem vem
 * do Spotify já faz sem pensar. É o espelho do `DeslizarParaTirar` da fila (que
 * tira para a esquerda): só apanha gestos claramente horizontais para a
 * direita, e o toque, o toque longo e o scroll da lista continuam como estavam.
 *
 * A cor só existe na faixa que a linha destapa, e anda com ela: a linha é
 * transparente (por trás está o fundo desfocado da app), e uma cor por baixo
 * da linha inteira via-se através do texto. A linha não sai: volta ao sítio,
 * e o ícone passa a um visto com uma vibração -- no iPhone não há um aviso
 * global onde dizer "Added to queue". Sem `ativo`, não embrulha nada.
 */
export function DeslizarParaAFila({ ativo, aoPorNaFila, children }: {
  ativo: boolean;
  aoPorNaFila: () => void;
  children: React.ReactNode;
}) {
  const theme = useTheme((s) => s.theme);
  const dx = useRef(new Animated.Value(0)).current;
  const [feito, setFeito] = useState(false);
  const passou = useRef(false);
  const acaoRef = useRef(aoPorNaFila);
  acaoRef.current = aoPorNaFila;

  useEffect(() => {
    if (!feito) return;
    const t = setTimeout(() => setFeito(false), 700);
    return () => clearTimeout(t);
  }, [feito]);

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => g.dx > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderGrant: () => { passou.current = false; },
    onPanResponderMove: (_e, g) => {
      // Resiste depois do limiar, como uma mola: diz que já chega.
      const x = Math.max(0, g.dx);
      dx.setValue(x <= LIMIAR_DA_FILA ? x : LIMIAR_DA_FILA + (x - LIMIAR_DA_FILA) * 0.35);
      const agora = x >= LIMIAR_DA_FILA;
      if (agora !== passou.current) { passou.current = agora; if (agora) hapticSelection(); }
    },
    onPanResponderRelease: (_e, g) => {
      pedirFluidez(600);
      if (g.dx >= LIMIAR_DA_FILA) {
        hapticNotification();
        acaoRef.current();
        setFeito(true);
      }
      Animated.spring(dx, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
    },
    onPanResponderTerminate: () => Animated.spring(dx, { toValue: 0, useNativeDriver: true }).start(),
  }), [dx]);

  if (!ativo) return <>{children}</>;

  const faixa = { transform: [{ translateX: Animated.subtract(dx, LARGURA_DA_FAIXA) }] };
  const icone = dx.interpolate({ inputRange: [0, 40, LIMIAR_DA_FILA], outputRange: [0, 0.6, 1], extrapolate: 'clamp' });
  return (
    <View style={styles.caixa}>
      <Animated.View pointerEvents="none" style={[styles.faixa, { backgroundColor: theme.color }, faixa]}>
        <Animated.View style={{ opacity: icone, transform: [{ scale: icone }] }}>
          <Ionicons name={feito ? 'checkmark-circle' : 'list'} size={20} color={theme.textColorOnGradient} />
        </Animated.View>
      </Animated.View>
      <Animated.View
        {...pan.panHandlers}
        accessibilityActions={[{ name: 'addToQueue', label: 'Add to queue' }]}
        onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'addToQueue') acaoRef.current(); }}
        style={{ transform: [{ translateX: dx }] }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: { overflow: 'hidden' },
  faixa: {
    position: 'absolute', top: 0, bottom: 0, left: 0, width: LARGURA_DA_FAIXA,
    alignItems: 'flex-end', justifyContent: 'center', paddingRight: 22,
  },
});
