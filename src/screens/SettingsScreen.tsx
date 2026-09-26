import { loadCapaIOS, useCapaIOS } from '../state/capaIOS';
import { getCarroMantemEcra, setCarroMantemEcra } from '../lib/prefs';
import { useNotifications } from '../state/notifications';
import { RecommendationPreferences } from '../components/RecommendationPreferences';
import { useOfflineMode } from '../hooks/useOfflineMode';
import { removeOwnProfileMedia } from '../lib/profileMedia';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, {useEffect, useState, useRef } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, STEEL } from '../state/theme';
import { clearLibrary } from '../api/library';
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
import { PillButton } from '../components/PillButton';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';
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
import { chaveDaFaixa, PLANO } from '../lib/equalizer';
import { usePlayer } from '../state/player';
import { getLibrary } from '../api/library';
import { DURACOES_DO_CROSSFADE, type DuracaoDoCrossfade } from '../lib/crossfade';
import { resumoDoVarrimento, varrerCatalogo } from '../state/catalogoDeFaixas';
import { partilharRelatorioDeReproducao } from '../lib/relatorioDeReproducao';
import { colors, radii, spacing, type } from '../theme';


type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const offline=useOfflineMode();
  const coverStyle = useCapaIOS(s => s.style);
  const [carroMantemEcra, setCarroMantemEcraState] = useState(true);
  useEffect(() => {
    let vivo = true;
    void getCarroMantemEcra().then((v) => { if (vivo) setCarroMantemEcraState(v); }).catch(() => {});
    return () => { vivo = false; };
  }, []);
  useEffect(() => { if (Platform.OS === 'ios') void loadCapaIOS(); }, []);
  const [recommendationsOpen,setRecommendationsOpen]=useState(false);
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
      if (texto) Alert.alert('Spotify', texto);
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
      Alert.alert(
        err ? 'Error' : 'Check your email',
        err ?? 'We sent a password reset link to your email.'
      );
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
    hapticNotification();
    Alert.alert('Cache cleared', 'Downloaded YouTube audio and resolved streams were cleared.');
  };

  const doClearLibrary = async () => {
    setClearingLibrary(true);
    try {
      await clearLibrary();
      setClearLibraryOpen(false);
      hapticNotification();
      Alert.alert('Cleared', 'Your library has been cleared.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not clear the library.');
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
      Alert.alert('Error', e?.message ?? 'Could not delete your account.');
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

  return (
    <Screen title="Settings" onBack={() => navigation.goBack()}>
      <RecommendationPreferences visible={recommendationsOpen} onClose={()=>setRecommendationsOpen(false)}/>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingBottom: insets.bottom + 48,
            gap: spacing.xl,
          }}
        >
          {/* Arrumadas a 26/9 (pedido do João): o que se usa, e mais nada.
              Saíram o PO Token, o "Build", o estado do widget, a contagem de
              falhas e a exportação em JSON -- coisas de quem mantém a app. O
              relatório de reprodução fica, numa linha, no About: é o que se
              manda quando uma música não toca. */}
          <Section title="Playback">
            <Label>Smart shuffle</Label>
            <SegmentedControl
              options={['Few', 'Some', 'Lots']}
              value={['poucas', 'normal', 'muitas'].indexOf(intensidadeSmart)}
              onChange={(i: number) => {
                const v = (['poucas', 'normal', 'muitas'] as const)[i] ?? 'normal';
                usePlayer.setState({ intensidadeSmartShuffle: v });
                void setIntensidadeDoSmartShuffle(v);
              }}
            />
            <Efeito texto={efeitos.smart} />

            {/* Desligado de origem. A passagem só entra em mudanças
                automáticas de faixa: num salto manual faria o botão parecer
                lento. */}
            <Label style={{ marginTop: spacing.md }}>Crossfade</Label>
            <SegmentedControl
              options={['Off', '3s', '6s', '9s']}
              value={DURACOES_DO_CROSSFADE.indexOf(crossfade)}
              onChange={changeCrossfade}
            />
            <Efeito texto={efeitos.crossfade} />

            <Label style={{ marginTop: spacing.md }}>Playback speed</Label>
            <BarraVelocidade
              valor={padraoRate}
              aoMudar={(v) => setPlaybackRate(v, true)}
            />
            <Efeito texto={efeitos.velocidade} />

            <Label style={{ marginTop: spacing.md }}>
              Sleep timer
              {sleepTimerTimeLeft > 0 && ` — ${formatTimeLeft(sleepTimerTimeLeft)}`}
            </Label>
            <SegmentedControl
              options={['Off', '15m', '30m', '45m', '60m']}
              value={
                sleepTimerTimeLeft === 0
                  ? 0
                  : sleepTimerTimeLeft <= 15 * 60
                  ? 1
                  : sleepTimerTimeLeft <= 30 * 60
                  ? 2
                  : sleepTimerTimeLeft <= 45 * 60
                  ? 3
                  : 4
              }
              onChange={(i) => {
                hapticSelection();
                const mins = [0, 15, 30, 45, 60][i];
                setSleepTimer(mins);
              }}
            />
            <Efeito texto={efeitos.temporizador} />

            <ToggleRow
              label="Autoplay similar music"
              value={autoplayRadio}
              onChange={toggleAutoplayRadio}
              style={{ marginTop: spacing.md }}
            />
            <Efeito texto={efeitos.radio} />
          </Section>

          <Section title="Sound">
            <Label>Audio quality</Label>
            <SegmentedControl
              options={['High', 'Data saver']}
              value={audioQuality === 'saver' ? 1 : 0}
              onChange={changeAudioQuality}
            />
            <Efeito texto={efeitos.qualidade} />

            <ToggleRow
              label="Even out volume"
              value={volumeNormalization}
              onChange={toggleVolumeNormalization}
              style={{ marginTop: spacing.md }}
            />
            <Efeito texto={efeitos.normalizacao} />

            {/* O equalizador base: vale para as faixas que não tenham o seu,
                e não mexe na que está a tocar. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md }}>
              <Label>Equaliser</Label>
              <ReporEqualizador aoRepor={() => setEqGanhos(PLANO.slice(), true)} />
            </View>
            <Equalizador
              ganhos={padraoGanhos}
              aoMudar={(novo) => setEqGanhos(novo, true)}
            />
            <Efeito texto={efeitos.equalizador} />
          </Section>

          <Section title="Appearance">
            <Label>Accent</Label>
            <View style={styles.themesGrid}>
              {([
                ['steel', 'Steel', STEEL],
                ['cover', 'Cover', modo === 'cover' ? temaActual : STEEL],
              ] as const).map(([nome, rotulo, amostra]) => {
                const activo = modo === nome;
                return (
                  <Pressable
                    key={nome}
                    onPress={() => {
                      hapticSelection();
                      void setMode(nome);
                    }}
                    style={styles.themeCircleWrap}
                  >
                    <LinearGradient
                      colors={amostra.gradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.themeCircle, activo && { borderWidth: 2, borderColor: '#fff' }]}
                    >
                      {activo && <Ionicons name="checkmark" size={16} color={amostra.textColorOnGradient} />}
                    </LinearGradient>
                    <Text style={styles.themeLabel}>{rotulo}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={type.caption}>Cover follows the artwork of whatever is playing.</Text>

            {Platform.OS === 'ios' && <>
              <Label style={{ marginTop: spacing.md }}>Artwork style</Label>
              <SegmentedControl options={['Floating 3D', 'Simple']} value={coverStyle === 'floating' ? 0 : 1}
                onChange={index => useCapaIOS.getState().setStyle(index === 0 ? 'floating' : 'simple')} />
            </>}

            <ToggleRow
              label="Show song length in lists"
              value={showDuration}
              onChange={toggleShowDuration}
              style={{ marginTop: spacing.md }}
            />
            <ToggleRow
              label="Show 15-second rewind"
              value={showRewindButton}
              onChange={toggleShowRewind}
              style={{ marginTop: spacing.sm }}
            />
          </Section>

          <Section title="General">
            <ToggleRow
              label="Message banners"
              value={notificationsOn}
              onChange={toggleNotifications}
            />
            <ToggleRow
              label="Haptic feedback"
              value={hapticsOn}
              onChange={toggleHaptics}
              style={{ marginTop: spacing.sm }}
            />
            <ToggleRow
              label="Keep screen awake"
              value={keepAwakeOn}
              onChange={toggleKeepAwake}
              style={{ marginTop: spacing.sm }}
            />
            <Efeito texto={efeitos.ecra} />
            <ToggleRow label="Keep screen on in car mode" value={carroMantemEcra}
              onChange={(v) => { setCarroMantemEcraState(v); void setCarroMantemEcra(v).catch(() => {}); }}
              style={{ marginTop: spacing.sm }} />
          </Section>

          <Section title="Library">
            <Text style={type.caption}>{offline ? 'Connect to the internet to change your recommendations.' : 'Songs you hid and artists you want to hear less often.'}</Text>
            <View style={styles.botoes}>
              <PillButton label="Manage recommendations" variant="ghost" small disabled={offline}
                onPress={() => setRecommendationsOpen(true)} />
              {spotifyDisponivel() && (
                <PillButton
                  label={aLerSpotify ? 'Reading Spotify…' : gostoDoSpotify ? 'Update from Spotify' : 'Import from Spotify'}
                  variant="ghost"
                  small
                  loading={aLerSpotify}
                  disabled={offline || aLerSpotify}
                  onPress={() => void importarDoSpotify()}
                />
              )}
            </View>
            {spotifyDisponivel() && <Efeito texto={efeitos.spotify} />}
            <Text style={[type.caption, { marginTop: spacing.lg }]}>
              {progresso
                ? `Identifying ${progresso.feitas} of ${progresso.total}…`
                : resumoDoCatalogo
                  ?? 'Fix artist names, titles and covers with a music catalogue, or find duplicates and songs that no longer play.'}
            </Text>
            <View style={styles.botoes}>
              <PillButton
                label={aIdentificar ? 'Stop' : 'Identify library'}
                disabled={offline}
                variant="ghost"
                small
                loading={aIdentificar && !progresso}
                onPress={aIdentificar ? () => { pararIdentificacao.current = true; } : identificarBiblioteca}
              />
              <PillButton label="Library check" variant="ghost" small onPress={() => navigation.navigate('LibraryCheck')} />
            </View>
          </Section>

          <Section title="Storage">
            <Text style={type.caption}>
              Songs are kept on the phone so they play with the screen locked.
            </Text>
            <View style={styles.botoes}>
              <PillButton label={`Downloads (${formatCacheSize(cacheBytes)})`} variant="ghost" small
                onPress={() => navigation.navigate('Downloads')} />
              <PillButton label="Clear cache" variant="ghost" small onPress={doClearCache} />
            </View>
            {/* Apaga TODO o áudio guardado, os downloads feitos de propósito
                incluídos -- e isso tem de se ler antes de carregar. */}
            <Efeito texto={efeitos.cache} />
          </Section>

          <Section title="Account">
            {offline&&<Text style={type.caption}>Offline · connect to manage your account.</Text>}
            <Row label="Email" value={session?.user?.email ?? '—'} />
            <View style={styles.botoes}>
              <PillButton
                label="Reset password"
                disabled={offline}
                variant="ghost"
                small
                loading={resettingPw}
                onPress={doResetPassword}
              />
              <PillButton
                label="Sign out"
                variant="ghost"
                small
                onPress={() => setSignOutOpen(true)}
              />
            </View>
            <View style={styles.botoes}>
              <PillButton
                label="Clear Liked Songs"
                disabled={offline}
                variant="danger"
                small
                onPress={() => setClearLibraryOpen(true)}
              />
              <PillButton
                label="Delete account"
                disabled={offline}
                variant="danger"
                small
                onPress={() => setDeleteAccountOpen(true)}
              />
            </View>
          </Section>

          <Section title="About">
            <Row label="Version" value={APP_VERSION} />
            {/* O relatório vai pela folha de partilha: quem precisa dele é quem
                o vai mandar a alguém. */}
            <PillButton
              label="Send playback report"
              variant="ghost"
              small
              onPress={() => { void partilharRelatorioDeReproducao().catch(() => {}); }}
              style={{ alignSelf: 'flex-start', marginTop: spacing.sm }}
            />
            <Text style={[type.caption, { marginTop: spacing.xs }]}>If a song won't play, send this so it can be fixed.</Text>
          </Section>
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmSheet
        visible={signOutOpen}
        title="Sign out"
        message={session?.user?.email ?? undefined}
        confirmLabel="Sign out"
        destructive
        onClose={() => setSignOutOpen(false)}
        onConfirm={() => {
          setSignOutOpen(false);
          usePlayer.getState().close();
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={[type.micro, { marginBottom: spacing.sm }]}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={type.body}>{label}</Text>
      <Text style={[type.caption, { color: colors.textSecondary }]}>{value}</Text>
    </View>
  );
}

/**
 * O que a opção de cima está a fazer agora (lib/efeitoDasDefinicoes.ts). Mais
 * clara do que a legenda que explica a opção: esta é sobre o momento, aquela é
 * sobre a regra.
 */
function Efeito({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <View style={styles.efeito} accessibilityRole="text">
      <View style={styles.efeitoPonto} />
      <Text style={[type.caption, { color: colors.text, flex: 1 }]}>{texto}</Text>
    </View>
  );
}

function Label({ children, style }: { children: React.ReactNode; style?: object }) {
  return <Text style={[type.caption, { marginBottom: spacing.sm }, style]}>{children}</Text>;
}

function ToggleRow({
  label,
  value,
  onChange,
  style,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  style?: object;
}) {
  return (
    <View style={[styles.row, style]}>
      <Text style={type.body}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.surfacePressed, true: colors.text }}
        thumbColor="#fff"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  botoes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  efeito: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  efeitoPonto: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.text, opacity: 0.6 },
  themesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
    justifyContent: 'space-between',
  },
  themeCircleWrap: {
    alignItems: 'center',
    width: '22%',
    marginBottom: spacing.sm,
  },
  themeCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  themeLabel: {
    ...type.micro,
    fontSize: 10,
    marginTop: 6,
    textAlign: 'center',
    textTransform: 'none',
  },
});

function formatTimeLeft(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
