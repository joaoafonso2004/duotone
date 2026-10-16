import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { pedirFluidez } from '../state/fluidez';
import {
  alcanceDasFaiscas, animacaoPara, direcoesDasFaiscas, DURACAO, MOLA, RESPIRA, tamanhoDaFaisca,
} from '../lib/coracaoAoCarregar';

type Props = {
  /** O que se mostra (o `mostrada` do `useCoracaoAoCarregar`). */
  guardada: boolean;
  /** Muda a cada toque: é ele que anima. Mudar só o `guardada` não anima. */
  pulso: number;
  tamanho: number;
  /** O contorno, por guardar. */
  cor: string;
  /** O cheio (e as faíscas), guardada. */
  corCheio: string;
};

const DIRECOES = direcoesDasFaiscas();

/** Uma sequência de escalas, cada passo com a sua fração do tempo total. */
function passos(valor: Animated.Value, pontos: readonly (readonly [number, number])[], total: number): Animated.CompositeAnimation {
  return Animated.sequence(pontos.slice(1).map(([escala, fim], i) => Animated.timing(valor, {
    toValue: escala,
    duration: Math.max(1, Math.round((fim - pontos[i]![1]) * total)),
    easing: Easing.out(Easing.quad),
    useNativeDriver: true,
  })));
}

/**
 * O coração de guardar, no iPhone (16/10, `lib/coracaoAoCarregar.ts`): as
 * Faíscas a pôr e o Encolher a tirar. Tudo no driver nativo, com a taxa alta
 * pedida (`pedirFluidez`). Com "Reduzir movimento" só muda o estado.
 */
export function CoracaoAnimado({ guardada, pulso, tamanho, cor, corCheio }: Props) {
  const reduzido = useReducedMotion();
  const cheio = useRef(new Animated.Value(guardada ? 1 : 0)).current;
  const escalaDoCheio = useRef(new Animated.Value(1)).current;
  const escala = useRef(new Animated.Value(1)).current;
  const faiscas = useRef(new Animated.Value(0)).current;
  const pulsoVisto = useRef(pulso);

  useEffect(() => {
    const tocou = pulso !== pulsoVisto.current;
    pulsoVisto.current = pulso;
    for (const v of [cheio, escalaDoCheio, escala, faiscas]) v.stopAnimation();
    if (!tocou || reduzido) {
      cheio.setValue(guardada ? 1 : 0); escalaDoCheio.setValue(1); escala.setValue(1); faiscas.setValue(0);
      return;
    }
    pedirFluidez(DURACAO.respira + 200);
    if (animacaoPara(guardada) === 'por') {
      cheio.setValue(0); escalaDoCheio.setValue(1); faiscas.setValue(0); escala.setValue(MOLA[0]![0]);
      Animated.timing(cheio, { toValue: 1, duration: DURACAO.aparece, useNativeDriver: true }).start();
      passos(escala, MOLA, DURACAO.mola).start();
      Animated.timing(faiscas, {
        toValue: 1, duration: DURACAO.faiscas, easing: Easing.bezier(0.2, 0.8, 0.3, 1), useNativeDriver: true,
      }).start(({ finished }) => { if (finished) faiscas.setValue(0); });
    } else {
      cheio.setValue(1); escalaDoCheio.setValue(1); faiscas.setValue(0); escala.setValue(RESPIRA[0]![0]);
      const curva = Easing.bezier(0.5, 0, 0.8, 0.5);
      Animated.timing(escalaDoCheio, { toValue: 0, duration: DURACAO.encolhe, easing: curva, useNativeDriver: true })
        .start(({ finished }) => { if (finished) escalaDoCheio.setValue(1); });
      Animated.timing(cheio, { toValue: 0, duration: DURACAO.encolhe, easing: curva, useNativeDriver: true }).start();
      passos(escala, RESPIRA, DURACAO.respira).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só o toque (pulso) ou o estado mexem
  }, [pulso, guardada, reduzido]);

  const alcance = alcanceDasFaiscas(tamanho);
  const lado = tamanhoDaFaisca(tamanho);
  return (
    <Animated.View style={{ width: tamanho, height: tamanho, transform: [{ scale: escala }] }}>
      {/* O contorno toma a cor do cheio quando está guardada: senão ficava um
          fio da cor de "por guardar" à volta do coração cheio. */}
      <Ionicons name="heart-outline" size={tamanho} color={guardada ? corCheio : cor} style={StyleSheet.absoluteFill} />
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: cheio, transform: [{ scale: escalaDoCheio }] }]}>
        <Ionicons name="heart" size={tamanho} color={corCheio} />
      </Animated.View>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        {DIRECOES.map((d, i) => (
          <Animated.View
            key={i}
            style={{
              position: 'absolute', width: lado, height: lado, borderRadius: lado / 2, backgroundColor: corCheio,
              opacity: faiscas.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
              transform: [
                { translateX: faiscas.interpolate({ inputRange: [0, 1], outputRange: [0, d.x * alcance] }) },
                { translateY: faiscas.interpolate({ inputRange: [0, 1], outputRange: [0, d.y * alcance] }) },
                { scale: faiscas.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0.4] }) },
              ],
            }}
          />
        ))}
      </View>
    </Animated.View>
  );
}
