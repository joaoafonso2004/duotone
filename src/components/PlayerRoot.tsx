import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayer } from '../state/player';
import { colors, MINI_PLAYER_HEIGHT, radii, spacing, type } from '../theme';
import { ProgressBar } from './ProgressBar';
import { YouTubePlayerView } from './YouTubePlayerView';

const TAB_BAR_BASE = 49;
const HEADER_H = 44;
const APP_NAME = 'Duotone';

export function PlayerRoot() {
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();

  const current = usePlayer((s) => s.current);
  const queue = usePlayer((s) => s.queue);
  const queueIndex = usePlayer((s) => s.queueIndex);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const expanded = usePlayer((s) => s.expanded);
  const repeatQueue = usePlayer((s) => s.repeatQueue);
  const showRewindButton = usePlayer((s) => s.showRewindButton);
  const positionMs = usePlayer((s) => s.positionMs);
  const durationMs = usePlayer((s) => s.durationMs);
  const error = usePlayer((s) => s.error);

  const playTrack = usePlayer((s) => s.playTrack);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const next = usePlayer((s) => s.next);
  const prev = usePlayer((s) => s.prev);
  const close = usePlayer((s) => s.close);
  const setExpanded = usePlayer((s) => s.setExpanded);
  const seekTo = usePlayer((s) => s.seekTo);
  const setError = usePlayer((s) => s.setError);

  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: expanded ? 1 : 0,
      useNativeDriver: false,
      speed: 14,
      bounciness: 3,
    }).start();
  }, [expanded, anim]);

  // Auto-limpar erros
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 4500);
    return () => clearTimeout(id);
  }, [error, setError]);

  if (!current) return null;

  const isYt = current.source === 'youtube';
  const TAB_H = TAB_BAR_BASE + insets.bottom;
  const miniBottom = TAB_H + 8;
  const fraction = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;

  // Frame de vídeo: mini (48px, dentro do mini-player) <-> expandido (cartão com margens)
  const vidMini = {
    x: 10 + 8,
    y: H - miniBottom - MINI_PLAYER_HEIGHT + (MINI_PLAYER_HEIGHT - 48) / 2,
    w: 85,
    h: 48,
  };
  const vidFull = {
    x: 16,
    y: insets.top + 6 + HEADER_H + 8,
    w: W - 32,
    h: ((W - 32) * 9) / 16,
  };

  const artSize = Math.min(W - 120, 320);
  const upNext = queue.slice(queueIndex + 1, queueIndex + 7);
  const tint = isYt ? 'rgba(255,78,69,0.10)' : 'rgba(29,185,84,0.08)';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* ===================== OVERLAY EXPANDIDO ===================== */}
      <Animated.View
        pointerEvents={expanded ? 'auto' : 'none'}
        style={[
          styles.full,
          {
            transform: [
              {
                translateY: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [H, 0],
                }),
              },
            ],
          },
        ]}
      >
        {/* tinte subtil da fonte no topo — sem blur, limpo */}
        <LinearGradient
          colors={[tint, 'rgba(10,10,15,0)']}
          style={styles.topTint}
          pointerEvents="none"
        />

        {/* cabeçalho */}
        <View style={[styles.fullHeader, { marginTop: insets.top + 6 }]}>
          <Pressable hitSlop={12} onPress={() => setExpanded(false)} style={styles.headerBtn}>
            <Ionicons name="chevron-down" size={24} color={colors.text} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={[type.micro, { letterSpacing: 1, fontWeight: '700' }]}>
              {APP_NAME.toUpperCase()}
            </Text>
          </View>
          <Pressable hitSlop={12} onPress={close} style={styles.headerBtn}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* área do vídeo (o WebView flutua por cima) ou artwork Spotify */}
        {isYt ? (
          <View style={{ height: vidFull.h, marginTop: 8 }} />
        ) : (
          <View style={styles.artworkWrap}>
            {current.artworkUrl ? (
              <Image
                source={{ uri: current.artworkUrl }}
                style={[styles.bigArtwork, { width: artSize, height: artSize }]}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View
                style={[
                  styles.bigArtwork,
                  styles.artFallback,
                  { width: artSize, height: artSize },
                ]}
              >
                <Ionicons name="musical-notes" size={56} color={colors.textTertiary} />
              </View>
            )}
          </View>
        )}

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.fullBody}
          showsVerticalScrollIndicator={false}
        >
          {/* título */}
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2} style={styles.trackTitle}>
                {current.title}
              </Text>
              <Text numberOfLines={1} style={styles.trackArtist}>
                {current.artist ?? 'YouTube'}
              </Text>
            </View>
          </View>

          <View style={{ marginTop: spacing.xl }}>
            <ProgressBar
              positionMs={positionMs}
              durationMs={durationMs}
              onSeek={seekTo}
            />
          </View>

          {/* controlos */}
          <View style={styles.controls}>
            <Pressable
              hitSlop={14}
              onPress={prev}
              disabled={!repeatQueue && queueIndex === 0}
              style={!repeatQueue && queueIndex === 0 && styles.dimmed}
            >
              <Ionicons name="play-skip-back" size={28} color={colors.text} />
            </Pressable>

            {showRewindButton ? (
              <Pressable
                hitSlop={14}
                onPress={() => seekTo(Math.max(0, positionMs - 15000))}
                accessibilityLabel="Rewind 15 seconds"
              >
                <Ionicons name="play-back" size={22} color={colors.text} />
              </Pressable>
            ) : null}

            <Pressable
              onPress={togglePlay}
              style={({ pressed }) => [styles.playBtn, pressed && { opacity: 0.85 }]}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={30}
                color={colors.bg}
                style={!isPlaying && { marginLeft: 3 }}
              />
            </Pressable>

            <Pressable
              hitSlop={14}
              onPress={next}
              disabled={!repeatQueue && queueIndex >= queue.length - 1}
              style={!repeatQueue && queueIndex >= queue.length - 1 && styles.dimmed}
            >
              <Ionicons name="play-skip-forward" size={28} color={colors.text} />
            </Pressable>
          </View>

          {/* a seguir */}
          {upNext.length > 0 ? (
            <View style={styles.upNextCard}>
              <Text style={[type.micro, { marginBottom: spacing.sm }]}>Up next</Text>
              {upNext.map((t) => (
                <Pressable
                  key={`${t.source}:${t.sourceId}`}
                  onPress={() => playTrack(t, queue)}
                  style={({ pressed }) => [
                    styles.upNextRow,
                    pressed && { backgroundColor: colors.surfacePressed },
                  ]}
                >
                  {t.artworkUrl ? (
                    <Image
                      source={{ uri: t.artworkUrl }}
                      style={styles.upNextArt}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.upNextArt, styles.artFallback]}>
                      <Ionicons name="musical-notes" size={12} color={colors.textTertiary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[type.body, { fontSize: 14, fontWeight: '600' }]}>
                      {t.title}
                    </Text>
                    <Text numberOfLines={1} style={[type.caption, { fontSize: 11 }]}>
                      {t.artist ?? 'YouTube'}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </Animated.View>

      {/* ===================== MINI-PLAYER ===================== */}
      <Animated.View
        pointerEvents={expanded ? 'none' : 'auto'}
        style={[
          styles.mini,
          {
            bottom: miniBottom,
            opacity: anim.interpolate({
              inputRange: [0, 0.35],
              outputRange: [1, 0],
              extrapolate: 'clamp',
            }),
          },
        ]}
      >
        <Pressable style={styles.miniInner} onPress={() => setExpanded(true)}>
          {isYt ? (
            // slot — o WebView flutua exatamente por cima desta área
            <View style={styles.miniVideoSlot} />
          ) : current.artworkUrl ? (
            <Image
              source={{ uri: current.artworkUrl }}
              style={styles.miniArt}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.miniArt, styles.artFallback]}>
              <Ionicons name="musical-notes" size={16} color={colors.textTertiary} />
            </View>
          )}

          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={[type.body, { fontWeight: '600', fontSize: 13.5 }]}
            >
              {current.title}
            </Text>
            <Text numberOfLines={1} style={[type.caption, { fontSize: 11 }]}>
              {current.artist ?? 'YouTube'}
            </Text>
          </View>

          <Pressable hitSlop={8} onPress={togglePlay} style={styles.miniBtn}>
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={22}
              color={colors.text}
            />
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={next}
            disabled={!repeatQueue && queueIndex >= queue.length - 1}
            style={[
              styles.miniBtn,
              !repeatQueue && queueIndex >= queue.length - 1 && styles.dimmed,
            ]}
          >
            <Ionicons name="play-skip-forward" size={20} color={colors.text} />
          </Pressable>
        </Pressable>

        {/* linha de progresso fina */}
        <View style={styles.miniTrack} pointerEvents="none">
          <View
            style={[styles.miniTrackFill, { width: `${fraction * 100}%` }]}
          />
        </View>
      </Animated.View>

      {/* ============ FRAME DE VÍDEO YOUTUBE (flutuante, nunca desmonta) ============ */}
      {isYt ? (
        <Animated.View
          style={{
            position: 'absolute',
            left: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [vidMini.x, vidFull.x],
            }),
            top: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [vidMini.y, vidFull.y],
            }),
            width: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [vidMini.w, vidFull.w],
            }),
            height: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [vidMini.h, vidFull.h],
            }),
            borderRadius: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [8, 14],
            }),
            overflow: 'hidden',
            backgroundColor: '#000',
          }}
        >
          <YouTubePlayerView track={current} />

          {/* Mostramos SEMPRE a thumbnail por cima — o áudio nativo continua a
              tocar por trás. (A app é só áudio; o vídeo é irrelevante.) */}
          {current.artworkUrl ? (
            <Image
              source={{ uri: current.artworkUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={250}
            />
          ) : null}

          {/* No modo mini, tocar no vídeo expande */}
          {!expanded ? (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setExpanded(true)}
            />
          ) : null}
        </Animated.View>
      ) : null}

      {/* ===================== TOAST DE ERRO ===================== */}
      {error ? (
        <View
          style={[styles.toast, { bottom: miniBottom + MINI_PLAYER_HEIGHT + 10 }]}
        >
          <Ionicons name="alert-circle" size={16} color={colors.danger} />
          <Text style={styles.toastText}>{error}</Text>
        </View>
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  full: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.bg,
  },
  topTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 320,
  },
  fullHeader: {
    height: HEADER_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  artworkWrap: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  bigArtwork: {
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceHigh,
  },
  artFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
  },
  fullBody: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: 56,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  trackTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.1,
  },
  trackArtist: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 3,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 48,
    marginTop: spacing.xl + 4,
  },
  playBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: {
    opacity: 0.3,
  },
  sourceNote: {
    ...type.caption,
    fontSize: 11,
    textAlign: 'center',
    marginTop: spacing.lg,
    color: colors.textTertiary,
  },
  upNextCard: {
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
  },
  upNextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: radii.sm,
  },
  upNextArt: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: colors.surfaceHigh,
  },
  mini: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: MINI_PLAYER_HEIGHT,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
    overflow: 'hidden',
  },
  miniInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 8,
    paddingRight: 6,
  },
  miniVideoSlot: {
    width: 85,
    height: 48,
    borderRadius: 8,
  },
  miniArt: {
    width: 48,
    height: 48,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
  miniBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniTrack: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  miniTrackFill: {
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.accent,
  },
  toast: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceHigh,
    borderColor: colors.borderStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  toastText: {
    ...type.caption,
    color: colors.text,
    flex: 1,
  },
});
