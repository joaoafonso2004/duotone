import {StateIcon} from './StateIcon';
import { useOfflineMode } from '../hooks/useOfflineMode';
import { readLikedSongsCache } from '../lib/likedSongsCache';
import { useAuth } from '../state/auth';
import { closePlayerSmoothly, confirmaSwipe } from '../lib/closePlayer';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { displayArtist } from '../lib/artistName';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  AppState,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  Keyboard,
  Image as RNImage,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { saveToLibrary, removeFromLibrary, checkIsSaved } from '../api/library';
import { hapticNotification, hapticSelection } from '../lib/haptics';
import { setRepeatMode as persistRepeatMode, setShuffle as persistShuffle } from '../lib/prefs';
import { useSaved } from '../state/saved';
import { usePlayer } from '../state/player';
import { colors, MINI_PLAYER_HEIGHT, radii, spacing, type } from '../theme';
import { useTheme } from '../state/theme';
import { AddToPlaylistSheet } from './AddToPlaylistSheet';
import { ProgressBar } from './ProgressBar';
import { YouTubePlayerView } from './YouTubePlayerView';
import {ArtworkLyricsCube} from './ArtworkLyricsCube';
import { QueueSheet } from './QueueSheet';
import { modoDeShuffle, rotuloDoModo } from '../lib/smartShuffle';
import { EstrelaInteligente } from './BrilhoInteligente';
import { EqualizadorSheet } from './EqualizadorSheet';
import { navigationRef } from '../navigation/RootNavigator';
import { endSession, publishSession, publishSessionNow } from '../lib/sessionSync';
import { useAutoplayRadio } from '../lib/radioSync';
import { addRemoteCommandListeners } from '../../modules/duotone-remote-commands';
import { reafirmarComandosDeFaixa } from '../lib/comandosDeFaixa';

const TAB_BAR_BASE = 49;
const HEADER_H = 44;
const APP_NAME = 'Duotone';

export function PlayerRoot() {
  const offline=useOfflineMode();
  const offlineId=useAuth(s=>s.session?.user.id??s.offlineUserId);
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const theme = useTheme((s) => s.theme);

  const current = usePlayer((s) => s.current);
  const queue = usePlayer((s) => s.queue);
  const queueIndex = usePlayer((s) => s.queueIndex);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const expanded = usePlayer((s) => s.expanded);
  const repeatMode = usePlayer((s) => s.repeatMode);
  const shuffle = usePlayer((s) => s.shuffle);
  const autoplayRadio = usePlayer((s) => s.autoplayRadio);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const shuffleInteligente = usePlayer((s) => s.shuffleInteligente);
  const showRewindButton = usePlayer((s) => s.showRewindButton);
  const positionMs = usePlayer((s) => s.positionMs);
  const durationMs = usePlayer((s) => s.durationMs);
  const buffering = usePlayer((s) => s.buffering);
  const error = usePlayer((s) => s.error);
  const activeBackend = usePlayer((s) => s.activeBackend);
  const downloadProgress = usePlayer((s) => s.downloadProgress);

  const playTrack = usePlayer((s) => s.playTrack);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const next = usePlayer((s) => s.next);
  const prev = usePlayer((s) => s.prev);
  const close = closePlayerSmoothly;
  const closeGain = usePlayer((s) => s.closeGain);
  const reducedMotion=useReducedMotion();
  const setExpanded = usePlayer((s) => s.setExpanded);
  const seekTo = usePlayer((s) => s.seekTo);
  const setError = usePlayer((s) => s.setError);

  // Rádio: mantém a fila abastecida antes de ela acabar, para não haver
  // silêncio entre a última faixa e a primeira do rádio.
  useAutoplayRadio();

  // Distingue "nunca houve faixa" de "o player foi fechado", para não
  // mandar um delete ao arrancar a app sem nada a tocar.
  const hadTrackRef = useRef(false);

  const anim = useRef(new Animated.Value(0)).current;
  // Deslocamento vertical do gesto de "arrastar para baixo para fechar" o
  // now-playing. Soma-se ao translateY do overlay (e da frame de vídeo).
  const dragY = useRef(new Animated.Value(0)).current;
  const dragX = useRef(new Animated.Value(0)).current;
  const widthRef = useRef(W); widthRef.current = W;
  const swiping = useRef(false);
  const swipeClose = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e,g) => !usePlayer.getState().expanded && !usePlayer.getState().closing && g.dx>12 && g.dx>Math.abs(g.dy)*1.5,
    onPanResponderGrant: () => { swiping.current=true; },
    onPanResponderMove: (_e,g) => dragX.setValue(Math.max(0,g.dx)),
    onPanResponderRelease: (_e,g) => {
      if(confirmaSwipe(g.dx,g.dy,g.vx,widthRef.current)) void closePlayerSmoothly();
      else Animated.spring(dragX,{toValue:0,useNativeDriver:true}).start();
      setTimeout(()=>{swiping.current=false;},200);
    },
    onPanResponderTerminate: () => {swiping.current=false;Animated.spring(dragX,{toValue:0,useNativeDriver:true}).start();},
  })).current;
  useEffect(()=>{dragX.setValue(0);},[current,dragX]);
  const miniFade=Animated.multiply(closeGain,dragX.interpolate({inputRange:[0,W],outputRange:[1,0.2],extrapolate:'clamp'}));

  // Opacidade da capa: "respira" (fade in/out) enquanto a música carrega.
  const pulse = useRef(new Animated.Value(1)).current;

  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [queueVisible, setQueueVisible] = useState(false);
  const [eqVisible, setEqVisible] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [currentRoute, setCurrentRoute] = useState<string | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    toastOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.delay(1800),
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setToastMessage(null);
      }
    });
  };

  const handleTitleLongPress = async () => {
    if (current?.title) {
      await Clipboard.setStringAsync(current.title);
      hapticSelection();
      showToast('Copiado');
    }
  };

  const visibilityAnim = useRef(new Animated.Value(1)).current;
  const shouldHide = (keyboardVisible && !expanded) || currentRoute === 'Settings';

  useEffect(() => {
    Animated.timing(visibilityAnim, {
      toValue: shouldHide ? 0 : 1,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [shouldHide]);

  // A sessão de handoff mantém a fila privada entre dispositivos.
  useEffect(() => {
    if (current) {
      hadTrackRef.current = true;
      publishSession();
    } else if (hadTrackRef.current) {
      // O player foi fechado: já não há nada para continuar noutro lado.
      hadTrackRef.current = false;
      void endSession();
    }
  }, [current, isPlaying, queueIndex]);

  // Guardar o handoff ao mudar de estado; a presença é gerida globalmente.
  useEffect(() => {
    const sub = AppState.addEventListener('change', () => {
      if (usePlayer.getState().current) publishSessionNow();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));

    // Listen to navigation changes to hide player bar on specific screens (e.g. Settings)
    const onNavStateChange = () => {
      if (navigationRef.isReady()) {
        const route = navigationRef.getCurrentRoute();
        setCurrentRoute(route?.name ?? null);
      }
    };

    let unsub: (() => void) | undefined;
    if (navigationRef.isReady()) {
      unsub = navigationRef.addListener('state', onNavStateChange);
      onNavStateChange();
    } else {
      // Check again after a short delay if navigation is not ready yet
      const timer = setInterval(() => {
        if (navigationRef.isReady()) {
          unsub = navigationRef.addListener('state', onNavStateChange);
          onNavStateChange();
          clearInterval(timer);
        }
      }, 200);
      return () => {
        clearInterval(timer);
        showSub.remove();
        hideSub.remove();
        if (unsub) unsub();
      };
    }

    return () => {
      showSub.remove();
      hideSub.remove();
      if (unsub) unsub();
    };
  }, []);

  // Botões de faixa seguinte/anterior no Lock Screen / Control Center /
  // auscultadores. O expo-video só publica play/pause/seek; o módulo nativo
  // local (modules/duotone-remote-commands) regista next/prev no
  // MPRemoteCommandCenter e reencaminha para a fila do store.
  useEffect(
    () =>
      addRemoteCommandListeners(
        () => usePlayer.getState().next(),
        () => usePlayer.getState().prev()
      ),
    []
  );
  // A fila mudou -> reafirmar. Os eventos do player nativo cobrem o resto,
  // que é onde isto falhava (ver src/lib/comandosDeFaixa.ts).
  useEffect(() => {
    reafirmarComandosDeFaixa();
  }, [current, queue.length, repeatMode, shuffle, isPlaying]);

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
    // Repõe o gesto de arrasto apenas ao abrir ou mudar de faixa, mantendo o valor
    // durante a animação de encerramento por arrasto para evitar teletransporte.
    if (expanded) {
      dragY.setValue(0);
    }
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
  const [dbTrackId, setDbTrackId] = useState<string | null>(null);
  useEffect(() => {
    if (!current) {
      setSaved(false);
      setDbTrackId(null);
      return;
    }
    let active=true;
    if(offline){
      if(offlineId)void readLikedSongsCache(offlineId).then(tracks=>{
        if(!active)return;
        const t=tracks.find(t=>t.source===current.source&&t.sourceId===current.sourceId);
        setSaved(!!t);setDbTrackId(t?.id??null);
      });
    }else checkIsSaved(current.source,current.sourceId).then(res=>{if(active){setSaved(res.saved);setDbTrackId(res.trackId);}});
    return()=>{active=false;};
  },[current?.source,current?.sourceId,offline,offlineId]);

  const [showLyrics, setShowLyrics] = useState(false);
  useEffect(() => {
    setShowLyrics(false);
  }, [current?.sourceId]);

  // Capa em ALTA resolução: a YouTube Data API devolve thumbnails pequenas, mas
  // i.ytimg.com tem versões grandes por videoId. Começamos na maxresdefault
  // (1280px) e, se não existir, caímos na hqdefault (existe sempre). Faz a
  // capa ficar nítida como no Demus.
  const [artUri, setArtUri] = useState<string | null>(null);
  useEffect(() => {
    const active = current;
    if (!active) {
      setArtUri(null);
    } else if (active.source === 'youtube') {
      setArtUri(`https://i.ytimg.com/vi/${active.sourceId}/maxresdefault.jpg`);
    } else {
      setArtUri(active.artworkUrl ?? null);
    }
  }, [current?.sourceId]);

  const onArtError = () => {
    const active = current;
    if (active && active.source === 'youtube' && artUri?.includes('maxresdefault')) {
      setArtUri(`https://i.ytimg.com/vi/${active.sourceId}/hqdefault.jpg`);
    }
  };
  const artSource = artUri ?? current?.artworkUrl;

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
    if(offline){Alert.alert('Offline','Connect to the internet to change your liked songs.');return;}
    if (!current) return;
    const wasSaved = saved;
    setSaved(!wasSaved); // otimista
    try {
      if (wasSaved) {
        let idToRemove = dbTrackId;
        if (!idToRemove) {
          const res = await checkIsSaved(current.source, current.sourceId);
          idToRemove = res.trackId;
        }
        if (idToRemove) {
          await removeFromLibrary(idToRemove);
        }
        setSaved(false);
      } else {
        const newId = await saveToLibrary(current);
        setDbTrackId(newId);
        setSaved(true);
        hapticNotification();
      }
      // Manter o conjunto global em sincronia: é dele que vem a marca de
      // "já guardada" nos resultados de pesquisa.
      useSaved.getState().markSaved(current, !wasSaved);
    } catch (e: any) {
      setSaved(wasSaved);
      Alert.alert('Error', e?.message ?? 'Could not update library.');
    }
  };

  // Auto-limpar erros
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 4500);
    return () => clearTimeout(id);
  }, [error, setError]);

  if (!current) return null;

  const isYt = current.source === 'youtube';
  const atQueueEnd =
    repeatMode === 'off' &&
    !shuffle &&
    !autoplayRadio &&
    queueIndex >= queue.length - 1;
  const TAB_H = TAB_BAR_BASE + insets.bottom;
  const miniBottom = TAB_H + 8;
  const fraction = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;

  // Capa: mini (quadrado 48px, no mini-player) <-> expandido (quadrado GRANDE
  // centrado). Antes era 16:9 (herança do vídeo) — agora que é só áudio, a
  // capa é quadrada e grande, para um look limpo tipo app de música.
  const ART_FULL = Math.min(W - 64, H * 0.42);
  const vidMini = {
    x: 10 + 8,
    y: keyboardVisible && !expanded
      ? H + 500
      : H - miniBottom - MINI_PLAYER_HEIGHT + (MINI_PLAYER_HEIGHT - 48) / 2,
    w: 48,
    h: 48,
  };
  const vidFull = {
    x: (W - ART_FULL) / 2,
    y: insets.top + 6 + HEADER_H + 20,
    w: ART_FULL,
    h: ART_FULL,
  };

  // upNext is now handled inside QueueSheet

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
        {artSource ? (
          <Image
            source={{ uri: artSource }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={64}
            transition={450}
            onError={onArtError}
          />
        ) : null}
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
          {/* Marca empilhada: símbolo em cima, nome por baixo, ambos ao
              centro. O ficheiro é quadrado com a marca ao centro (ocupa 84%
              da largura), por isso a caixa também é quadrada -- numa caixa
              larga o `contain` encolhia-a até não se ver. */}
          <View style={[styles.headerCenter, { flexDirection: 'column', alignItems: 'center', gap: 1 }]}>
            <Image
              source={require('../../assets/auth-logo.png')}
              style={{ width: 22, height: 22 }}
              contentFit="contain"
            />
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
        <View style={{ height: vidFull.h, marginTop: 20, marginBottom: 12 }} />

        <View style={styles.staticBody}>
          {/* Grupo Principal: Título + Ações, Barra de Progresso e Controlos de Reprodução */}
          <View style={styles.mainControlsGroup}>
            {/* título + ações visíveis (guardar / adicionar a playlist) */}
            <View style={styles.titleRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Pressable
                  onLongPress={handleTitleLongPress}
                  delayLongPress={500}
                  style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
                >
                  <Text style={styles.trackTitle} numberOfLines={2}>
                    {current.title}
                  </Text>
                </Pressable>
                <Text numberOfLines={1} style={styles.trackArtist}>
                  {downloadProgress != null
                    ? `Downloading… ${Math.round(downloadProgress * 100)}%`
                    : displayArtist(current)}
                </Text>
              </View>
              <Pressable
                hitSlop={8}
                onPress={saveCurrentToLibrary}
                style={[styles.actionsBtn, saved && styles.actionsBtnActive]}
                accessibilityLabel={saved ? 'Saved to Library' : 'Save to Library'}
              >
                <StateIcon
                  name={saved ? 'heart' : 'heart-outline'}
                  size={20}
                  color={colors.text}
                />
              </Pressable>
              <Pressable
                hitSlop={8}
                onPress={() => {if(offline)Alert.alert('Offline','Connect to the internet to edit playlists.');else setPlaylistOpen(true);}}
                style={styles.actionsBtn}
                accessibilityLabel="Add to playlist"
              >
                <Ionicons name="add" size={22} color={colors.text} />
              </Pressable>
            </View>

            {/* Barra de Progresso */}
            <View style={{ marginTop: spacing.xs }}>
              <ProgressBar
                positionMs={positionMs}
                durationMs={durationMs}
                onSeek={seekTo}
                onScrubbingChange={setScrubbing}
              />
            </View>

            {/* Controlos: shuffle · anterior · play · seguinte · repeat */}
            <View style={styles.controls}>
              {/* Três estados: apagado, ligado, e inteligente — este último
                  com uma estrelinha ao canto, que é como o Spotify o mostra e
                  como o João o conhece. Sem a estrela, ligar o inteligente não
                  se distinguia do normal e ninguém saberia em que modo está. */}
              <Pressable
                hitSlop={12}
                onPress={onToggleShuffle}
                accessibilityLabel={rotuloDoModo(modoDeShuffle(shuffle, shuffleInteligente))}
              >
                <StateIcon
                  name="shuffle"
                  size={22}
                  color={shuffle ? colors.text : colors.textTertiary}
                />
                {shuffleInteligente && (
                  <View style={{ position: 'absolute', top: -3, right: -5 }}>
                    <EstrelaInteligente tamanho={7} cor={theme.color} />
                  </View>
                )}
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
                <StateIcon
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

              <Pressable
                hitSlop={12}
                onPress={onCycleRepeat}
                accessibilityRole="button"
                accessibilityState={{ selected: repeatMode !== 'off' }}
                accessibilityLabel={
                  repeatMode === 'one' ? 'Repeat this track'
                    : repeatMode === 'all' ? 'Repeat queue' : 'Repeat off'
                }
              >
                <StateIcon
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
          </View>

          {/* Grupo de Rodapé: Botão Recuar & Botões Utilitários (Fila & Equalizador) */}
          <View style={styles.bottomGroup}>
            {showRewindButton ? (
              <Pressable
                hitSlop={14}
                onPress={() => seekTo(Math.max(0, positionMs - 15000))}
                accessibilityLabel="Rewind 15 seconds"
                style={{ alignSelf: 'center', marginBottom: spacing.md }}
              >
                <Ionicons name="play-back" size={20} color={colors.textSecondary} />
              </Pressable>
            ) : null}

            <View style={styles.utilityRow}>
              <Pressable
                hitSlop={12}
                onPress={() => {
                  hapticSelection();
                  setQueueVisible(true);
                }}
                style={[styles.utilityIconBtn, { backgroundColor: theme.soft }]}
              >
                <Ionicons name="list" size={18} color={theme.color} />
                <Text style={[styles.utilityIconLabel, { color: theme.color }]}>Queue</Text>
              </Pressable>

              <Pressable
                hitSlop={12}
                onPress={() => {
                  hapticSelection();
                  setEqVisible(true);
                }}
                style={[styles.utilityIconBtn, { backgroundColor: theme.soft }]}
              >
                <Ionicons name="options-outline" size={18} color={theme.color} />
                <Text style={[styles.utilityIconLabel, { color: theme.color }]}>EQ</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Animated.View>

      <Animated.View
        {...swipeClose.panHandlers}
        accessibilityActions={[{name:'dismiss',label:'Fechar leitor'}]}
        onAccessibilityAction={()=>void closePlayerSmoothly()}
        pointerEvents={shouldHide || expanded ? 'none' : 'auto'}
        style={[
          styles.mini,
          {
            bottom: miniBottom,
            transform:[{translateX:reducedMotion?0:Animated.add(dragX,(1-closeGain)*W)}],
            opacity: Animated.multiply(
              Animated.multiply(visibilityAnim,miniFade),
              anim.interpolate({
                inputRange: [0, 0.35],
                outputRange: [1, 0],
                extrapolate: 'clamp',
              })
            ),
          },
        ]}
      >
          <Pressable style={styles.miniInner} onPress={() => {if(!swiping.current)setExpanded(true);}}>
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
                {downloadProgress != null
                  ? `Downloading… ${Math.round(downloadProgress * 100)}%`
                  : displayArtist(current)}
              </Text>
            </View>

            {/* Guardar sem ter de abrir o player todo. */}
            <Pressable
              hitSlop={8}
              onPress={saveCurrentToLibrary}
              accessibilityLabel={saved ? 'Remove from Library' : 'Save to Library'}
              style={styles.miniBtn}
            >
              <StateIcon
                name={saved ? 'heart' : 'heart-outline'}
                size={19}
                color={saved ? theme.color : colors.textSecondary}
              />
            </Pressable>
            <Pressable hitSlop={8} onPress={togglePlay} style={styles.miniBtn}>
              <StateIcon
                name={isPlaying ? 'pause' : 'play'}
                size={22}
                color={colors.text}
              />
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={next}
              // Com o rádio ligado a fila nunca é o fim: o `next()` estende-a.
              disabled={atQueueEnd}
              style={[styles.miniBtn, atQueueEnd && styles.dimmed]}
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
      {current ? (
        <Animated.View
          {...(!expanded ? swipeClose.panHandlers : {})}
          pointerEvents={shouldHide ? 'none' : 'auto'}
          style={{
            position: 'absolute',
            opacity: expanded ? visibilityAnim : Animated.multiply(visibilityAnim,miniFade),
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
            transform: [{ translateY: dragY },{translateX:expanded||reducedMotion?0:Animated.add(dragX,(1-closeGain)*W)}],
            overflow: expanded ? 'visible' : 'hidden',
            backgroundColor: expanded ? 'transparent' : '#000',
          }}
        >
          {isYt && <View style={[StyleSheet.absoluteFill,{overflow:'hidden',borderRadius:20,opacity:expanded?0:1}]}><YouTubePlayerView track={current} /></View>}

          {/* Fundo preto opaco para tapar quaisquer controlos, logos ou botões do YouTube (WebView)
              de brilharem por trás quando a capa de álbum diminui de opacidade ao pulsar. */}
          {!expanded && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} pointerEvents="none" />
          )}

          {/* Mostramos SEMPRE a thumbnail por cima — o áudio nativo continua a
              tocar por trás. (A app é só áudio; o vídeo é irrelevante.) A capa
              "respira" (opacidade a pulsar) enquanto a música carrega. */}
          {!expanded && artSource ? (
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

          {expanded && <ArtworkLyricsCube key={`${current.source}:${current.sourceId}`} track={current} size={vidFull.w} artwork={artSource} showLyrics={showLyrics} onChange={setShowLyrics}
            front={artSource?<RNImage source={{uri:artSource}} style={StyleSheet.absoluteFill} resizeMode="cover" onError={onArtError} />:<View style={StyleSheet.absoluteFill} />} />}

          {/* No modo mini, tocar no vídeo expande */}
          {!expanded ? (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => {if(!swiping.current)setExpanded(true);}}
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

      {/* ===================== TOAST CLEAN DE AVISO ===================== */}
      {toastMessage ? (
        <Animated.View
          style={[
            styles.toastClean,
            {
              bottom: expanded ? insets.bottom + 90 : miniBottom + MINI_PLAYER_HEIGHT + 10,
              opacity: toastOpacity,
              transform: [
                {
                  translateY: toastOpacity.interpolate({
                    inputRange: [0, 1],
                    outputRange: [12, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Ionicons name="checkmark-circle" size={16} color="#4ADE80" />
          <Text style={styles.toastCleanText}>{toastMessage}</Text>
        </Animated.View>
      ) : null}

      {/* ===================== ADICIONAR A PLAYLIST ===================== */}
      <AddToPlaylistSheet
        visible={playlistOpen}
        track={current}
        onClose={() => setPlaylistOpen(false)}
      />

      {/* ===================== LISTA DA FILA (QUEUE) ===================== */}
      <QueueSheet
        visible={queueVisible}
        onClose={() => setQueueVisible(false)}
      />

      {/* ===================== EQUALIZADOR E VELOCIDADE ===================== */}
      <EqualizadorSheet
        visible={eqVisible}
        onClose={() => setEqVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  staticBody: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'space-between',
    paddingBottom: spacing.xxl + spacing.xl,
    paddingTop: spacing.sm,
  },
  mainControlsGroup: {
    width: '100%',
    gap: spacing.xl,
  },
  bottomGroup: {
    width: '100%',
    alignItems: 'center',
  },
  utilityRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  utilityIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: radii.pill,
  },
  utilityIconLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
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
  actionsBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderColor: 'rgba(255,255,255,0.25)',
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
    marginTop: 0,
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
    backgroundColor: colors.text,
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
  toastClean: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(29, 29, 40, 0.95)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.pill,
    paddingVertical: 8,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  toastCleanText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
});
