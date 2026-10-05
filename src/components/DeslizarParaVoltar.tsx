// O modal do chat não herda o gesto da navegação. O reconhecedor nativo
// funciona dentro da FlatList sem depender de cada movimento no JavaScript.
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, useWindowDimensions } from 'react-native';
import { PanGestureHandler, State, type PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { useReducedMotion } from '../hooks/useReducedMotion';

export function DeslizarParaVoltar({ aoVoltar, children }: { aoVoltar: () => void; children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const reduzido = useReducedMotion();
  const dedo = useRef(new Animated.Value(0)).current;
  const fechar = useRef(aoVoltar), aSair = useRef(false);
  fechar.current = aoVoltar;
  useEffect(() => {
    aSair.current = false;
    return () => { aSair.current = true; dedo.stopAnimation(); };
  }, [dedo]);
  const dx = useMemo(() => dedo.interpolate({ inputRange: [0, width], outputRange: [0, width], extrapolate: 'clamp' }), [dedo, width]);
  const aoMexer = useMemo(() => Animated.event([{ nativeEvent: { translationX: dedo } }], { useNativeDriver: true }), [dedo]);
  const aoLargar = ({ nativeEvent: e }: PanGestureHandlerStateChangeEvent) => {
    if (aSair.current || (e.state !== State.END && e.state !== State.CANCELLED && e.state !== State.FAILED)) return;
    if (e.state === State.END && (e.translationX >= 72 || (e.translationX >= 20 && e.velocityX >= 650))) {
      aSair.current = true;
      if (reduzido) { fechar.current(); return; }
      Animated.timing(dedo, { toValue: width, duration: 160, useNativeDriver: true }).start(({ finished }) => {
        if (finished) fechar.current();
      });
    } else {
      Animated.spring(dedo, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
    }
  };
  return <PanGestureHandler activeOffsetX={16} failOffsetY={[-12, 12]} maxPointers={1}
    hitSlop={{ left: 0, width: 32 }} onGestureEvent={aoMexer} onHandlerStateChange={aoLargar}>
    <Animated.View style={[styles.body, { transform: [{ translateX: dx }] }]}>{children}</Animated.View>
  </PanGestureHandler>;
}
const styles = StyleSheet.create({ body: { flex: 1, minHeight: 0, width: '100%' } });
