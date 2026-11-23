import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { DEGRAU_DO_REFLEXO_MS, OPACIDADE_DO_REFLEXO, voltaDoDisco } from '../lib/luz';
import { SOLTAR } from '../lib/movimento';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { pedirFluidez } from '../state/fluidez';

/**
 * O play do iPhone como o do PC: um disco de metal escovado com o laço de luz
 * (23/11, o João: "o que quero realmente é o metálico com o efeito das luzes").
 * O mesmo desenho do `desktop/DiscoDeMetal.web.ts`, em três camadas:
 *
 *  - o metal: claro em cima e escuro em baixo, como um botão de alumínio sob uma
 *    luz de tecto (no PC é um gradiente radial; aqui o `LinearGradient`, com as
 *    mesmas três cores e as arestas acesas em cima e escuras em baixo);
 *  - o laço: o PNG do `scripts/gerar-reflexo-do-disco.py` ("o PNG fica para o
 *    iPhone"), branco com alfa, por cima do metal a 60 % e em `screen`;
 *  - o ícone, por cima.
 *
 * O laço roda como no PC, e só quando o play MUDA (nunca ao montar, nem entre
 * músicas): na pausa trava como um prato de gira-discos, meia volta a perder
 * velocidade (o travão); no play arranca, um quarto de volta com ressalto (a mola
 * SOLTAR). Sempre no mesmo sentido, a partir de onde está. Roda no driver nativo
 * (`transform`, nada desenhado por fotograma), com a fluidez pedida (120 Hz). Com
 * menos movimento muda de ângulo sem rodar, num degrau de opacidade.
 */

/** As cores do metal do PC (`METAL`, desktop/DiscoDeMetal.web.ts). */
export const CORES_DO_METAL = ['#c4c7ce', '#8f929b', '#5c5f68'] as const;
const PARAGENS_DO_METAL = [0, 0.48, 1] as const;
/** O ícone por cima do metal: escuro, como no PC. */
export const COR_DO_ICONE_NO_METAL = '#141418';
/**
 * O travão do PC (a curva `travar`, 1033 ms): 90 % do caminho aos ~400 ms, a perder
 * velocidade como um prato a parar. 1 - e^(-kt), com k tal que aos 0,387 vá a 0,9.
 */
export const DURACAO_DO_TRAVAO = 1033;
const K_DO_TRAVAO = Math.log(10) / (400 / DURACAO_DO_TRAVAO);
export const travao = (t: number) => (1 - Math.exp(-K_DO_TRAVAO * t)) / (1 - Math.exp(-K_DO_TRAVAO));

export function DiscoDeMetal({ lado, aTocar, children, style }: {
  lado: number;
  /** O estado de agora: o laço roda quando muda. */
  aTocar: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduzido = useReducedMotion();
  // O ângulo em graus, acumulado: o prato só anda para a frente.
  const angulo = useRef(new Animated.Value(0)).current;
  const opacidade = useRef(new Animated.Value(OPACIDADE_DO_REFLEXO)).current;
  const onde = useRef(0);
  const antes = useRef(aTocar);
  useEffect(() => {
    if (antes.current === aTocar) return;
    antes.current = aTocar;
    const { graus, curva } = voltaDoDisco(aTocar);
    onde.current += graus;
    angulo.stopAnimation();
    if (reduzido) {
      // Muda de ângulo sem rodar: um degrau de opacidade (150 ms), como no PC.
      angulo.setValue(onde.current);
      Animated.sequence([
        Animated.timing(opacidade, { toValue: OPACIDADE_DO_REFLEXO / 3, duration: DEGRAU_DO_REFLEXO_MS / 2, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(opacidade, { toValue: OPACIDADE_DO_REFLEXO, duration: DEGRAU_DO_REFLEXO_MS / 2, easing: Easing.linear, useNativeDriver: true }),
      ]).start();
      return;
    }
    pedirFluidez(curva === 'travar' ? DURACAO_DO_TRAVAO + 100 : 900);
    if (curva === 'travar') {
      Animated.timing(angulo, { toValue: onde.current, duration: DURACAO_DO_TRAVAO, easing: travao, useNativeDriver: true }).start();
    } else {
      Animated.spring(angulo, { toValue: onde.current, ...SOLTAR, useNativeDriver: true }).start();
    }
  }, [aTocar, angulo, opacidade, reduzido]);
  const rodar = angulo.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'], extrapolate: 'extend' });
  const raio = lado / 2;
  return (
    <View style={[{ width: lado, height: lado, borderRadius: raio }, styles.sombra, style]}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: raio, overflow: 'hidden' }]}>
        <LinearGradient colors={CORES_DO_METAL} locations={PARAGENS_DO_METAL} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
        {/* O laço roda numa camada só dele (a imagem não leva o `mixBlendMode`). */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.luz, { opacity: opacidade, transform: [{ rotate: rodar }] }]}>
          <Image source={require('../../assets/reflexo-do-disco.png')} resizeMode="cover" style={{ width: lado, height: lado }} />
        </Animated.View>
        {/* As arestas: acesas em cima, escuras em baixo (o `inset` do PC). */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: raio }, styles.arestas]} />
      </View>
      <View style={styles.icone}>{children}</View>
    </View>
  );
}

/** O ícone dentro do disco de metal quando `ligado`; sem ele, o ícone sozinho, como estava. */
export function NoMetal({ ligado, lado, aTocar, children }: { ligado: boolean; lado: number; aTocar: boolean; children: React.ReactNode }) {
  return ligado ? <DiscoDeMetal lado={lado} aTocar={aTocar}>{children}</DiscoDeMetal> : <>{children}</>;
}

const styles = StyleSheet.create({
  sombra: { shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 5, shadowOffset: { width: 0, height: 4 } },
  luz: { mixBlendMode: 'screen' },
  arestas: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: 'rgba(255,255,255,0.35)', borderLeftColor: 'rgba(255,255,255,0.12)',
    borderRightColor: 'rgba(0,0,0,0.12)', borderBottomColor: 'rgba(0,0,0,0.25)',
  },
  icone: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
});
