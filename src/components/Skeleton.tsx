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

/**
 * Uma prateleira horizontal a chegar: capa quadrada, título e artista.
 *
 * Existe por secção e não uma vez por ecrã, porque as prateleiras aterram em
 * alturas diferentes -- as que saem da base de dados chegam quase logo, a
 * descoberta fala com o YouTube e demora segundos. Um esqueleto único à
 * frente de todas escondia as rápidas atrás da lenta, que é exactamente o
 * problema que o carregamento por partes foi feito para resolver.
 *
 * Não desliza na horizontal de propósito: um esqueleto não se percorre.
 */
export function SkeletonDePrateleira({ cartoes = 4, largura = 120 }: {
  cartoes?: number; largura?: number;
}) {
  return (
    <View accessibilityLabel="Loading" style={styles.prateleira}>
      {Array.from({ length: cartoes }).map((_, i) => (
        <View key={i} style={{ width: largura, gap: 6 }}>
          <Barra style={{ width: largura, height: largura, borderRadius: radii.md }} />
          <Barra style={{ height: 10, width: `${84 - (i % 3) * 14}%` }} />
          <Barra style={{ height: 9, width: `${56 - (i % 2) * 12}%` }} />
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
  prateleira: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    overflow: 'hidden',
  },
  capa: { width: 48, height: 48, borderRadius: radii.sm },
  avatarGrande: { width: 54, height: 54, borderRadius: 27 },
  conversa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 68,
    paddingHorizontal: spacing.xl,
  },
  redondo: { width: 48, height: 48, borderRadius: 24 },
});

/**
 * A lista de conversas do Social: avatar redondo grande, nome e a linha de
 * baixo (o que está a ouvir, ou quando foi visto).
 *
 * As medidas são as do `socialStyles.conversa` -- 54 de avatar, 68 de altura
 * mínima. Um esqueleto com outras medidas é pior do que nenhum: promete uma
 * forma e chega outra, e o salto na troca vê-se.
 */
export function SkeletonDeConversas({ linhas = 6 }: { linhas?: number }) {
  return (
    <View accessibilityLabel="A carregar">
      {Array.from({ length: linhas }).map((_, i) => (
        <View key={i} style={styles.conversa}>
          <Barra style={styles.avatarGrande} />
          <View style={{ flex: 1, gap: 8 }}>
            <Barra style={{ height: 12, width: `${58 - (i % 3) * 12}%` }} />
            <Barra style={{ height: 10, width: `${76 - (i % 4) * 14}%` }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * O perfil: a capa e o avatar em cima, e as secções por baixo.
 *
 * Não tenta desenhar o perfil todo -- só o que ocupa o primeiro ecrã. Um
 * esqueleto que continua para lá do que se vê é trabalho a mais para desenhar
 * o que ninguém está a olhar.
 */
export function SkeletonDoPerfil() {
  return (
    <View accessibilityLabel="A carregar" style={{ gap: spacing.xl }}>
      <View style={{ gap: spacing.md }}>
        <Barra style={{ height: 132, borderRadius: radii.lg }} />
        <View style={{ paddingHorizontal: spacing.xl, gap: 9 }}>
          <Barra style={{ height: 16, width: '46%' }} />
          <Barra style={{ height: 11, width: '30%' }} />
        </View>
      </View>
      {[0, 1].map((n) => (
        <View key={n} style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
          <Barra style={{ height: 10, width: '34%' }} />
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Barra style={styles.capa} />
              <View style={{ flex: 1, gap: 7 }}>
                <Barra style={{ height: 11, width: `${70 - (i % 3) * 14}%` }} />
                <Barra style={{ height: 9, width: `${42 - (i % 2) * 12}%` }} />
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
