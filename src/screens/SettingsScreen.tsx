import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearLibrary } from '../api/library';
import { clearPoTokenMemo, pingPoTokenServer } from '../api/potProvider';
import { clearStreamMemo } from '../api/ytstream';
import { BUILD_ID } from '../lib/buildInfo';
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
  setHapticsEnabled,
  setHapticsEnabledCache,
  setPoTokenServerUrl,
  setRepeatQueue as persistRepeatQueue,
  setShowRewindButton as persistShowRewindButton,
  setShowTrackDuration as persistShowTrackDuration,
  setShowTrackDurationCache,
  type AudioQuality,
} from '../lib/prefs';
import { clearDownloadedAudioCache } from '../lib/youtubeCache';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../state/auth';
import { usePlayer } from '../state/player';
import { colors, radii, spacing, type } from '../theme';

const APP_VERSION = '1.0.0';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
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

  const repeatQueue = usePlayer((s) => s.repeatQueue);
  const setRepeatQueue = usePlayer((s) => s.setRepeatQueue);
  const showRewindButton = usePlayer((s) => s.showRewindButton);
  const setShowRewindButton = usePlayer((s) => s.setShowRewindButton);

  const [audioQuality, setAudioQualityState] = useState<AudioQuality>('high');
  const [showDuration, setShowDuration] = useState(true);
  const [hapticsOn, setHapticsOn] = useState(true);

  const [signOutOpen, setSignOutOpen] = useState(false);
  const [clearLibraryOpen, setClearLibraryOpen] = useState(false);
  const [clearingLibrary, setClearingLibrary] = useState(false);

  const [potServerUrl, setPotServerUrlState] = useState('');
  const [testingPotServer, setTestingPotServer] = useState(false);

  useEffect(() => {
    getAudioQuality().then(setAudioQualityState);
    getShowTrackDuration().then(setShowDuration);
    getHapticsEnabled().then(setHapticsOn);
    getPoTokenServerUrl().then(setPotServerUrlState);
  }, []);

  const changeAudioQuality = async (i: number) => {
    const v: AudioQuality = i === 1 ? 'saver' : 'high';
    setAudioQualityState(v);
    hapticSelection();
    await setAudioQuality(v);
  };

  const toggleRepeatQueue = async (v: boolean) => {
    setRepeatQueue(v);
    hapticSelection();
    await persistRepeatQueue(v);
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
    // Ativa a háptica ANTES de desligar, para o próprio toggle ainda vibrar.
    if (v) setHapticsEnabledCache(true);
    hapticSelection();
    setHapticsOn(v);
    setHapticsEnabledCache(v);
    await setHapticsEnabled(v);
  };

  const doClearCache = () => {
    clearDownloadedAudioCache();
    clearStreamMemo();
    clearPoTokenMemo();
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
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not clear the library.');
    } finally {
      setClearingLibrary(false);
    }
  };

  return (
    <Screen title="Settings" onBack={() => navigation.goBack()}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingBottom: insets.bottom + 48,
          gap: spacing.xl,
        }}
      >
        <Section title="Account">
          <Row label="Email" value={session?.user?.email ?? '—'} />
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            <PillButton
              label="Reset password"
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
          </View>
        </Section>

        <Section title="Playback">
          <Label>Audio quality</Label>
          <SegmentedControl
            options={['High', 'Data saver']}
            value={audioQuality === 'saver' ? 1 : 0}
            onChange={changeAudioQuality}
          />

          <ToggleRow
            label="Repeat queue when it ends"
            value={repeatQueue}
            onChange={toggleRepeatQueue}
            style={{ marginTop: spacing.lg }}
          />
        </Section>

        <Section title="Behavior">
          <ToggleRow
            label="Show track duration in lists"
            value={showDuration}
            onChange={toggleShowDuration}
          />
          <ToggleRow
            label="Show rewind 15s button"
            value={showRewindButton}
            onChange={toggleShowRewind}
            style={{ marginTop: spacing.md }}
          />
          <ToggleRow
            label="Haptic feedback"
            value={hapticsOn}
            onChange={toggleHaptics}
            style={{ marginTop: spacing.md }}
          />
        </Section>

        <Section title="Data">
          <Text style={[type.caption, { lineHeight: 18, marginBottom: spacing.sm }]}>
            YouTube audio is downloaded locally so it can keep playing with the
            screen locked. Clearing the cache frees that space; songs
            re-download next time you play them.
          </Text>
          <PillButton
            label="Clear YouTube cache"
            variant="ghost"
            small
            onPress={doClearCache}
            style={{ alignSelf: 'flex-start' }}
          />
          <PillButton
            label="Clear library"
            variant="danger"
            small
            onPress={() => setClearLibraryOpen(true)}
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
            disabled={!potServerUrl.trim()}
            onPress={testPotServer}
            style={{ alignSelf: 'flex-start', marginTop: spacing.sm }}
          />
        </Section>

        <Section title="About">
          <Row label="Version" value={APP_VERSION} />
          <Row label="Build" value={BUILD_ID} />
        </Section>
      </ScrollView>

      <ConfirmSheet
        visible={signOutOpen}
        title="Sign out"
        message={session?.user?.email ?? undefined}
        confirmLabel="Sign out"
        destructive
        onClose={() => setSignOutOpen(false)}
        onConfirm={() => {
          setSignOutOpen(false);
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
        trackColor={{ false: colors.surfacePressed, true: colors.accent }}
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
});
