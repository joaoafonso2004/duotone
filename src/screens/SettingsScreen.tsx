import { loadCapaIOS, useCapaIOS } from '../state/capaIOS';
import { getCarroMantemEcra, setCarroMantemEcra } from '../lib/prefs';
import { useNotifications } from '../state/notifications';
import { RecommendationPreferences } from '../components/RecommendationPreferences';
import { useOfflineMode } from '../hooks/useOfflineMode';
import { removeOwnProfileMedia } from '../lib/profileMedia';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, {useEffect, useMemo, useState, useRef } from 'react';
import { Alert, Animated, StyleSheet, Text, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, STEEL } from '../state/theme';
import { clearLibrary, reporGuardadas } from '../api/library';
import { avisarRemocao, contarMusicas, avisarErro, avisarFeito } from '../lib/avisoDeRemocao';
import { useSaved } from '../state/saved';
import { clearPoTokenMemo } from '../api/potProvider';
import { clearStreamMemo, clearVisitorData, streamEmMemoria } from '../api/ytstream';
import {
  efeitoDaNormalizacao, efeitoDaQualidade, efeitoDeLimparACache, efeitoDeManterOEcra,
  efeitoDoCrossfade, efeitoDoSmartShuffle, efeitoDoGostoDoSpotify, efeitoDoPadrao, efeitoDoRadio,
  efeitoDoTemporizador,
} from '../lib/efeitoDasDefinicoes';
import { ErroDoSpotify, importarGostoDoSpotify, spotifyDisponivel } from '../api/spotifyConta';
import { mensagemDoSpotify, type GostoDoSpotify } from '../lib/gostoDoSpotify';
import { getGostoDoSpotify } from '../lib/prefs';
import { useRecomendacoes } from '../state/recomendacoes';
import { getLoudnessDb } from '../lib/loudnessCache';
import { limparTodosOsDownloads } from '../lib/descarregarFaixa';
import { idsPedidos } from '../lib/downloadsFixados';
import { supabase } from '../lib/supabase';
import { APP_VERSION } from '../lib/buildInfo';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { Screen, useCabecalhoQueEncolhe } from '../components/Screen';
import { hapticNotification, hapticSelection } from '../lib/haptics';
import {
  getAudioQuality,
  getHapticsEnabled,
  getShowTrackDuration,
  setAudioQuality,
  setAutoplayRadio as persistAutoplayRadio,
  getKeepAwake,
  getNotificationsEnabled,
  setNotificationsEnabled as persistNotifications,
  setKeepAwake as persistKeepAwake,
  setVolumeNormalization as persistVolumeNormalization,
  setHapticsEnabled,
  setHapticsEnabledCache,
  setShowRewindButton as persistShowRewindButton,
  setShowTrackDuration as persistShowTrackDuration,
  setShowTrackDurationCache,
  type AudioQuality,
  getCrossfadeSegundos,
  setCrossfadeSegundos,
  setIntensidadeDoSmartShuffle,
} from '../lib/prefs';
import { formatCacheSize, getAudioCacheBytes, isAudioCached } from '../lib/youtubeCache';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../state/auth';
import { BarraVelocidade } from '../components/BarraVelocidade';
import { Equalizador, ReporEqualizador } from '../components/Equalizador';
import { BottomSheet, BottomSheetGestureGuard } from '../components/BottomSheet';
import { Grupo, Linha, LinhaAlta, LinhaInterruptor } from '../components/ListaAgrupada';
import { MenuFlutuante, type Ancora } from '../components/MenuFlutuante';
import type { PlayerAction } from '../components/PlayerActionsSheet';
import { chaveDaFaixa, ePlano, PLANO } from '../lib/equalizer';
import { presetDosGanhos, presetsVisiveis, resumoDosPresets } from '../lib/presetsDoEqualizador';
import { usePresets } from '../state/presets';
import { PresetsSheet } from '../components/PresetsSheet';
import { usePlayer } from '../state/player';
import { getLibrary } from '../api/library';
import { DURACOES_DO_CROSSFADE, type DuracaoDoCrossfade } from '../lib/crossfade';
import { resumoDoVarrimento, varrerCatalogo } from '../state/catalogoDeFaixas';
import { partilharRelatorioDeReproducao } from '../lib/relatorioDeReproducao';
import { spacing, type } from '../theme';
import { mensagemDeErro } from '../lib/mensagemDeErro';


type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const offline=useOfflineMode();
  // O título encolhe ao rolar (3/10, lib/tituloQueEncolhe.ts).
  const cab = useCabecalhoQueEncolhe();
  const coverStyle = useCapaIOS(s => s.style);
  const [carroMantemEcra, setCarroMantemEcraState] = useState(true);
  useEffect(() => {
    let vivo = true;
    void getCarroMantemEcra().then((v) => { if (vivo) setCarroMantemEcraState(v); }).catch(() => {});
    return () => { vivo = false; };
  }, []);
  useEffect(() => { if (Platform.OS === 'ios') void loadCapaIOS(); }, []);
  const [recommendationsOpen,setRecommendationsOpen]=useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const memoriaDosPresets = usePresets((s) => s.memoria);
  const presetsNaFila = useMemo(() => presetsVisiveis(memoriaDosPresets), [memoriaDosPresets]);
  // O gosto lido do Spotify (api/spotifyConta.ts). Só no iPhone, e só com o
  // Client ID na build -- sem ele a linha nem aparece.
  const [gostoDoSpotify, setGostoDoSpotifyNoEcra] = useState<GostoDoSpotify | null>(null);
  const [aLerSpotify, setALerSpotify] = useState(false);
  useEffect(() => {
    let vivo = true;
    void getGostoDoSpotify().then((g) => { if (vivo) setGostoDoSpotifyNoEcra(g); }).catch(() => {});
    return () => { vivo = false; };
  }, []);
  const importarDoSpotify = async () => {
    setALerSpotify(true);
    try {
      const lido = await importarGostoDoSpotify();
      setGostoDoSpotifyNoEcra(lido);
      hapticNotification();
      // Refaz as prateleiras JÁ: a descoberta da semana estava calculada sem
      // este gosto, e sem forçar ficava assim até à semana seguinte.
      void useRecomendacoes.getState().carregar(true);
    } catch (e) {
      const texto = mensagemDoSpotify(e instanceof ErroDoSpotify ? e.tipo : 'rede');
      if (texto) avisarErro(texto);
    } finally {
      setALerSpotify(false);
    }
  };
  const insets = useSafeAreaInsets();
  const session = useAuth((s) => s.session);
  const signOut = useAuth((s) => s.signOut);
  const resetPassword = useAuth((s) => s.resetPassword);
  const [resettingPw, setResettingPw] = useState(false);

  const doResetPassword = async () => {
    setResettingPw(true);
    try {
      const err = await resetPassword();
      hapticNotification();
      if (err) avisarErro(mensagemDeErro(err, 'Could not send the reset email.'));
      else avisarFeito('Check your email', 'We sent you a link to reset your password.');
    } finally {
      setResettingPw(false);
    }
  };

  const showRewindButton = usePlayer((s) => s.showRewindButton);
  const autoplayRadio = usePlayer((s) => s.autoplayRadio);
  const setAutoplayRadio = usePlayer((s) => s.setAutoplayRadio);
  const volumeNormalization = usePlayer((s) => s.volumeNormalization);
  const setVolumeNormalization = usePlayer((s) => s.setVolumeNormalization);
  const setShowRewindButton = usePlayer((s) => s.setShowRewindButton);
  // O padrao, e nao a velocidade da faixa a tocar: e isso que este controlo
  // define, e mostrar a outra fazia a barra saltar a cada mudanca de musica.
  const padraoRate = usePlayer((s) => s.padraoRate);
  const padraoGanhos = usePlayer((s) => s.padraoGanhos);
  const setEqGanhos = usePlayer((s) => s.setEqGanhos);
  const setPlaybackRate = usePlayer((s) => s.setPlaybackRate);
  const sleepTimerTimeLeft = usePlayer((s) => s.sleepTimerTimeLeft);
  const setSleepTimer = usePlayer((s) => s.setSleepTimer);
  // O que está a tocar AGORA, para cada opção dizer o efeito que tem nesta
  // música -- ver lib/efeitoDasDefinicoes.ts.
  const atual = usePlayer((s) => s.current);
  const motor = usePlayer((s) => s.activeBackend);
  const repeatUma = usePlayer((s) => s.repeatMode === 'one');
  const intensidadeSmart = usePlayer((s) => s.intensidadeSmartShuffle);
  const smartLigado = usePlayer((s) => s.shuffle && s.shuffleInteligente);
  const rateDaFaixa = usePlayer((s) => s.playbackRate);
  const ganhosDaFaixa = usePlayer((s) => s.eqGanhos);
  const ajusteDaFaixa = usePlayer((s) => (s.current ? s.ajustesPorFaixa[chaveDaFaixa(s.current)] : undefined));
  const radioActivo = usePlayer((s) => s.radioActive);
  const modo = useTheme((s) => s.mode);
  const setMode = useTheme((s) => s.setMode);
  // O que a capa a tocar está a dar agora. Serve de amostra na própria
  // escolha: uma opção chamada "segue a capa" tem de mostrar qual é a capa.
  const temaActual = useTheme((s) => s.theme);
  const activeTheme = useTheme((s) => s.theme);

  const [audioQuality, setAudioQualityState] = useState<AudioQuality>('high');
  const [crossfade, setCrossfadeState] = useState<DuracaoDoCrossfade>(0);
  const [showDuration, setShowDuration] = useState(true);
  const [hapticsOn, setHapticsOn] = useState(false);
  const [keepAwakeOn, setKeepAwakeOn] = useState(false);
  const [notificationsOn, setNotificationsOn] = useState(true);
  const [cacheBytes, setCacheBytes] = useState(0);
  // Identificação da biblioteca contra um catálogo a sério. Só corre quando
  // se pede: são uma ou duas chamadas de rede por faixa.
  const [aIdentificar, setAIdentificar] = useState(false);
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null);
  const [resumoDoCatalogo, setResumoDoCatalogo] = useState<string | null>(null);
  const pararIdentificacao = useRef(false);

  const [signOutOpen, setSignOutOpen] = useState(false);
  const [clearLibraryOpen, setClearLibraryOpen] = useState(false);
  const [clearingLibrary, setClearingLibrary] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);


  useEffect(() => {
    getAudioQuality().then(setAudioQualityState);
    getCrossfadeSegundos().then(setCrossfadeState);
    getShowTrackDuration().then(setShowDuration);
    getHapticsEnabled().then(setHapticsOn);

    // Só reflete o estado — quem o aplica no arranque é o App.tsx.
    getKeepAwake().then(setKeepAwakeOn);
    getNotificationsEnabled().then(setNotificationsOn);
    // Quanto espaco o "Clear YouTube cache" vai libertar. Le o filesystem;
    // uma vez ao abrir o ecra e outra depois de limpar.
    setCacheBytes(getAudioCacheBytes());
  }, []);

  const changeAudioQuality = async (i: number) => {
    const v: AudioQuality = i === 1 ? 'saver' : 'high';
    setAudioQualityState(v);
    hapticSelection();
    await setAudioQuality(v);
  };

  const toggleNotifications = async (v: boolean) => {
    setNotificationsOn(v);
    if (!v) useNotifications.getState().clearBanners();
    hapticSelection();
    await persistNotifications(v);
  };

  const toggleVolumeNormalization = async (v: boolean) => {
    setVolumeNormalization(v);
    hapticSelection();
    await persistVolumeNormalization(v);
  };

  const toggleAutoplayRadio = async (v: boolean) => {
    setAutoplayRadio(v);
    hapticSelection();
    await persistAutoplayRadio(v);
  };

  const toggleShowRewind = async (v: boolean) => {
    setShowRewindButton(v);
    hapticSelection();
    await persistShowRewindButton(v);
  };

  const toggleShowDuration = async (v: boolean) => {
    setShowDuration(v);
    setShowTrackDurationCache(v);
    hapticSelection();
    await persistShowTrackDuration(v);
  };

  const toggleHaptics = async (v: boolean) => {
    if (v) setHapticsEnabledCache(true);
    hapticSelection();
    setHapticsOn(v);
    setHapticsEnabledCache(v);
    await setHapticsEnabled(v);
  };

  const toggleKeepAwake = async (v: boolean) => {
    setKeepAwakeOn(v);
    hapticSelection();
    await persistKeepAwake(v);
    if (v) {
      await activateKeepAwakeAsync();
    } else {
      deactivateKeepAwake();
    }
  };

  const changeCrossfade = (indice: number) => {
    const valor = DURACOES_DO_CROSSFADE[indice] ?? 0;
    setCrossfadeState(valor);
    usePlayer.setState({ crossfadeSegundos: valor });
    void setCrossfadeSegundos(valor);
  };

  const identificarBiblioteca = async () => {
    setAIdentificar(true);
    setResumoDoCatalogo(null);
    pararIdentificacao.current = false;
    try {
      const faixas = await getLibrary();
      const r = await varrerCatalogo(
        faixas,
        (feitas, total) => setProgresso(total ? { feitas, total } : null),
        () => pararIdentificacao.current,
      );
      setResumoDoCatalogo(resumoDoVarrimento(r));
    } catch {
      setResumoDoCatalogo('Could not finish. Check your connection and try again.');
    } finally {
      setProgresso(null);
      setAIdentificar(false);
    }
  };

  const doClearCache = async () => {
    // Todo o áudio, os downloads pedidos incluídos, e os que estão a meio
    // (ver o efeito por baixo do botão, que o diz antes de carregar).
    await limparTodosOsDownloads();
    clearStreamMemo();
    clearPoTokenMemo();
    // O visitorData sobrevivia ao "Clear cache" (24h no AsyncStorage). Se a
    // Google o marcasse, limpar a cache nao resolvia nada ate ele expirar.
    clearVisitorData();
    setCacheBytes(getAudioCacheBytes());
    // Um aviso que não interrompe (3/10): era um alerta com "OK".
    avisarRemocao({ texto: 'Cache cleared', detalhe: 'Downloaded songs and saved links' });
  };

  const doClearLibrary = async () => {
    setClearingLibrary(true);
    try {
      const tiradas = await clearLibrary();
      setClearLibraryOpen(false);
      // Com "Undo" (3/10): as mesmas linhas voltam, com as datas de antes.
      avisarRemocao({
        texto: 'Liked Songs cleared',
        detalhe: contarMusicas(tiradas.length),
        desfazer: async () => { await reporGuardadas(tiradas); void useSaved.getState().refresh(); },
      });
    } catch (e: any) {
      avisarErro(mensagemDeErro(e, 'Could not clear the library.'));
    } finally {
      setClearingLibrary(false);
    }
  };

  const doDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await removeOwnProfileMedia();
      const { error } = await supabase.rpc('delete_user_account');
      if (error) throw error;
      setDeleteAccountOpen(false);
      hapticNotification();
      await signOut();
      Alert.alert('Deleted', 'Your account has been deleted.');
    } catch (e: any) {
      avisarErro(mensagemDeErro(e, 'Could not delete your account.'));
    } finally {
      setDeletingAccount(false);
    }
  };

  // O que cada opção está a fazer agora -- a linha por baixo de cada uma. As
  // frases vivem em lib/efeitoDasDefinicoes.ts, testadas; aqui só se junta o
  // estado que elas pedem.
  const doYouTube = !!atual && atual.source === 'youtube';
  const descarregadaAgora = doYouTube && isAudioCached(atual!.sourceId);
  const streamAgora = doYouTube ? streamEmMemoria(atual!.sourceId, audioQuality) : null;
  const efeitos = {
    smart: efeitoDoSmartShuffle({ intensidade: intensidadeSmart, ligado: smartLigado }),
    qualidade: efeitoDaQualidade({
      escolha: audioQuality, motor: atual ? motor : null, descarregada: descarregadaAgora,
      kbps: streamAgora?.kbps ?? null, codec: streamAgora?.codec ?? null,
    }),
    crossfade: efeitoDoCrossfade({ segundos: crossfade, repeatUma }),
    velocidade: efeitoDoPadrao({
      tipo: 'velocidade', temFaixa: !!atual,
      temAjusteProprio: !!ajusteDaFaixa && ajusteDaFaixa.rate !== null,
      igualAoPadrao: Math.abs(rateDaFaixa - padraoRate) < 0.005,
      valorDaFaixa: `${Number(rateDaFaixa.toFixed(2))}×`,
    }),
    equalizador: efeitoDoPadrao({
      tipo: 'equalizador', temFaixa: !!atual,
      temAjusteProprio: !!ajusteDaFaixa && ajusteDaFaixa.ganhos !== null,
      igualAoPadrao: ganhosDaFaixa.length === padraoGanhos.length
        && ganhosDaFaixa.every((g, i) => Math.abs(g - padraoGanhos[i]) < 0.05),
    }),
    temporizador: efeitoDoTemporizador({ restanteS: sleepTimerTimeLeft, agora: new Date() }),
    normalizacao: efeitoDaNormalizacao({
      ligada: volumeNormalization, temFaixa: doYouTube,
      loudnessDb: doYouTube ? getLoudnessDb(atual!.sourceId) : null,
    }),
    radio: efeitoDoRadio({ ligado: autoplayRadio, aTocarRadio: radioActivo }),
    ecra: efeitoDeManterOEcra(keepAwakeOn),
    cache: efeitoDeLimparACache({ bytes: cacheBytes, downloads: idsPedidos().filter(isAudioCached).length }),
    spotify: efeitoDoGostoDoSpotify({
      artistas: gostoDoSpotify?.artistas.length ?? 0, lidoEm: gostoDoSpotify?.lidoEm ?? null, agora: Date.now(),
    }),
  };

  // As escolhas abrem um menu junto ao dedo (variante B, 4/10): a linha mostra
  // o valor, e o menu tem o ✓ na escolhida.
  const indiceDoTemporizador = sleepTimerTimeLeft === 0 ? 0
    : sleepTimerTimeLeft <= 15 * 60 ? 1
    : sleepTimerTimeLeft <= 30 * 60 ? 2
    : sleepTimerTimeLeft <= 45 * 60 ? 3 : 4;
  const escolhas: Record<string, { opcoes: string[]; atual: number; escolher: (i: number) => void }> = {
    smart: {
      opcoes: ['Few', 'Some', 'Lots'],
      atual: ['poucas', 'normal', 'muitas'].indexOf(intensidadeSmart),
      escolher: (i) => {
        const v = (['poucas', 'normal', 'muitas'] as const)[i] ?? 'normal';
        usePlayer.setState({ intensidadeSmartShuffle: v });
        void setIntensidadeDoSmartShuffle(v);
      },
    },
    crossfade: {
      opcoes: ['Off', '3 seconds', '6 seconds', '9 seconds'],
      atual: DURACOES_DO_CROSSFADE.indexOf(crossfade),
      escolher: changeCrossfade,
    },
    temporizador: {
      opcoes: ['Off', '15 minutes', '30 minutes', '45 minutes', '1 hour'],
      atual: indiceDoTemporizador,
      escolher: (i) => setSleepTimer([0, 15, 30, 45, 60][i] ?? 0),
    },
    qualidade: { opcoes: ['High', 'Data saver'], atual: audioQuality === 'saver' ? 1 : 0, escolher: (i) => void changeAudioQuality(i) },
    destaque: { opcoes: ['Steel', 'Cover'], atual: modo === 'cover' ? 1 : 0, escolher: (i) => void setMode(i === 1 ? 'cover' : 'steel') },
    capa: {
      opcoes: ['Floating 3D', 'Simple'],
      atual: coverStyle === 'floating' ? 0 : 1,
      escolher: (i) => useCapaIOS.getState().setStyle(i === 0 ? 'floating' : 'simple'),
    },
  };
  const [menu, setMenu] = useState<{ chave: string; ancora: Ancora } | null>(null);
  const abrirMenu = (chave: string) => (ancora: Ancora) => setMenu({ chave, ancora });
  const valorDe = (chave: string) => escolhas[chave].opcoes[escolhas[chave].atual] ?? null;
  const accoesDoMenu: PlayerAction[] = menu
    ? escolhas[menu.chave].opcoes.map((nome, i) => ({
      label: nome,
      icon: 'checkmark',
      escolhida: i === escolhas[menu.chave].atual,
      onPress: () => { escolhas[menu.chave].escolher(i); setMenu(null); },
    }))
    : [];

  // O equalizador padrão saiu da página para uma folha (4/10); a linha diz o
  // preset que ele é, se for um.
  const [eqAberto, setEqAberto] = useState(false);
  const presetDoPadrao = presetDosGanhos(presetsNaFila, padraoGanhos);
  const valorDoEq = presetDoPadrao?.nome ?? (ePlano(padraoGanhos) ? 'Flat' : 'Custom');
  const amostraDoDestaque = modo === 'cover' ? temaActual : STEEL;

  return (
    <Screen title="Settings" onBack={() => navigation.goBack()} encolhe={cab}>
      <RecommendationPreferences visible={recommendationsOpen} onClose={()=>setRecommendationsOpen(false)}/>
      <PresetsSheet visible={presetsOpen} onClose={() => setPresetsOpen(false)} ganhosIniciais={padraoGanhos} />
      <EqualizadorPadrao visivel={eqAberto} aoFechar={() => setEqAberto(false)} ganhos={padraoGanhos} presets={presetsNaFila} efeito={efeitos.equalizador} />
      <MenuFlutuante visivel={!!menu} ancora={menu?.ancora ?? null} accoes={accoesDoMenu} aoFechar={() => setMenu(null)} />
      <Animated.ScrollView
        style={{ flex: 1 }}
        onScroll={cab.onScroll}
        scrollEventThrottle={cab.scrollEventThrottle}
        scrollIndicatorInsets={{ top: cab.espaco }}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: cab.espaco,
          paddingBottom: insets.bottom + 48,
          gap: spacing.xl,
        }}
      >
        {/* Arrumadas a 26/9 (pedido do João): o que se usa, e mais nada.
            A 4/10 passaram à lista agrupada dos Ajustes do iPhone (auditoria
            1.6, variante B): o que cada opção está a fazer agora é o rodapé
            do grupo, com as frases de sempre (lib/efeitoDasDefinicoes.ts). */}
        <Grupo titulo="Playback" rodape={efeitos.smart}>
          <Linha icone="sparkles" rotulo="Smart shuffle" valor={valorDe('smart')} chevron aoTocar={abrirMenu('smart')} />
        </Grupo>
        {/* Desligado de origem. A passagem só entra em mudanças automáticas
            de faixa: num salto manual faria o botão parecer lento. */}
        <Grupo rodape={efeitos.crossfade}>
          <Linha icone="swap-horizontal" rotulo="Crossfade" valor={valorDe('crossfade')} chevron aoTocar={abrirMenu('crossfade')} />
        </Grupo>
        <Grupo rodape={efeitos.velocidade}>
          <LinhaAlta icone="speedometer-outline" rotulo="Playback speed">
            <BarraVelocidade valor={padraoRate} aoMudar={(v) => setPlaybackRate(v, true)} />
          </LinhaAlta>
        </Grupo>
        <Grupo rodape={[efeitos.temporizador, efeitos.radio]}>
          <Linha
            icone="moon"
            rotulo="Sleep timer"
            valor={sleepTimerTimeLeft > 0 ? formatTimeLeft(sleepTimerTimeLeft) : 'Off'}
            chevron
            aoTocar={abrirMenu('temporizador')}
          />
          <LinhaInterruptor icone="radio-outline" rotulo="Autoplay similar music" valor={autoplayRadio} aoMudar={toggleAutoplayRadio} />
        </Grupo>

        <Grupo titulo="Sound" rodape={efeitos.qualidade}>
          <Linha icone="pulse" rotulo="Audio quality" valor={valorDe('qualidade')} chevron aoTocar={abrirMenu('qualidade')} />
        </Grupo>
        <Grupo rodape={efeitos.normalizacao}>
          <LinhaInterruptor icone="volume-medium" rotulo="Even out volume" valor={volumeNormalization} aoMudar={toggleVolumeNormalization} />
        </Grupo>
        {/* O equalizador base: vale para as faixas que não tenham o seu, e não
            mexe na que está a tocar. Os presets: quais aparecem, os teus, e
            o do carro. */}
        <Grupo rodape={[efeitos.equalizador, resumoDosPresets(memoriaDosPresets)]}>
          <Linha icone="options" rotulo="Equaliser" valor={valorDoEq} chevron aoTocar={() => setEqAberto(true)} />
          <Linha icone="list" rotulo="Presets" valor={String(presetsNaFila.length)} chevron aoTocar={() => setPresetsOpen(true)} />
        </Grupo>

        <Grupo titulo="Appearance" rodape="Cover follows the artwork of whatever is playing.">
          <Linha
            icone="color-palette"
            rotulo="Accent"
            antesDoValor={
              <LinearGradient colors={amostraDoDestaque.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.amostra} />
            }
            valor={valorDe('destaque')}
            chevron
            aoTocar={abrirMenu('destaque')}
          />
          {Platform.OS === 'ios' && (
            <Linha icone="cube-outline" rotulo="Artwork style" valor={valorDe('capa')} chevron aoTocar={abrirMenu('capa')} />
          )}
        </Grupo>
        <Grupo>
          <LinhaInterruptor icone="time-outline" rotulo="Show song length in lists" valor={showDuration} aoMudar={toggleShowDuration} />
          <LinhaInterruptor icone="play-back" rotulo="Show 15-second rewind" valor={showRewindButton} aoMudar={toggleShowRewind} />
        </Grupo>

        <Grupo titulo="General" rodape={efeitos.ecra}>
          <LinhaInterruptor icone="notifications" rotulo="Message banners" valor={notificationsOn} aoMudar={toggleNotifications} />
          <LinhaInterruptor icone="phone-portrait-outline" rotulo="Haptic feedback" valor={hapticsOn} aoMudar={toggleHaptics} />
          <LinhaInterruptor icone="sunny" rotulo="Keep screen awake" valor={keepAwakeOn} aoMudar={toggleKeepAwake} />
          <LinhaInterruptor
            icone="car"
            rotulo="Keep screen on in car mode"
            valor={carroMantemEcra}
            aoMudar={(v) => { setCarroMantemEcraState(v); void setCarroMantemEcra(v).catch(() => {}); }}
          />
        </Grupo>

        <Grupo
          titulo="Library"
          rodape={offline
            ? 'Connect to the internet to change your recommendations.'
            : spotifyDisponivel() ? efeitos.spotify : 'Songs you hid and artists you want to hear less often.'}
        >
          <Linha icone="heart" rotulo="Manage recommendations" chevron desativada={offline} aoTocar={() => setRecommendationsOpen(true)} />
          {spotifyDisponivel() && (
            <Linha
              icone="musical-notes"
              rotulo={aLerSpotify ? 'Reading Spotify…' : gostoDoSpotify ? 'Update from Spotify' : 'Import from Spotify'}
              acao
              aCarregar={aLerSpotify}
              desativada={offline || aLerSpotify}
              aoTocar={() => void importarDoSpotify()}
            />
          )}
        </Grupo>
        <Grupo rodape={resumoDoCatalogo ?? 'Fix artist names, titles and covers with a music catalogue, or find duplicates and songs that no longer play.'}>
          <Linha
            icone="pricetag"
            rotulo={aIdentificar ? 'Stop identifying' : 'Identify library'}
            acao
            valor={progresso ? `${progresso.feitas} of ${progresso.total}` : null}
            aCarregar={aIdentificar && !progresso}
            desativada={offline && !aIdentificar}
            aoTocar={aIdentificar ? () => { pararIdentificacao.current = true; } : () => void identificarBiblioteca()}
          />
          <Linha icone="checkmark-done" rotulo="Library check" chevron aoTocar={() => navigation.navigate('LibraryCheck')} />
        </Grupo>

        {/* O "Clear cache" apaga TODO o áudio guardado, os downloads feitos de
            propósito incluídos -- e o rodapé di-lo antes de se carregar. */}
        <Grupo titulo="Storage" rodape={[efeitos.cache, 'Songs are kept on the phone so they play with the screen locked.']}>
          <Linha icone="arrow-down-circle" rotulo="Downloads" valor={formatCacheSize(cacheBytes)} chevron aoTocar={() => navigation.navigate('Downloads')} />
          <Linha icone="trash" rotulo="Clear cache" acao aoTocar={() => void doClearCache()} />
        </Grupo>

        <Grupo titulo="Account" rodape={offline ? 'Offline · connect to manage your account.' : null}>
          <Linha icone="mail" rotulo="Email" valor={session?.user?.email ?? '—'} />
          <Linha icone="key" rotulo="Reset password" acao aCarregar={resettingPw} desativada={offline || resettingPw} aoTocar={() => void doResetPassword()} />
          <Linha icone="log-out-outline" rotulo="Sign out" acao aoTocar={() => setSignOutOpen(true)} />
        </Grupo>
        <Grupo>
          <Linha icone="heart-dislike" rotulo="Clear Liked Songs" perigo desativada={offline} aoTocar={() => setClearLibraryOpen(true)} />
          <Linha icone="trash" rotulo="Delete account" perigo desativada={offline} aoTocar={() => setDeleteAccountOpen(true)} />
        </Grupo>

        {/* O relatório vai pela folha de partilha: quem precisa dele é quem o
            vai mandar a alguém. */}
        <Grupo titulo="About" rodape="If a song won't play, send this so it can be fixed.">
          <Linha icone="information-circle" rotulo="Version" valor={APP_VERSION} />
          <Linha
            icone="paper-plane"
            rotulo="Send playback report"
            acao
            aoTocar={() => { void partilharRelatorioDeReproducao().catch(() => {}); }}
          />
        </Grupo>
      </Animated.ScrollView>

      <ConfirmSheet
        visible={signOutOpen}
        title="Sign out"
        message={session?.user?.email ?? undefined}
        confirmLabel="Sign out"
        destructive
        onClose={() => setSignOutOpen(false)}
        onConfirm={() => {
          setSignOutOpen(false);
          // O signOut fecha o leitor (state/auth.ts).
          signOut();
        }}
      />

      <ConfirmSheet
        visible={clearLibraryOpen}
        title="Clear Liked Songs"
        message="All your Liked Songs will be permanently removed. Playlists are not affected. This cannot be undone."
        confirmLabel="Clear Liked Songs"
        destructive
        loading={clearingLibrary}
        onClose={() => setClearLibraryOpen(false)}
        onConfirm={doClearLibrary}
      />

      <ConfirmSheet
        visible={deleteAccountOpen}
        title="Delete Account"
        message="Your account and all your profile data will be permanently deleted. This cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deletingAccount}
        onClose={() => setDeleteAccountOpen(false)}
        onConfirm={doDeleteAccount}
      />
    </Screen>
  );
}

/**
 * O equalizador padrão numa folha (4/10): vale para as faixas que não têm o
 * seu, e não mexe na que está a tocar -- por isso escreve com `padrao`.
 */
function EqualizadorPadrao({ visivel, aoFechar, ganhos, presets, efeito }: {
  visivel: boolean;
  aoFechar: () => void;
  ganhos: number[];
  presets: ReturnType<typeof presetsVisiveis>;
  efeito: string | null;
}) {
  const setEqGanhos = usePlayer((s) => s.setEqGanhos);
  return (
    <BottomSheet visible={visivel} onClose={aoFechar}>
      <View style={{ gap: spacing.lg, paddingBottom: spacing.xs }}>
        <View style={styles.cabecalhoDoEq}>
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={type.title}>Equaliser</Text>
            <Text style={[type.caption, { marginTop: 2 }]}>For every song that has no EQ of its own</Text>
          </View>
          <ReporEqualizador desativado={ePlano(ganhos)} aoRepor={() => setEqGanhos(PLANO.slice(), true)} />
        </View>
        <BottomSheetGestureGuard>
          <Equalizador ganhos={ganhos} aoMudar={(novo) => setEqGanhos(novo, true)} presets={presets} moldura sangria={spacing.lg} />
        </BottomSheetGestureGuard>
        {efeito ? <Text style={type.caption}>{efeito}</Text> : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  amostra: { width: 16, height: 16, borderRadius: 8 },
  cabecalhoDoEq: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
});

function formatTimeLeft(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
