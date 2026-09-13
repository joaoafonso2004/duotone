import MaskedView from '@react-native-masked-view/masked-view';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { CAPA_FLUTUANTE, profundidadeDaFatia, tonsDaFatia } from '../lib/capaFlutuante3D';

type Props = {
  size: number;
  enabled: boolean;
  /** A capa, para a luz que ela deixa no fundo. Sem ela, fica só a sombra. */
  artwork?: string | null;
  children: React.ReactNode;
};

/** Da mais funda para a mais perto da face: é por esta ordem que se desenham. */
const FATIAS = Array.from({ length: CAPA_FLUTUANTE.fatias }, (_, i) => i);
const CURVA = Easing.bezier(0.45, 0, 0.55, 1);
/** Translação em Z pelo truque do cubo das letras: os motores nativos só expõem X e Y. */
const profundidade = (z: number) => [{ rotateY: '90deg' }, { translateX: -z }, { rotateY: '-90deg' }];
/** Acende no meio e apaga-se nas pontas: a máscara da luz e da sombra. */
const RAMPA = ['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,1)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0)'] as const;
const PARAGENS = [0, 0.22, 0.5, 0.78, 1] as const;

type EstiloAnimado = React.ComponentProps<typeof Animated.View>['style'];

/**
 * Uma mancha sem bordos: duas rampas cruzadas como máscara (horizontal por fora,
 * vertical por dentro). É o que deixa a luz e a sombra DISSOLVER-SE no fundo,
 * em vez de terminarem num retângulo.
 */
function Difusa({ style, children }: { style: EstiloAnimado; children: React.ReactNode }) {
  return (
    <Animated.View pointerEvents="none" style={style}>
      <MaskedView
        style={StyleSheet.absoluteFill}
        maskElement={<LinearGradient colors={RAMPA} locations={PARAGENS} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />}
      >
        <MaskedView
          style={StyleSheet.absoluteFill}
          maskElement={<LinearGradient colors={RAMPA} locations={PARAGENS} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />}
        >
          {children}
        </MaskedView>
      </MaskedView>
    </Animated.View>
  );
}

/**
 * A capa como um objeto fino suspenso no ar -- ver `lib/capaFlutuante3D.ts`.
 *
 * Por ordem, de trás para a frente, todas irmãs:
 *
 * 1. **a luz**: a própria capa desfocada, no plano do fundo, a sair por trás e
 *    sobretudo por baixo dela. É o que faz a capa pertencer à página em vez de
 *    estar colada por cima;
 * 2. **a sombra**: larga e difusa, também no plano do fundo, mais clara e mais
 *    aberta quando a capa sobe. Não é um drop-shadow preso à capa -- esse
 *    recortava-a do fundo;
 * 3. **as fatias da espessura**, com a mesma pose da face;
 * 4. **a face**, que é o cubo capa/letras, sem mudar nada dentro dele. A arte
 *    não é tocada: só rodada.
 *
 * Irmãs, e não umas dentro das outras: no iPhone uma vista com transformação 3D
 * achata o que tem dentro antes de rodar, e uma fatia lá dentro deixava de ter
 * profundidade nenhuma. A pose não muda no swipe para as letras.
 */
export function CapaFlutuante3D({ size, enabled, artwork, children }: Props) {
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
  // flutuar a 0 é a capa em cima, a 1 em baixo.
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
      {/* A luz: a capa desfocada, um véu claro por baixo dela para o fundo nunca
          ficar preto chapado, e bordos que se dissolvem. Não passa muito da
          caixa: por cima está o cabeçalho e por baixo o título. */}
      <Difusa
        style={{
          position: 'absolute',
          left: -size * 0.2,
          top: -size * 0.08,
          width: size * 1.4,
          height: size * 1.2,
          opacity: Animated.multiply(pose, c.luz.opacidade),
        }}
      >
        <View style={[StyleSheet.absoluteFill, styles.veuDeLuz]} />
        {artwork ? (
          <Image
            source={{ uri: artwork }}
            blurRadius={c.luz.desfoque}
            contentFit="cover"
            style={[StyleSheet.absoluteFill, styles.luzDaCapa]}
          />
        ) : null}
      </Difusa>

      {/* A sombra, no fundo, por baixo do bordo mais baixo da capa. */}
      <Difusa
        style={{
          position: 'absolute',
          left: size * 0.03,
          top: size * 0.78,
          width: size * 1.04,
          height: size * 0.34,
          opacity: Animated.multiply(
            pose,
            flutuar.interpolate({ inputRange: [0, 1], outputRange: [c.sombra.opacidade * 0.78, c.sombra.opacidade] }),
          ),
          transform: [{ scaleX: flutuar.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1] }) }],
        }}
      >
        <View style={[StyleSheet.absoluteFill, styles.sombra]} />
      </Difusa>

      {FATIAS.map((indice) => (
        <Animated.View
          key={indice}
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: c.raio,
              overflow: 'hidden',
              opacity: pose,
              transform: [...postura, ...profundidade(profundidadeDaFatia(indice, c.fatias, espessura))],
            },
          ]}
        >
          <LinearGradient
            colors={tonsDaFatia(indice, c.fatias)}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ))}

      <Animated.View style={[StyleSheet.absoluteFill, { transform: postura }]}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  veuDeLuz: { backgroundColor: 'rgba(255,255,255,0.07)' },
  luzDaCapa: { opacity: 0.75 },
  sombra: { backgroundColor: '#000' },
});
