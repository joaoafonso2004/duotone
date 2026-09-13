import React, { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { CAPA_FLUTUANTE, deslocamentoDaCamada } from '../lib/capaFlutuante3D';

type Props = {
  size: number;
  enabled: boolean;
  showLyrics: boolean;
  turning: boolean;
  children: React.ReactNode;
};

// As mais fundas desenham-se primeiro. Ao contrário, a última placa escura
// tapava todas as gradações e a espessura parecia uma única sombra recortada.
const CAMADAS = Array.from({ length: CAPA_FLUTUANTE.camadas }, (_, i) => CAPA_FLUTUANTE.camadas - i);
const CURVA = Easing.bezier(0.45, 0, 0.55, 1);

/**
 * A pose exterior do cubo capa/letras.
 *
 * O cubo interior continua a fazer a rotação de 90 graus. Esta vista só lhe
 * dá a pose de objeto pousado no ar: perspetiva, espessura, sombra e uma
 * subida/descida contínua. Separar as duas transformações é o que impede o
 * gesto horizontal das letras de lutar com a flutuação.
 */
export function CapaFlutuante3D({ size, enabled, showLyrics, turning, children }: Props) {
  const reduced = useReducedMotion();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const flutuar = useRef(new Animated.Value(0)).current;
  const pose = useRef(new Animated.Value(enabled && !showLyrics ? 1 : 0)).current;
  const mostrarPose = enabled && !showLyrics && !turning;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const animacao = Animated.timing(pose, {
      toValue: mostrarPose ? 1 : 0,
      duration: mostrarPose ? 320 : 180,
      easing: CURVA,
      useNativeDriver: true,
    });
    animacao.start();
    return () => animacao.stop();
  }, [mostrarPose, pose]);

  useEffect(() => {
    flutuar.stopAnimation();
    if (!enabled || reduced || !foreground) {
      flutuar.setValue(0.5);
      return;
    }
    flutuar.setValue(0);
    const metade = CAPA_FLUTUANTE.cicloMs / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flutuar, { toValue: 1, duration: metade, easing: CURVA, useNativeDriver: true }),
        Animated.timing(flutuar, { toValue: 0, duration: metade, easing: CURVA, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [enabled, foreground, flutuar, reduced]);

  const altura = flutuar.interpolate({
    inputRange: [0, 1],
    outputRange: [-CAPA_FLUTUANTE.amplitude, CAPA_FLUTUANTE.amplitude],
  });
  const deslocacaoY = Animated.multiply(altura, pose);
  const opacidadeDaSombra = Animated.multiply(
    pose,
    flutuar.interpolate({ inputRange: [0, 1], outputRange: [0.34, 0.46] }),
  );

  return (
    <View style={{ width: size, height: size, overflow: 'visible' }}>
      {/* A sombra fica no plano do ecrã. Se rodasse com o objeto, pareceria
          uma segunda capa preta em vez de uma sombra projetada no fundo. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.sombra,
          {
            left: size * 0.14,
            top: size * 0.84,
            width: size * 0.72,
            opacity: opacidadeDaSombra,
            transform: [
              { translateY: flutuar.interpolate({ inputRange: [0, 1], outputRange: [8, 4] }) },
              { scaleX: flutuar.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.05] }) },
            ],
          },
        ]}
      />

      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            transform: [
              { perspective: CAPA_FLUTUANTE.perspective },
              { translateY: deslocacaoY },
              { rotateX: pose.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${CAPA_FLUTUANTE.rotateX}deg`] }) },
              { rotateY: pose.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${CAPA_FLUTUANTE.rotateY}deg`] }) },
              { rotateZ: pose.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${CAPA_FLUTUANTE.rotateZ}deg`] }) },
              { scale: pose.interpolate({ inputRange: [0, 1], outputRange: [1, CAPA_FLUTUANTE.scale] }) },
            ],
          },
        ]}
      >
        {/* O React Native não extruda vistas. Estas lâminas, cada uma um
            pouco atrás da anterior, formam a aresta esquerda/inferior que se
            vê na referência sem pôr outra imagem a brilhar por baixo. */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: pose }]}>
          {CAMADAS.map((indice) => {
            const { x, y } = deslocamentoDaCamada(indice);
            const tom = Math.max(7, 27 - indice * 2);
            return (
              <View
                key={indice}
                style={[
                  styles.camada,
                  {
                    backgroundColor: `rgb(${tom},${tom},${tom + 2})`,
                    transform: [{ translateX: x }, { translateY: y }],
                  },
                ]}
              />
            );
          })}
        </Animated.View>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  camada: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 20,
  },
  sombra: {
    position: 'absolute',
    height: 9,
    borderRadius: 999,
    backgroundColor: '#020203',
    shadowColor: '#000',
    shadowOpacity: 0.95,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
});
