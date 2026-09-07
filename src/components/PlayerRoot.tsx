import {StateIcon} from './StateIcon';
import { Toque } from './Toque';
import { BarraDaSessao } from './BarraDaSessao';
import { FolhaDaSessao } from './FolhaDaSessao';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { useSincroniaDaSessao } from '../hooks/useSincroniaDaSessao';
import { ESCALA } from '../lib/movimento';
import { useOfflineMode } from '../hooks/useOfflineMode';
import { readLikedSongsCache } from '../lib/likedSongsCache';
import { useAuth } from '../state/auth';
import { closePlayerSmoothly, confirmaSwipe } from '../lib/closePlayer';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
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
import { ShareFriendSheet } from './ShareFriendSheet';
import { navigationRef } from '../navigation/RootNavigator';
import { endSession, publishSession, publishSessionNow } from '../lib/sessionSync';
import { useAutoplayRadio } from '../lib/radioSync';
import {
  addAudioInterruptionListeners, addAudioOutputRemovedListener, addRemoteCommandListeners,
} from '../../modules/duotone-remote-commands';
import { addIntentListener } from '../../modules/duotone-intents';
import { accaoParaComando } from '../lib/comandosDaSiri';
import { deveRetomar } from '../lib/interrupcaoDeAudio';
import { apresentarErro } from '../lib/erroDeReproducao';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { limparOrigem, origemValida, type RectanguloDaCapa } from '../state/origemDaCapa';
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
  const maquina = usePlayer((s) => s.maquina);
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
  /**
   * O raio dos cantos, à parte -- mas no MESMO driver que o resto.
   *
   * Está separado do `anim` só porque tem outra escala: o `anim` vai de -1 a 1
   * para caber o voo de entrada, e o raio só tem duas paragens.
   *
   * O driver não é opcional. Uma vista só tem um nó de propriedades, e assim
   * que UMA delas passa para o driver nativo o React Native leva a vista
   * inteira -- animar outra propriedade da mesma vista a partir do JS deixa de
   * degradar e passa a ATIRAR, no arranque, antes de haver ecrã. Foi o que
   * matou a 1.12.0. O `borderRadius` está na lista do módulo nativo, por isso
   * não há aqui nada a sacrificar.
   */
  const animRaio = useRef(new Animated.Value(0)).current;
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
  const [partilhaAberta, setPartilhaAberta] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [queueVisible, setQueueVisible] = useState(false);
  const [eqVisible, setEqVisible] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [currentRoute, setCurrentRoute] = useState<string | null>(null);
  // Montado aqui porque o PlayerRoot existe enquanto a app existe -- e uma
  // sessao de escuta nao pode depender de um ecra estar aberto.
  useSincroniaDaSessao();
  const [sessaoAberta, setSessaoAberta] = useState(false);
  const temSessao = useOuvirJuntos((s) => !!s.sessao);

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
    // Tem de ser nativa. Este valor entra na opacidade de vistas cuja
    // transformacao ja corre no driver nativo, e o React Native passa a vista
    // INTEIRA para nativo quando uma das propriedades la vai -- animar esta a
    // partir do JS a seguir e um erro fatal, nao um degrade.
    Animated.timing(visibilityAnim, {
      toValue: shouldHide ? 0 : 1,
      duration: 250,
      useNativeDriver: true,
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

  // Uma chamada, um alarme, um vídeo do Instagram: o iOS tira o áudio e o
  // AVPlayer pára. Isso chegava como uma pausa igual às outras, e a máquina
  // trata as confirmações do motor como FASE e nunca como intenção -- de
  // propósito, senão uma confirmação atrasada ressuscitava a reprodução. O
  // efeito era a música calar-se com a app a mostrar-se a tocar, e ter de se
  // carregar em pausa e outra vez em play para voltar a ouvir.
  //
  // Guarda-se a intenção do instante em que a interrupção COMEÇOU: quando ela
  // acaba já não se sabe, porque a intenção entretanto caiu por nossa mão.
  const tocavaAntesDaInterrupcao = useRef(false);
  useEffect(
    () =>
      addAudioInterruptionListeners(
        () => {
          const st = usePlayer.getState();
          tocavaAntesDaInterrupcao.current = st.isPlaying;
          // O som já está cortado; isto só faz a UI dizer a verdade -- e põe o
          // `wantsPlayRef` a falso, que é o que impede o watchdog de ver uma
          // posição parada e julgar que o stream encravou.
          st.pausePlayback();
        },
        (oSistemaPede) => {
          const retomar = deveRetomar({
            tocavaAntes: tocavaAntesDaInterrupcao.current,
            oSistemaPede,
          });
          tocavaAntesDaInterrupcao.current = false;
          const st = usePlayer.getState();
          // O `isPlaying` na condição não é zelo a mais: se a pessoa carregou
          // em play durante a interrupção, já está a tocar e o toggle
          // pausava-a.
          if (retomar && !st.isPlaying) void st.togglePlay();
        }
      ),
    []
  );

  // Tirar os auscultadores. O iOS pausa o AVPlayer sozinho, mas a app ficava a
  // achar que estava a tocar: botão em play, Lock Screen desalinhado, e com o
  // crossfade só um dos dois motores parado.
  //
  // Voltar a ligar NÃO retoma -- como no Spotify. É por isso que não há aqui
  // um segundo handler: a ausência dele é a decisão.
  useEffect(
    () =>
      addAudioOutputRemovedListener(() => {
        const st = usePlayer.getState();
        // A interrupção guarda a intenção para poder retomar; aqui limpa-se de
        // propósito. Sem isto, uma chamada que acabasse logo a seguir lia um
        // `tocavaAntes` velho e punha a tocar sem ninguém ter pedido.
        tocavaAntesDaInterrupcao.current = false;
        if (st.isPlaying) st.pausePlayback();
      }),
    []
  );

  // Os atalhos da Siri. Não passam pelo `togglePlay` de propósito: quem fala
  // não vê o estado antes de falar, e dizer "tocar" com a música já a tocar
  // não pode pausá-la. A decisão está em lib/comandosDaSiri.ts, testada.
  useEffect(
    () =>
      addIntentListener((comando) => {
        const st = usePlayer.getState();
        const accao = accaoParaComando(comando, {
          aTocar: st.isPlaying,
          temFaixa: !!st.current,
        });
        if (accao === 'tocar' || accao === 'pausar') void st.togglePlay();
        else if (accao === 'seguinte') void st.next();
        else if (accao === 'anterior') void st.prev();
      }),
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
    Animated.parallel([
      Animated.spring(anim, { toValue: expanded ? 1 : 0, useNativeDriver: true, speed: 14, bounciness: 3 }),
      Animated.spring(animRaio, { toValue: expanded ? 1 : 0, useNativeDriver: true, speed: 14, bounciness: 3 }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, anim, dragY, current?.sourceId]);

  /**
   * A capa entra a voar da linha que foi tocada.
   *
   * Só quando o player estava ESCONDIDO: trocar de faixa com o mini já no
   * ecrã não pode fazer a capa saltar para fora e voltar -- ela já lá está.
   *
   * Declarado a seguir ao efeito de cima de propósito: os dois correm quando a
   * faixa muda, e o último a correr é que manda no `anim`.
   */
  const [origemDaEntrada, setOrigemDaEntrada] = useState<RectanguloDaCapa | null>(null);
  const tinhaFaixa = useRef(false);
  useEffect(() => {
    const temAgora = !!current;
    const entrou = temAgora && !tinhaFaixa.current;
    tinhaFaixa.current = temAgora;
    if (!entrou) { limparOrigem(); return; }

    const origem = origemValida(H);
    limparOrigem();
    // Sem medição válida (a lista rolou, a linha desmontou, veio de outro
    // sítio que não uma lista), ou com menos animação pedida ao sistema, o
    // player entra exactamente como sempre entrou.
    if (!origem || reducedMotion) return;

    setOrigemDaEntrada(origem);
    anim.setValue(-1);
    animRaio.setValue(0);
    Animated.spring(anim, {
      toValue: expanded ? 1 : 0,
      useNativeDriver: true,
      speed: 14,
      bounciness: 3,
    }).start(({ finished }) => { if (finished) setOrigemDaEntrada(null); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.sourceId]);

  /**
   * Arrastar para baixo, de QUALQUER ponto da página, para fechar o
   * now-playing. Estava só no cabeçalho, que é uma faixa estreita.
   *
   * O que impede isto de roubar os gestos de quem está por dentro é ser um
   * responder da fase NORMAL e não de captura: a negociação começa no nó mais
   * fundo tocado e sobe, por isso quem estiver lá dentro decide primeiro.
   * Em concreto, e sem precisar de exceções escritas à mão:
   *
   *  - as letras vivem num `ScrollView`, que fica com os arrastos verticais;
   *  - o cubo reclama em captura, mas só gestos horizontais (`acceptsCubeSwipe`);
   *  - a fila e o equalizador são folhas irmãs desta vista, não descendentes,
   *    portanto nunca chegam sequer a ver este gesto.
   *
   * O limiar subiu de 6 para 12 px, com a mesma dominância vertical de 1,5x que
   * o `swipeClose` usa: sobre a página inteira há botões por todo o lado, e 6 px
   * de deriva ao carregar num deles não pode começar a fechar o ecrã.
   */
  const dismissPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        g.dy > 12 && g.dy > Math.abs(g.dx) * 1.5,
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
            useNativeDriver: true,
          }).start();
        } else {
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
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

  // Um aviso some-se sozinho; uma falha fica, porque tem o que fazer dentro.
  // Ver lib/erroDeReproducao.ts.
  const aviso = apresentarErro({
    mensagem: error,
    estado: maquina,
    temSeguinte: !!usePlayer.getState().peekNextTrack(),
  });
  const erroTemporario = aviso?.temporario ?? false;
  useEffect(() => {
    if (!error || !erroTemporario) return;
    const id = setTimeout(() => setError(null), 4500);
    return () => clearTimeout(id);
  }, [error, erroTemporario, setError]);

  // Sem faixa não há leitor -- mas pode haver SESSÃO. Entrar numa sessão e
  // ficar à espera que o anfitrião escolha a primeira música é um estado
  // normal, e nesse a barra é a única coisa no ecrã que explica o que se passa.
  // Devolver `null` aqui deixava o convidado a olhar para uma app que parecia
  // não ter reagido ao convite.
  if (!current) {
    return (
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: spacing.xl,
          right: spacing.xl,
          bottom: TAB_BAR_BASE + insets.bottom + 8,
        }}
      >
        <BarraDaSessao aoAbrir={() => setSessaoAberta(true)} />
        <FolhaDaSessao visivel={sessaoAberta} aoFechar={() => setSessaoAberta(false)} />
      </View>
    );
  }

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

  /**
   * Onde a moldura tem de estar em cada paragem, em escala e deslocação.
   *
   * O centro é o que se desloca: escalar em RN é à volta do centro, por isso
   * basta levar o centro do quadrado grande até ao centro do sítio de destino
   * e encolher. Assim não há uma única propriedade de layout a animar.
   */
  const centro = (r: { x: number; y: number; w: number; h: number }) => ({
    x: r.x + r.w / 2,
    y: r.y + r.h / 2,
  });
  const centroFull = centro(vidFull);
  const centroMini = centro(vidMini);
  const escalaMini = vidMini.w / vidFull.w;
  const deslocacaoMini = { x: centroMini.x - centroFull.x, y: centroMini.y - centroFull.y };
  const origemComoRect = origemDaEntrada
    ? { x: origemDaEntrada.x, y: origemDaEntrada.y, w: origemDaEntrada.largura, h: origemDaEntrada.altura }
    : vidMini;
  const centroOrigem = centro(origemComoRect);
  const escalaOrigem = origemComoRect.w / vidFull.w;
  const deslocacaoOrigem = { x: centroOrigem.x - centroFull.x, y: centroOrigem.y - centroFull.y };
  // Sem voo de entrada a interpolação tem duas paragens, exactamente como antes.
  const faixaDoVoo = origemDaEntrada ? [-1, 0, 1] : [0, 1];
  const saidaDoVoo = (deOrigem: number, deMini: number, deFull: number) =>
    origemDaEntrada ? [deOrigem, deMini, deFull] : [deMini, deFull];


  /**
   * O artista do now-playing leva à página dele.
   *
   * Fecha o now-playing antes de navegar: o overlay é ecrã inteiro e por cima
   * do navegador, por isso navegar sem o minimizar abria a página do artista
   * por trás -- o utilizador carregava e não via acontecer nada.
   *
   * "Unknown artist" não é um artista. Aí o nome continua a aparecer, mas não
   * é um botão: levava a uma página vazia.
   */
  const nomeDoArtista = displayArtist(current);
  const temArtista = !!nomeDoArtista && nomeDoArtista !== 'Unknown artist';
  const abrirArtista = () => {
    if (!temArtista || !navigationRef.isReady()) return;
    hapticSelection();
    setExpanded(false);
    navigationRef.navigate('LibraryGroup', { type: 'artist', name: nomeDoArtista });
  };

  // upNext is now handled inside QueueSheet

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* ===================== OVERLAY EXPANDIDO ===================== */}
      <Animated.View
        pointerEvents={expanded ? 'auto' : 'none'}
        {...dismissPan.panHandlers}
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

        {/* cabeçalho — o arrasto para fechar agora é da página toda */}
        <View
          style={[styles.fullHeader, { marginTop: insets.top + 6 }]}
        >
          <Toque escala={ESCALA.icone} hitSlop={12} onPress={() => setExpanded(false)} style={styles.headerBtn}>
            <Ionicons name="chevron-down" size={24} color={colors.text} />
          </Toque>
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
          <Toque escala={ESCALA.icone} hitSlop={12} onPress={close} style={styles.headerBtn}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </Toque>
        </View>

        {/* No leitor grande basta um sinal, e nao a barra inteira: aqui o ecra
            e da musica, e uma faixa com nomes e estados por cima da capa rouba
            a atencao ao que se veio ver. Um icone diz o mesmo -- ha sessao a
            decorrer -- e leva ao mesmo sitio. */}
        {temSessao ? (
          <Toque
            escala={ESCALA.icone}
            hitSlop={12}
            onPress={() => setSessaoAberta(true)}
            accessibilityLabel="Ver a sessão de escuta"
            style={styles.sinalDaSessao}
          >
            <Ionicons name="headset" size={15} color={theme.color} />
          </Toque>
        ) : null}

        {/* Espaço reservado para a capa quadrada grande (a frame flutua por
            cima nesta posição). */}
        <View style={{ height: vidFull.h, marginTop: 20, marginBottom: 8 }} />

        {/* Dois pontos por baixo da capa: a pista mínima de que ali há outro
            lado. A capa fica limpa -- nada por cima dela, que era a condição.
            E tocar troca, para quem nunca descobrir o gesto de rodar. */}
        <View style={styles.pontosDoCubo}>
          {[false, true].map((paraAsLetras) => (
            <Pressable
              key={String(paraAsLetras)}
              hitSlop={10}
              onPress={() => setShowLyrics(paraAsLetras)}
              accessibilityLabel={paraAsLetras ? 'Ver as letras' : 'Ver a capa'}
            >
              <View
                style={[
                  styles.ponto,
                  showLyrics === paraAsLetras && { backgroundColor: theme.color, opacity: 1 },
                ]}
              />
            </Pressable>
          ))}
        </View>

        <View style={styles.staticBody}>
          {/* Grupo Principal: Título + Ações, Barra de Progresso e Controlos de Reprodução */}
          <View style={styles.mainControlsGroup}>
            {/* título + ações visíveis (guardar / adicionar a playlist) */}
            {/* O título ocupa a largura toda. As ações estavam à direita dele
                e, com duas linhas de título, empurravam-se uma à outra. */}
            <View style={styles.titleRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Pressable
                  onLongPress={handleTitleLongPress}
                  delayLongPress={500}
                  style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
                >
                  <Text style={styles.trackTitle} numberOfLines={2}>
                    {/* O mesmo título que as listas mostram. O player era o
                        único sítio da app a mostrar o título CRU do YouTube --
                        com o nome do artista à frente e o [Official Video]
                        atrás, por cima do artista repetido na linha de baixo. */}
                    {tituloDaFaixa(current)}
                  </Text>
                </Pressable>
                {downloadProgress != null ? (
                  <Text numberOfLines={1} style={styles.trackArtist}>
                    {`Downloading… ${Math.round(downloadProgress * 100)}%`}
                  </Text>
                ) : (
                  // O nome do artista leva à página dele, como em todo o resto
                  // da app. `alignSelf` para a área de toque acabar no fim do
                  // nome e não atravessar a largura toda -- um alvo invisível a
                  // ocupar a linha inteira apanha toques que não eram para ele.
                  <Toque
                    escala={ESCALA.cartao}
                    onPress={abrirArtista}
                    disabled={!temArtista}
                    hitSlop={8}
                    accessibilityRole={temArtista ? 'link' : undefined}
                    accessibilityLabel={temArtista ? `View ${nomeDoArtista}` : undefined}
                    style={{ alignSelf: 'flex-start', maxWidth: '100%' }}
                  >
                    <Text numberOfLines={1} style={styles.trackArtist}>
                      {nomeDoArtista}
                    </Text>
                  </Toque>
                )}
              </View>
            </View>

            {/* Guardar, juntar a uma playlist, mandar a alguém. */}
            <View style={styles.accoesRow}>
              <Toque
                escala={ESCALA.botao}
                hitSlop={8}
                onPress={saveCurrentToLibrary}
                style={[styles.actionsBtn, saved && styles.actionsBtnActive]}
                accessibilityLabel={saved ? 'Saved to Library' : 'Save to Library'}
              >
                {/* Salta ao guardar, como o shuffle salta ao ligar. O repeat
                    nao salta: percorrer tres modos e informacao, nao uma
                    escolha que se celebra -- e um icone a saltar de cada vez
                    que se passa por ele deixaria de querer dizer nada. */}
                <StateIcon
                  pulsar={saved}
                  name={saved ? 'heart' : 'heart-outline'}
                  size={20}
                  color={colors.text}
                />
              </Toque>
              <Toque
                escala={ESCALA.botao}
                hitSlop={8}
                onPress={() => {if(offline)Alert.alert('Offline','Connect to the internet to edit playlists.');else setPlaylistOpen(true);}}
                style={styles.actionsBtn}
                accessibilityLabel="Add to playlist"
              >
                <Ionicons name="add" size={22} color={colors.text} />
              </Toque>
              <Toque
                escala={ESCALA.botao}
                hitSlop={8}
                onPress={() => {if(offline)Alert.alert('Offline','Connect to the internet to share.');else setPartilhaAberta(true);}}
                style={styles.actionsBtn}
                accessibilityLabel="Partilhar com um amigo"
              >
                <Ionicons name="paper-plane-outline" size={19} color={colors.text} />
              </Toque>
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
              <Toque
                escala={ESCALA.icone}
                hitSlop={12}
                onPress={onToggleShuffle}
                accessibilityLabel={rotuloDoModo(modoDeShuffle(shuffle, shuffleInteligente))}
              >
                {/* Salta ao LIGAR e nao ao desligar. Ligar o shuffle e uma
                    escolha; desliga-lo e voltar ao normal, e o normal nao se
                    anuncia. A mesma assimetria do coracao. */}
                <StateIcon
                  pulsar={shuffle}
                  name="shuffle"
                  size={22}
                  color={shuffle ? colors.text : colors.textTertiary}
                />
                {shuffleInteligente && (
                  <View style={{ position: 'absolute', top: -3, right: -5 }}>
                    <EstrelaInteligente tamanho={7} cor={theme.color} />
                  </View>
                )}
              </Toque>

              <Toque
                escala={ESCALA.icone}
                accessibilityRole="button"
                accessibilityLabel="Previous track"
                hitSlop={14}
                onPress={prev}
                disabled={repeatMode === 'off' && !shuffle && queueIndex === 0}
                style={
                  repeatMode === 'off' && !shuffle && queueIndex === 0 && styles.dimmed
                }
              >
                <Ionicons name="play-skip-back" size={28} color={colors.text} />
              </Toque>

              <Toque
                escala={ESCALA.botao}
                accessibilityRole="button"
                accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
                onPress={togglePlay}
                style={styles.playBtn}
              >
                {/* `rodar` porque play e pause sao o mesmo botao visto dos
                    dois lados -- rodar diz isso. Nao `pulsar`: quem carrega
                    no play ja esta a olhar para ele, nao precisa de aviso. */}
                <StateIcon
                  rodar
                  name={isPlaying ? 'pause' : 'play'}
                  size={30}
                  color={colors.bg}
                  style={!isPlaying && { marginLeft: 3 }}
                />
              </Toque>

              <Toque
                escala={ESCALA.icone}
                accessibilityRole="button"
                accessibilityLabel="Next track"
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
              </Toque>

              <Toque
                escala={ESCALA.icone}
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
              </Toque>
            </View>
          </View>

          {/* Grupo de Rodapé: Botão Recuar & Botões Utilitários (Fila & Equalizador) */}
          <View style={styles.bottomGroup}>
            {showRewindButton ? (
              <Toque
                escala={ESCALA.icone}
                hitSlop={14}
                onPress={() => seekTo(Math.max(0, positionMs - 15000))}
                accessibilityLabel="Rewind 15 seconds"
                style={{ alignSelf: 'center', marginBottom: spacing.md }}
              >
                <Ionicons name="play-back" size={20} color={colors.textSecondary} />
              </Toque>
            ) : null}

            <View style={styles.utilityRow}>
              <Toque
                escala={ESCALA.botao}
                hitSlop={12}
                onPress={() => {
                  hapticSelection();
                  setQueueVisible(true);
                }}
                style={[styles.utilityIconBtn, { backgroundColor: theme.soft }]}
              >
                <Ionicons name="list" size={18} color={theme.color} />
                <Text style={[styles.utilityIconLabel, { color: theme.color }]}>Queue</Text>
              </Toque>

              <Toque
                escala={ESCALA.botao}
                hitSlop={12}
                onPress={() => {
                  hapticSelection();
                  setEqVisible(true);
                }}
                style={[styles.utilityIconBtn, { backgroundColor: theme.soft }]}
              >
                <Ionicons name="options-outline" size={18} color={theme.color} />
                <Text style={[styles.utilityIconLabel, { color: theme.color }]}>EQ</Text>
              </Toque>
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
                {tituloDaFaixa(current)}
              </Text>
              <Text numberOfLines={1} style={[type.caption, { fontSize: 11 }]}>
                {downloadProgress != null
                  ? `Downloading… ${Math.round(downloadProgress * 100)}%`
                  : displayArtist(current)}
              </Text>
            </View>

            {/* Guardar sem ter de abrir o player todo. */}
            <Toque
              escala={ESCALA.icone}
              hitSlop={8}
              onPress={saveCurrentToLibrary}
              accessibilityLabel={saved ? 'Remove from Library' : 'Save to Library'}
              style={styles.miniBtn}
            >
              <StateIcon
                pulsar={saved}
                name={saved ? 'heart' : 'heart-outline'}
                size={19}
                color={saved ? theme.color : colors.textSecondary}
              />
            </Toque>
            <Toque escala={ESCALA.icone} accessibilityRole="button" accessibilityLabel={isPlaying ? 'Pause' : 'Play'} hitSlop={8} onPress={togglePlay} style={styles.miniBtn}>
              <StateIcon
                rodar
                name={isPlaying ? 'pause' : 'play'}
                size={22}
                color={colors.text}
              />
            </Toque>
            <Toque
              escala={ESCALA.icone}
              hitSlop={8}
              onPress={next}
              // Com o rádio ligado a fila nunca é o fim: o `next()` estende-a.
              disabled={atQueueEnd}
              style={[styles.miniBtn, atQueueEnd && styles.dimmed]}
            >
              <Ionicons name="play-skip-forward" size={20} color={colors.text} />
            </Toque>
          </Pressable>

          {/* linha de progresso fina */}
          <View style={styles.miniTrack} pointerEvents="none">
            <View
              style={[styles.miniTrackFill, { width: `${fraction * 100}%` }]}
            />
          </View>
        </Animated.View>

      {/* A faixa da sessão de escuta, mesmo por cima do leitor pequeno.
          Fora do `Animated.View` do mini de propósito: ela existe mesmo quando
          ainda não há faixa nenhuma a tocar -- entrar numa sessão e ficar à
          espera que o anfitrião escolha é um estado normal, e nesse a barra é a
          única coisa que diz o que se está a passar. */}
      {!shouldHide && !expanded ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: spacing.xl,
            right: spacing.xl,
            // Encostada, sem folga: com os cantos de baixo direitos na barra,
            // as duas leem-se como uma peca so.
            bottom: miniBottom + (current ? MINI_PLAYER_HEIGHT : 0),
          }}
        >
          <BarraDaSessao aoAbrir={() => setSessaoAberta(true)} />
        </View>
      ) : null}
      <FolhaDaSessao visivel={sessaoAberta} aoFechar={() => setSessaoAberta(false)} />

      {/* ============ FRAME DE VÍDEO YOUTUBE (flutuante, nunca desmonta) ============ */}
      {current ? (
        <Animated.View
          {...(!expanded ? swipeClose.panHandlers : {})}
          pointerEvents={shouldHide ? 'none' : 'auto'}
          style={{
            position: 'absolute',
            opacity: expanded ? visibilityAnim : Animated.multiply(visibilityAnim,miniFade),
            // A moldura fica SEMPRE com a geometria do player grande, e vai
            // ao mini por escala e deslocação. O left/top/width/height são
            // propriedades de layout: não correm no driver nativo, e cada
            // fotograma tinha de atravessar a ponte para o JS e recalcular
            // layout -- era isso que dava a sensação de meia-cadência ao
            // minimizar. Escala e deslocação correm na UI thread.
            //
            // Ordem importa: translate depois de scale, para o arrasto do dedo
            // continuar a ser em píxeis de ecrã e não em píxeis encolhidos.
            left: vidFull.x,
            top: vidFull.y,
            width: vidFull.w,
            height: vidFull.h,
            borderRadius: animRaio.interpolate({
              inputRange: [0, 1],
              outputRange: [8, 20],
            }),
            transform: [
              {
                translateX: Animated.add(
                  anim.interpolate({
                    inputRange: faixaDoVoo,
                    outputRange: saidaDoVoo(deslocacaoOrigem.x, deslocacaoMini.x, 0),
                  }),
                  expanded || reducedMotion ? 0 : Animated.add(dragX, (1 - closeGain) * W)
                ),
              },
              {
                translateY: Animated.add(
                  anim.interpolate({
                    inputRange: faixaDoVoo,
                    outputRange: saidaDoVoo(deslocacaoOrigem.y, deslocacaoMini.y, 0),
                  }),
                  dragY
                ),
              },
              {
                scale: anim.interpolate({
                  inputRange: faixaDoVoo,
                  outputRange: saidaDoVoo(escalaOrigem, escalaMini, 1),
                }),
              },
            ],
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
          {!expanded && (origemDaEntrada?.uri || capaParaLista(artSource)) ? (
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: pulse }]}>
              {/* A MESMA imagem que a lista mostrava, e no mesmo formato: a
                  mini usa a mqdefault como as listas, não a que o player grande
                  carregou. Sem isto a capa aterrava e perdia as barras pretas
                  no momento do pouso -- dava-se pela troca, que é justamente o
                  que a animação existe para esconder. */}
              <Image
                source={{ uri: origemDaEntrada?.uri || capaParaLista(artSource) || undefined }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={origemDaEntrada ? 0 : 250}
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
      {aviso ? (
        <View
          style={[styles.toast, { bottom: miniBottom + MINI_PLAYER_HEIGHT + 10 }]}
        >
          <Ionicons name="alert-circle" size={16} color={colors.danger} />
          <View style={{ flex: 1, gap: aviso.accoes.length ? 8 : 0 }}>
            <Text style={styles.toastText}>{aviso.mensagem}</Text>
            {/* Uma faixa que falha não pode custar o sítio na fila: daqui
                repete-se ou salta-se, e a fila fica onde estava. */}
            {aviso.accoes.length > 0 && (
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {aviso.accoes.map((accao) => (
                  <Pressable
                    key={accao}
                    onPress={() => {
                      const st = usePlayer.getState();
                      setError(null);
                      if (accao === 'repetir') void st.togglePlay();
                      else void st.next();
                    }}
                    hitSlop={6}
                    style={({ pressed }) => [styles.accaoDoErro, pressed && { opacity: 0.6 }]}
                  >
                    <Text style={[type.caption, { color: theme.color, fontWeight: '700' }]}>
                      {accao === 'repetir' ? 'Tentar outra vez' : 'Seguinte'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
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

      {/* ===================== PARTILHAR COM UM AMIGO ===================== */}
      <ShareFriendSheet
        visible={partilhaAberta}
        itemType="track"
        item={current}
        onClose={() => setPartilhaAberta(false)}
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
  // O sinal de que ha sessao, no canto do cabecalho do leitor grande.
  sinalDaSessao: {
    position: 'absolute',
    right: 46,
    top: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
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
  pontosDoCubo: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 7,
    marginBottom: 10,
  },
  ponto: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textTertiary,
    opacity: 0.5,
  },
  accoesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
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
  accaoDoErro: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
  toast: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
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
