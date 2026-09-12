import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { hapticSelection } from '../lib/haptics';
import { deviceLabel, resumoDaFila } from '../lib/handoff';
import { mandarComando } from '../lib/connectSync';
import { avisoDoPedido, estaAcordado, type TipoDePedido } from '../lib/duotoneConnect';
import { useHandoffSession } from '../lib/sessionSync';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';
import { colors, MINI_PLAYER_HEIGHT, radii, spacing, type } from '../theme';

const TAB_BAR_BASE = 49;

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * O ponto que diz "ao vivo": a faixa, a pausa e os saltos chegam pelo
 * Realtime e o tempo anda ao segundo. Parado com o "reduzir movimento".
 */
function PontoAoVivo({ cor }: { cor: string }) {
  const reduzido = useReducedMotion();
  const brilho = React.useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    if (reduzido) { brilho.setValue(1); return; }
    const ciclo = Animated.loop(Animated.sequence([
      Animated.timing(brilho, { toValue: 0.35, duration: 800, useNativeDriver: true }),
      Animated.timing(brilho, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]));
    ciclo.start();
    return () => ciclo.stop();
  }, [reduzido, brilho]);
  return <Animated.View style={[styles.aoVivo, { backgroundColor: cor, opacity: brilho }]} />;
}

/**
 * "A tocar no PC — continuar aqui".
 *
 * Fica por cima do mini-player (ou da tab bar, quando não há nada a tocar),
 * que é onde a Spotify põe o equivalente. Desaparece sozinho: a sessão do
 * outro dispositivo tem de continuar fresca e a apontar para outra faixa
 * (ver shouldOfferHandoff).
 */
export function HandoffBanner() {
  const insets = useSafeAreaInsets();
  const theme = useTheme((s) => s.theme);
  const current = usePlayer((s) => s.current);
  const aTocarAqui = usePlayer((s) => s.isPlaying && !!s.current);
  const expanded = usePlayer((s) => s.expanded);
  const { session, positionMs, dismiss, adopt } = useHandoffSession();
  const [aviso, setAviso] = useState('');
  const [aMandar, setAMandar] = useState(false);

  // Com o Now Playing aberto o banner ficaria por baixo do overlay.
  if (!session || expanded) return null;

  // O que se leva ao carregar: a fila do outro aparelho entra por cima da
  // deste, e o que aqui estiver a tocar para. Dizê-lo ANTES é a diferença
  // entre continuar e ser surpreendido.
  const { proxima, depois } = resumoDaFila(session);
  const aSeguir = [
    aTocarAqui ? 'Replaces what’s playing here' : '',
    proxima ? `Next: ${tituloDaFaixa(proxima)}${depois ? ` · ${depois} more` : ''}` : '',
  ].filter(Boolean).join(' · ');

  // Duotone Connect: comandar o aparelho que está a tocar, daqui. Só quando
  // ele está mesmo à escuta -- um iPhone com a app fechada não recebe nada.
  const comandavel = estaAcordado(session);

  const comandar = (tipo: TipoDePedido) => {
    hapticSelection();
    setAMandar(true);
    void mandarComando(session.deviceId, tipo).then((estado) => {
      setAMandar(false);
      // Correr bem vê-se no próprio banner, que muda pelo Realtime. Só se
      // escreve alguma coisa quando corre mal.
      if (estado === 'feito') { setAviso(''); return; }
      setAviso(avisoDoPedido(estado, deviceLabel(session), tipo));
      setTimeout(() => setAviso(''), 5000);
    });
  };

  const bottom =
    TAB_BAR_BASE + insets.bottom + 8 + (current ? MINI_PLAYER_HEIGHT + 10 : 0);
  const durationMs = (session.track.durationSeconds ?? 0) * 1000;
  const fraction = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;

  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      <Pressable
        onPress={() => {
          hapticSelection();
          void adopt();
        }}
        style={({ pressed }) => [
          styles.card,
          { borderColor: theme.soft },
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: theme.soft }]}>
          <Ionicons
            name={session.deviceKind === 'desktop' ? 'desktop-outline' : 'phone-portrait-outline'}
            size={16}
            color={theme.color}
          />
        </View>

        {session.track.artworkUrl ? (
          <Image source={{ uri: session.track.artworkUrl }} style={styles.art} contentFit="cover" />
        ) : null}

        <View style={styles.texts}>
          <View style={styles.eyebrowRow}>
            {session.isPlaying ? <PontoAoVivo cor={theme.color} /> : null}
            <Text style={[styles.eyebrow, { color: theme.color }]} numberOfLines={1}>
              {session.isPlaying ? 'Playing on' : 'Paused on'} {deviceLabel(session)}
              {durationMs > 0 ? ` · ${fmt(positionMs)}` : ''}
            </Text>
          </View>
          <Text style={styles.title} numberOfLines={1}>
            {session.track.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {displayArtist(session.track)}
          </Text>
          {aSeguir ? (
            <Text style={styles.aSeguir} numberOfLines={1}>{aSeguir}</Text>
          ) : null}
        </View>

        {/*
          O texto do botão vem do TEMA, não é branco fixo. O acento `steel` é
          #E9EAEE -- quase branco -- e branco sobre ele deixava o botão a
          parecer um retângulo vazio. O `textColorOnGradient` é escolhido por
          medição de contraste em lib/corDaCapa.ts, por isso serve tanto o
          steel como qualquer cor que a capa dê.
        */}
        <View style={[styles.cta, { backgroundColor: theme.color }]}>
          <Ionicons name="play" size={14} color={theme.textColorOnGradient} />
          <Text style={[styles.ctaText, { color: theme.textColorOnGradient }]}>
            Continue here
          </Text>
        </View>

        <Pressable
          onPress={dismiss}
          hitSlop={10}
          accessibilityLabel="Dismiss"
          style={styles.close}
        >
          <Ionicons name="close" size={16} color={colors.textTertiary} />
        </Pressable>
      </Pressable>

      {/* Comandar à distância, numa linha própria: no cartão de cima não cabe
          sem apertar o nome da música, e é ele que diz o que está a tocar. */}
      {comandavel ? (
        <View style={styles.remoto}>
          {aviso ? (
            <Text numberOfLines={1} style={[styles.aSeguir, { flex: 1 }]}>{aviso}</Text>
          ) : (
            <Text numberOfLines={1} style={[styles.aSeguir, { flex: 1 }]}>
              Control {deviceLabel(session)} from here
            </Text>
          )}
          <Pressable hitSlop={8} disabled={aMandar} accessibilityLabel={`Previous on ${deviceLabel(session)}`}
            onPress={() => comandar('anterior')} style={styles.botaoRemoto}>
            <Ionicons name="play-skip-back" size={15} color={colors.textSecondary} />
          </Pressable>
          <Pressable hitSlop={8} disabled={aMandar} accessibilityLabel={`${session.isPlaying ? 'Pause' : 'Play'} on ${deviceLabel(session)}`}
            onPress={() => comandar('tocar-pausa')} style={styles.botaoRemoto}>
            <Ionicons name={session.isPlaying ? 'pause' : 'play'} size={16} color={colors.text} />
          </Pressable>
          <Pressable hitSlop={8} disabled={aMandar} accessibilityLabel={`Next on ${deviceLabel(session)}`}
            onPress={() => comandar('seguinte')} style={styles.botaoRemoto}>
            <Ionicons name="play-skip-forward" size={15} color={colors.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      {/* Barra de progresso projetada — anda sozinha entre batimentos. */}
      <View style={styles.trackLine}>
        <View
          style={[styles.trackFill, { width: `${fraction * 100}%`, backgroundColor: theme.color }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 10,
    right: 10,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: 'rgba(29, 29, 40, 0.97)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 12,
    elevation: 6,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
  },
  pressed: { opacity: 0.82 },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  art: { width: 34, height: 34, borderRadius: 6, backgroundColor: colors.surfaceHigh },
  texts: { flex: 1, minWidth: 0 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  aoVivo: { width: 6, height: 6, borderRadius: 3 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4, flexShrink: 1 },
  title: { ...type.caption, color: colors.text, fontWeight: '700', marginTop: 1 },
  artist: { fontSize: 11, color: colors.textSecondary },
  aSeguir: { fontSize: 10, color: colors.textTertiary, marginTop: 1 },
  remoto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 10,
    paddingBottom: 7,
    marginTop: -2,
  },
  botaoRemoto: { width: 30, height: 26, alignItems: 'center', justifyContent: 'center' },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: radii.pill,
  },
  // A cor vem do tema, no sítio de uso.
  ctaText: { fontSize: 12, fontWeight: '700' },
  close: { padding: 2 },
  trackLine: { height: 2, backgroundColor: 'rgba(255,255,255,0.08)' },
  trackFill: { height: 2 },
});
