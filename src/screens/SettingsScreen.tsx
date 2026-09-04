import { RecommendationPreferences } from '../components/RecommendationPreferences';
import { useOfflineMode } from '../hooks/useOfflineMode';
import { removeOwnProfileMedia } from '../lib/profileMedia';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View, Share, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, STEEL } from '../state/theme';
import { clearLibrary } from '../api/library';
import { clearPoTokenMemo, pingPoTokenServer } from '../api/potProvider';
import { clearStreamMemo, clearVisitorData } from '../api/ytstream';
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
} from '../lib/prefs';
import { clearDownloadedAudioCache, formatCacheSize, getAudioCacheBytes } from '../lib/youtubeCache';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../state/auth';
import { BarraVelocidade } from '../components/BarraVelocidade';
import { usePlayer } from '../state/player';
import { colors, radii, spacing, type } from '../theme';


type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const offline=useOfflineMode();
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
  const setPlaybackRate = usePlayer((s) => s.setPlaybackRate);
  const sleepTimerTimeLeft = usePlayer((s) => s.sleepTimerTimeLeft);
  const setSleepTimer = usePlayer((s) => s.setSleepTimer);
  const modo = useTheme((s) => s.mode);
  const setMode = useTheme((s) => s.setMode);
  // O que a capa a tocar está a dar agora. Serve de amostra na própria
  // escolha: uma opção chamada "segue a capa" tem de mostrar qual é a capa.
  const temaActual = useTheme((s) => s.theme);
  const activeTheme = useTheme((s) => s.theme);

  const [audioQuality, setAudioQualityState] = useState<AudioQuality>('high');
  const [showDuration, setShowDuration] = useState(true);
  const [hapticsOn, setHapticsOn] = useState(false);
  const [keepAwakeOn, setKeepAwakeOn] = useState(false);
  const [notificationsOn, setNotificationsOn] = useState(true);
  const [cacheBytes, setCacheBytes] = useState(0);

  const [signOutOpen, setSignOutOpen] = useState(false);
  const [clearLibraryOpen, setClearLibraryOpen] = useState(false);
  const [clearingLibrary, setClearingLibrary] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [exportingPlaylists, setExportingPlaylists] = useState(false);

  const [potServerUrl, setPotServerUrlState] = useState('');
  const [testingPotServer, setTestingPotServer] = useState(false);

  useEffect(() => {
    getAudioQuality().then(setAudioQualityState);
    getShowTrackDuration().then(setShowDuration);
    getHapticsEnabled().then(setHapticsOn);
    getPoTokenServerUrl().then(setPotServerUrlState);

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
    await setPoTokenServerUrl(v);
  };

  const testPotServer = async () => {
    setTestingPotServer(true);
    try {
      const ok = await pingPoTokenServer(potServerUrl);
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

            {/* Os tres presets viraram uma velocidade continua (0,5 a 2), e
                agora numa barra em vez de botoes: de ponta a ponta eram trinta
                toques. O valor vai escrito ao lado da propria barra. */}
            <Label style={{ marginTop: spacing.md }}>Velocidade</Label>
            <BarraVelocidade
              valor={padraoRate}
              aoMudar={(v) => setPlaybackRate(v, true)}
            />

            <Label style={{ marginTop: spacing.md }}>
              Sleep Timer (Temporizador)
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
            <ToggleRow
              label="Autoplay radio at end of queue"
              value={autoplayRadio}
              onChange={toggleAutoplayRadio}
              style={{ marginTop: spacing.md }}
            />
            <ToggleRow
              label="Show rewind 15s button"
              value={showRewindButton}
              onChange={toggleShowRewind}
              style={{ marginTop: spacing.md }}
            />
            <ToggleRow
              label="Notifications"
              value={notificationsOn}
              onChange={toggleNotifications}
              style={{ marginTop: spacing.md }}
            />
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
          </Section>

          <Section title="Data">
            {offline&&<Text style={type.caption}>Offline · library changes and playlist exports need internet.</Text>}
            <Text style={[type.caption, { lineHeight: 18, marginBottom: spacing.sm }]}>
              YouTube audio is downloaded locally so it can keep playing with the
              screen locked. Clearing the cache frees that space; songs
              re-download next time you play them.
            </Text>
            <PillButton
              label={`Clear YouTube cache (${formatCacheSize(cacheBytes)})`}
              variant="ghost"
              small
              onPress={doClearCache}
              style={{ alignSelf: 'flex-start' }}
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

          <Section title="Advanced">
            <Text style={[type.caption, { lineHeight: 18, marginBottom: spacing.sm }]}>
              PO Tokens (needed for full YouTube tracks to play natively
              instead of stopping after ~20-30s) are generated on-device
              automatically — nothing to set up. This optional field only
              applies if you want to use an external bgutil-ytdlp-pot-provider
              server instead. See GUIA-POT-TOKEN.md.
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
          </Section>

          <Section title="About">
            <Row label="Version" value={APP_VERSION} />
            <Row label="Build" value={BUILD_ID} />
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
