import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { colors, radii, spacing } from '../theme';

/**
 * O desenho do que está a chegar, em vez de uma roda a girar.
 *
 * A diferença não é decorativa: um spinner diz "espera" e não diz mais nada;
 * um esqueleto com a forma da lista diz o que vem a seguir e quanto é. A app
 * deixa de parecer que está à espera e passa a parecer que está a chegar.
 *
 * O brilho respeita o `reduce motion` do sistema -- quem pediu menos animação
 * fica com as barras paradas, que continuam a dizer a mesma coisa.
 */
function Barra({ style }: { style?: ViewStyle }) {
  const reduzido = useReducedMotion();
  const brilho = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (reduzido) return;
    const ciclo = Animated.loop(
      Animated.sequence([
        Animated.timing(brilho, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(brilho, { toValue: 0.5, duration: 750, useNativeDriver: true }),
      ])
    );
    ciclo.start();
    return () => ciclo.stop();
  }, [brilho, reduzido]);

  return (
    <Animated.View
      style={[styles.barra, style, reduzido ? { opacity: 0.6 } : { opacity: brilho }]}
    />
  );
}

/** Uma linha com a forma de uma faixa: capa, título e artista. */
export function SkeletonDeFaixas({ linhas = 8 }: { linhas?: number }) {
  return (
    <View accessibilityLabel="A carregar" style={{ paddingHorizontal: spacing.xl }}>
      {Array.from({ length: linhas }).map((_, i) => (
        <View key={i} style={styles.linha}>
          <Barra style={styles.capa} />
          <View style={{ flex: 1, gap: 7 }}>
            {/* Larguras diferentes por linha: todas iguais leem-se como uma
                grelha vazia, não como uma lista a chegar. */}
            <Barra style={{ height: 11, width: `${72 - (i % 3) * 12}%` }} />
            <Barra style={{ height: 9, width: `${44 - (i % 2) * 10}%` }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** A grelha redonda dos artistas. */
export function SkeletonDeArtistas({ linhas = 6 }: { linhas?: number }) {
  return (
    <View accessibilityLabel="A carregar" style={{ paddingHorizontal: spacing.xl }}>
      {Array.from({ length: linhas }).map((_, i) => (
        <View key={i} style={styles.linha}>
          <Barra style={styles.redondo} />
          <Barra style={{ height: 11, width: `${58 - (i % 3) * 10}%` }} />
        </View>
      ))}
    </View>
  );
}

/**
 * A grelha das playlists: dois quadrados grandes por linha, com o nome e a
 * contagem por baixo. Um esqueleto com a forma da LISTA de faixas aqui era
 * pior do que um spinner: prometia uma coisa e chegava outra.
 */
export function SkeletonDePlaylists({ lado, linhas = 3 }: { lado: number; linhas?: number }) {
  return (
    <View accessibilityLabel="A carregar" style={styles.grelha}>
      {Array.from({ length: linhas * 2 }).map((_, i) => (
        <View key={i} style={{ width: lado, gap: spacing.sm }}>
          <Barra style={{ width: lado, height: lado, borderRadius: radii.lg }} />
          <Barra style={{ height: 11, width: `${80 - (i % 3) * 15}%` }} />
          <Barra style={{ height: 9, width: '40%' }} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grelha: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  barra: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: radii.sm,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
  },
  capa: { width: 48, height: 48, borderRadius: radii.sm },
  redondo: { width: 48, height: 48, borderRadius: 24 },
});
