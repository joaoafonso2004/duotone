import React, { useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  PanGestureHandler, State, type PanGestureHandlerGestureEvent, type PanGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import { colors, radii } from '../theme';
import { hapticSelection } from '../lib/haptics';

const BOLA = 26;

/**
 * Uma barra que se arrasta (28/11, a opacidade do Liquid Glass na Customise: o
 * João pediu "uma dragable bar"). Como as bandas do equalizador: o dedo é do
 * Gesture Handler, que ativa ao primeiro ponto e não deixa a página rolar por
 * baixo; tocar sem arrastar também acerta o valor. Anda aos `passo`, com um toque
 * a cada um, e o valor vai à direita.
 */
export function Deslizador({ valor, min = 0, max = 100, passo = 5, rotulo, formatar, aoMudar }: {
  valor: number;
  min?: number;
  max?: number;
  passo?: number;
  /** Para o VoiceOver. */
  rotulo: string;
  formatar: (v: number) => string;
  aoMudar: (v: number) => void;
}) {
  const larguraRef = useRef(0);
  const ultimoRef = useRef(valor);
  ultimoRef.current = valor;
  const aoMudarRef = useRef(aoMudar);
  aoMudarRef.current = aoMudar;
  const inicioRef = useRef(0);

  const aplicar = (x: number) => {
    const w = larguraRef.current - BOLA;
    if (w <= 0) return;
    const f = Math.max(0, Math.min(1, (x - BOLA / 2) / w));
    const novo = Math.round((min + f * (max - min)) / passo) * passo;
    if (novo === ultimoRef.current) return;
    ultimoRef.current = novo;
    hapticSelection();
    aoMudarRef.current(novo);
  };
  const aoMudarDeEstado = useMemo(() => (e: PanGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.state === State.BEGAN) {
      inicioRef.current = e.nativeEvent.x;
      aplicar(inicioRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const aoArrastar = useMemo(() => (e: PanGestureHandlerGestureEvent) => {
    aplicar(inicioRef.current + e.nativeEvent.translationX);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const f = max > min ? (Math.min(max, Math.max(min, valor)) - min) / (max - min) : 0;
  return (
    <View style={styles.linha}>
      <PanGestureHandler minDist={0} onHandlerStateChange={aoMudarDeEstado} onGestureEvent={aoArrastar}>
        <View
          collapsable={false}
          onLayout={(e) => { larguraRef.current = e.nativeEvent.layout.width; }}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={rotulo}
          accessibilityValue={{ min, max, now: valor, text: formatar(valor) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => {
            const p = e.nativeEvent.actionName === 'increment' ? passo : e.nativeEvent.actionName === 'decrement' ? -passo : 0;
            const novo = Math.max(min, Math.min(max, valor + p));
            if (!p || novo === valor) return;
            hapticSelection();
            aoMudarRef.current(novo);
          }}
          style={styles.pista}
        >
          <View style={styles.fundo} />
          <View style={[styles.cheio, { width: `${f * 100}%` }]} />
          <View style={[styles.bola, { left: `${f * 100}%`, marginLeft: -BOLA * f }]} />
        </View>
      </PanGestureHandler>
      <Text style={styles.valor}>{formatar(valor)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pista: { flex: 1, height: 36, justifyContent: 'center' },
  fundo: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: radii.pill, backgroundColor: colors.border },
  cheio: { position: 'absolute', left: 0, height: 4, borderRadius: radii.pill, backgroundColor: colors.text },
  bola: {
    position: 'absolute', width: BOLA, height: BOLA, borderRadius: BOLA / 2, backgroundColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  valor: { minWidth: 42, textAlign: 'right', fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'], color: colors.textSecondary },
});
