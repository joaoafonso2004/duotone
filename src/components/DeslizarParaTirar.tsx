import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';
import { hapticNotification } from '../lib/haptics';
import { colors } from '../theme';

/** Quanto é preciso puxar para a esquerda para tirar a linha. */
const LIMIAR = 96;

/**
 * Deslizar uma linha da fila para a esquerda tira-a (26/9). Só apanha gestos
 * CLARAMENTE horizontais para a esquerda: o toque simples continua a tocar a
 * música, o toque longo e a pega continuam a pegar para mudar de sítio, e o
 * deslize vertical continua a ser da lista. Largar antes do limiar volta ao
 * sítio. Desligado (`ativo=false`) num Jam e enquanto outra linha está pegada.
 */
export function DeslizarParaTirar({ ativo, aoTirar, children }: {
  ativo: boolean;
  aoTirar: () => void;
  children: React.ReactNode;
}) {
  const dx = useRef(new Animated.Value(0)).current;
  const ativoRef = useRef(ativo);
  ativoRef.current = ativo;
  const aoTirarRef = useRef(aoTirar);
  aoTirarRef.current = aoTirar;

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) =>
      ativoRef.current && g.dx < -12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderMove: (_e, g) => dx.setValue(Math.min(0, g.dx)),
    onPanResponderRelease: (_e, g) => {
      if (g.dx <= -LIMIAR) {
        hapticNotification();
        Animated.timing(dx, { toValue: -600, duration: 180, useNativeDriver: true }).start(() => {
          aoTirarRef.current();
          dx.setValue(0);
        });
      } else {
        Animated.spring(dx, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
      }
    },
    onPanResponderTerminate: () => Animated.spring(dx, { toValue: 0, useNativeDriver: true }).start(),
  }), [dx]);

  const fundo = dx.interpolate({ inputRange: [-LIMIAR, -24, 0], outputRange: [1, 0.4, 0], extrapolate: 'clamp' });

  return (
    <View>
      <Animated.View pointerEvents="none" style={[styles.fundo, { opacity: fundo }]}>
        <Ionicons name="trash-outline" size={18} color="#fff" />
        <Text style={styles.texto}>Remove</Text>
      </Animated.View>
      <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: dx }], backgroundColor: colors.surfaceHigh }}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fundo: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.danger, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'flex-end', gap: 6, paddingRight: 18, borderRadius: 10,
  },
  texto: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
