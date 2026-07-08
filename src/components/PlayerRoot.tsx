import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { saveToLibrary } from '../api/library';
import { hapticNotification, hapticSelection } from '../lib/haptics';
import { setRepeatMode as persistRepeatMode, setShuffle as persistShuffle } from '../lib/prefs';
import { usePlayer } from '../state/player';
import { colors, MINI_PLAYER_HEIGHT, radii, spacing, type } from '../theme';
import { AddToPlaylistSheet } from './AddToPlaylistSheet';
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
  const repeatMode = usePlayer((s) => s.repeatMode);
  const shuffle = usePlayer((s) => s.shuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const showRewindButton = usePlayer((s) => s.showRewindButton);
  const positionMs = usePlayer((s) => s.positionMs);
  const durationMs = usePlayer((s) => s.durationMs);
  const buffering = usePlayer((s) => s.buffering);
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
  // Deslocamento vertical do gesto de "arrastar para baixo para fechar" o
  // now-playing. Soma-se ao translateY do overlay (e da frame de vídeo).
  const dragY = useRef(new Animated.Value(0)).current;
  // Opacidade da capa: "respira" (fade in/out) enquanto a música carrega.
  const pulse = useRef(new Animated.Value(1)).current;

  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);

  // Pulsar suave da capa durante o carregamento; volta a opaco quando toca.
  useEffect(() => {
    if (buffering) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.4, duration: 750, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
    Animated.timing(pulse, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, [buffering, pulse]);

  useEffect(() => {
    // Repõe o gesto de arrasto e re-sincroniza a animação com `expanded`.
    // Corre também a CADA nova faixa (current.sourceId) — sem isto, ao
    // fechar (X) e abrir outra música o `anim` podia ficar dessincronizado
    // (overlay visível mas com pointerEvents 'none'), deixando o utilizador
    // "preso" a ver a página sem conseguir tocar em nada.
    dragY.setValue(0);
    Animated.spring(anim, {
      toValue: expanded ? 1 : 0,
      useNativeDriver: false,
      speed: 14,
      bounciness: 3,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, anim, dragY, current?.sourceId]);

  // Gesto de arrastar para baixo (no cabeçalho) para fechar o now-playing.
  const dismissPan = useRef(
    PanResponder.create({
      // Só assume o gesto se for claramente um arrasto vertical para baixo.
      onMoveShouldSetPanResponder: (_e, g) =>
        g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        dragY.setValue(Math.max(0, g.dy));
      },
      onPanResponderRelease: (_e, g) => {
        // Longe o suficiente (ou com impulso) → fecha; senão volta ao sítio.
        if (g.dy > 120 || g.vy > 0.6) {
          setExpanded(false);
          Animated.timing(dragY, {
            toValue: 0,
            duration: 220,
            useNativeDriver: false,
          }).start();
        } else {
          Animated.spring(dragY, { toValue: 0, useNativeDriver: false }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragY, { toValue: 0, useNativeDriver: false }).start();
      },
    })
  ).current;

  // Estado do botão "guardar" da faixa atual (reinicia a cada nova música).
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setSaved(false);
  }, [current?.sourceId]);

  // Capa em ALTA resolução: a YouTube Data API devolve thumbnails pequenas, mas
  // i.ytimg.com tem versões grandes por videoId. Começamos na maxresdefault
  // (1280px) e, se não existir, caímos na hqdefault (existe sempre). Faz a
  // capa ficar nítida como no Demus.
  const [artUri, setArtUri] = useState<string | null>(null);
  useEffect(() => {
    if (!current) {
      setArtUri(null);
    } else if (current.source === 'youtube') {
      setArtUri(`https://i.ytimg.com/vi/${current.sourceId}/maxresdefault.jpg`);
    } else {
      setArtUri(current.artworkUrl);
    }
  }, [current?.sourceId]);

  const onToggleShuffle = () => {
    toggleShuffle();
    hapticSelection();
    persistShuffle(!shuffle);
  };
  const onCycleRepeat = () => {
    const next = repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off';
    cycleRepeat();
    hapticSelection();
    persistRepeatMode(next);
  };

  const saveCurrentToLibrary = async () => {
    if (!current || saved) return;
    setSaved(true); // otimista
    try {
      await saveToLibrary(current);
      hapticNotification();
    } catch (e: any) {
      setSaved(false);
      Alert.alert('Error', e?.message ?? 'Could not save the track.');
    }
  };

  // Auto-limpar erros
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 4500);
    return () => clearTimeout(id);
  }, [error, setError]);

  if (!current) return null;

  // maxresdefault indisponível → hqdefault (existe sempre). Só desce um nível.
  const onArtError = () => {
    if (current.source === 'youtube' && artUri?.includes('maxresdefault')) {
      setArtUri(`https://i.ytimg.com/vi/${current.sourceId}/hqdefault.jpg`);
    }
  };
  const artSource = artUri ?? current.artworkUrl;

  const isYt = current.source === 'youtube';
  const TAB_H = TAB_BAR_BASE + insets.bottom;
  const miniBottom = TAB_H + 8;
  const fraction = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;

  // Capa: mini (quadrado 48px, no mini-player) <-> expandido (quadrado GRANDE
  // centrado). Antes era 16:9 (herança do vídeo) — agora que é só áudio, a
  // capa é quadrada e grande, para um look limpo tipo app de música.
  const ART_FULL = Math.min(W - 48, H * 0.46);
  const vidMini = {
    x: 10 + 8,
    y: H - miniBottom - MINI_PLAYER_HEIGHT + (MINI_PLAYER_HEIGHT - 48) / 2,
    w: 48,
    h: 48,
  };
  const vidFull = {
    x: (W - ART_FULL) / 2,
    y: insets.top + 6 + HEADER_H + 20,
    w: ART_FULL,
    h: ART_FULL,
  };

  const upNext = queue.slice(queueIndex + 1, queueIndex + 7);

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
              { translateY: dragY },
            ],
          },
        ]}
      >
        {/* Fundo = capa da música muito desfocada → o fundo "apanha" as cores
            da foto. Crossfade suave ao trocar de faixa (transition). */}
        {artSource ? (
          <Image
            source={{ uri: artSource }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={64}
            transition={450}
          />
        ) : null}
        {/* Escurece o fundo para o texto/controlos serem legíveis e funde para
            o fundo sólido em baixo. */}
        <LinearGradient
          colors={['rgba(10,10,15,0.30)', 'rgba(10,10,15,0.72)', colors.bg]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* cabeçalho — arrastável para baixo para fechar */}
        <View
          style={[styles.fullHeader, { marginTop: insets.top + 6 }]}
          {...dismissPan.panHandlers}
        >
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

        {/* Espaço reservado para a capa quadrada grande (a frame flutua por
            cima nesta posição). */}
        <View style={{ height: vidFull.h, marginTop: 20 }} />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.fullBody}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!scrubbing}
        >
          {/* título + ações visíveis (guardar / adicionar a playlist) */}
          <View style={styles.titleRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={2} style={styles.trackTitle}>
                {current.title}
              </Text>
              <Text numberOfLines={1} style={styles.trackArtist}>
                {current.artist ?? 'YouTube'}
              </Text>
            </View>
            <Pressable
              hitSlop={8}
              onPress={saveCurrentToLibrary}
              style={styles.actionsBtn}
              accessibilityLabel={saved ? 'Saved to Library' : 'Save to Library'}
            >
              <Ionicons
                name={saved ? 'heart' : 'heart-outline'}
                size={20}
                color={colors.text}
              />
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={() => setPlaylistOpen(true)}
              style={styles.actionsBtn}
              accessibilityLabel="Add to playlist"
            >
              <Ionicons name="add" size={22} color={colors.text} />
            </Pressable>
          </View>

          <View style={{ marginTop: spacing.xl }}>
            <ProgressBar
              positionMs={positionMs}
              durationMs={durationMs}
              onSeek={seekTo}
              onScrubbingChange={setScrubbing}
            />
          </View>

          {/* controlos: shuffle · anterior · play · seguinte · repeat */}
          <View style={styles.controls}>
            <Pressable hitSlop={12} onPress={onToggleShuffle} accessibilityLabel="Shuffle">
              <Ionicons
                name="shuffle"
                size={22}
                color={shuffle ? colors.text : colors.textTertiary}
              />
            </Pressable>

            <Pressable
              hitSlop={14}
              onPress={prev}
              disabled={repeatMode === 'off' && !shuffle && queueIndex === 0}
              style={
                repeatMode === 'off' && !shuffle && queueIndex === 0 && styles.dimmed
              }
            >
              <Ionicons name="play-skip-back" size={28} color={colors.text} />
            </Pressable>

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
              disabled={
                repeatMode === 'off' && !shuffle && queueIndex >= queue.length - 1
              }
              style={
                repeatMode === 'off' &&
                !shuffle &&
                queueIndex >= queue.length - 1 &&
                styles.dimmed
              }
            >
              <Ionicons name="play-skip-forward" size={28} color={colors.text} />
            </Pressable>

            <Pressable hitSlop={12} onPress={onCycleRepeat} accessibilityLabel="Repeat">
              <Ionicons
                name="repeat"
                size={22}
                color={repeatMode === 'off' ? colors.textTertiary : colors.text}
              />
              {repeatMode === 'one' ? (
                <View style={styles.repeatOneBadge}>
                  <Text style={styles.repeatOneText}>1</Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          {showRewindButton ? (
            <Pressable
              hitSlop={14}
              onPress={() => seekTo(Math.max(0, positionMs - 15000))}
              accessibilityLabel="Rewind 15 seconds"
              style={{ alignSelf: 'center', marginTop: spacing.md }}
            >
              <Ionicons name="play-back" size={20} color={colors.textSecondary} />
            </Pressable>
          ) : null}

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
            disabled={repeatMode === 'off' && !shuffle && queueIndex >= queue.length - 1}
            style={[
              styles.miniBtn,
              repeatMode === 'off' &&
                !shuffle &&
                queueIndex >= queue.length - 1 &&
                styles.dimmed,
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
              outputRange: [8, 20],
            }),
            transform: [{ translateY: dragY }],
            overflow: 'hidden',
            backgroundColor: '#000',
          }}
        >
          <YouTubePlayerView track={current} />

          {/* Mostramos SEMPRE a thumbnail por cima — o áudio nativo continua a
              tocar por trás. (A app é só áudio; o vídeo é irrelevante.) A capa
              "respira" (opacidade a pulsar) enquanto a música carrega. */}
          {artSource ? (
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: pulse }]}>
              <Image
                source={{ uri: artSource }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={250}
                onError={onArtError}
              />
            </Animated.View>
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

      {/* ===================== ADICIONAR A PLAYLIST ===================== */}
      <AddToPlaylistSheet
        visible={playlistOpen}
        track={current}
        onClose={() => setPlaylistOpen(false)}
      />
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
  actionsBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surfaceHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackTitle: {
    fontSize: 23,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 0.1,
  },
  trackArtist: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 4,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginTop: spacing.xl + 4,
  },
  repeatOneBadge: {
    position: 'absolute',
    top: -5,
    right: -7,
    minWidth: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  repeatOneText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.bg,
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
    width: 48,
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
