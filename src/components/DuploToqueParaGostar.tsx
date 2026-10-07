import React, { useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { pedirFluidez } from '../state/fluidez';
import { duploToque } from '../lib/duploToque';

/**
 * Dois toques na capa do leitor para gostar (7/10, iPhone), como no
 * Instagram: o coração salta por cima da capa. Só GOSTA -- nunca tira das
 * Liked Songs; para isso há o coração ao lado do título, que fica onde estava.
 *
 * Um toque sozinho não faz nada (a capa não tinha toque). É um `Pressable` na
 * face da frente: o arrasto lateral do cubo continua a ganhar-lhe no movimento
 * (o cubo captura no `onMoveShouldSetPanResponderCapture`), e o gesto de fechar
 * o leitor é do Gesture Handler, que corre antes. Fora da árvore de
 * acessibilidade: com o VoiceOver, dois toques são "ativar", e o coração ao
 * lado do título já diz o que faz.
 */
export function DuploToqueParaGostar({ aoGostar }: { aoGostar: () => void }) {
  const ultimo = useRef(0);
  const anim = useRef(new Animated.Value(0)).current;
  const tocar = () => {
    const agora = Date.now();
    if (!duploToque(ultimo.current, agora)) { ultimo.current = agora; return; }
    ultimo.current = 0;
    aoGostar();
    pedirFluidez(800);
    anim.stopAnimation();
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 720, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };
  const escala = anim.interpolate({ inputRange: [0, 0.22, 0.5, 1], outputRange: [0.3, 1.18, 1, 1.06] });
  const opacidade = anim.interpolate({ inputRange: [0, 0.12, 0.7, 1], outputRange: [0, 1, 1, 0] });
  return (
    <Pressable accessible={false} importantForAccessibility="no" onPress={tocar} style={StyleSheet.absoluteFill}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, estilos.centro, { opacity: opacidade, transform: [{ scale: escala }] }]}>
        <Ionicons name="heart" size={104} color="#fff" style={estilos.sombra} />
      </Animated.View>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  centro: { alignItems: 'center', justifyContent: 'center' },
  sombra: { textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 18, textShadowOffset: { width: 0, height: 4 } },
});
