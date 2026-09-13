import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { CAPA_FLUTUANTE, profundidadeDaFatia, tonsDaFatia } from '../lib/capaFlutuante3D';

type Props = {
  size: number;
  enabled: boolean;
  children: React.ReactNode;
};

/** Da mais funda para a mais perto da face: é por esta ordem que se desenham. */
const FATIAS = Array.from({ length: CAPA_FLUTUANTE.fatias }, (_, i) => i);
const CURVA = Easing.bezier(0.45, 0, 0.55, 1);
/** Translação em Z pelo truque do cubo das letras: os motores nativos só expõem X e Y. */
const profundidade = (z: number) => [{ rotateY: '90deg' }, { translateX: -z }, { rotateY: '-90deg' }];

/**
 * A capa como um objeto fino suspenso no ar -- ver `lib/capaFlutuante3D.ts`.
 *
 * Três coisas, todas irmãs e todas com a MESMA pose (a lista de transformações
 * de cada uma começa igual):
 *
 * 1. as fatias da espessura, da mais funda para a da frente, com a sombra
 *    presa à do fundo -- assim a sombra tem a silhueta da capa e acompanha-a;
 * 2. a face, que é o cubo capa/letras, sem mudar nada dentro dele.
 *
 * Irmãs, e não umas dentro das outras: no iPhone uma vista com transformação 3D
 * achata o que tem dentro antes de rodar, e uma fatia lá dentro deixava de ter
 * profundidade nenhuma.
 *
 * O cubo continua a fazer a sua volta de 90 graus por dentro da face, e a pose
 * não muda durante o swipe: capa e letras são a frente do mesmo objeto.
 */
export function CapaFlutuante3D({ size, enabled, children }: Props) {
  const reduced = useReducedMotion();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const flutuar = useRef(new Animated.Value(0.5)).current;
  const pose = useRef(new Animated.Value(enabled ? 1 : 0)).current;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const animacao = Animated.timing(pose, {
      toValue: enabled ? 1 : 0,
      duration: enabled ? 320 : 180,
      easing: CURVA,
      useNativeDriver: true,
    });
    animacao.start();
    return () => animacao.stop();
  }, [enabled, pose]);

  // A flutuação: muito subtil, parada com Reduzir movimento e em segundo plano.
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

  const c = CAPA_FLUTUANTE;
  const ate = (fim: number) => pose.interpolate({ inputRange: [0, 1], outputRange: [0, fim] });
  const angulo = (graus: number) => pose.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${graus}deg`] });
  const noAr = Animated.multiply(
    flutuar.interpolate({ inputRange: [0, 1], outputRange: [-c.amplitude, c.amplitude] }),
    pose,
  );
  // A pose inteira, por esta ordem -- a mesma de `projetar` no lib, que é o que
  // o teste confere contra a referência.
  const postura = [
    { perspective: c.perspectiva * size },
    { translateX: ate(c.deslocacaoX * size) },
    { translateY: Animated.add(ate(c.deslocacaoY * size), noAr) },
    { rotateX: angulo(c.rotateX) },
    { rotateY: angulo(c.rotateY) },
    { rotateZ: angulo(c.rotateZ) },
    { scale: pose.interpolate({ inputRange: [0, 1], outputRange: [1, c.scale] }) },
  ];
  const espessura = c.espessura * size;

  return (
    <View style={{ width: size, height: size, overflow: 'visible' }}>
      {FATIAS.map((indice) => {
        const transform = [...postura, ...profundidade(profundidadeDaFatia(indice, c.fatias, espessura))];
        // A do fundo leva a sombra. Sem `overflow: hidden` e sem filhos: no iOS
        // recortar a camada apaga-lhe a sombra.
        if (indice === 0) {
          return (
            <Animated.View
              key={indice}
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                styles.fundo,
                {
                  borderRadius: c.raio,
                  opacity: pose,
                  shadowRadius: size * 0.07,
                  shadowOffset: { width: size * 0.015, height: size * 0.08 },
                  transform,
                },
              ]}
            />
          );
        }
        return (
          <Animated.View
            key={indice}
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { borderRadius: c.raio, overflow: 'hidden', opacity: pose, transform }]}
          >
            <LinearGradient
              colors={tonsDaFatia(indice, c.fatias)}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        );
      })}

      <Animated.View style={[StyleSheet.absoluteFill, { transform: postura }]}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fundo: {
    backgroundColor: '#070708',
    shadowColor: '#000',
    shadowOpacity: 0.6,
  },
});
