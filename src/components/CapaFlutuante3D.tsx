import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Easing, Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { CAPA_FLUTUANTE } from '../lib/capaFlutuante3D';

// Os materiais saem de scripts/gerar-materiais-da-capa.py.
const GRAO: ImageSourcePropType = require('../../assets/capa3d-grao.png');
const SOMBRA_AMBIENTE: ImageSourcePropType = require('../../assets/capa3d-sombra-ambiente.png');
const SOMBRA_DE_CONTACTO: ImageSourcePropType = require('../../assets/capa3d-sombra-contacto.png');

const CURVA = Easing.bezier(0.45, 0, 0.55, 1);

/**
 * A pose inteira, por esta ordem -- a mesma de `projetar` no lib, que é o que o
 * teste confere contra a referência. Cada face da caixa começa a sua lista de
 * transformações por aqui.
 */
function criarPostura(pose: Animated.Value, flutuar: Animated.Value, size: number) {
  const c = CAPA_FLUTUANTE;
  const ate = (fim: number) => pose.interpolate({ inputRange: [0, 1], outputRange: [0, fim] });
  const angulo = (graus: number) => pose.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${graus}deg`] });
  // flutuar a 0 é a capa em cima, a 1 em baixo.
  const noAr = Animated.multiply(
    flutuar.interpolate({ inputRange: [0, 1], outputRange: [-c.amplitude, c.amplitude] }),
    pose,
  );
  return [
    { perspective: c.perspectiva * size },
    { translateX: ate(c.deslocacaoX * size) },
    { translateY: Animated.add(ate(c.deslocacaoY * size), noAr) },
    { rotateX: angulo(c.rotateX) },
    { rotateY: angulo(c.rotateY) },
    { rotateZ: angulo(c.rotateZ) },
    { scale: pose.interpolate({ inputRange: [0, 1], outputRange: [1, c.scale] }) },
  ];
}

/** O que o cubo capa/letras precisa para se desenhar como caixa. */
export type PoseDaCapa3D = {
  postura: ReturnType<typeof criarPostura>;
  /** 0 = plana, 1 = em 3D: a opacidade das laterais. */
  pose: Animated.Value;
  /** Em pontos. */
  espessura: number;
  grao: { fonte: ImageSourcePropType; opacidade: number };
};

type Props = {
  size: number;
  enabled: boolean;
  /**
   * O cubo capa/letras. Recebe a pose quando o 3D está ligado, e desenha-se
   * então como caixa (ver `ArtworkLyricsCube`); sem ela, é o cubo de sempre.
   */
  children: (pose3D: PoseDaCapa3D | null) => React.ReactNode;
};

/**
 * A capa como um objeto fino suspenso no ar -- ver `lib/capaFlutuante3D.ts`.
 *
 * Isto desenha o que vive no PLANO DO FUNDO -- a sombra larga e a de contacto,
 * que se dissolvem nele e respiram com a flutuação -- e entrega a pose ao cubo.
 * A caixa (face, verso e laterais) é o cubo que a desenha, porque é ele que tem
 * o gesto: virar para as letras roda a caixa inteira.
 *
 * Nada aqui fica à volta do cubo numa vista que roda: no iPhone isso achatava
 * as faces antes de rodar, e a caixa perdia a profundidade.
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
  // Estáveis entre renders: o leitor volta a desenhar a cada segundo da música,
  // e refazer as interpolações a cada vez era religar o grafo nativo por nada.
  const postura = useMemo(() => criarPostura(pose, flutuar, size), [pose, flutuar, size]);
  const pose3D = useMemo<PoseDaCapa3D | null>(
    () => (enabled
      ? { postura, pose, espessura: c.espessura * size, grao: { fonte: GRAO, opacidade: c.grao.opacidade } }
      : null),
    [enabled, postura, pose, size, c.espessura, c.grao.opacidade],
  );
  const sombras = useMemo(() => {
    const a = c.sombraAmbiente, k = c.sombraDeContacto;
    return {
      ambiente: {
        left: a.x * size, top: a.y * size, width: a.largura * size, height: a.altura * size,
        opacity: Animated.multiply(pose, flutuar.interpolate({ inputRange: [0, 1], outputRange: [a.opacidade * 0.85, a.opacidade] })),
        transform: [{ scaleX: flutuar.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1] }) }],
      },
      // Mais clara e mais pequena quando a capa sobe: é isso que vende a altura.
      contacto: {
        left: k.x * size, top: k.y * size, width: k.largura * size, height: k.altura * size,
        opacity: Animated.multiply(pose, flutuar.interpolate({ inputRange: [0, 1], outputRange: [k.opacidade * 0.55, k.opacidade] })),
        transform: [
          { rotate: `${k.rotacao}deg` },
          { scale: flutuar.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
        ],
      },
    };
  }, [pose, flutuar, size, c.sombraAmbiente, c.sombraDeContacto]);

  return (
    <View style={{ width: size, height: size, overflow: 'visible' }}>
      <Animated.View pointerEvents="none" style={[styles.sombra, sombras.ambiente]}>
        <Image source={SOMBRA_AMBIENTE} resizeMode="stretch" style={styles.cheia} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.sombra, sombras.contacto]}>
        <Image source={SOMBRA_DE_CONTACTO} resizeMode="stretch" style={styles.cheia} />
      </Animated.View>
      {children(pose3D)}
    </View>
  );
}

const styles = StyleSheet.create({
  sombra: { position: 'absolute' },
  cheia: { width: '100%', height: '100%' },
});
