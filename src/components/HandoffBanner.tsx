import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { displayArtist } from '../lib/artistName';
import { hapticSelection } from '../lib/haptics';
import { deviceLabel } from '../lib/handoff';
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
  const expanded = usePlayer((s) => s.expanded);
  const { session, positionMs, dismiss, adopt } = useHandoffSession();

  // Com o Now Playing aberto o banner ficaria por baixo do overlay.
  if (!session || expanded) return null;

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
          <Text style={[styles.eyebrow, { color: theme.color }]} numberOfLines={1}>
            {session.isPlaying ? 'A tocar em' : 'Em pausa em'} {deviceLabel(session)}
            {durationMs > 0 ? ` · ${fmt(positionMs)}` : ''}
          </Text>
          <Text style={styles.title} numberOfLines={1}>
            {session.track.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {displayArtist(session.track)}
          </Text>
        </View>

        <View style={[styles.cta, { backgroundColor: theme.color }]}>
          <Ionicons name="play" size={14} color="#FFFFFF" />
          <Text style={styles.ctaText}>Continuar aqui</Text>
        </View>

        <Pressable
          onPress={dismiss}
          hitSlop={10}
          accessibilityLabel="Dispensar"
          style={styles.close}
        >
          <Ionicons name="close" size={16} color={colors.textTertiary} />
        </Pressable>
      </Pressable>

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
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  title: { ...type.caption, color: colors.text, fontWeight: '700', marginTop: 1 },
  artist: { fontSize: 11, color: colors.textSecondary },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: radii.pill,
  },
  ctaText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  close: { padding: 2 },
  trackLine: { height: 2, backgroundColor: 'rgba(255,255,255,0.08)' },
  trackFill: { height: 2 },
});
