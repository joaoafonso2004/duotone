import { CapaComTransicao } from './CapaComTransicao';
import { sentidoDaTransicao, type Sentido } from '../lib/transicaoDaCapa';
import { CapaFlutuante3D } from './CapaFlutuante3D';
import { CAPA_FLUTUANTE } from '../lib/capaFlutuante3D';
import { useMontagemDaCapa, type MontagemDaCapa } from '../hooks/useMontagemDaCapa';
import type { Track } from '../types';
import { capaDeRecurso, desfoqueLeve } from '../lib/capaGrande';
import { capaGrande, marcarCapaFalhada, ouvirCapasGrandes, preCarregarCapasGrandes } from '../state/capasGrandes';
import { partilharRelatorioDoArranque } from '../lib/partilharRelatorioDoArranque';
import { ModoCarro } from './ModoCarro';
import { loadCapaIOS, useCapaIOS } from '../state/capaIOS';
import {StateIcon} from './StateIcon';
import { Toque } from './Toque';
import { TextoQueCabe } from './TextoQueCabe';
import { IndicadorDeVisibilidade } from './IndicadorDeVisibilidade';
import { BarraDaSessao } from './BarraDaSessao';
import { BarraDeSeguir } from './BarraDeSeguir';
import { useSeguirAmigo } from '../state/seguirAmigo';
import { FolhaDaSessao } from './FolhaDaSessao';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { useSincroniaDaSessao } from '../hooks/useSincroniaDaSessao';
import { ESCALA } from '../lib/movimento';
import { useOfflineMode } from '../hooks/useOfflineMode';
import { readLikedSongsCache } from '../lib/likedSongsCache';
import { useAuth } from '../state/auth';
import { closePlayerSmoothly, confirmaSwipe } from '../lib/closePlayer';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { displayArtist, tituloDaFaixa, tituloNoLeitor } from '../lib/artistName';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Animated,
  Easing,
  AppState,
  Platform,
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
import { hapticImpact, hapticNotification, hapticSelection } from '../lib/haptics';
import { setRepeatMode as persistRepeatMode } from '../lib/prefs';
import { savedKey, useSaved } from '../state/saved';
import { contextoDaRecomendacaoAtual, usePlayer } from '../state/player';
import { colors, MINI_PLAYER_HEIGHT, radii, spacing, type } from '../theme';
import { useTheme } from '../state/theme';
import { useShallow } from 'zustand/react/shallow';
import { useAparencia } from '../state/aparencia';
import {
  abrirJaNasLetras, destinoDaOrigem, fonteDosTitulos, NOMES_DOS_BOTOES, olhoDaOrigem, veuDoLeitor, type BotaoDoLeitor,
} from '../lib/aparencia';
import { FundoEmGradiente } from './FundoEmGradiente';
import { lyricsCacheKey, useLyrics } from '../state/lyrics';
import { rotuloDaOrigem } from '../lib/origemDaFila';
import { trackKey as chaveDaFaixaNaFila } from '../lib/shuffle';
import { desvioDaMusica, useDoca } from '../state/doca';
import { pedirFluidez, segurarFluidez } from '../state/fluidez';
import { posicoesDaDoca } from '../lib/doca';
import { contextoParaAnalytics } from '../lib/contextoDaDescoberta';
import { registar } from '../lib/eventos';
import { AddToPlaylistSheet } from './AddToPlaylistSheet';
import { ProgressBar, TOQUE_DA_BARRA } from './ProgressBar';
import { YouTubePlayerView } from './YouTubePlayerView';
import {ArtworkLyricsCube} from './ArtworkLyricsCube';
import { DuploToqueParaGostar } from './DuploToqueParaGostar';
import { deveGuardar } from '../lib/duploToque';
import { registarAccoesDaFila } from '../state/filaNativa';
import { PlayerControlRow } from './PlayerControlRow';
import { accoesDoMenu, PlayerActionsSheet, type PlayerAction } from './PlayerActionsSheet';
import { mandarComando, useAparelhos } from '../lib/connectSync';
import { avisoDoPedido, type TipoDePedido } from '../lib/duotoneConnect';
import { RecommendationPreferences } from './RecommendationPreferences';
import { menuDaFaixa, MOTIVOS, type IdDaAcao } from '../lib/menuDaFaixa';
import { alternarDownload, downloadNoMenuDe, podeDescarregar, tocaSemRede } from '../lib/descarregarFaixa';
import { MenuFlutuante, type Ancora } from './MenuFlutuante';
import { EqualizerIcon } from './EqualizerIcon';
import { modoDeShuffle, rotuloDoModo } from '../lib/smartShuffle';
import { EstrelaInteligente } from './BrilhoInteligente';
import { EqualizadorSheet } from './EqualizadorSheet';
import { ShareFriendSheet } from './ShareFriendSheet';
import { irParaNoIphone, navigationRef } from '../navigation/RootNavigator';
import { endSession, publishSession, publishSessionNow, takeOverSession } from '../lib/sessionSync';
import { useAutoplayRadio } from '../lib/radioSync';
import {
  addAudioInterruptionListeners, addAudioOutputRemovedListener, addRemoteCommandListeners,
} from '../../modules/duotone-remote-commands';
import { addIntentListener } from '../../modules/duotone-intents';
import { accaoParaComando } from '../lib/comandosDaSiri';
import { descreverSaida, deveRetomar, type Saida } from '../lib/interrupcaoDeAudio';
import { registarNaSessaoDeAudio } from '../lib/playbackDiagnostics';
import { apresentarErro } from '../lib/erroDeReproducao';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { limparOrigem, origemValida, type RectanguloDaCapa } from '../state/origemDaCapa';
import { reafirmarComandosDeFaixa } from '../lib/comandosDeFaixa';
import {
  abertura, arrasto, aterrar, cartaoEsc, cartaoEscVisto, cartaoX, cartaoXVisto, cartaoY, cartaoYVisto,
  dedoX, dedoY, definirAlturaDoEcra,
  ESCADA, folhaEscala, folhaOpacidade, folhaRaio, forcaDaPose, miniEscala, miniOpacidade, miniSubir, reporGesto,
} from '../state/transicaoDoLeitor';
import { PanGestureHandler, State, type PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import {
  cartaoDoArrasto, deLadoInverso, destinoNoMini, deveFechar, molaIOS, velocidadeDeAterragem, velocidadeDeVolta,
  type Geometria,
} from '../lib/transicaoDoLeitor';
import { useAlturaDosSeparadores } from '../state/doca';
import { avisarErro, avisarFeito, avisarInfo } from '../lib/avisoDeRemocao';
import { AVISO_DO_NAO_INTERESSA, eSugestao, naoInteressa } from '../state/naoInteressa';
import { mensagemDeErro } from '../lib/mensagemDeErro';

const HEADER_H = 44;
/** O X fecha a música só depois de o leitor descer (a mola de fechar, 0,42 s). */
const FECHAR_DEPOIS_DE_DESCER_MS = 380;
const APP_NAME = 'Duotone';

/**
 * O ar entre o cabeçalho e a capa.
 *
 * Vive numa constante porque este número está em DOIS sítios que têm de
 * concordar: o `vidFull.y`, que diz onde a moldura flutuante se pousa, e a
 * margem da caixa vazia que lhe reserva o lugar no fluxo. Estavam os dois
 * escritos à mão como `20`, e mexer num sem o outro descolava a capa do buraco
 * que lhe foi guardado.
 */
const AR_ACIMA_DA_CAPA = 20;
/** A vinheta do fundo com a capa 3D. Sai de scripts/gerar-materiais-da-capa.py. */
const VINHETA_DA_CAPA_3D = require('../../assets/capa3d-vinheta.png');

/**
 * O que se reserva por baixo da capa para os controlos, antes de a encolher.
 *
 * Não é decoração: é a conta que impede a capa de empurrar o transporte para
 * fora do ecrã quando o texto está aumentado. Sobe com o ritmo vertical do
 * corpo -- se as folgas lá em baixo crescerem e este número não, em texto
 * grande volta a faltar espaço.
 */
const RESERVA_DOS_CONTROLOS = 360;
/**
 * A mesma conta com a capa "Full" (10/10). Os 360 têm folga: o corpo reparte o
 * que sobra por três espaçadores (~45 pt cada, medido a 13/9). A capa inteira
 * fica com 20 de cada um, e eles continuam acima do mínimo (`styles.folga`).
 * Num 6,1" a capa passa de 345 para 393 pt.
 */
const RESERVA_COM_A_CAPA_INTEIRA = 300;

/**
 * Quanto e que a placa da sombra encolhe em relacao a capa.
 *
 * Dez pontos de cada lado. Chegam para a placa ficar sempre escondida por
 * baixo da capa -- mesmo a meio da rotacao do cubo, onde a pegada do quadrado
 * muda -- e sao pouco face ao raio da sombra, por isso o que transborda quase
 * nao se nota que sai de um quadrado mais pequeno.
 */
const RECUO_DA_SOMBRA = 10;

/** O espaçamento entre as letras da marca. Ver o `brandName`. */
const ESPACO_DA_MARCA = 2.6;

export function PlayerRoot() {
  const offline=useOfflineMode();
  const offlineId=useAuth(s=>s.session?.user.id??s.offlineUserId);
  const insets = useSafeAreaInsets();
  // A barra dos separadores MEDIDA na base (auditoria 1.3), não um 49 à mão.
  const TAB_BAR_BASE = useAlturaDosSeparadores();
  const { width: W, height: H, fontScale } = useWindowDimensions();
  // As contas do arrasto, que correm no motor nativo, são em frações da altura.
  useEffect(() => { definirAlturaDoEcra(H); }, [H]);
  const theme = useTheme((s) => s.theme);
  const estiloDaCapa = useCapaIOS((s) => s.style);
  const estiloDaCapaCarregado = useCapaIOS((s) => s.loaded);

  useEffect(() => {
    if (Platform.OS === 'ios') void loadCapaIOS();
  }, []);

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
  const buffering = usePlayer((s) => s.buffering);
  const error = usePlayer((s) => s.error);
  const maquina = usePlayer((s) => s.maquina);
  // A seguir um amigo ("Listen along"): o topo do leitor aberto di-lo, no lugar da marca.
  const seguindoAlguem = useSeguirAmigo((s) => !!s.seguindo);
  // A personalização (10/10, state/aparencia.ts): o topo, o título, a barra, o
  // botão play, os botões de baixo, o flutuar e o fundo.
  const ap = useAparencia(useShallow((s) => ({
    topo: s.topo, titulo: s.titulo, barra: s.barra, play: s.play, botoes: s.botoes,
    flutuar: s.flutuar, fundoLeitor: s.fundoLeitor, brilho: s.brilho, titulos: s.titulos, abrirNasLetras: s.abrirNasLetras,
  })));
  // De onde vem a música, para o "Playing from" (o G1). As que a app meteu
  // (rádio, Smart Shuffle) dizem-no, como no PC (`rotuloDaOrigem`).
  const origemDaFila = usePlayer((s) => s.origemDaFila);
  const sugeridaAgora = usePlayer((s) => !!s.current && s.sugeridas.includes(chaveDaFaixaNaFila(s.current)));
  const doRadioAgora = usePlayer((s) => !!s.current && s.doRadio.includes(chaveDaFaixaNaFila(s.current)));

  const playTrack = usePlayer((s) => s.playTrack);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const next = usePlayer((s) => s.next);
  const prev = usePlayer((s) => s.prev);
  const close = closePlayerSmoothly;
  // O fecho: o SOM desvanece pelo `closeGain` (JavaScript, de 16 em 16 ms);
  // a IMAGEM sai pelo motor nativo, sem ler o `closeGain` (3/10). Lido aqui,
  // redesenhava o leitor inteiro 18 vezes em 300 ms e refazia os nós animados
  // a cada uma -- era o "não está smooth a fechar o mini player".
  const aFechar = usePlayer((s) => s.closing);
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

  // A abertura vive em state/transicaoDoLeitor.ts (2/10): a app de trás recua
  // com ela, e é o RootNavigator que a lê. O arrasto para fechar deixou de ser
  // um `dragY` que só descia a página -- é o cartão do gesto, no mesmo sítio.
  const anim = abertura;
  /**
   * O cartão está a aterrar no mini-player. O leitor já está FECHADO na store
   * (fecha-se no largar): tocar numa música ou no mini a meio é pedir para
   * abrir, e isso tem de ser uma mudança que se veja. Até ao fim da aterragem,
   * o que se desenha continua o do leitor aberto (`aberto`).
   */
  const aterrandoRef = useRef(false);
  const [aterrando, setAterrando] = useState(false);
  /**
   * A aterragem em curso, por número. Uma que foi interrompida (alguém reabriu
   * a meio) não pode acabar depois por cima da abertura: o fim dela fechava o
   * leitor e deixava a app de trás escurecida (4.1.6).
   */
  const aterragemRef = useRef(0);
  /** O dedo está no cartão: nada o põe a mexer por baixo dele. */
  const arrastandoRef = useRef(false);
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
  /*
   * Deslizar o mini-player para a direita fecha o leitor (decisão do João,
   * 3/10). Como o fecho do leitor aberto, o dedo é do Gesture Handler: escreve
   * em `dedoDoMini` no motor nativo e o que se vê é `dragX` mais ele. O
   * JavaScript só decide no fim se fecha. Duas vistas (o mini e a capa
   * pequena), dois eventos: um `Animated.event` só se liga a uma.
   */
  const dedoDoMini = useRef(new Animated.Value(0)).current;
  const eventoDoMini = useMemo(
    () => Animated.event([{ nativeEvent: { translationX: dedoDoMini } }], { useNativeDriver: true }),
    [dedoDoMini],
  );
  const eventoDaCapaNoMini = useMemo(
    () => Animated.event([{ nativeEvent: { translationX: dedoDoMini } }], { useNativeDriver: true }),
    [dedoDoMini],
  );
  // Só para a direita (era o `Math.max(0, dx)`).
  const dragXVisto = useMemo(
    () => Animated.add(dragX, dedoDoMini).interpolate({
      inputRange: [0, 1], outputRange: [0, 1], extrapolateLeft: 'clamp', extrapolateRight: 'extend',
    }),
    [dragX, dedoDoMini],
  );
  const aoMudarODeslizeDoMini = useCallback((e: PanGestureHandlerStateChangeEvent) => {
    const { state, oldState, translationX, translationY, velocityX } = e.nativeEvent;
    if (state === State.ACTIVE) {
      swiping.current = true; dragX.stopAnimation();
      largarFluidezRef.current?.();
      largarFluidezRef.current = segurarFluidez(700);
      return;
    }
    if (oldState !== State.ACTIVE) return;
    largarFluidezRef.current?.();
    largarFluidezRef.current = null;
    dragX.setValue(Math.max(0, translationX));
    dedoDoMini.setValue(0);
    const voltar = () => Animated.spring(dragX, { toValue: 0, useNativeDriver: true }).start();
    // O `confirmaSwipe` conta a velocidade em pt/ms (a do PanResponder).
    if (state === State.END && confirmaSwipe(translationX, translationY, velocityX / 1000, widthRef.current)) {
      // Sai JÁ, com a velocidade do dedo e no motor nativo, e o vidro da base
      // desce ao mesmo tempo (state/doca.ts). O som desvanece à parte.
      saidaPorDeslizeRef.current = true;
      useDoca.setState({ aFechar: true });
      pedirFluidez(900);
      Animated.spring(dragX, {
        toValue: widthRef.current, velocity: Math.max(0, velocityX), useNativeDriver: true, ...molaIOS(0.32, 1),
      }).start();
      void closePlayerSmoothly().then(() => {
        saidaPorDeslizeRef.current = false;
        useDoca.setState({ aFechar: false });
        // Não fechou (uma Jam que não deixou sair): volta ao sítio.
        if (usePlayer.getState().current) voltar();
      });
    } else voltar();
    setTimeout(() => { swiping.current = false; }, 200);
  }, [dragX, dedoDoMini]);
  useEffect(()=>{dragX.setValue(0);dedoDoMini.setValue(0);},[current,dragX,dedoDoMini]);
  /** O fecho começou por um deslize: a saída já vai a caminho. */
  const saidaPorDeslizeRef = useRef(false);
  // Um fecho que NÃO veio do deslize (o "Close player" do VoiceOver, o fim de
  // uma sessão): a linha sai na mesma, no motor nativo, enquanto o som desvanece.
  useEffect(() => {
    if (saidaPorDeslizeRef.current || reducedMotion) return;
    if (aFechar && !usePlayer.getState().expanded) {
      pedirFluidez(700);
      Animated.timing(dragX, { toValue: widthRef.current, duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start();
    } else if (!aFechar && usePlayer.getState().current) {
      Animated.spring(dragX, { toValue: 0, useNativeDriver: true }).start();
    }
  }, [aFechar, dragX, reducedMotion]);
  const miniFade=useMemo(()=>dragXVisto.interpolate({inputRange:[0,W],outputRange:[1,0.2],extrapolate:'clamp'}),[dragXVisto,W]);
  /**
   * Os nós animados que dependem da geometria (o voo da capa, o mini-player),
   * guardados entre desenhos (2/10). Eram refeitos a CADA desenho, e um nó novo
   * num estilo é religar o grafo do motor nativo -- o leitor redesenha-se
   * várias vezes ao tocar numa música (faixa, backend, a carregar), justamente
   * a meio da animação. Num ref e não num `useMemo` porque se calculam depois
   * do `if (!current)`, onde um hook não pode estar.
   */
  const nosRef = useRef<{ chave: string; nos: unknown } | null>(null);

  // Opacidade da capa: "respira" (fade in/out) enquanto a música carrega.
  const pulse = useRef(new Animated.Value(1)).current;
  // A capa GRANDE respira escurecendo (ver o comentário junto do cubo): o
  // mesmo `pulse`, lido ao contrário -- 0,4 de opacidade vira 0,6 de véu preto.
  // Memorizada: uma interpolação nova a cada render é um nó nativo novo, e
  // uma prop nova para a capa memorizada (`CapaDoLeitor`).
  const escurecerCapa = useMemo(() => pulse.interpolate({ inputRange: [0.4, 1], outputRange: [0.6, 0] }), [pulse]);

  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [optionsVisible, setOptionsVisible] = useState(false);
  const ancoraDasOpcoes = useRef<View>(null);
  const [ancora, setAncora] = useState<Ancora | null>(null);
  /** O menu tem duas páginas: as acções, e as durações do temporizador. */
  const [paginaDoMenu, setPaginaDoMenu] = useState<'raiz' | 'aparelhos' | 'comando'>('raiz');
  // O aparelho cujo comando esta aberto (a terceira pagina do menu).
  const [aComandar, setAComandar] = useState<string | null>(null);
  // Os outros aparelhos desta conta. Só vai à rede com a página aberta.
  const { aparelhos, sessaoDe, aCarregar: aProcurarAparelhos } = useAparelhos(paginaDoMenu === 'aparelhos');
  // Aqui em cima, antes de qualquer `return`: um hook depois de uma saída
  // antecipada muda a ordem dos hooks entre renderizações, e isso já pôs esta
  // app a não arrancar uma vez. O lint apanhou-o -- foi para isto que entrou.
  const depoisDeFechar = useRef<(() => void) | null>(null);


  const abrirOpcoes = () => {
    hapticSelection();
    setPaginaDoMenu('raiz');
    // Medido no ECRÃ, que é onde o menu se vai colocar. Se a medição falhar
    // não se abre nada: um menu no canto superior esquerdo, longe do botão
    // que se tocou, seria pior do que menu nenhum.
    ancoraDasOpcoes.current?.measureInWindow((x, y, width, height) => {
      setAncora({ x, y, width, height });
      setOptionsVisible(true);
    });
  };
  const [partilhaAberta, setPartilhaAberta] = useState(false);
  // O botão "Devices" de baixo (10/10, personalização): a página dos aparelhos
  // do mesmo menu, aberta junto a ele.
  const ancoraDosAparelhos = useRef<View>(null);
  const abrirAparelhos = () => {
    hapticSelection();
    setPaginaDoMenu('aparelhos');
    ancoraDosAparelhos.current?.measureInWindow((x, y, width, height) => {
      setAncora({ x, y, width, height });
      setOptionsVisible(true);
    });
  };
  const [recomendacoesAbertas, setRecomendacoesAbertas] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  /**
   * A capa esta a virar para as letras?
   *
   * A sombra vive numa placa por tras do cubo, e uma placa NAO roda. A meio da
   * volta a perspectiva encolhe a face que se ve -- com a distancia de
   * `size*3` que o cubo usa, a aresta mais afastada chega a ficar ~14% mais
   * baixa -- e a placa, que e um rectangulo parado, espreitava por cima e por
   * baixo dela como uma tira preta. Enquanto o cubo se mexe, a placa apaga-se.
   */
  const [capaARodar, setCapaARodarDeVez] = useState(false);
  // A capa a rodar para as letras a 120 Hz (3/10). Estável: vai para a capa memorizada.
  const setCapaARodar = useCallback((v: boolean) => { if (v) pedirFluidez(1000); setCapaARodarDeVez(v); }, []);
  /** Quem larga os 120 Hz de um gesto em curso (state/fluidez.ts). */
  const largarFluidezRef = useRef<(() => void) | null>(null);
  const sombraAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    // Depressa a sair e devagar a entrar: a sombra tem de desaparecer ANTES de
    // a face encolher o suficiente para a deixar ver, e volta sem se dar por
    // ela quando o cubo assenta.
    Animated.timing(sombraAnim, {
      toValue: capaARodar ? 0 : 1,
      duration: capaARodar ? 90 : 220,
      useNativeDriver: true,
    }).start();
  }, [capaARodar, sombraAnim]);

  const [bodyHeight, setBodyHeight] = useState(0);
  const [bodyContentHeight, setBodyContentHeight] = useState(0);
  // O que a folha nativa da fila (screens/FilaScreen.tsx) pede ao leitor.
  useEffect(() => registarAccoesDaFila({
    abrirSessao: () => setSessaoAberta(true),
    // Como o nome do artista no leitor: baixa o leitor antes de navegar,
    // senão a página abria por trás dele.
    // A fila é uma folha da raiz: o `irPara` fecha-a e abre o artista na
    // pilha do separador onde se está.
    verArtista: (nome) => {
      if (!navigationRef.isReady()) return;
      setExpanded(false);
      irParaNoIphone({ tipo: 'artista', nome });
    },
  }), [setExpanded]);
  const [eqVisible, setEqVisible] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  // Montado aqui porque o PlayerRoot existe enquanto a app existe -- e uma
  // sessao de escuta nao pode depender de um ecra estar aberto.
  useSincroniaDaSessao();
  const [sessaoAberta, setSessaoAberta] = useState(false);
  const temSessao = useOuvirJuntos((s) => !!s.sessao);
  // Num Jam manda a fila partilhada: não há "de onde vem" (como no PC).
  const origemNoTopo = temSessao ? null : rotuloDaOrigem(origemDaFila, { sugerida: sugeridaAgora, doRadio: doRadioAgora });
  const destinoDoTopo = destinoDaOrigem(origemNoTopo?.alvo ?? null);
  const filaDaSessao = useOuvirJuntos((s) => s.fila);
  const convidadosControlam = useOuvirJuntos((s) => s.sessao?.convidadosControlam);

  const handleTitleLongPress = async () => {
    if (current?.title) {
      await Clipboard.setStringAsync(current.title);
      // O aviso de sempre (vibra e leva a cor do tema): era um segundo toast
      // só do leitor, com um verde escrito à mão (auditoria 2.4 e 6.1).
      avisarFeito('Title copied');
    }
  };

  const visibilityAnim = useRef(new Animated.Value(1)).current;
  // A base de baixo (3/10, state/doca.ts): nas Definições, no Library check e
  // no Importar a música sai com ela.
  const modoDaDoca = useDoca((s) => s.modo);
  const shouldHide = (keyboardVisible && !expanded) || modoDaDoca === 'escondida';

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

  // Guardar ao ir para segundo plano. inactive (Centro de Controlo) e voltar
  // a active não precisam de reescrever uma sessão que já está publicada.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'background' && usePlayer.getState().current) publishSessionNow();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));

    // Em que ecrãs a música aparece já não se decide aqui: é a base que o sabe
    // (state/doca.ts, alimentada pelo RootNavigator).
    return () => {
      showSub.remove();
      hideSub.remove();
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
  // Guarda-se também por onde saía o som: o fim compara-a com a de então (ver
  // `deveRetomar`).
  const interrupcao = useRef<{
    tocavaAntes: boolean;
    saidaAntes: Saida | null;
    saidaRemovidaAMeio: boolean;
  } | null>(null);
  useEffect(
    () => {
      // Voltar a tocar, seja por que porta for, fecha o episódio: uma
      // interrupção que nunca teve fim (há chamadas VoIP que não o avisam)
      // não pode decidir nada horas depois.
      const largar = usePlayer.subscribe((s, antes) => {
        if (s.isPlaying && !antes.isPlaying) interrupcao.current = null;
      });
      const deixarDeOuvir = addAudioInterruptionListeners(
        (saida) => {
          const st = usePlayer.getState();
          interrupcao.current = { tocavaAntes: st.isPlaying, saidaAntes: saida, saidaRemovidaAMeio: false };
          registarNaSessaoDeAudio(
            `interrupted while ${st.isPlaying ? 'playing' : 'paused'} (output ${descreverSaida(saida)})`,
          );
          // O som já está cortado; isto só faz a UI dizer a verdade -- e põe o
          // `wantsPlayRef` a falso, que é o que impede o watchdog de ver uma
          // posição parada e julgar que o stream encravou.
          st.pausePlayback();
        },
        (oSistemaPede, saida) => {
          const i = interrupcao.current;
          interrupcao.current = null;
          const retomar = deveRetomar({
            tocavaAntes: i?.tocavaAntes ?? false,
            oSistemaPede,
            saidaAntes: i?.saidaAntes,
            saidaDepois: saida,
            saidaRemovidaAMeio: i?.saidaRemovidaAMeio,
          });
          const st = usePlayer.getState();
          registarNaSessaoDeAudio(
            `audio returned, system ${oSistemaPede ? 'asks' : 'does not ask'} to resume `
            + `(output ${descreverSaida(saida)}) -> ${retomar && !st.isPlaying ? 'resumed' : 'stays paused'}`,
          );
          // O `isPlaying` na condição não é zelo a mais: se a pessoa carregou
          // em play durante a interrupção, já está a tocar e o toggle
          // pausava-a.
          if (retomar && !st.isPlaying) void st.togglePlay();
        }
      );
      return () => {
        largar();
        deixarDeOuvir();
      };
    },
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
        // A meio de uma chamada isto NÃO apaga a intenção: com AirPods o iOS
        // troca de perfil e diz que a saída desapareceu, e a música nunca mais
        // voltava (16/9). Quem decide no fim é a comparação das saídas; o
        // aviso só conta num binário que não as traz.
        if (interrupcao.current) interrupcao.current.saidaRemovidaAMeio = true;
        registarNaSessaoDeAudio(
          `output removed${interrupcao.current ? ' during an interruption' : ''}`,
        );
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
  }, [current, queue.length, repeatMode, shuffle, isPlaying, temSessao, filaDaSessao, convidadosControlam]);

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

  // Aberto só com faixa: o `playTrack` de uma lista pode abrir antes de a
  // faixa chegar, e sem leitor por cima a app de trás ficava escurecida.
  const temFaixa = !!current;
  useEffect(() => {
    const alvo = expanded && temFaixa ? 1 : 0;
    // Abrir e fechar a 120 Hz (3/10, state/fluidez.ts).
    pedirFluidez(900);
    if (aterrandoRef.current) {
      // A aterrar: o leitor já está fechado, e ela acaba sozinha (com a
      // abertura a 0). Uma faixa que muda a meio não a interrompe.
      if (!alvo) return;
      // Pediram para abrir a meio (uma música tocada, o mini): ela deixa de
      // contar, e o cartão volta ao sítio com a mola de abrir.
      aterragemRef.current++;
      aterrandoRef.current = false;
      setAterrando(false);
    }
    // Molas do iOS (2/10): abrir com um ressalto mínimo, fechar sem nenhum.
    // Corre sempre: com tudo já no sítio, as molas acabam logo.
    const mola = alvo ? molaIOS(0.5, 0.82) : molaIOS(0.42, 0.92);
    const ir = (valor: Animated.Value, para: number) =>
      Animated.spring(valor, { toValue: para, useNativeDriver: true, ...mola });
    // Cada uma por si, NUNCA num `Animated.parallel` (2/10). Fechar pelo X tira a
    // faixa: a capa desmonta, o `animRaio` fica sem quem o use e o React
    // Native PÁRA-lhe a animação (o `__detach` de um valor sem filhos) -- e um
    // `parallel` pára as irmãs com ela. A abertura ficava presa no 1, e a app
    // de trás recuada e escura.
    ir(anim, alvo).start(({ finished }) => {
      if (finished) setOrigemDaEntrada((o) => (o ? null : o));
      // Rede de segurança: sem faixa não há leitor por cima, e uma abertura que
      // ficasse a meio deixava a app de trás escura e recuada.
      else if (!usePlayer.getState().current) anim.setValue(0);
    });
    ir(animRaio, alvo).start();
    // O cartão do gesto volta ao repouso (uma volta ou uma aterragem
    // interrompida a meio) -- à parte, para quem agarrar o cartão não parar a
    // abertura com ele. Nunca com o dedo lá.
    if (alvo && !arrastandoRef.current) {
      Animated.parallel([ir(cartaoX, 0), ir(cartaoY, 0), ir(cartaoEsc, 1), ir(arrasto, 0), ir(aterrar, 0)]).start();
      const ge = gestoRef.current;
      ge.baseDx = 0; ge.baseDy = 0; ge.tx = 0; ge.ty = 0; ge.esc = 1; ge.g = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  // Sem a faixa nas dependências (2/10): mudar de música com o leitor aberto
  // não tem nada a animar aqui, e eram sete molas a arrancar no instante do skip.
  }, [expanded, temFaixa]);

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
    pedirFluidez(900);
    anim.setValue(-1);
    animRaio.setValue(0);
    // A mola do iOS, como o resto da transição (era a `speed`/`bounciness` do RN).
    const mola = molaIOS(0.55, 0.86);
    Animated.spring(animRaio, { toValue: expanded ? 1 : 0, useNativeDriver: true, ...mola }).start();
    Animated.spring(anim, { toValue: expanded ? 1 : 0, useNativeDriver: true, ...mola })
      .start(({ finished }) => { if (finished) setOrigemDaEntrada(null); });
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
  /**
   * O gesto de fechar (2/10, docs/transicao-do-leitor.html): a página encolhe
   * para um cartão que segue o dedo, e ao largar aterra no mini-player com a
   * velocidade do dedo. Antes só descia, como uma página plana.
   *
   * O que precisa da geometria lê-a do `geometriaRef` (atualizado em cada
   * desenho): o PanResponder é criado uma vez e não vê os valores novos.
   */
  const geometriaRef = useRef<{ H: number; geo: Geometria }>({
    H: 800,
    geo: { pivo: { x: 200, y: 320 }, capa: { x: 200, y: 300, lado: 380 }, mini: { x: 40, y: 760, lado: 48 } },
  });
  const gestoRef = useRef({ tx: 0, ty: 0, esc: 1, g: 0, baseDx: 0, baseDy: 0 });

  const aterrarNoMini = (vx: number, vy: number) => {
    const { geo } = geometriaRef.current, ge = gestoRef.current;
    // A velocidade do dedo na direção do mini-player: o cartão continua com ela.
    const vn = velocidadeDeAterragem(geo, ge, vx, vy);
    const alvo = destinoNoMini(geo);
    const minha = ++aterragemRef.current;
    aterrandoRef.current = true;
    setAterrando(true);
    // Fechado já, no largar (ver `aterrandoRef`). O efeito do `expanded` vê a
    // aterragem e não mexe na abertura: é ela que a põe a 0 no fim.
    if (usePlayer.getState().expanded) setExpanded(false);
    hapticSelection();
    const mola = molaIOS(0.5, 0.86);
    // Todas com a MESMA mola e a velocidade na mesma proporção do caminho: andam
    // juntas, e a capa nunca descola do cartão. O repouso é o que se vê (meio
    // ponto, 0,2% da escala): com limiares de velocidade minúsculos a cauda da
    // mola durava mais meio segundo, com o mini-player ainda por tocar.
    const ir = (valor: Animated.Value, para: number, de: number, perto: number, devagar: number) => Animated.spring(valor, {
      toValue: para, velocity: vn * (para - de), useNativeDriver: true, ...mola,
      restDisplacementThreshold: perto, restSpeedThreshold: devagar,
    });
    Animated.parallel([
      ir(cartaoX, alvo.tx, ge.tx, 0.5, 8),
      ir(cartaoY, alvo.ty, ge.ty, 0.5, 8),
      ir(cartaoEsc, alvo.esc, ge.esc, 0.002, 0.02),
      ir(aterrar, 1, 0, 0.004, 0.04),
    ]).start(() => {
      // Interrompida (alguém reabriu a meio): quem reabriu já tratou de tudo.
      if (aterragemRef.current !== minha) return;
      // Tudo no mini-player: a abertura a 0 e o cartão em repouso no mesmo
      // instante -- o que se vê é o mesmo.
      anim.setValue(0);
      animRaio.setValue(0);
      reporGesto();
      ge.baseDx = 0; ge.baseDy = 0; ge.tx = 0; ge.ty = 0; ge.esc = 1; ge.g = 0;
      aterrandoRef.current = false;
      setAterrando(false);
      setOrigemDaEntrada((o) => (o ? null : o));
    });
  };

  const voltarAoSitio = (vy: number) => {
    const ge = gestoRef.current;
    // u vai de 1 a 0; continuar o dedo é u a crescer primeiro.
    const vu = velocidadeDeVolta(ge, vy);
    const mola = molaIOS(0.42, 0.8);
    const ir = (valor: Animated.Value, para: number, de: number, limiar: number) => Animated.spring(valor, {
      toValue: para, velocity: (de - para) * vu, useNativeDriver: true, ...mola,
      restDisplacementThreshold: limiar, restSpeedThreshold: limiar,
    });
    Animated.parallel([
      ir(cartaoX, 0, ge.tx, 0.25),
      ir(cartaoY, 0, ge.ty, 0.25),
      ir(cartaoEsc, 1, ge.esc, 0.0015),
      ir(arrasto, 0, ge.g, 0.002),
    ]).start(({ finished }) => { if (finished) { ge.baseDx = 0; ge.baseDy = 0; ge.tx = 0; ge.ty = 0; ge.esc = 1; ge.g = 0; } });
  };

  // A página nasce um terço do ecrã abaixo e sobe; no gesto, vai com o cartão.
  // O pivô do crescer é (50%, 40%) -- o mesmo da capa no `vooDaMoldura` --, mas
  // feito com uma translação e não com `transformOrigin`: o RN escala à volta
  // do centro (50%), e 0,1·H·(escala − 1) leva esse centro para os 40%.
  const folhaSubir = useMemo(() => Animated.add(
    Animated.add(
      anim.interpolate({ inputRange: [0, 1], outputRange: [H * 0.314, 0], extrapolate: 'extend' }),
      cartaoYVisto,
    ),
    Animated.multiply(Animated.add(folhaEscala, -1), H * 0.1),
  ), [anim, H]);

  const fecharRef = useRef({ aterrarNoMini, voltarAoSitio });
  fecharRef.current = { aterrarNoMini, voltarAoSitio };

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
  /*
   * Desde 3/10 o dedo é do Gesture Handler, na thread da interface: o cartão
   * segue-o mesmo com o JavaScript ocupado (a música nova a montar-se, um
   * download a acabar), que era o "encrava e dá snap". O dedo escreve-se
   * direto em `dedoX`/`dedoY` (`Animated.event` nativo) e o que se desenha é
   * o valor de sempre mais o dele (state/transicaoDoLeitor.ts). O JavaScript só
   * entra no princípio (parar o que estava a andar) e no fim: junta o dedo nos
   * valores de sempre, no mesmo fotograma, e lança as molas de antes.
   * Ativa com 12 pt para baixo e falha com 16 pt para o lado (o cubo, a barra).
   */
  const eventoDoDedo = useMemo(
    () => Animated.event([{ nativeEvent: { translationX: dedoX, translationY: dedoY } }], { useNativeDriver: true }),
    [],
  );
  const aoMudarOGesto = useCallback((e: PanGestureHandlerStateChangeEvent) => {
    const { state, oldState, translationX, translationY, velocityX, velocityY } = e.nativeEvent;
    const ge = gestoRef.current;
    if (state === State.ACTIVE) {
      // O dedo no cartão a 120 Hz, e a aterragem a seguir (state/fluidez.ts).
      largarFluidezRef.current?.();
      largarFluidezRef.current = segurarFluidez(900);
      // Um cartão apanhado a meio da volta ao sítio continua de onde está.
      arrastandoRef.current = true;
      let tx = 0, ty = 0;
      cartaoX.stopAnimation((v) => { tx = v; });
      cartaoY.stopAnimation((v) => { ty = v; });
      cartaoEsc.stopAnimation();
      arrasto.stopAnimation();
      ge.baseDx = deLadoInverso(tx);
      ge.baseDy = ty > 0 ? ty / 0.62 : 0;
      return;
    }
    if (oldState !== State.ACTIVE) return;
    arrastandoRef.current = false;
    largarFluidezRef.current?.();
    largarFluidezRef.current = null;
    // O dedo passa para os valores de sempre, e volta a 0, no mesmo fotograma.
    const c = cartaoDoArrasto(ge.baseDx + translationX, ge.baseDy + translationY, geometriaRef.current.H);
    ge.g = c.g; ge.esc = c.esc; ge.tx = c.tx; ge.ty = c.ty;
    cartaoX.setValue(c.tx);
    cartaoY.setValue(c.ty);
    cartaoEsc.setValue(c.esc);
    arrasto.setValue(c.g);
    dedoX.setValue(0);
    dedoY.setValue(0);
    // A velocidade do Gesture Handler já vem em pontos por segundo.
    if (state === State.END && deveFechar(ge, velocityY)) fecharRef.current.aterrarNoMini(velocityX, velocityY);
    else fecharRef.current.voltarAoSitio(state === State.END ? velocityY : 0);
  }, []);

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
  // O coração segue também o que se guarda nos OUTROS menus. Os menus
  // passaram a ser os mesmos em todo o lado (lib/menuDaFaixa.ts), e a fila e
  // as listas também guardam a faixa que está a tocar -- sem isto o coração do
  // leitor ficava vazio até à música seguinte.
  useEffect(() => {
    if (!current) return;
    const chave = savedKey(current);
    return useSaved.subscribe((s, p) => {
      const agora = s.keys.has(chave);
      if (agora === p.keys.has(chave)) return;
      setSaved(agora);
      if (!agora) setDbTrackId(null);
    });
  }, [current?.source, current?.sourceId]);

  const [showLyrics, setShowLyrics] = useState(false);
  const [modoCarro, setModoCarro] = useState(false);
  // A largura da linha do título, entre o coração e as reticências. O título
  // e o artista desvanecem contra ela (ver TextoQueCabe).
  const [larguraDoTitulo, setLarguraDoTitulo] = useState(0);
  useEffect(() => {
    setShowLyrics(false);
  }, [current?.sourceId]);
  // "Open on lyrics" (10/10, personalização): vira-se para as letras quando o
  // leitor abre, ou quando elas chegam com ele aberto. Voltar à capa à mão fica:
  // nada disto muda até abrir de novo ou mudar a música.
  const letrasDaMusica = useLyrics((s) => (current ? s.entries[lyricsCacheKey(current)] : undefined));
  const virarParaAsLetras = abrirJaNasLetras(ap.abrirNasLetras, expanded, letrasDaMusica);
  useEffect(() => {
    if (virarParaAsLetras) setShowLyrics(true);
  }, [virarParaAsLetras, current?.sourceId]);

  // Capa em ALTA resolução: a YouTube Data API devolve thumbnails pequenas, mas
  // i.ytimg.com tem versões grandes por videoId. Começamos na maxresdefault
  // (1280px), depois a hq720, e a mqdefault fica por baixo enquanto elas não
  // chegam -- nunca a hqdefault, que é 4:3 e trazia barras pretas (30/9).
  // A escolha, e a memória de quem não tem maxres, vivem em state/capasGrandes:
  // é o mesmo sítio que as PRÉ-CARREGA para as próximas faixas, e por isso a
  // capa já está na cache quando se carrega em seguinte (14/9).
  // Derivada da faixa NO render: setState num efeito mostrava primeiro a capa
  // antiga no cubo novo, perdendo a transição e revelando o fundo cinzento.
  const artSource = useSyncExternalStore(ouvirCapasGrandes, () => current ? capaGrande(current) : null);
  useEffect(() => {
    if (current && !offline) preCarregarCapasGrandes([current]);
  }, [current?.source, current?.sourceId, current?.artworkUrl, offline]);

  const fundo = desfoqueLeve(artSource, 64);

  const onArtError = useCallback(() => {
    // Passa à seguinte sem moldura. A de recurso fica: é a última que há.
    if (current && artSource && artSource !== capaDeRecurso(current)) void marcarCapaFalhada(artSource);
  }, [current, artSource]);

  const onToggleShuffle = () => {
    toggleShuffle();
    hapticSelection();
  };
  const onCycleRepeat = () => {
    const next = repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off';
    cycleRepeat();
    hapticSelection();
    persistRepeatMode(next);
  };

  // Dois toques na capa gostam (7/10): só gostam, nunca tiram (`deveGuardar`).
  // Por um ref, para a capa memorizada receber sempre a mesma função.
  const gostarPelaCapa = useRef<() => void>(() => {});
  gostarPelaCapa.current = () => { if (deveGuardar(saved)) void saveCurrentToLibrary(); else hapticImpact(); };
  const aoGostarPelaCapa = useCallback(() => gostarPelaCapa.current(), []);

  const saveCurrentToLibrary = async () => {
    if(offline){avisarInfo("You're offline", 'Connect to the internet to change your Liked Songs.');return;}
    if (!current) return;
    const wasSaved = saved;
    setSaved(!wasSaved); // otimista
    // O conjunto global também, já: é dele que vem a marca de "já guardada"
    // nas listas e na pesquisa, que ficavam à espera do servidor.
    useSaved.getState().markSaved(current, !wasSaved);
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
        const contexto=contextoDaRecomendacaoAtual();
        if(contexto)registar('recomendacao_guardada',contextoParaAnalytics(contexto));
      }
    } catch (e: any) {
      setSaved(wasSaved);
      useSaved.getState().markSaved(current, wasSaved);
      avisarErro(mensagemDeErro(e, 'Could not update library.'));
    }
  };

  // Um aviso some-se sozinho; uma falha fica, porque tem o que fazer dentro.
  // Ver lib/erroDeReproducao.ts.
  const aviso = apresentarErro({
    mensagem: error,
    estado: maquina,
    temSeguinte: !!usePlayer.getState().proximaFaixa(),
  });
  const erroTemporario = aviso?.temporario ?? false;
  useEffect(() => {
    if (!error || !erroTemporario) return;
    const id = setTimeout(() => setError(null), 4500);
    return () => clearTimeout(id);
  }, [error, erroTemporario, setError]);

  // A capa 3D a montar-se com o download, e o botão do relatório quando o
  // arranque fica preso (lib/montagemDaCapa.ts). Antes do `if (!current)`: é um
  // hook. A deteção corre também no Simple; as animações só com a capa 3D à vista.
  // O que se desenha: o leitor aberto continua até ao fim da aterragem, embora
  // a store já o dê por fechado (ver `aterrandoRef`).
  const aberto = expanded || aterrando;
  const montagem = useMontagemDaCapa(
    current?.sourceId ?? null,
    Platform.OS === 'ios' && estiloDaCapaCarregado && estiloDaCapa === 'floating' && aberto,
  );

  // O "Recuo subtil" do skip (lib/transicaoDaCapa.ts). O sentido lê-se UMA vez
  // por faixa, no instante em que ela chega: o `saltoDaFaixa` diz se foi um next
  // ou um prev -- e não se subscreve, que redesenhava o leitor por nada.
  const transicaoDaCapa = useRef<{ chave: string; sentido: Sentido } | null>(null);
  const chaveDaCapa = current ? `${current.source}:${current.sourceId}` : null;
  if (chaveDaCapa && transicaoDaCapa.current?.chave !== chaveDaCapa) {
    transicaoDaCapa.current = {
      chave: chaveDaCapa,
      sentido: sentidoDaTransicao(usePlayer.getState().saltoDaFaixa, Date.now()),
    };
  }

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
  // A linha da música está DENTRO da base de vidro (components/Doca.tsx): a
  // faixa dela tem 72 pt por cima dos separadores, e a linha fica a meio.
  const miniBottom = TAB_H + 4;
  const capaFlutuante = Platform.OS === 'ios' && estiloDaCapaCarregado && estiloDaCapa === 'floating';
  // "Full" (10/10, personalização): a capa de uma borda à outra, sem cantos nem sombra.
  const capaInteira = Platform.OS === 'ios' && estiloDaCapaCarregado && estiloDaCapa === 'full';

  // Capa: mini (quadrado 48px, no mini-player) <-> expandido (quadrado GRANDE
  // centrado). Antes era 16:9 (herança do vídeo) — agora que é só áudio, a
  // capa é quadrada e grande, para um look limpo tipo app de música.
  // Reservar espaço para os controlos em ecrãs pequenos. Com texto muito
  // aumentado, só o corpo desliza: a capa e o motor continuam montados.
  // A margem lateral da capa. Eram 64 -- 32 de cada lado -- e num iPhone é a
  // LARGURA que manda (W-64 = 329 contra H*0.42 = 358), por isso este número
  // era, na prática, o tamanho da capa. 48 dá-lhe mais dezasseis pontos e
  // aproxima o enquadramento do que se vê nas outras apps de música.
  const MARGEM_DA_CAPA = 48;
  const ART_FULL = capaInteira
    // A toda a largura: os 48 pt da margem e o teto de 42% da altura saem, e a
    // reserva dos controlos encolhe o que os três espaçadores do corpo davam a
    // mais (ver RESERVA_COM_A_CAPA_INTEIRA). Num ecrã baixo, ou com o texto
    // aumentado, encolhe como as outras.
    ? Math.min(W, Math.max(96, H - insets.top - insets.bottom - HEADER_H - RESERVA_COM_A_CAPA_INTEIRA * Math.min(fontScale, 1.4)))
    : Math.min(W - MARGEM_DA_CAPA, H * 0.42,
      Math.max(96, H - insets.top - insets.bottom - HEADER_H - RESERVA_DOS_CONTROLOS * Math.min(fontScale, 1.4)));
  const vidMini = {
    x: 16,
    y: keyboardVisible && !expanded
      ? H + 500
      : H - miniBottom - MINI_PLAYER_HEIGHT + (MINI_PLAYER_HEIGHT - 48) / 2,
    w: 48,
    h: 48,
  };
  const vidFull = {
    x: (W - ART_FULL) / 2,
    y: insets.top + 6 + HEADER_H + AR_ACIMA_DA_CAPA,
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
   * O voo da moldura, num sitio so.
   *
   * Estava escrito por extenso dentro do `style` da moldura. Passou a ser
   * preciso duas vezes -- a placa da sombra tem de fazer exactamente o mesmo
   * percurso -- e duas copias destas interpolacoes divergiam ao primeiro
   * acerto, com a sombra a descolar da capa a meio da animacao.
   */
  // O pivô do cartão do gesto (e do crescer da página ao abrir): o mesmo
  // `transformOrigin` do painel, 50% / 40%.
  const pivo = { x: W / 2, y: H * 0.4 };
  const kx = centroFull.x - pivo.x, ky = centroFull.y - pivo.y;
  // O gesto lê a geometria daqui (ver `geometriaRef`).
  geometriaRef.current = {
    H,
    geo: {
      pivo,
      capa: { x: centroFull.x, y: centroFull.y, lado: vidFull.w },
      // Onde a música está AGORA: num ecrã sem separadores desceu com a base.
      mini: { x: centroMini.x, y: centroMini.y + posicoesDaDoca(modoDaDoca, true, insets.bottom, TAB_BAR_BASE).musica, lado: vidMini.w },
    },
  };

  // A capa faz um ARCO do mini-player até ao sítio (a variante C): o X
  // adianta-se ao Y. Em amostras, porque o motor nativo só interpola por troços.
  const criarNos = () => {
    const AMOSTRAS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
    const arcoX = (t: number) => 1 - Math.pow(1 - t, 1.7);
    const arcoY = (t: number) => Math.pow(t, 1.35);
    const voo = (deOrigem: number, deMini: number, curva: (t: number) => number) => anim.interpolate({
      inputRange: origemDaEntrada ? [-1, ...AMOSTRAS] : AMOSTRAS,
      outputRange: [...(origemDaEntrada ? [deOrigem] : []), ...AMOSTRAS.map((t) => deMini * (1 - curva(t)))],
    });
    const vooDaMoldura = [
      {
        translateX: Animated.add(
          Animated.add(
            voo(deslocacaoOrigem.x, deslocacaoMini.x, arcoX),
            aberto || reducedMotion ? 0 : dragXVisto
          ),
          // O cartão do gesto: a capa vai com ele, à volta do mesmo pivô.
          Animated.add(cartaoXVisto, Animated.multiply(Animated.add(cartaoEscVisto, -1), kx)),
        ),
      },
      {
        translateY: Animated.add(
          Animated.add(
            voo(deslocacaoOrigem.y, deslocacaoMini.y, arcoY),
            // No mini-player, a capa desce com a base (state/doca.ts); aberta, não.
            Animated.multiply(desvioDaMusica, anim.interpolate({ inputRange: faixaDoVoo, outputRange: saidaDoVoo(0, 1, 0), extrapolate: 'clamp' })),
          ),
          Animated.add(cartaoYVisto, Animated.multiply(Animated.add(cartaoEscVisto, -1), ky)),
        ),
      },
      {
        scale: Animated.multiply(
          anim.interpolate({
            inputRange: faixaDoVoo,
            outputRange: saidaDoVoo(escalaOrigem, escalaMini, 1),
          }),
          cartaoEscVisto,
        ),
      },
    ];
    return {
      vooDaMoldura,
      sombra: capaFlutuante ? 0 : capaInteira ? 0 : Animated.multiply(
        sombraAnim,
        Animated.multiply(visibilityAnim, anim.interpolate({ inputRange: faixaDoVoo, outputRange: saidaDoVoo(0, 0, 1) })),
      ),
      molduraOpacidade: aberto ? visibilityAnim : Animated.multiply(visibilityAnim, miniFade),
      moldura: { borderRadius: animRaio.interpolate({ inputRange: [0, 1], outputRange: [8, capaInteira ? 0 : 20] }) },
      miniTransform: [
        { translateX: reducedMotion ? 0 : dragXVisto },
        { translateY: Animated.add(miniSubir, desvioDaMusica) },
        { scale: miniEscala },
      ],
      miniOpacidade: Animated.multiply(Animated.multiply(visibilityAnim, miniFade), miniOpacidade),
    };
  };
  const chaveDosNos = [
    origemDaEntrada ? `${origemDaEntrada.x},${origemDaEntrada.y},${origemDaEntrada.largura},${origemDaEntrada.altura}` : '-',
    vidFull.x, vidFull.y, vidFull.w, vidMini.x, vidMini.y, W, H,
    aberto, reducedMotion, capaFlutuante, capaInteira,
  ].join('|');
  if (nosRef.current?.chave !== chaveDosNos) nosRef.current = { chave: chaveDosNos, nos: criarNos() };
  const nos = nosRef.current.nos as ReturnType<typeof criarNos>;
  const vooDaMoldura = nos.vooDaMoldura;


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
    irParaNoIphone({ tipo: 'artista', nome: nomeDoArtista });
  };

  // upNext is now handled inside QueueSheet

  const fecharMenu = () => setOptionsVisible(false);
  /**
   * Fecha o menu e SÓ DEPOIS faz o resto.
   *
   * Abrir uma folha no mesmo toque punha o iOS a apresentar uma coisa
   * enquanto outra saía. O que ficava era uma janela órfã e invisível a
   * apanhar todos os toques: o som continuava e a app deixava de reagir ao
   * dedo até ser reiniciada. Uma de cada vez.
   */
  const fecharEEntao = (fn: () => void) => { depoisDeFechar.current = fn; fecharMenu(); };

  /**
   * O "…" do leitor: primeiro as ações da faixa, que são as de todos os menus
   * -- a mesma ordem e os mesmos nomes da fila, das listas e do PC (ver
   * lib/menuDaFaixa.ts). Aqui não há "Play now" nem "queue": a faixa já está
   * a tocar. Chamava "Like" ao guardar e não tinha artista, download nem
   * recomendações.
   *
   * Depois, num grupo à parte, o que é do LEITOR e não da faixa: o carro, a
   * música do dia, o temporizador.
   */
  const menuDoLeitor = menuDaFaixa({
    plataforma: 'ios',
    onde: 'leitor',
    semRede: offline,
    tocaSemRede: tocaSemRede(current),
    guardada: saved,
    podeDescarregar: podeDescarregar(current),
    download: downloadNoMenuDe(current),
    temArtista,
    sugestao: eSugestao(current),
  });
  const fazerNaFaixa = (id: IdDaAcao) => {
    const faixa = current;
    switch (id) {
      case 'guardar': fecharMenu(); void saveCurrentToLibrary(); return;
      case 'por-em-playlist': fecharEEntao(() => setPlaylistOpen(true)); return;
      case 'ver-artista': fecharEEntao(abrirArtista); return;
      case 'partilhar': fecharEEntao(() => setPartilhaAberta(true)); return;
      case 'descarregar': fecharMenu(); void alternarDownload(faixa); return;
      case 'recomendacoes': fecharEEntao(() => setRecomendacoesAbertas(true)); return;
      case 'nao-interessa':
        fecharMenu();
        if (faixa) void naoInteressa(faixa).then(() => avisarFeito(AVISO_DO_NAO_INTERESSA))
          .catch((e) => avisarErro(mensagemDeErro(e, 'Could not save this preference.')));
        return;
      default: return;
    }
  };

  const accoesDaFaixa: PlayerAction[] = [
    ...accoesDoMenu(menuDoLeitor, fazerNaFaixa),
    /* Modo carro, a abrir o grupo do leitor: e a unica que se procura com o
       carro ja a andar, e o traco por cima encontra-se sem ler a lista. */
    { label: 'Car mode', icon: 'car-sport-outline', inicioDeGrupo: true, onPress: () => {
      fecharEEntao(() => setModoCarro(true));
    } },
    /* Duotone Connect: mandar isto para outro aparelho teu. Fica aqui, ao pé
       do modo carro, porque as duas são a mesma pergunta -- "onde é que isto
       vai tocar?" -- e não uma ação sobre a faixa.

       Estas duas são as únicas do grupo. A música do dia e o temporizador
       saíram a pedido do João (12/9) -- o temporizador continua nas
       Definições. */
    { label: 'Play on another device', icon: 'desktop-outline',
      onPress: () => setPaginaDoMenu('aparelhos') },
  ];

  /**
   * Os aparelhos, como página do mesmo menu.
   *
   * Os que não estão à escuta aparecem na mesma, apagados e a dizer porquê --
   * a regra dos menus. Um iPhone com a app fechada não recebe ordem nenhuma, e
   * esconder isso dava um aparelho que desaparecia sem explicação.
   */
  const aparelhosDoMenu: PlayerAction[] = aparelhos.length
    ? aparelhos.map((a) => ({
        label: a.nome,
        icon: (a.tipo === 'desktop' ? 'desktop-outline' : 'phone-portrait-outline') as PlayerAction['icon'],
        motivo: a.motivo,
        nota: a.aTocar ? 'Playing now' : null,
        onPress: () => {
          const alvo = a;
          // O que esta a TOCAR abre o comando; o resto recebe a musica. Mandar
          // "assumir" a um aparelho que ja esta a tocar era passar-lhe a fila
          // por cima do que ele tinha -- e o que se quer dali e mexer nele.
          if (alvo.aTocar) {
            hapticSelection();
            setAComandar(alvo.deviceId);
            setPaginaDoMenu('comando');
            return;
          }
          fecharEEntao(() => {
            void mandarComando(alvo.deviceId, 'assumir').then((estado) => {
              if (estado === 'feito') { hapticNotification(); return; }
              (estado === 'pendente' ? avisarInfo : avisarErro)(avisoDoPedido(estado, alvo.nome, 'assumir'));
            });
          });
        },
      }))
    : [{
        label: aProcurarAparelhos ? 'Looking for devices…' : 'No other devices',
        icon: 'ellipse-outline',
        motivo: aProcurarAparelhos ? null : 'Open Duotone on your PC and try again',
        disabled: true,
        onPress: () => {},
      }];

  /**
   * O comando do outro aparelho, como terceira pagina do mesmo menu.
   *
   * Esta aqui, e nao so no banner do "continuar aqui", porque o banner
   * dispensa-se -- e depois de dispensado ficava 15 minutos calado, sem porta
   * nenhuma para voltar. Daqui chega-se sempre, pelo mesmo caminho: as "...",
   * "Play on another device", o aparelho que esta a tocar.
   *
   * Nao se finge nada localmente: o que se ve vem da sessao dele, que chega
   * pelo Realtime. Uma ordem que nao chegue diz-se, em vez de se assumir.
   */
  const comandoDoMenu: PlayerAction[] = (() => {
    const alvo = aparelhos.find((a) => a.deviceId === aComandar);
    const sessao = aComandar ? sessaoDe(aComandar) : null;
    if (!alvo || !sessao) {
      return [{
        label: 'That device is gone', icon: 'ellipse-outline', disabled: true,
        motivo: 'Open Duotone there and try again', onPress: () => {},
      }];
    }
    const ordenar = (tipo: TipoDePedido) => {
      void mandarComando(alvo.deviceId, tipo).then((estado) => {
        if (estado === 'feito') { hapticSelection(); return; }
        (estado === 'pendente' ? avisarInfo : avisarErro)(avisoDoPedido(estado, alvo.nome, tipo));
      });
    };
    return [
      { label: tituloDaFaixa(sessao.track), icon: 'musical-notes-outline', disabled: true,
        nota: `${displayArtist(sessao.track)} \u00b7 on ${alvo.nome}`, onPress: () => {} },
      { label: 'Previous', icon: 'play-skip-back-outline', inicioDeGrupo: true,
        onPress: () => ordenar('anterior') },
      { label: sessao.isPlaying ? 'Pause' : 'Play', icon: sessao.isPlaying ? 'pause-outline' : 'play-outline',
        onPress: () => ordenar('tocar-pausa') },
      { label: 'Next', icon: 'play-skip-forward-outline', onPress: () => ordenar('seguinte') },
      { label: 'Continue here', icon: 'phone-portrait-outline', inicioDeGrupo: true,
        onPress: () => { fecharEEntao(() => { void takeOverSession(sessao); }); } },
    ];
  })();

  // A personalização do título e do fundo (10/10, lib/aparencia.ts).
  const tituloAoCentro = ap.titulo === 'centro';
  const coracaoDoTitulo = (
    <Toque
      escala={ESCALA.icone}
      onPress={saveCurrentToLibrary}
      style={styles.ladoDoTitulo}
      accessibilityRole="button"
      accessibilityLabel={saved ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
    >
      <StateIcon
        pulsar={saved}
        name={saved ? 'heart' : 'heart-outline'}
        size={22}
        color={saved ? theme.color : colors.text}
      />
    </Toque>
  );
  const veu = veuDoLeitor(ap.brilho);
  /** Os botões de baixo, os escolhidos e pela ordem escolhida. */
  const botaoDeBaixo = (b: BotaoDoLeitor) => {
    switch (b) {
      case 'fila': return (
        <Toque
          key={b}
          escala={ESCALA.icone}
          accessibilityRole="button"
          accessibilityLabel="Queue"
          onPress={() => {
            hapticSelection();
            // Uma folha nativa do iOS (3/10, screens/FilaScreen.tsx).
            if (navigationRef.isReady()) navigationRef.navigate('Fila');
          }}
          style={styles.utilityIconBtn}
        >
          <Ionicons name="list-outline" size={23} color={colors.text} />
          <Text style={styles.utilityIconLabel}>Queue</Text>
        </Toque>
      );
      // Quem vê o que está a tocar: amigos, ninguém, ou o Jam.
      case 'visibilidade': return (
        <IndicadorDeVisibilidade
          key={b}
          onAbrirJam={() => setSessaoAberta(true)}
          onAviso={(msg) => { avisarInfo(msg); }}
        />
      );
      case 'eq': return (
        <Toque
          key={b}
          escala={ESCALA.icone}
          accessibilityRole="button"
          accessibilityLabel="EQ"
          onPress={() => {
            hapticSelection();
            setEqVisible(true);
          }}
          style={styles.utilityIconBtn}
        >
          <EqualizerIcon />
          <Text style={styles.utilityIconLabel}>EQ</Text>
        </Toque>
      );
      case 'aparelhos': return (
        <View key={b} ref={ancoraDosAparelhos} collapsable={false}>
          <Toque escala={ESCALA.icone} accessibilityRole="button" accessibilityLabel="Play on another device"
            onPress={abrirAparelhos} style={styles.utilityIconBtn}>
            <Ionicons name="desktop-outline" size={22} color={colors.text} />
            <Text style={styles.utilityIconLabel}>{NOMES_DOS_BOTOES.aparelhos}</Text>
          </Toque>
        </View>
      );
      case 'partilhar': return (
        <Toque key={b} escala={ESCALA.icone} accessibilityRole="button" accessibilityLabel="Share"
          onPress={() => { hapticSelection(); setPartilhaAberta(true); }} style={styles.utilityIconBtn}>
          <Ionicons name="share-outline" size={22} color={colors.text} />
          <Text style={styles.utilityIconLabel}>{NOMES_DOS_BOTOES.partilhar}</Text>
        </Toque>
      );
      case 'letras': return (
        <Toque key={b} escala={ESCALA.icone} accessibilityRole="button"
          accessibilityLabel={showLyrics ? 'Show artwork' : 'Show lyrics'}
          onPress={() => { hapticSelection(); setShowLyrics(!showLyrics); }} style={styles.utilityIconBtn}>
          <Ionicons name={showLyrics ? 'chatbox-ellipses' : 'chatbox-ellipses-outline'} size={22}
            color={showLyrics ? theme.color : colors.text} />
          <Text style={styles.utilityIconLabel}>{NOMES_DOS_BOTOES.letras}</Text>
        </Toque>
      );
    }
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* ===================== OVERLAY EXPANDIDO ===================== */}
      {/* A página nasce a crescer (0,86 -> 1) e a subir, e no gesto é o
          cartão que encolhe com o dedo. Tudo à volta do mesmo pivô (50%, 40%),
          que é o da capa no `vooDaMoldura`. Ver state/transicaoDoLeitor.ts. */}
      <PanGestureHandler
        enabled={expanded && !aterrando}
        activeOffsetY={12}
        failOffsetX={[-16, 16]}
        onGestureEvent={eventoDoDedo}
        onHandlerStateChange={aoMudarOGesto}
      >
      <Animated.View
        pointerEvents={expanded && !aterrando ? 'auto' : 'none'}
        style={[
          styles.full,
          {
            overflow: 'hidden',
            opacity: folhaOpacidade,
            borderRadius: folhaRaio,
            transform: [
              { translateX: cartaoXVisto },
              { translateY: folhaSubir },
              { scale: folhaEscala },
            ],
          },
        ]}
      >
        {/* O fundo do leitor (10/10, personalização): a capa desfocada (o de
            sempre), a cor dela (a mesma imagem tão desfocada que fica só a
            cor), duas cores dela a mexer devagar (FundoEmGradiente), ou preto. */}
        {ap.fundoLeitor === 'preto' ? <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />
          : ap.fundoLeitor === 'gradiente' ? <FundoEmGradiente uri={fundo?.uri ?? null} animar={aberto} /> : fundo ? (
          // Desfocado a partir da miniatura pequena (desfoqueLeve): o mesmo
          // fundo, sem desfocar 1280 px no instante do skip. Sem onError: a
          // falha da maxres é a capa da frente que a diz.
          <Image
            source={{ uri: fundo.uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={ap.fundoLeitor === 'cor' ? fundo.raio * 4 : fundo.raio}
            transition={450}
          />
        ) : null}
        {ap.fundoLeitor === 'preto' ? null : <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: veu.opacidadeDoVeu }]}>
        {capaFlutuante ? (
          // Com a capa 3D, o véu de cima para baixo dá lugar a uma vinheta
          // centrada na capa: mais leve atrás dela, para a cor da capa se ver no
          // fundo, e escura nos cantos. Em baixo continua escuro para os
          // controlos. Ver lib/capaFlutuante3D.ts.
          <>
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Image source={VINHETA_DA_CAPA_3D} style={StyleSheet.absoluteFill} contentFit="fill" />
            </View>
            <LinearGradient
              colors={['rgba(10,10,15,0)', 'rgba(10,10,15,0.75)', colors.bg]}
              locations={[0.55, 0.78, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          </>
        ) : (
          <LinearGradient
            colors={['rgba(10,10,15,0.30)', 'rgba(10,10,15,0.72)', colors.bg]}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        )}
        </View>}
        {ap.fundoLeitor !== 'preto' && veu.escurecer > 0 ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: veu.escurecer }]} />
        ) : null}

        {/* cabeçalho — o arrasto para fechar agora é da página toda */}
        <Animated.View
          style={[styles.fullHeader, { marginTop: insets.top + 6 }, { opacity: ESCADA[0].opacidade, transform: [{ translateY: ESCADA[0].subir }] }]}
        >
          <Toque escala={ESCALA.icone} accessibilityRole="button" accessibilityLabel="Minimize player" onPress={() => setExpanded(false)} style={styles.headerBtn}>
            <Ionicons name="chevron-down" size={24} color={colors.text} />
          </Toque>
          {/* Marca empilhada: símbolo em cima, nome por baixo, ambos ao
              centro. O ficheiro é quadrado com a marca ao centro (ocupa 84%
              da largura), por isso a caixa também é quadrada -- numa caixa
              larga o `contain` encolhia-a até não se ver. */}
          <View style={styles.headerCenter}>
            {seguindoAlguem ? <BarraDeSeguir compacta /> : ap.topo === 'origem' && origemNoTopo ? (
              // "Playing from" (o G1, 10/10): o TEXTO ao centro, e o símbolo
              // pendurado à esquerda dele, fora da conta do centro.
              <Toque
                escala={ESCALA.cartao}
                disabled={!destinoDoTopo}
                onPress={() => { if (destinoDoTopo) { setExpanded(false); irParaNoIphone(destinoDoTopo); } }}
                accessibilityRole={destinoDoTopo ? 'link' : undefined}
                accessibilityLabel={`${olhoDaOrigem(origemNoTopo.antes)} ${origemNoTopo.nome}`}
                style={styles.origemDoTopo}
              >
                <View style={styles.olhoDoTopo}>
                  <Image source={require('../../assets/auth-logo.png')} style={styles.simboloDoOlho} contentFit="contain" />
                  <Text numberOfLines={1} style={styles.textoDoOlho}>{olhoDaOrigem(origemNoTopo.antes)}</Text>
                </View>
                <Text numberOfLines={1} style={styles.nomeDaOrigem}>{origemNoTopo.nome}</Text>
              </Toque>
            ) : (
              <>
                <Image
                  source={require('../../assets/auth-logo.png')}
                  style={{ width: 22, height: 22 }}
                  contentFit="contain"
                />
                {/* Com o "Playing from" e uma música sem origem: só o símbolo. */}
                {ap.topo === 'marca' ? <Text style={styles.brandName}>
                  {APP_NAME.toUpperCase()}
                </Text> : null}
              </>
            )}
          </View>
          {/* Fechar volta ao canto, e as opções ficam em baixo.
              São gestos diferentes: fechar é sair do ecrã e vive na moldura,
              ao lado do minimizar; as opções agem sobre a FAIXA e vivem ao pé
              dela. Estavam trocados -- o fechar escondido num menu e o menu
              no canto mais longe do polegar. */}
          <Toque
            escala={ESCALA.icone}
            accessibilityRole="button"
            accessibilityLabel="Close player"
            // Primeiro o leitor desce para o mini-player (o fecho de sempre), e
            // só depois a música sai, com o mini a desvanecer com ela. Fechar
            // logo tirava a página de um fotograma para o outro (2/10). Quem
            // voltar a abrir a meio fica com a música.
            onPress={() => {
              hapticSelection();
              setExpanded(false);
              setTimeout(() => { if (!usePlayer.getState().expanded) void close(); }, FECHAR_DEPOIS_DE_DESCER_MS);
            }}
            style={styles.headerBtn}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </Toque>
        </Animated.View>


        {/* O espaço reservado à capa (a moldura flutua por cima nesta
            posição). Teve no canto um auscultador a dizer que havia Jam; saiu
            quando o indicador de visibilidade da fila de baixo passou a dizer
            o mesmo -- com quantas pessoas, e a abrir a mesma folha. Dois sinais
            para uma coisa, e um deles em cima da capa. */}
        <View style={{ height: vidFull.h, marginTop: AR_ACIMA_DA_CAPA, marginBottom: spacing.sm }} />

        {/* Dois pontos por baixo da capa: a pista mínima de que ali há outro
            lado. A capa fica limpa -- nada por cima dela, que era a condição.
            E tocar troca, para quem nunca descobrir o gesto de rodar. */}
        <Animated.View style={[styles.pontosDoCubo, { opacity: ESCADA[1].opacidade, transform: [{ translateY: ESCADA[1].subir }] }]}>
          {[false, true].map((paraAsLetras) => (
            <Pressable
              key={String(paraAsLetras)}
              hitSlop={10}
              onPress={() => setShowLyrics(paraAsLetras)}
              disabled={!!montagem.preso}
              style={montagem.preso ? styles.pontoEscondido : undefined}
              accessibilityLabel={paraAsLetras ? 'Show lyrics' : 'Show artwork'}
            >
              <View
                style={[
                  styles.ponto,
                  showLyrics === paraAsLetras && { backgroundColor: theme.color, opacity: 1 },
                ]}
              />
            </Pressable>
          ))}
          {/* Preso a arrancar: no lugar dos pontos, o botão que guarda o que
              estava a acontecer (lib/relatorioDoArranque.ts). Só existe
              enquanto está preso. */}
          {montagem.preso ? (
            <Toque
              escala={ESCALA.icone}
              onPress={() => { void partilharRelatorioDoArranque(montagem.preso); }}
              style={styles.botaoDoRelatorio}
              accessibilityRole="button"
              accessibilityLabel="Save a report about why this song is stuck"
            >
              <Ionicons name="document-text-outline" size={13} color="rgba(255,255,255,0.8)" />
              <Text style={styles.textoDoRelatorio}>Save report</Text>
            </Toque>
          ) : null}
        </Animated.View>

        <ScrollView
          style={styles.bodyScroll}
          contentContainerStyle={[styles.staticBody, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
          onLayout={(event) => setBodyHeight(event.nativeEvent.layout.height)}
          onContentSizeChange={(_width, height) => setBodyContentHeight(height)}
          scrollEnabled={bodyContentHeight > bodyHeight + 1 && !scrubbing}
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          {/* O corpo reparte a folga por TRÊS espaçadores iguais: por cima do
              título, entre o artista e a barra, e entre o play e o Queue/EQ.
              Com o `space-between` eram duas folgas e nada por cima do título,
              que ficava colado aos pontos do cubo com um vazio por baixo do
              artista (13/9). Os espaçadores descontam o que não se vê -- a
              margem dos pontos e o toque invisível da barra --, para os três
              espaços que se VEEM serem iguais. Medido na preview: 45/44/45 pt. */}
          <View style={[styles.folga, styles.folgaDeCima]} />

          {/* O título ao centro, entre o coração e as reticências, os dois sem
              círculo e com o mesmo alvo -- é essa simetria que o deixa mesmo ao
              centro do ecrã. Uma linha só: o que não cabe desvanece, e tocar
              dá-lhe uma volta (TextoQueCabe). O toque longo continua a copiar. */}
          <Animated.View style={[styles.titleRow, { opacity: ESCADA[2].opacidade, transform: [{ translateY: ESCADA[2].subir }] }]}>
            {/* Ao centro (o de sempre), o coração à esquerda; à esquerda (10/10,
                personalização), o título primeiro e o coração ao pé das reticências. */}
            {tituloAoCentro ? coracaoDoTitulo : null}
            <View
              style={[styles.textosDoTitulo, !tituloAoCentro && styles.textosAEsquerda]}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                setLarguraDoTitulo((antes) => (Math.abs(antes - w) > 0.5 ? w : antes));
              }}
            >
              {/* Sem nada entre parênteses no fim: aqui não se distingue a
                  versão, e as listas continuam a mostrá-la (tituloNoLeitor). */}
              <TextoQueCabe
                rola
                texto={tituloNoLeitor(current)}
                style={[styles.trackTitle, fonteDosTitulos(ap.titulos)]}
                larguraDisponivel={larguraDoTitulo}
                onLongPress={handleTitleLongPress}
              />
              {/* O nome do artista leva à página dele, como em todo o resto da
                  app. A caixa encolhe à medida do nome para o toque acabar onde
                  ele acaba -- um alvo invisível a ocupar a linha inteira apanha
                  toques que não eram para ele.

                  E fica SEMPRE o artista: aqui aparecia "Downloading… 42%"
                  enquanto a faixa descarregava. Era verdade, e era a pior
                  maneira de o dizer -- quem desistiu da app por isso (13/9)
                  lia que tinha de fazer download de cada música. Que a faixa
                  ainda não está pronta já o diz a capa, a respirar. */}
              <Toque
                escala={ESCALA.cartao}
                onPress={abrirArtista}
                disabled={!temArtista}
                hitSlop={8}
                accessibilityRole={temArtista ? 'link' : undefined}
                accessibilityLabel={temArtista ? `View ${nomeDoArtista}` : undefined}
                style={[styles.artistaDoTitulo, !tituloAoCentro && { alignSelf: 'flex-start' }]}
              >
                <TextoQueCabe
                  texto={nomeDoArtista}
                  style={styles.trackArtist}
                  larguraDisponivel={larguraDoTitulo}
                />
              </Toque>
            </View>
            {/* As reticências vivem aqui e não no cabeçalho: no canto de cima
                estavam no ponto mais longe do polegar, e longe daquilo sobre que
                agem. */}
            {tituloAoCentro ? null : coracaoDoTitulo}
            <View ref={ancoraDasOpcoes} collapsable={false}>
              <Toque
                escala={ESCALA.icone}
                onPress={abrirOpcoes}
                style={styles.ladoDoTitulo}
                accessibilityRole="button"
                accessibilityLabel="Track options"
              >
                <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
              </Toque>
            </View>
          </Animated.View>

          <View style={[styles.folga, styles.folgaAntesDaBarra]} />

          {/* A barra vive com os controlos, a 20 pt da fila de botões: é do
              transporte que ela fala, e colada ao título deixava-o sem ar. */}
          <Animated.View style={[styles.controls, { opacity: ESCADA[3].opacidade, transform: [{ translateY: ESCADA[3].subir }] }]}>
            <BarraDoLeitor onSeek={seekTo} onScrubbingChange={setScrubbing} grossa={ap.barra === 'grossa'} />
              <PlayerControlRow>
              {/* Três estados: apagado, ligado, e inteligente — este último
                  com uma estrelinha ao canto, que é como o Spotify o mostra e
                  como o João o conhece. Sem a estrela, ligar o inteligente não
                  se distinguia do normal e ninguém saberia em que modo está. */}
              <Toque
                escala={ESCALA.icone}
                style={styles.transportButton}
                onPress={onToggleShuffle}
                accessibilityRole="button"
                accessibilityLabel={rotuloDoModo(modoDeShuffle(shuffle, shuffleInteligente))}
              >
                {/* Salta ao LIGAR e nao ao desligar. Ligar o shuffle e uma
                    escolha; desliga-lo e voltar ao normal, e o normal nao se
                    anuncia. A mesma assimetria do coracao. */}
                <StateIcon
                  pulsar={shuffle}
                  name="shuffle"
                  size={22}
                  /**
                   * Ligado leva a cor do tema, desligado fica cinzento.
                   *
                   * Esteve branco, com o argumento de que "um interruptor
                   * desligado nao esta desactivado, esta disponivel". O
                   * argumento e bom e a pratica desmentiu-o: ao lado de um
                   * anterior e um seguinte que TAMBEM sao brancos, o branco
                   * nao distingue nada, e ligar o shuffle nao se via. Um
                   * interruptor tem de dizer em que estado esta antes de dizer
                   * que se pode carregar nele.
                   */
                  color={shuffle ? theme.color : colors.textTertiary}
                />
                {shuffleInteligente && (
                  <View style={{ position: 'absolute', top: 5, right: 4 }}>
                    <EstrelaInteligente tamanho={7} cor={theme.color} animar={expanded} />
                  </View>
                )}
              </Toque>

              <Toque
                escala={ESCALA.icone}
                accessibilityRole="button"
                accessibilityLabel="Previous track"
                // Nunca apagado (3/10): na primeira faixa recomeça-a.
                onPress={prev}
                style={styles.transportButton}
              >
                <Ionicons name="play-skip-back" size={28} color={colors.text} />
              </Toque>

              <Toque
                escala={ESCALA.botao}
                accessibilityRole="button"
                accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
                onPress={togglePlay}
                style={[styles.playBtn, ap.play === 'anel' && [styles.playAnel, { borderColor: theme.color }], ap.play === 'icone' && styles.playIcone]}
              >
                {/* `trocar`: play e pause sao o mesmo botao, e cruzam-se no
                    sitio. Nao `pulsar`: quem carrega no play ja esta a olhar
                    para ele, nao precisa de aviso. */}
                <StateIcon
                  trocar
                  name={isPlaying ? 'pause' : 'play'}
                  size={ap.play === 'icone' ? 44 : 27}
                  color={ap.play === 'cheio' ? colors.bg : colors.text}
                  /**
                   * O acerto optico do triangulo, e porque era uma MARGEM que
                   * nao chegava a acontecer.
                   *
                   * O `style` do StateIcon vai parar ao proprio `Ionicons`, que
                   * ja esta centrado numa caixa do tamanho exacto do icone. Uma
                   * `marginLeft` ali faz o filho ficar mais largo do que a
                   * caixa, e o `alignItems: 'center'` reparte esse excesso
                   * pelos dois lados -- so metade do deslocamento chegava ao
                   * ecra. Era por isso que o triangulo continuava a parecer
                   * encostado a esquerda.
                   *
                   * Um `translateX` nao mexe no layout: sai do centro e vai
                   * inteiro. O valor nao e escolhido a olho -- no desenho do
                   * Ionicons o triangulo vai de 96 a 416 num quadrado de 512, e
                   * o centro de MASSA de um triangulo esta a um terco da base:
                   * 202, contra os 256 do centro da caixa. Sao 10,4% do tamanho
                   * a menos, e e isso que se devolve.
                   */
                  style={!isPlaying ? { transform: [{ translateX: (ap.play === 'icone' ? 44 : 27) * 0.104 }] } : undefined}
                />
              </Toque>

              <Toque
                escala={ESCALA.icone}
                accessibilityRole="button"
                accessibilityLabel="Next track"
                onPress={() => { void next(); }}
                // A mesma regra do mini-player (3/10): com o rádio ligado a
                // fila nunca acaba, e o botão ficava apagado na última faixa.
                disabled={atQueueEnd}
                style={[styles.transportButton, atQueueEnd && styles.dimmed]}
              >
                <Ionicons name="play-skip-forward" size={28} color={colors.text} />
              </Toque>

              <Toque
                escala={ESCALA.icone}
                style={styles.transportButton}
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
                  // O mesmo do shuffle, e pela mesma razao.
                  color={repeatMode === 'off' ? colors.textTertiary : theme.color}
                />
                {repeatMode === 'one' ? (
                  <View style={styles.repeatOneBadge}>
                    <Text style={styles.repeatOneText}>1</Text>
                  </View>
                ) : null}
              </Toque>
              </PlayerControlRow>
          </Animated.View>

          <View style={styles.folga} />

          {/* Grupo de Rodapé: Botão Recuar & Botões Utilitários (Fila & Equalizador) */}
          <Animated.View style={[styles.bottomGroup, { opacity: ESCADA[4].opacidade, transform: [{ translateY: ESCADA[4].subir }] }]}>
            {showRewindButton ? (
              <Toque
                escala={ESCALA.icone}
                hitSlop={14}
                onPress={() => seekTo(Math.max(0, usePlayer.getState().positionMs - 15000))}
                accessibilityLabel="Rewind 15 seconds"
                style={{ alignSelf: 'center', marginBottom: spacing.md }}
              >
                <Ionicons name="play-back" size={20} color={colors.textSecondary} />
              </Toque>
            ) : null}

            <PlayerControlRow>
              <View />
              {ap.botoes.map(botaoDeBaixo)}
              <View />
            </PlayerControlRow>
          </Animated.View>
        </ScrollView>
      </Animated.View>
      </PanGestureHandler>

      <PanGestureHandler
        enabled={!expanded && !shouldHide}
        activeOffsetX={12}
        failOffsetY={[-12, 12]}
        onGestureEvent={eventoDoMini}
        onHandlerStateChange={aoMudarODeslizeDoMini}
      >
      <Animated.View
        accessibilityActions={[{name:'dismiss',label:'Close player'}]}
        onAccessibilityAction={()=>void closePlayerSmoothly()}
        pointerEvents={shouldHide || expanded ? 'none' : 'auto'}
        style={[
          styles.mini,
          {
            bottom: miniBottom,
            // Ao abrir sobe um pouco a crescer e some; no gesto de fechar volta
            // a aparecer por baixo do cartão (state/transicaoDoLeitor.ts).
            transform: nos.miniTransform,
            opacity: nos.miniOpacidade,
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
              {/* O artista, e não "Downloading…": ver a nota no leitor grande. */}
              <Text numberOfLines={1} style={[type.caption, { fontSize: 11 }]}>
                {displayArtist(current)}
              </Text>
            </View>

            {/* Guardar sem ter de abrir o player todo. */}
            <Toque
              escala={ESCALA.icone}
              hitSlop={8}
              onPress={saveCurrentToLibrary}
              accessibilityLabel={saved ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
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
                trocar
                name={isPlaying ? 'pause' : 'play'}
                size={22}
                color={colors.text}
              />
            </Toque>
            <Toque
              escala={ESCALA.icone}
              hitSlop={8}
              onPress={() => { void next(); }}
              // Com o rádio ligado a fila nunca é o fim: o `next()` estende-a.
              disabled={atQueueEnd}
              style={[styles.miniBtn, atQueueEnd && styles.dimmed]}
            >
              <Ionicons name="play-skip-forward" size={20} color={colors.text} />
            </Toque>
          </Pressable>

          {/* linha de progresso fina */}
          <View style={styles.miniTrack} pointerEvents="none">
            <PreenchimentoDoMini />
          </View>
        </Animated.View>
      </PanGestureHandler>

      {/* Os avisos do Jam, por cima do leitor pequeno. A barra permanente que
          aqui vivia saiu (11/9/2026): quem está e o que vem a seguir vêem-se no
          botão do Jam do leitor grande. Ficou só o que o Jam tem para DIZER --
          ver `soAvisos`. Sem faixa nenhuma a barra continua inteira, lá em
          cima, porque aí é a única porta para o Jam. */}
      {!shouldHide && !aberto ? (
        <Animated.View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: spacing.xl,
            right: spacing.xl,
            // Solta, com folga: um aviso que passa não é uma peça do leitor.
            // Por cima do vidro da base, e desce com ela.
            bottom: miniBottom + (current ? MINI_PLAYER_HEIGHT + 4 : 0) + spacing.sm,
            gap: 6,
            transform: [{ translateY: desvioDaMusica }],
          }}
        >
          {/* "Listening along with X · Leave": seguir alguém é um modo, e vê-se. */}
          <BarraDeSeguir />
          <BarraDaSessao soAvisos aoAbrir={() => setSessaoAberta(true)} />
        </Animated.View>
      ) : null}
      <FolhaDaSessao visivel={sessaoAberta} aoFechar={() => setSessaoAberta(false)} />

      {/* ===================== A SOMBRA DA CAPA =====================
          Numa placa POR TRAS da moldura, e nao na propria moldura.
          ------------------------------------------------------------------
          Duas razoes, as duas do iOS. A primeira: uma sombra numa View com
          fundo transparente nao desenha -- o `CALayer` tira-a do conteudo da
          camada, e a moldura e transparente de propósito quando expandida,
          para o cubo poder rodar e deixar ver a pagina por tras. A segunda: a
          moldura tem `overflow: hidden` no mini, e isso corta a sombra.

          A placa e ENCOLHIDA em relacao a capa (ver `RECUO_DA_SOMBRA`) para
          ficar sempre escondida por baixo dela -- inclusive a meio da rotacao
          do cubo, onde a pegada do quadrado muda. O que se ve e so o que
          transborda: um halo curto em baixo e aos lados.

          Faz o MESMO voo da moldura (o `vooDaMoldura`), e so aparece com o
          leitor aberto: uma sombra debaixo da capa de 48 px do mini-player
          nao se veria e ainda pintava por baixo da barra. */}
      {current ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.sombraDaCapa,
            {
              position: 'absolute',
              left: vidFull.x + RECUO_DA_SOMBRA,
              top: vidFull.y + RECUO_DA_SOMBRA,
              width: Math.max(0, vidFull.w - RECUO_DA_SOMBRA * 2),
              height: Math.max(0, vidFull.h - RECUO_DA_SOMBRA * 2),
              // Com a capa 3D a sombra é dela (a fatia do fundo). Esta placa é
              // plana e não roda: por trás das letras via-se como um quadrado
              // escuro desfasado da capa inclinada.
              opacity: nos.sombra,
              transform: vooDaMoldura,
            },
          ]}
        />
      ) : null}

      {/* ============ FRAME DE VÍDEO YOUTUBE (flutuante, nunca desmonta) ============ */}
      {current ? (
        <PanGestureHandler
          enabled={!aberto && !shouldHide}
          activeOffsetX={12}
          failOffsetY={[-12, 12]}
          onGestureEvent={eventoDaCapaNoMini}
          onHandlerStateChange={aoMudarODeslizeDoMini}
        >
        <Animated.View
          pointerEvents={shouldHide ? 'none' : 'auto'}
          style={{
            position: 'absolute',
            opacity: nos.molduraOpacidade,
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
            borderRadius: nos.moldura.borderRadius,
            transform: vooDaMoldura,
            overflow: aberto ? 'visible' : 'hidden',
            backgroundColor: aberto ? 'transparent' : '#000',
          }}
        >
          {isYt && <View style={[StyleSheet.absoluteFill,{overflow:'hidden',borderRadius:20,opacity:aberto?0:1}]}><YouTubePlayerView track={current} /></View>}

          {/* Fundo preto opaco para tapar quaisquer controlos, logos ou botões do YouTube (WebView)
              de brilharem por trás quando a capa de álbum diminui de opacidade ao pulsar. */}
          {!aberto && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} pointerEvents="none" />
          )}

          {/* Mostramos SEMPRE a thumbnail por cima — o áudio nativo continua a
              tocar por trás. (A app é só áudio; o vídeo é irrelevante.) A capa
              "respira" (opacidade a pulsar) enquanto a música carrega. */}
          {!aberto && (origemDaEntrada?.uri || capaParaLista(artSource)) ? (
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

          {/* A CAPA GRANDE TAMBEM RESPIRA enquanto carrega.
              O `pulse` so estava no mini-player: no leitor aberto -- que e
              onde se esta a olhar quando se espera pela musica -- a capa
              ficava parada e nada dizia que alguma coisa estava a acontecer.
              E o mesmo valor e a mesma animacao, so que aplicada aqui
              tambem. */}
          {/* Respira ESCURECENDO, e não ficando transparente. A 40% de opacidade
              via-se o que estava por trás -- a sombra da capa, com fundo preto, e o
              fundo do cubo --, e isso lia-se como uma moldura à volta da capa
              (13/9). O véu vive DENTRO da face do cubo, que recorta com o raio:
              a capa fica opaca e não há borda que se possa ver. */}
          {/* O cubo NÃO remonta por faixa (24/9): remontava, e cada skip
              construía outra vez as quatro laterais, os mosaicos do grão das
              duas faces e o verso desfocado, e o iPhone rasterizava tudo de
              novo -- no mesmo instante do "Recuo subtil", que engasgava. Só as
              letras levam a `key` da faixa (dentro do cubo). A capa da frente
              também já não (2/10): uma por faixa deixava a face preta entre
              a que saía e a que entrava (ver CapaComTransicao). */}
          {aberto && (
            <CapaDoLeitor
              track={current} size={vidFull.w} capaFlutuante={capaFlutuante} capaInteira={capaInteira} montagem={montagem}
              transicao={transicaoDaCapa.current} artSource={artSource} showLyrics={showLyrics}
              setShowLyrics={setShowLyrics} setCapaARodar={setCapaARodar} onArtError={onArtError}
              escurecerCapa={escurecerCapa} aoGostar={aoGostarPelaCapa} aFlutuar={ap.flutuar}
            />
          )}

          {/* No modo mini, tocar no vídeo expande */}
          {!aberto ? (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => {if(!swiping.current)setExpanded(true);}}
            />
          ) : null}
        </Animated.View>
        </PanGestureHandler>
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
                      {accao === 'repetir' ? 'Try again' : 'Skip'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
      ) : null}


      {/* ===================== ADICIONAR A PLAYLIST ===================== */}
      <MenuFlutuante
        visivel={optionsVisible}
        ancora={ancora}
        aoFechar={() => setOptionsVisible(false)}
        aoFechado={() => { const fn = depoisDeFechar.current; depoisDeFechar.current = null; fn?.(); }}
        accoes={paginaDoMenu === 'comando' ? comandoDoMenu : paginaDoMenu === 'aparelhos' ? aparelhosDoMenu : accoesDaFaixa}
      />
      <AddToPlaylistSheet
        visible={playlistOpen}
        track={current}
        onClose={() => setPlaylistOpen(false)}
      />

      {/* ========================== MODO CARRO ========================== */}
      <ModoCarro visivel={modoCarro} aoFechar={() => setModoCarro(false)} />

      {/* ===================== PARTILHAR COM UM AMIGO ===================== */}
      <ShareFriendSheet
        visible={partilhaAberta}
        itemType="track"
        item={current}
        onClose={() => setPartilhaAberta(false)}
      />
      <RecommendationPreferences
        visible={recomendacoesAbertas}
        track={current}
        reason={contextoDaRecomendacaoAtual()?.reason}
        onClose={() => setRecomendacoesAbertas(false)}
      />

      {/* A fila passou a uma folha nativa do iOS (3/10): é o ecrã `Fila` do
          stack, e o que só o leitor sabe fazer chega-lhe pelo
          `registarAccoesDaFila` (state/filaNativa.ts). */}

      {/* ===================== EQUALIZADOR E VELOCIDADE ===================== */}
      <EqualizadorSheet
        visible={eqVisible}
        onClose={() => setEqVisible(false)}
      />
    </View>
  );
}

/**
 * A barra do leitor lê a posição ELA PRÓPRIA. A posição muda a cada evento do
 * motor (até duas vezes por segundo), e lida no `PlayerRoot` redesenhava o
 * leitor inteiro -- capa 3D, letras, controlos --, também com o leitor fechado
 * e com o ecrã bloqueado.
 */
function BarraDoLeitor(props: Pick<React.ComponentProps<typeof ProgressBar>, 'onSeek' | 'onScrubbingChange' | 'grossa'>) {
  const positionMs = usePlayer((s) => s.positionMs);
  const durationMs = usePlayer((s) => s.durationMs);
  const ritmo = usePlayer((s) => s.playbackRate);
  // Desliza só com o leitor ABERTO e a app à frente: fechado, ninguém a vê, e
  // uma animação a correr mantinha o ecrã a redesenhar-se (lib/barraSuave.ts).
  const aVista = usePlayer((s) => s.isPlaying && s.expanded) && AppState.currentState === 'active';
  // Fechar o leitor ou mudar de faixa larga um arrasto preso (6/10).
  const aberto = usePlayer((s) => s.expanded);
  const faixa = usePlayer((s) => s.current?.sourceId ?? null);
  return <ProgressBar positionMs={positionMs} durationMs={durationMs} aTocar={aVista} ritmo={ritmo} faixa={faixa} aVista={aberto} {...props} />;
}

/**
 * A capa (e as letras) do leitor aberto, fora do corpo do `PlayerRoot` (27/9).
 *
 * O `PlayerRoot` redesenha-se a cada mudança do estado da faixa -- a carregar,
 * a tocar, erro, a fila --, várias vezes em cada skip. Com a capa lá dentro, o
 * cubo inteiro (seis faces, o grão, as letras) era reconciliado de cada vez, no
 * mesmo instante do recuo da capa. Memorizada, só se redesenha quando muda o
 * que ela mostra: as props têm de ficar ESTÁVEIS (`useCallback`, `useMemo`).
 */
const CapaDoLeitor = React.memo(function CapaDoLeitor({
  track, size, capaFlutuante, capaInteira, montagem, transicao, artSource, showLyrics, setShowLyrics, setCapaARodar,
  onArtError, escurecerCapa, aoGostar, aFlutuar,
}: {
  track: Track;
  size: number;
  capaFlutuante: boolean;
  /** A capa "Full": sem cantos e sem o fio claro (10/10). */
  capaInteira: boolean;
  montagem: MontagemDaCapa;
  transicao: { chave: string; sentido: Sentido } | null;
  artSource: string | null;
  showLyrics: boolean;
  setShowLyrics: (v: boolean) => void;
  setCapaARodar: (v: boolean) => void;
  onArtError: () => void;
  escurecerCapa: Animated.AnimatedInterpolation<number>;
  /** Dois toques na capa (`DuploToqueParaGostar`). Estável: a capa é memorizada. */
  aoGostar: () => void;
  /** A capa 3D a flutuar (10/10, personalização). */
  aFlutuar: boolean;
}) {
  return (
    <CapaFlutuante3D size={size} enabled={capaFlutuante} montagem={montagem} transicao={transicao} forcaDaPose={forcaDaPose} aFlutuar={aFlutuar}>
      {(pose3D) => (
        <ArtworkLyricsCube track={track} size={size} artwork={artSource} showLyrics={showLyrics} onChange={setShowLyrics} aoRodar={setCapaARodar} raio={capaFlutuante ? CAPA_FLUTUANTE.raio : capaInteira ? 0 : 20}
          front={<>{artSource?<CapaComTransicao uri={artSource} onError={onArtError} />:<View style={StyleSheet.absoluteFill} />}<Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: escurecerCapa }]} />{!capaFlutuante && !capaInteira && <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.arestaDaCapa]} />}<DuploToqueParaGostar aoGostar={aoGostar} /></>} pose3D={pose3D} />
      )}
    </CapaFlutuante3D>
  );
});

/** A linha fina do mini-player, pela mesma razão. */
function PreenchimentoDoMini() {
  // Aos saltos de propósito: numa linha de 2 px avança menos de um píxel por
  // segundo, e uma animação contínua mantinha o ecrã a redesenhar-se sempre
  // que há música -- que é o que o aquecimento de 13/9 ensinou a evitar.
  const fraction = usePlayer((s) => (s.durationMs > 0 ? Math.min(1, s.positionMs / s.durationMs) : 0));
  // Na cor do tema (3/10): a da capa com "seguir a cor da capa", o steel sem.
  const cor = useTheme((s) => s.destino.color);
  return <View style={[styles.miniTrackFill, { width: `${fraction * 100}%`, backgroundColor: cor }]} />;
}

const styles = StyleSheet.create({
  bodyScroll: { flex: 1 },
  staticBody: {
    /**
     * O corpo ocupa o que sobra e reparte-o.
     *
     * O `flexGrow` perdeu-se num refactor, e sem ele os espaçadores não têm o
     * que repartir: a capa, o título, os controlos e o Queue/EQ ficavam
     * colados uns aos outros com um terço do ecrã vazio por baixo. Num `ScrollView` é o `contentContainerStyle` que precisa do
     * `flexGrow: 1` -- o `flex: 1` aqui não faz nada, porque o contentor de
     * conteúdo não tem altura própria para dividir.
     */
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
  },
  /**
   * Os três espaços do corpo: por cima do título, entre o artista e a barra, e
   * entre o play e o Queue/EQ. Crescem por igual; o mínimo é o que impede um
   * ecrã pequeno (ou o texto aumentado) de os colar.
   */
  folga: {
    flexGrow: 1,
    minHeight: spacing.lg,
  },
  // Os pontos do cubo trazem 7 de margem por baixo. Descontam-se, e mais um,
  // para o espaço que se VÊ entre os pontos e o título ser igual aos outros.
  folgaDeCima: {
    marginTop: -8,
  },
  // O espaço que se vê começa na pista, não nos 12 de toque invisível por cima.
  folgaAntesDaBarra: {
    marginBottom: -TOQUE_DA_BARRA,
  },
  bottomGroup: {
    width: '100%',
    alignItems: 'center',
    // Sem `marginTop`: a separação do transporte vem do espaçador de baixo
    // (`folga`). Somar-lhe uma margem era pedir duas vezes o mesmo espaço.
  },
  utilityIconBtn: {
    width: 48,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 5,
  },
  utilityIconLabel: {
    fontSize: 11,
    fontWeight: '400',
    color: colors.textSecondary,
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
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    // Empilhada: símbolo em cima, nome por baixo. Era um override inline no
    // JSX; ao passar para aqui tem de trazer o `column` atrás, senão a marca
    // volta a deitar-se ao lado do símbolo.
    flexDirection: 'column',
    alignItems: 'center',
    gap: 1,
  },
  brandName: {
    ...type.micro,
    fontSize: 11,
    letterSpacing: ESPACO_DA_MARCA,
    fontWeight: '600',
    /**
     * O acerto que faz a marca ficar mesmo ao centro.
     *
     * O `letterSpacing` acrescenta espaço depois de CADA letra, incluindo a
     * última. A caixa do texto fica com esse espaço à direita sem nada lá
     * dentro, e ao centrá-la as letras assentam meio espaço à esquerda do
     * centro -- o que se vê como o símbolo desviado para a direita, porque
     * esse está bem centrado.
     *
     * Um `padding` igual do lado esquerdo devolve a simetria: as letras
     * passam a ter o mesmo vazio dos dois lados, e o centro da caixa volta a
     * ser o centro do que se lê. Tem de ser o MESMO valor do espaçamento, e é
     * por isso que os dois saem da mesma constante em vez de serem dois
     * números escritos à mão que podem divergir.
     */
    paddingLeft: ESPACO_DA_MARCA,
  },
  /**
   * A área de toque dos botões de transporte -- anterior, seguinte, repetir.
   *
   * A escala visual pode mudar sem reduzir os alvos de toque de 48 pt.
   */
  transportButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * Ligeira, e ligeira a serio.
   *
   * O que se quer e a capa parecer pousada, nao recortada: um halo curto por
   * baixo e quase nada aos lados. Dai o deslocamento so na vertical, a
   * opacidade a menos de metade, e um raio largo -- uma sombra apertada
   * desenha um contorno, e um contorno le-se como uma moldura.
   *
   * O `elevation` e para o Android; o resto e o iOS, que e onde isto se ve.
   */
  sombraDaCapa: {
    borderRadius: 20,
    backgroundColor: '#000',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  // O fio claro é só da capa plana (Simple). Na caixa 3D desenhava uma linha
  // branca à volta da face, que se lia como arestas esbranquiçadas (14/9).
  arestaDaCapa: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.13)',
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
    // Sete e não dez: isto é a terceira de quatro margens entre a capa e o
    // título, e somadas davam um vazio que não era decisão de ninguém.
    marginBottom: 7,
  },
  ponto: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textTertiary,
    opacity: 0.5,
  },
  pontoEscondido: { opacity: 0 },
  // O botão do relatório, no lugar dos pontos. Absoluto para não mexer no espaço
  // entre a capa e o título quando aparece.
  botaoDoRelatorio: {
    position: 'absolute',
    top: -9,
    height: 24,
    paddingHorizontal: 11,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  textoDoRelatorio: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' },
  // O coração e as reticências: o mesmo alvo dos dois lados, sem círculo.
  ladoDoTitulo: {
    width: 44,
    height: 44,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textosDoTitulo: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  artistaDoTitulo: {
    marginTop: 4,
    alignSelf: 'center',
    maxWidth: '100%',
  },
  actionsBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: colors.border,
  },
  // Mais pequeno do que os 27 de antes: ao centro e numa linha só, um título
  // grande enchia a caixa e desvanecia quase sempre.
  trackTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.4,
  },
  trackArtist: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  controls: {
    width: '100%',
    // Da pista aos tempos e dos tempos à fila de botões. O ar por cima vem do
    // espaçador, que tem mínimo -- já não é preciso uma margem aqui.
    gap: 20,
  },
  repeatOneBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
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
    // Um pouco maior do que os 54 que eram: e o alvo principal do ecra e o
    // unico que se carrega sem olhar.
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // O botão play em anel ou só o ícone (10/10, personalização).
  playAnel: { backgroundColor: 'transparent', borderWidth: 2 },
  playIcone: { backgroundColor: 'transparent' },
  // "Playing from" no topo (o G1): o texto ao centro, o símbolo à esquerda dele.
  origemDoTopo: { alignItems: 'center', maxWidth: 240 },
  olhoDoTopo: { flexDirection: 'row', alignItems: 'center' },
  simboloDoOlho: { position: 'absolute', right: '100%', marginRight: 6, width: 14, height: 14 },
  textoDoOlho: { fontSize: 11, fontWeight: '600', letterSpacing: 1.2, paddingLeft: 1.2, textTransform: 'uppercase', color: colors.textSecondary },
  nomeDaOrigem: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 1, maxWidth: 240 },
  textosAEsquerda: { alignItems: 'flex-start' },
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
    borderCurve: 'continuous',
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
    borderCurve: 'continuous',
  },
  upNextArt: {
    width: 36,
    height: 36,
    borderRadius: 6,
    borderCurve: 'continuous',
    backgroundColor: colors.surfaceHigh,
  },
  // Sem fundo nem moldura (3/10): o vidro é da base (components/Doca.tsx), e a
  // linha está por cima dele. Era um cartão opaco pousado na barra.
  mini: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: MINI_PLAYER_HEIGHT,
    overflow: 'hidden',
  },
  miniInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 16,
    paddingRight: 10,
  },
  miniVideoSlot: {
    width: 48,
    height: 48,
    borderRadius: 8,
    borderCurve: 'continuous',
  },
  miniArt: {
    width: 48,
    height: 48,
    borderRadius: radii.sm,
    borderCurve: 'continuous',
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
    left: 16,
    right: 16,
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
    borderCurve: 'continuous',
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
    borderCurve: 'continuous',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  toastText: {
    ...type.caption,
    color: colors.text,
    flex: 1,
  },
});
