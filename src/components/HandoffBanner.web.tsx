import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { displayArtist } from '../lib/artistName';
import { deviceLabel } from '../lib/handoff';
import { useHandoffSession } from '../lib/sessionSync';
import { desktop } from '../desktop/ui.web';
import { useTheme } from '../state/theme';

const P = Pressable as any;

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Versão desktop do banner de handoff (o resolver do Expo escolhe este
 * ficheiro na web/Electron). Mesma lógica que o do telemóvel — só muda o
 * sítio e o vocabulário visual: flutua por cima da PlayerBar, com hover.
 */
export function HandoffBanner() {
  const theme = useTheme((s) => s.theme);
  const { session, positionMs, dismiss, adopt } = useHandoffSession();

  if (!session) return null;

  const durationMs = (session.track.durationSeconds ?? 0) * 1000;
  const fraction = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;

  return (
    <View style={s.wrap}>
      <View style={s.card}>
        <View style={[s.iconWrap, { backgroundColor: theme.soft }]}>
          <Ionicons
            name={session.deviceKind === 'desktop' ? 'desktop-outline' : 'phone-portrait-outline'}
            size={16}
            color={theme.color}
          />
        </View>

        {session.track.artworkUrl ? (
          <Image source={{ uri: session.track.artworkUrl }} style={s.art} />
        ) : null}

        <View style={s.texts}>
          <Text numberOfLines={1} style={[s.eyebrow, { color: theme.color }]}>
            {session.isPlaying ? 'A TOCAR EM' : 'EM PAUSA EM'} {deviceLabel(session).toUpperCase()}
            {durationMs > 0 ? ` · ${fmt(positionMs)} / ${fmt(durationMs)}` : ''}
          </Text>
          <Text numberOfLines={1} style={s.title}>{session.track.title}</Text>
          <Text numberOfLines={1} style={s.artist}>{displayArtist(session.track)}</Text>
        </View>

        <P
          onPress={() => void adopt()}
          style={({ hovered, pressed }: any) => [
            s.cta,
            { backgroundColor: theme.color },
            hovered && s.ctaHover,
            pressed && s.pressed,
          ]}
        >
          <Ionicons name="play" size={13} color="#FFFFFF" />
          <Text style={s.ctaText}>Continuar aqui</Text>
        </P>

        <P
          onPress={dismiss}
          accessibilityLabel="Dispensar"
          style={({ hovered }: any) => [s.close, hovered && s.closeHover]}
        >
          <Ionicons name="close" size={15} color={desktop.dim} />
        </P>
      </View>

      {/* Progresso projetado a partir da última escrita do outro dispositivo. */}
      <View style={s.trackLine}>
        <View style={[s.trackFill, { width: `${fraction * 100}%`, backgroundColor: theme.color }]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 24,
    bottom: 96,
    zIndex: 30,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: desktop.border,
    backgroundColor: '#1B1B24',
    boxShadow: '0 14px 40px rgba(0,0,0,.5)',
  } as any,
  card: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10, paddingHorizontal: 12 },
  iconWrap: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  art: { width: 38, height: 38, borderRadius: 6, backgroundColor: desktop.raised },
  texts: { minWidth: 170, maxWidth: 280 },
  eyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  title: { color: desktop.text, fontSize: 13, fontWeight: '650' as any, marginTop: 3 },
  artist: { color: desktop.muted, fontSize: 11, marginTop: 2 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 13, borderRadius: 999, cursor: 'pointer' } as any,
  ctaHover: { opacity: 0.88 },
  pressed: { opacity: 0.72 },
  ctaText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  close: { width: 26, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' } as any,
  closeHover: { backgroundColor: desktop.hover },
  trackLine: { height: 2, backgroundColor: 'rgba(255,255,255,.08)' },
  trackFill: { height: 2 },
});
