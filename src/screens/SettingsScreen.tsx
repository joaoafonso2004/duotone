import { loadCapaIOS, useCapaIOS } from '../state/capaIOS';
import { getCarroMantemEcra, setCarroMantemEcra } from '../lib/prefs';
import { useNotifications } from '../state/notifications';
import { RecommendationPreferences } from '../components/RecommendationPreferences';
import { useOfflineMode } from '../hooks/useOfflineMode';
import { removeOwnProfileMedia } from '../lib/profileMedia';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, {useEffect, useState, useRef } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View, Share, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, STEEL } from '../state/theme';
import { clearLibrary } from '../api/library';
import { clearPoTokenMemo, pingPoTokenServer } from '../api/potProvider';
import { clearStreamMemo, clearVisitorData, streamEmMemoria } from '../api/ytstream';
import {
  efeitoDaNormalizacao, efeitoDaQualidade, efeitoDeLimparACache, efeitoDeManterOEcra,
  efeitoDoCrossfade, efeitoDoPadrao, efeitoDoPoToken, efeitoDoRadio, efeitoDoTemporizador,
} from '../lib/efeitoDasDefinicoes';
import { getLoudnessDb } from '../lib/loudnessCache';
import { idsFixados } from '../lib/downloadsFixados';
import { listPlaylists, getPlaylistTracks } from '../api/playlists';
import { supabase } from '../lib/supabase';
import { APP_VERSION, BUILD_ID } from '../lib/buildInfo';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { Input } from '../components/Input';
import { PillButton } from '../components/PillButton';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';
import { hapticNotification, hapticSelection } from '../lib/haptics';
import {
  getAudioQuality,
  getHapticsEnabled,
  getPoTokenServerUrl,
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
  setPoTokenServerUrl,
  setShowRewindButton as persistShowRewindButton,
  setShowTrackDuration as persistShowTrackDuration,
  setShowTrackDurationCache,
  type AudioQuality,
  getCrossfadeSegundos,
  setCrossfadeSegundos,
} from '../lib/prefs';
import { clearDownloadedAudioCache, formatCacheSize, getAudioCacheBytes, isAudioCached } from '../lib/youtubeCache';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../state/auth';
import { BarraVelocidade } from '../components/BarraVelocidade';
import { Equalizador, ReporEqualizador } from '../components/Equalizador';
import { chaveDaFaixa, PLANO } from '../lib/equalizer';
import { usePlayer } from '../state/player';
import { getLibrary } from '../api/library';
import { DURACOES_DO_CROSSFADE, type DuracaoDoCrossfade } from '../lib/crossfade';
import { resumoDoVarrimento, varrerCatalogo } from '../state/catalogoDeFaixas';
import { historico, limparHistorico, resumo, rotulo as rotuloDaFalha, type TipoFalha } from '../lib/playbackDiagnostics';
import { partilharRelatorioDeReproducao } from '../lib/relatorioDeReproducao';
import { colors, radii, spacing, type } from '../theme';
import { widgetDisponivel } from '../../modules/duotone-widget';


type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const offline=useOfflineMode();
  const coverMode = useCapaIOS(s => s.mode);
  const [carroMantemEcra, setCarroMantemEcraState] = useState(true);
  useEffect(() => {
    let vivo = true;
    void getCarroMantemEcra().then((v) => { if (vivo) setCarroMantemEcraState(v); }).catch(() => {});
    return () => { vivo = false; };
  }, []);
  useEffect(() => { if (Platform.OS === 'ios') void loadCapaIOS(); }, []);
  const [recommendationsOpen,setRecommendationsOpen]=useState(false);
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
  const rateDaFaixa = usePlayer((s) => s.playbackRate);
  const ganhosDaFaixa = usePlayer((s) => s.eqGanhos);
  const ajusteDaFaixa = usePlayer((s) => (s.current ? s.ajustesPorFaixa[chaveDaFaixa(s.current)] : undefined));
  const radioActivo = usePlayer((s) => s.radioActive);
  const [ultimoTestePot, setUltimoTestePot] = useState<{ ok: boolean; ms: number | null } | null>(null);
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
  const [widgetPronto, setWidgetPronto] = useState<boolean | null>(null);

  const [signOutOpen, setSignOutOpen] = useState(false);
  const [clearLibraryOpen, setClearLibraryOpen] = useState(false);
  const [clearingLibrary, setClearingLibrary] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [exportingPlaylists, setExportingPlaylists] = useState(false);
  // O anel de falhas vive fora do React; isto só serve para redesenhar depois
  // de o limpar.
  const [, setLimpezasDoRelatorio] = useState(0);
  const falhasDaSessao = historico();

  const [potServerUrl, setPotServerUrlState] = useState('');
  const [testingPotServer, setTestingPotServer] = useState(false);

  useEffect(() => {
    getAudioQuality().then(setAudioQualityState);
    getCrossfadeSegundos().then(setCrossfadeState);
    getShowTrackDuration().then(setShowDuration);
    getHapticsEnabled().then(setHapticsOn);
    getPoTokenServerUrl().then(setPotServerUrlState);
    if (Platform.OS === 'ios') setWidgetPronto(widgetDisponivel());

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

  const doClearCache = () => {
    clearDownloadedAudioCache();
    clearStreamMemo();
    clearPoTokenMemo();
    // O visitorData sobrevivia ao "Clear cache" (24h no AsyncStorage). Se a
    // Google o marcasse, limpar a cache nao resolvia nada ate ele expirar.
    clearVisitorData();
    setCacheBytes(getAudioCacheBytes());
    hapticNotification();
    Alert.alert('Cache cleared', 'Downloaded YouTube audio and resolved streams were cleared.');
  };

  const savePotServerUrl = async (v: string) => {
    setPotServerUrlState(v);
    // Outro endereço: o último teste já não diz nada sobre ele.
    setUltimoTestePot(null);
    await setPoTokenServerUrl(v);
  };

  const testPotServer = async () => {
    setTestingPotServer(true);
    try {
      const inicio = Date.now();
      const ok = await pingPoTokenServer(potServerUrl);
      // Fica escrito por baixo do botão, e não só no alerta que se fecha.
      setUltimoTestePot({ ok, ms: ok ? Date.now() - inicio : null });
      hapticNotification();
      Alert.alert(
        ok ? 'Connected' : 'Not reachable',
        ok
          ? 'The PO Token server responded.'
          : 'Could not reach the PO Token server at that URL. Check the address and that your phone is on the same network.'
      );
    } finally {
      setTestingPotServer(false);
    }
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

  const doExportPlaylists = async () => {
    setExportingPlaylists(true);
    try {
      const playlists = await listPlaylists();
      const exportData = [];
      for (const pl of playlists) {
        const tracks = await getPlaylistTracks(pl.id);
        exportData.push({
          name: pl.name,
          createdAt: pl.createdAt,
          tracks: tracks.map((t) => ({
            source: t.source,
            sourceId: t.sourceId,
            title: t.title,
            artist: t.artist,
            album: t.album,
            artworkUrl: t.artworkUrl,
            durationSeconds: t.durationSeconds,
          })),
        });
      }
      const json = JSON.stringify(exportData, null, 2);
      hapticNotification();
      await Share.share({
        title: 'Duotone Playlists Export',
        message: json,
      });
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not export playlists.');
    } finally {
      setExportingPlaylists(false);
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
    cache: efeitoDeLimparACache({ bytes: cacheBytes, downloads: idsFixados().filter(isAudioCached).length }),
    poToken: efeitoDoPoToken({ url: potServerUrl, ultimoTeste: ultimoTestePot }),
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
          <Section title="Recommendations">
            <Text style={type.caption}>{offline?'Connect to the internet to change your recommendation preferences.':'Review songs you have hidden and artists you want to hear less often.'}</Text>
            <PillButton label="Manage preferences" disabled={offline} onPress={()=>setRecommendationsOpen(true)}/>
          </Section>
          <Section title="Theme">
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
            <Text style={type.caption}>
              Steel is the app's own colour. Cover follows the artwork of whatever is playing,
              and falls back to Steel when a cover has no colour to give.
            </Text>
          </Section>

          <Section title="Playback">
            <Label>Audio quality</Label>
            <SegmentedControl
              options={['High', 'Data saver']}
              value={audioQuality === 'saver' ? 1 : 0}
              onChange={changeAudioQuality}
            />
            <Efeito texto={efeitos.qualidade} />

            {/* Desligado de origem. A passagem só entra em mudanças
                automáticas de faixa: num salto manual faria o botão parecer
                lento. E fica de fora quando a duração da faixa não é de
                confiança, porque sem ela não se sabe onde é o fim. */}
            <Label style={{ marginTop: spacing.md }}>Crossfade</Label>
            <SegmentedControl
              options={['Off', '3s', '6s', '9s']}
              value={DURACOES_DO_CROSSFADE.indexOf(crossfade)}
              onChange={changeCrossfade}
            />
            <Efeito texto={efeitos.crossfade} />

            {/* Os tres presets viraram uma velocidade continua (0,5 a 2), e
                agora numa barra em vez de botoes: de ponta a ponta eram trinta
                toques. O valor vai escrito ao lado da propria barra. */}
            <Label style={{ marginTop: spacing.md }}>Playback speed</Label>
            <BarraVelocidade
              valor={padraoRate}
              aoMudar={(v) => setPlaybackRate(v, true)}
            />
            <Efeito texto={efeitos.velocidade} />

            {/* O equalizador base. Mesmo sitio e mesmo padrao da velocidade
                logo acima -- as duas sao o que vale para as faixas que nao
                tenham o seu, e nenhuma delas mexe na que esta a tocar. A
                frase fixa que dizia isto passou a ser a linha de efeito, que
                diz o mesmo sobre a musica que esta mesmo a tocar. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md }}>
              <Label>Equaliser</Label>
              <ReporEqualizador aoRepor={() => setEqGanhos(PLANO.slice(), true)} />
            </View>
            <Equalizador
              ganhos={padraoGanhos}
              aoMudar={(novo) => setEqGanhos(novo, true)}
            />
            <Efeito texto={efeitos.equalizador} />

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
          </Section>

          <Section title="Behavior">
            <ToggleRow
              label="Show track duration in lists"
              value={showDuration}
              onChange={toggleShowDuration}
            />
            <ToggleRow
              label="Normalize volume between tracks"
              value={volumeNormalization}
              onChange={toggleVolumeNormalization}
              style={{ marginTop: spacing.md }}
            />
            <Efeito texto={efeitos.normalizacao} />
            <ToggleRow
              label="Autoplay radio at end of queue"
              value={autoplayRadio}
              onChange={toggleAutoplayRadio}
              style={{ marginTop: spacing.md }}
            />
            <Efeito texto={efeitos.radio} />
            <ToggleRow
              label="Show rewind 15s button"
              value={showRewindButton}
              onChange={toggleShowRewind}
              style={{ marginTop: spacing.md }}
            />
            <ToggleRow
              label="In-app notifications"
              value={notificationsOn}
              onChange={toggleNotifications}
              style={{ marginTop: spacing.md }}
            />
            <Text style={{color:colors.textSecondary,fontSize:12,marginTop:8}}>Show banners at the top while Duotone is open. No notifications outside the app.</Text>
            <ToggleRow
              label="Haptic feedback"
              value={hapticsOn}
              onChange={toggleHaptics}
              style={{ marginTop: spacing.md }}
            />
            <ToggleRow
              label="Keep screen awake"
              value={keepAwakeOn}
              onChange={toggleKeepAwake}
              style={{ marginTop: spacing.md }}
            />
            <Efeito texto={efeitos.ecra} />
          </Section>

          <Section title="Car mode">
            <ToggleRow label="Keep the screen on" value={carroMantemEcra}
              onChange={(v) => { setCarroMantemEcraState(v); void setCarroMantemEcra(v).catch(() => {}); }} />
            <Text style={[type.caption, { marginTop: spacing.sm }]}>
              Car mode lives in the now playing menu. With this off, the screen dims as
              usual — better for battery, but you have to wake the phone to skip a song.
              This is separate from “Keep screen on” above.
            </Text>
          </Section>

          {Platform.OS === 'ios' && <Section title="Artwork effect">
            <SegmentedControl options={['Reactive', 'Static', 'Off']} value={['reactive', 'static', 'off'].indexOf(coverMode)}
              onChange={index => useCapaIOS.getState().setMode((['reactive', 'static', 'off'] as const)[index])} />
            <Text style={[type.caption, { marginTop: spacing.sm }]}>Tap the artwork to switch between Reactive and Static. This preference only affects iPhone.</Text>
          </Section>}

          <Section title="Data">
            {offline&&<Text style={type.caption}>Offline · library changes and playlist exports need internet.</Text>}
            <Text style={[type.caption, { lineHeight: 18, marginBottom: spacing.sm }]}>
              YouTube audio is downloaded locally so it can keep playing with the
              screen locked. Clearing the cache frees that space; songs
              re-download next time you play them.
            </Text>
            <PillButton
              label={`Downloads (${formatCacheSize(cacheBytes)})`}
              variant="ghost"
              small
              onPress={() => navigation.navigate('Downloads')}
              style={{ alignSelf: 'flex-start', marginBottom: spacing.sm }}
            />
            <PillButton
              label="Clear YouTube cache"
              variant="ghost"
              small
              onPress={doClearCache}
              style={{ alignSelf: 'flex-start' }}
            />
            {/* Apaga TODO o áudio guardado, os downloads feitos de propósito
                incluídos -- e isso tem de se ler antes de carregar. */}
            <Efeito texto={efeitos.cache} />
            {/* Identificar a biblioteca: o artista e o título vêm adivinhados
                do título do vídeo do YouTube, e um catálogo a sério corrige-os
                — incluindo a capa quadrada, sem as barras pretas. */}
            <Text style={[type.caption, { lineHeight: 18, marginTop: spacing.lg, marginBottom: spacing.sm }]}>
              {progresso
                ? `Identifying ${progresso.feitas} of ${progresso.total}…`
                : resumoDoCatalogo
                  ?? 'Match your library against a music catalogue to fix artist names, titles and cover art.'}
            </Text>
            <PillButton
              label={aIdentificar ? 'Stop' : 'Identify library'}
              disabled={offline}
              variant="ghost"
              small
              loading={aIdentificar && !progresso}
              onPress={aIdentificar ? () => { pararIdentificacao.current = true; } : identificarBiblioteca}
              style={{ alignSelf: 'flex-start' }}
            />
            {/* O Library check: duplicados, vídeos que já não tocam e capas
                partidas. Só corre quando se abre e se carrega. */}
            <PillButton
              label="Library check"
              variant="ghost"
              small
              onPress={() => navigation.navigate('LibraryCheck')}
              style={{ alignSelf: 'flex-start', marginTop: spacing.sm }}
            />
            <PillButton
              label="Clear library"
              disabled={offline}
              variant="danger"
              small
              onPress={() => setClearLibraryOpen(true)}
              style={{ alignSelf: 'flex-start', marginTop: spacing.sm }}
            />
            <PillButton
              label="Export playlists (JSON)"
              disabled={offline}
              variant="ghost"
              small
              loading={exportingPlaylists}
              onPress={doExportPlaylists}
              style={{ alignSelf: 'flex-start', marginTop: spacing.sm }}
            />
          </Section>

          {/* O relatório que o PC já exportava. No telemóvel vai pela folha de
              partilha: quem precisa dele é quem o vai mandar a alguém. */}
          <Section title="Playback diagnostics">
            <Text style={[type.caption, { lineHeight: 18, marginBottom: spacing.sm }]}>
              {falhasDaSessao.length
                ? `${falhasDaSessao.length} ${falhasDaSessao.length === 1 ? 'failure' : 'failures'} this session: ${
                  Object.entries(resumo(falhasDaSessao)).sort((a, b) => b[1] - a[1])
                    .map(([t, n]) => `${n}× ${rotuloDaFalha(t as TipoFalha)}`).join(', ')}.`
                : 'No playback failures this session.'}
              {' '}The report has the technical detail. Send it when music stops playing.
            </Text>
            <PillButton
              label="Share playback report"
              variant="ghost"
              small
              onPress={() => { void partilharRelatorioDeReproducao().catch(() => {}); }}
              style={{ alignSelf: 'flex-start' }}
            />
            {falhasDaSessao.length > 0 && (
              <PillButton
                label="Clear recorded failures"
                variant="ghost"
                small
                onPress={() => { limparHistorico(); hapticSelection(); setLimpezasDoRelatorio((n) => n + 1); }}
                style={{ alignSelf: 'flex-start', marginTop: spacing.sm }}
              />
            )}
          </Section>

          {/* O texto dizia que sem PO Token as faixas paravam aos 20-30 s. Deixou
              de ser verdade com o cliente VISIONOS (ago 2026): o servidor é só
              uma rede de segurança, a seguir ao BotGuard do próprio aparelho, e
              o token fica preso ao IP de quem o gerou -- em dados móveis o do
              servidor não serve. Ver `api/potProvider.ts`. */}
          <Section title="Advanced">
            <Text style={[type.caption, { lineHeight: 18, marginBottom: spacing.sm }]}>
              Playback needs no setup. This is only a fallback for when YouTube
              blocks the usual way in: the address of a PO Token server
              (bgutil-ytdlp-pot-provider). Its tokens only work on the same
              internet connection as the server, so it helps at home, not on
              mobile data.
            </Text>
            <Input
              placeholder="http://192.168.1.10:4416"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              value={potServerUrl}
              onChangeText={savePotServerUrl}
              onClear={() => savePotServerUrl('')}
            />
            <PillButton
              label="Test connection"
              variant="ghost"
              small
              loading={testingPotServer}
              disabled={offline||!potServerUrl.trim()}
              onPress={testPotServer}
              style={{ alignSelf: 'flex-start', marginTop: spacing.sm }}
            />
            <Efeito texto={efeitos.poToken} />
          </Section>

          <Section title="About">
            <Row label="Version" value={APP_VERSION} />
            <Row label="Build" value={BUILD_ID} />
            {Platform.OS === 'ios' && (
              <Row
                label="Home Screen widget"
                value={widgetPronto === null ? 'Checking…' : widgetPronto ? 'Ready' : 'App Group unavailable'}
              />
            )}
          </Section>

          <Section title="Account">
            {offline&&<Text style={type.caption}>Offline · connect to manage your account.</Text>}
            <Row label="Email" value={session?.user?.email ?? '—'} />
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' }}>
              <PillButton
                label="Reset password"
              disabled={offline}
                variant="ghost"
                small
                loading={resettingPw}
                onPress={doResetPassword}
                style={{ alignSelf: 'flex-start' }}
              />
              <PillButton
                label="Sign out"
                variant="danger"
                small
                onPress={() => setSignOutOpen(true)}
                style={{ alignSelf: 'flex-start' }}
              />
              <PillButton
                label="Delete account"
              disabled={offline}
                variant="danger"
                small
                onPress={() => setDeleteAccountOpen(true)}
                style={{ alignSelf: 'flex-start' }}
              />
            </View>
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
        title="Clear library"
        message="All saved songs will be permanently removed from your library. Playlists are not affected. This cannot be undone."
        confirmLabel="Clear library"
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
