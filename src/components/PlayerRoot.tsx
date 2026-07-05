import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useKeepAwake } from 'expo-keep-awake';
import React, { useEffect, useRef } from 'react';
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
import { getPlaybackState } from '../api/spotify';
import { usePlayer } from '../state/player';
import { ProgressBar } from './ProgressBar';
import { YouTubePlayerView } from './YouTubePlayerView';
import {
  colors,
  gradients,
  MINI_PLAYER_HEIGHT,
  radii,
  spacing,
  type,
} from '../theme';

const TAB_BAR_BASE = 49;

/** Mantém o ecrã acordado enquanto o YouTube toca (evita o lock que pausa o WKWebView). */
function KeepAwakeWhilePlaying() {
  useKeepAwake();
  return null;
}

export function PlayerRoot() {
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();

  const current = usePlayer((s) => s.current);
  const queue = usePlayer((s) => s.queue);
  const queueIndex = usePlayer((s) => s.queueIndex);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const expanded = usePlayer((s) => s.expanded);
  const ytViewMode = usePlayer((s) => s.ytViewMode);
  const positionMs = usePlayer((s) => s.positionMs);
  const durationMs = usePlayer((s) => s.durationMs);
  const error = usePlayer((s) => s.error);

  const playTrack = usePlayer((s) => s.playTrack);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const next = usePlayer((s) => s.next);
  const prev = usePlayer((s) => s.prev);
  const close = usePlayer((s) => s.close);
  const setExpanded = usePlayer((s) => s.setExpanded);
  const setYtViewMode = usePlayer((s) => s.setYtViewMode);
  const seekTo = usePlayer((s) => s.seekTo);
  const setError = usePlayer((s) => s.setError);
  const setProgress = usePlayer((s) => s._setProgress);
  const setIsPlaying = usePlayer((s) => s._setIsPlaying);

  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: expanded ? 1 : 0,
      useNativeDriver: false,
      speed: 14,
      bounciness: 4,
    }).start();
  }, [expanded, anim]);

  // Sincronização Spotify (a música toca na app Spotify; fazemos poll do estado)
  useEffect(() => {
    if (!current || current.source !== 'spotify') return;
    const id = setInterval(async () => {
      try {
        const s = await getPlaybackState();
        if (!s) return;
        if (s.trackId === current.sourceId) {
          setProgress(s.progressMs, s.durationMs);
          setIsPlaying(s.isPlaying);
        }
      } catch {
        // offline / token expirado — ignorar silenciosamente no poll
      }
    }, 3000);
    return () => clearInterval(id);
  }, [current, setProgress, setIsPlaying]);

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

  // Retângulos do frame de vídeo YouTube (mini <-> expandido)
  const vidMini = {
    x: 10 + 8,
    y: H - miniBottom - MINI_PLAYER_HEIGHT + (MINI_PLAYER_HEIGHT - 50) / 2,
    w: 89,
    h: 50,
  };
  const vidFull = { x: 0, y: insets.top + 96, w: W, h: (W * 9) / 16 };

  const upNext = queue.slice(queueIndex + 1, queueIndex + 7);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {isYt && isPlaying ? <KeepAwakeWhilePlaying /> : null}

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
        {/* fundo: artwork desfocada + véu escuro */}
        {current.artworkUrl ? (
          <Image
            source={{ uri: current.artworkUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={60}
          />
        ) : null}
        <View style={styles.dim} />
        <LinearGradient
          colors={gradients.fadeDown}
          style={styles.bottomFade}
          pointerEvents="none"
        />

        {/* cabeçalho */}
        <View style={[styles.fullHeader, { paddingTop: insets.top + 8 }]}>
          <Pressable hitSlop={10} onPress={() => setExpanded(false)}>
            <Ionicons name="chevron-down" size={26} color={colors.text} />
          </Pressable>
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text style={type.micro}>Now playing</Text>
            <Text
              style={[
                type.micro,
                { color: isYt ? colors.youtube : colors.spotify },
              ]}
            >
              {isYt ? 'YouTube' : 'Spotify'}
            </Text>
          </View>
          <Pressable hitSlop={10} onPress={close}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* área do vídeo (o WebView flutua por cima) ou artwork Spotify */}
        {isYt ? (
          <View style={{ height: vidFull.h }} />
        ) : (
          <View style={styles.artworkWrap}>
            {current.artworkUrl ? (
              <Image
                source={{ uri: current.artworkUrl }}
                style={styles.bigArtwork}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={[styles.bigArtwork, styles.artFallback]}>
                <Ionicons
                  name="musical-notes"
                  size={64}
                  color={colors.textTertiary}
                />
              </View>
            )}
          </View>
        )}

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.fullBody}
          showsVerticalScrollIndicator={false}
        >
          <Text numberOfLines={2} style={[type.title, { textAlign: 'center' }]}>
            {current.title}
          </Text>
          {current.artist ? (
            <Text
              numberOfLines={1}
              style={[type.caption, { textAlign: 'center', fontSize: 15 }]}
            >
              {current.artist}
            </Text>
          ) : null}

          {isYt ? (
            <View style={{ gap: 8, marginTop: spacing.md }}>
              <View style={{ width: 200, alignSelf: 'center' }}>
                {/* Toggle vista vídeo / vista foto — o WebView continua a
                    tocar por trás da foto (áudio e anúncios continuam) */}
                <View style={styles.toggleWrap}>
                  {(['video', 'photo'] as const).map((mode) => (
                    <Pressable
                      key={mode}
                      onPress={() => setYtViewMode(mode)}
                      style={[
                        styles.toggleBtn,
                        ytViewMode === mode && styles.toggleBtnActive,
                      ]}
                    >
                      <Ionicons
                        name={mode === 'video' ? 'videocam' : 'image'}
                        size={14}
                        color={
                          ytViewMode === mode
                            ? colors.text
                            : colors.textTertiary
                        }
                      />
                      <Text
                        style={[
                          styles.toggleLabel,
                          ytViewMode === mode && { color: colors.text },
                        ]}
                      >
                        {mode === 'video' ? 'Video' : 'Photo'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <Text style={[type.caption, { textAlign: 'center', fontSize: 11 }]}>
                Plays through the official YouTube player · screen stays awake
              </Text>
            </View>
          ) : (
            <Text
              style={[
                type.caption,
                { textAlign: 'center', fontSize: 11, marginTop: spacing.md },
              ]}
            >
              Playing via the Spotify app · Premium required
            </Text>
          )}

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
              hitSlop={12}
              onPress={prev}
              disabled={queueIndex === 0}
              style={queueIndex === 0 && { opacity: 0.3 }}
            >
              <Ionicons name="play-skip-back" size={30} color={colors.text} />
            </Pressable>

            <Pressable onPress={togglePlay}>
              <LinearGradient
                colors={gradients.aurora}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.playBtn}
              >
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={34}
                  color="#fff"
                  style={!isPlaying && { marginLeft: 3 }}
                />
              </LinearGradient>
            </Pressable>

            <Pressable
              hitSlop={12}
              onPress={next}
              disabled={queueIndex >= queue.length - 1}
              style={queueIndex >= queue.length - 1 && { opacity: 0.3 }}
            >
              <Ionicons
                name="play-skip-forward"
                size={30}
                color={colors.text}
              />
            </Pressable>
          </View>

          {/* a seguir */}
          {upNext.length > 0 ? (
            <View style={{ marginTop: spacing.xl, gap: 2 }}>
              <Text style={[type.micro, { marginBottom: spacing.sm }]}>
                Up next
              </Text>
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
                      <Ionicons
                        name="musical-notes"
                        size={12}
                        color={colors.textTertiary}
                      />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[type.body, { fontSize: 14 }]}>
                      {t.title}
                    </Text>
                    <Text numberOfLines={1} style={[type.caption, { fontSize: 11 }]}>
                      {t.artist ?? (t.source === 'youtube' ? 'YouTube' : 'Spotify')}
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
            // slot vazio — o WebView flutua exatamente por cima desta área
            <View style={{ width: 89, height: 50 }} />
          ) : current.artworkUrl ? (
            <Image
              source={{ uri: current.artworkUrl }}
              style={styles.miniArt}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.miniArt, styles.artFallback]}>
              <Ionicons
                name="musical-notes"
                size={16}
                color={colors.textTertiary}
              />
            </View>
          )}

          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={1} style={[type.body, { fontWeight: '600', fontSize: 14 }]}>
              {current.title}
            </Text>
            <Text numberOfLines={1} style={[type.caption, { fontSize: 11 }]}>
              {current.artist ?? (isYt ? 'YouTube' : 'Spotify')}
            </Text>
          </View>

          <Pressable hitSlop={10} onPress={togglePlay}>
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={24}
              color={colors.text}
            />
          </Pressable>
          <Pressable
            hitSlop={10}
            onPress={next}
            disabled={queueIndex >= queue.length - 1}
            style={queueIndex >= queue.length - 1 && { opacity: 0.3 }}
          >
            <Ionicons name="play-skip-forward" size={22} color={colors.text} />
          </Pressable>
        </Pressable>
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
              outputRange: [8, 0],
            }),
            overflow: 'hidden',
            backgroundColor: '#000',
          }}
        >
          <YouTubePlayerView videoId={current.sourceId} />

          {/* Vista foto: artwork por cima — o WebView CONTINUA a tocar por trás */}
          {expanded && ytViewMode === 'photo' && current.artworkUrl ? (
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
          style={[
            styles.toast,
            { bottom: miniBottom + MINI_PLAYER_HEIGHT + 10 },
          ]}
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,15,0.72)',
  },
  bottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 220,
  },
  fullHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  artworkWrap: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  bigArtwork: {
    width: 300,
    height: 300,
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
    paddingTop: spacing.lg,
    paddingBottom: 48,
  },
  toggleWrap: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radii.pill,
    padding: 2,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: radii.pill,
  },
  toggleBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  toggleLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 44,
    marginTop: spacing.xl,
  },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upNextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: radii.md,
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
  },
  miniInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: 8,
    paddingRight: 14,
  },
  miniArt: {
    width: 48,
    height: 48,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
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
