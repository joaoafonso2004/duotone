import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { PillButton } from '../components/PillButton';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';
import {
  connectSpotify,
  disconnectSpotify,
  isSpotifyConnected,
} from '../lib/spotifyAuth';
import {
  getDefaultSearchTab,
  setDefaultSearchTab,
  type SearchSource,
} from '../lib/prefs';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../state/auth';
import { colors, radii, spacing, type } from '../theme';

const APP_VERSION = '1.0.0';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const session = useAuth((s) => s.session);
  const signOut = useAuth((s) => s.signOut);

  const [spotifyOk, setSpotifyOk] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [searchDefault, setSearchDefault] = useState<SearchSource>('youtube');
  const [signOutOpen, setSignOutOpen] = useState(false);

  useEffect(() => {
    isSpotifyConnected().then(setSpotifyOk);
    getDefaultSearchTab().then(setSearchDefault);
  }, []);

  const toggleSpotify = async () => {
    if (spotifyOk) {
      await disconnectSpotify();
      setSpotifyOk(false);
      return;
    }
    setConnecting(true);
    try {
      const ok = await connectSpotify();
      setSpotifyOk(ok);
      if (ok) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setConnecting(false);
    }
  };

  const changeSearchDefault = async (i: number) => {
    const v: SearchSource = i === 1 ? 'spotify' : 'youtube';
    setSearchDefault(v);
    Haptics.selectionAsync();
    await setDefaultSearchTab(v);
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
          <PillButton
            label="Sign out"
            variant="danger"
            small
            onPress={() => setSignOutOpen(true)}
            style={{ alignSelf: 'flex-start', marginTop: spacing.sm }}
          />
        </Section>

        <Section title="Spotify">
          <Row
            label="Connection"
            value={spotifyOk === null ? '…' : spotifyOk ? 'Connected' : 'Not connected'}
          />
          <PillButton
            label={spotifyOk ? 'Disconnect' : 'Connect Spotify'}
            variant={spotifyOk ? 'ghost' : 'primary'}
            small
            loading={connecting}
            onPress={toggleSpotify}
            style={{ alignSelf: 'flex-start', marginTop: spacing.sm }}
          />
        </Section>

        <Section title="Playback">
          <Text style={[type.caption, { marginBottom: spacing.sm }]}>
            Default search tab
          </Text>
          <SegmentedControl
            options={['YouTube', 'Spotify']}
            accents={[colors.youtube, colors.spotify]}
            value={searchDefault === 'spotify' ? 1 : 0}
            onChange={changeSearchDefault}
          />
        </Section>

        <Section title="About">
          <Row label="Version" value={APP_VERSION} />
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
