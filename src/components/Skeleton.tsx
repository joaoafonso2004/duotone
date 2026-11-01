import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { CICLO_MAXIMO_MS, FRASES_DO_CARREGAMENTO, LUZ_DO_CARREGAMENTO_MS, OPACIDADE_DO_CARREGAMENTO } from '../lib/luz';
import { pedirFluidez } from '../state/fluidez';
import { colors, radii, spacing } from '../theme';

/**
 * O desenho do que está a chegar, em vez de uma roda a girar.
 *
 * A diferença não é decorativa: um spinner diz "espera" e não diz mais nada;
 * um esqueleto com a forma da lista diz o que vem a seguir e quanto é. A app
 * deixa de parecer que está à espera e passa a parecer que está a chegar.
 *
 * Uma só luz (C10, 1/11): as barras ficam paradas, e UM reflexo em diagonal
 * passa pela região inteira (era um brilho por barra, a piscar cada uma).
 * Aos 4 s a luz pára e diz-se "Still loading…". Com menos movimento, as
 * barras sem luz, que continuam a dizer a mesma coisa.
 */
const WEB = Platform.OS === 'web';

/** No PC, as regras da casca (o gradiente preso à janela) acendem as formas. */
const marcaDoPc = (dt: string) => (WEB ? ({ dataSet: { dt } } as object) : {});

function Barra({ style }: { style?: ViewStyle }) {
  return <View {...marcaDoPc('forma')} style={[styles.barra, style]} />;
}

/** "Still loading…", por cima das formas (aos 4 s nada salta). */
function Ainda() {
  return (
    <View accessibilityRole="text" style={styles.ainda}>
      <Text style={styles.aindaTexto}>{FRASES_DO_CARREGAMENTO.ainda}</Text>
    </View>
  );
}

/**
 * A luz única do iPhone: as formas são a MÁSCARA (um `MaskedView`), e por
 * baixo o metal e uma banda de luz em diagonal a andar em `translateX`, no
 * driver nativo. As formas desenham-se duas vezes, a da máscara e uma
 * invisível que dá o tamanho. No PC o `MaskedView` só desenha a máscara: as
 * formas levam as marcas e a luz é a da casca.
 */
function LuzDoCarregamento({ children }: { children: React.ReactNode }) {
  const reduzido = useReducedMotion();
  const [lado, setLado] = useState<{ w: number; h: number } | null>(null);
  const [ainda, setAinda] = useState(false);
  const passo = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const id = setTimeout(() => setAinda(true), CICLO_MAXIMO_MS);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    if (WEB || reduzido || ainda || !lado) return;
    pedirFluidez(CICLO_MAXIMO_MS);
    const a = Animated.loop(Animated.timing(passo, {
      toValue: 1, duration: LUZ_DO_CARREGAMENTO_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
    }));
    a.start();
    return () => a.stop();
  }, [reduzido, ainda, lado?.w, passo]);

  if (WEB) return <View {...marcaDoPc(ainda ? 'formas' : 'formas carregando')}>{children}{ainda ? <Ainda /> : null}</View>;
  const anda = !!lado && !reduzido && !ainda;
  return (
    <View>
      <MaskedView maskElement={<View>{children}</View>}>
        <View onLayout={(e) => { const { width: w, height: h } = e.nativeEvent.layout; if (w && h) setLado({ w, h }); }}>
          <View style={{ opacity: 0 }}>{children}</View>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceHigh }]} />
          {anda ? (
            <Animated.View style={{
              position: 'absolute', top: -lado!.h * 0.3, height: lado!.h * 1.6, width: lado!.w * 0.5, left: 0,
              transform: [
                { translateX: passo.interpolate({ inputRange: [0, 1], outputRange: [-lado!.w * 0.6, lado!.w * 1.1] }) },
                { rotate: '15deg' },
              ],
            }}>
              <LinearGradient
                colors={['rgba(255,255,255,0)', `rgba(255,255,255,${OPACIDADE_DO_CARREGAMENTO})`, 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          ) : null}
        </View>
      </MaskedView>
      {ainda ? <Ainda /> : null}
    </View>
  );
}

/** Uma linha com a forma de uma faixa: capa, título e artista. */
export function SkeletonDeFaixas({ linhas = 8 }: { linhas?: number }) {
  return (
    <LuzDoCarregamento>
    <View accessibilityLabel="Loading" style={{ paddingHorizontal: spacing.xl }}>
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
    </LuzDoCarregamento>
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
    <LuzDoCarregamento>
    <View accessibilityLabel="Loading" style={styles.prateleira}>
      {Array.from({ length: cartoes }).map((_, i) => (
        <View key={i} style={{ width: largura, gap: 6 }}>
          <Barra style={{ width: largura, height: largura, borderRadius: radii.md }} />
          <Barra style={{ height: 10, width: `${84 - (i % 3) * 14}%` }} />
          <Barra style={{ height: 9, width: `${56 - (i % 2) * 12}%` }} />
        </View>
      ))}
    </View>
    </LuzDoCarregamento>
  );
}

/** A grelha redonda dos artistas. */
export function SkeletonDeArtistas({ linhas = 6 }: { linhas?: number }) {
  return (
    <LuzDoCarregamento>
    <View accessibilityLabel="Loading" style={{ paddingHorizontal: spacing.xl }}>
      {Array.from({ length: linhas }).map((_, i) => (
        <View key={i} style={styles.linha}>
          <Barra style={styles.redondo} />
          <Barra style={{ height: 11, width: `${58 - (i % 3) * 10}%` }} />
        </View>
      ))}
    </View>
    </LuzDoCarregamento>
  );
}

/**
 * A grelha das playlists: dois quadrados grandes por linha, com o nome e a
 * contagem por baixo. Um esqueleto com a forma da LISTA de faixas aqui era
 * pior do que um spinner: prometia uma coisa e chegava outra.
 */
export function SkeletonDePlaylists({ lado, linhas = 3 }: { lado: number; linhas?: number }) {
  return (
    <LuzDoCarregamento>
    <View accessibilityLabel="Loading" style={styles.grelha}>
      {Array.from({ length: linhas * 2 }).map((_, i) => (
        <View key={i} style={{ width: lado, gap: spacing.sm }}>
          <Barra style={{ width: lado, height: lado, borderRadius: radii.lg }} />
          <Barra style={{ height: 11, width: `${80 - (i % 3) * 15}%` }} />
          <Barra style={{ height: 9, width: '40%' }} />
        </View>
      ))}
    </View>
    </LuzDoCarregamento>
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
    borderCurve: 'continuous',
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
  ainda: {
    position: 'absolute', top: 0, left: spacing.xl, paddingHorizontal: spacing.md, height: 30,
    borderRadius: 15, justifyContent: 'center', backgroundColor: colors.surface,
  },
  aindaTexto: { fontSize: 13, color: colors.textSecondary },
});

/**
 * As estatísticas, a retrospetiva e o "You two" (C10, 1/11): um bloco grande, uma
 * fila de números e a lista por baixo. Eram uma roda a girar no meio do ecrã.
 */
export function SkeletonDeEstatisticas() {
  return (
    <LuzDoCarregamento>
    <View accessibilityLabel="Loading" style={{ paddingHorizontal: spacing.xl, gap: spacing.lg }}>
      <Barra style={{ height: 132, borderRadius: radii.lg }} />
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        {[0, 1, 2].map((i) => <Barra key={i} style={{ flex: 1, height: 74, borderRadius: radii.md }} />)}
      </View>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.linha}>
          <Barra style={styles.capa} />
          <View style={{ flex: 1, gap: 7 }}>
            <Barra style={{ height: 11, width: `${70 - (i % 3) * 14}%` }} />
            <Barra style={{ height: 9, width: `${42 - (i % 2) * 12}%` }} />
          </View>
        </View>
      ))}
    </View>
    </LuzDoCarregamento>
  );
}

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
    <LuzDoCarregamento>
    <View accessibilityLabel="Loading">
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
    </LuzDoCarregamento>
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
    <LuzDoCarregamento>
    <View accessibilityLabel="Loading" style={{ gap: spacing.xl }}>
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
    </LuzDoCarregamento>
  );
}
