import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../components/Screen';
import { hapticNotification, hapticSelection } from '../lib/haptics';
import { getMostPlayed, getTotalPlays, type PlayCountEntry } from '../lib/playCounts';
import { getAvatarUri, setAvatarFromUri } from '../lib/profileImage';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../state/auth';
import { usePlayer } from '../state/player';
import type { Track } from '../types';
import { colors, radii, spacing, type } from '../theme';

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const session = useAuth((s) => s.session);
  const updateName = useAuth((s) => s.updateName);
  const playTrack = usePlayer((s) => s.playTrack);

  const email = session?.user?.email ?? '—';
  const currentName =
    (session?.user?.user_metadata?.username as string | undefined) ??
    (session?.user?.user_metadata?.name as string | undefined) ??
    email.split('@')[0] ??
    'You';

  const [avatar, setAvatar] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(currentName);
  const [savingName, setSavingName] = useState(false);
  const [mostPlayed, setMostPlayed] = useState<PlayCountEntry[]>([]);
  const [totalPlays, setTotalPlays] = useState(0);

  const loadStats = useCallback(() => {
    getMostPlayed(50).then(setMostPlayed);
    getTotalPlays().then(setTotalPlays);
    getAvatarUri().then(setAvatar);
  }, []);

  // Recarrega sempre que o ecrã ganha foco (contagens mudam ao ouvir música).
  useEffect(() => {
    if (isFocused) loadStats();
  }, [isFocused, loadStats]);

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to set a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    try {
      const uri = await setAvatarFromUri(result.assets[0].uri);
      setAvatar(uri);
      hapticNotification();
    } catch {
      Alert.alert('Error', 'Could not set the profile picture.');
    }
  };

  const startEditName = () => {
    setNameDraft(currentName);
    setEditingName(true);
  };

  const saveName = async () => {
    setSavingName(true);
    try {
      const err = await updateName(nameDraft);
      if (err) {
        Alert.alert('Error', err);
        return;
      }
      hapticNotification();
      setEditingName(false);
    } finally {
      setSavingName(false);
    }
  };

  const playEntry = (e: PlayCountEntry) => {
    const track: Track = {
      source: e.source,
      sourceId: e.sourceId,
      title: e.title,
      artist: e.artist,
      album: null,
      artworkUrl: e.artworkUrl,
      durationSeconds: null,
    };
    hapticSelection();
    playTrack(track);
  };

  return (
    <Screen
      title="Profile"
      right={
        <Pressable
          hitSlop={10}
          onPress={() => navigation.navigate('Settings')}
          accessibilityLabel="Settings"
        >
          <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
        </Pressable>
      }
    >
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingBottom: insets.bottom + 120,
          gap: spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- cabeçalho do perfil ---- */}
        <View style={styles.head}>
          <Pressable onPress={pickAvatar} style={styles.avatarWrap}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Ionicons name="person" size={40} color={colors.textTertiary} />
              </View>
            )}
            <View style={styles.avatarEdit}>
              <Ionicons name="camera" size={14} color="#fff" />
            </View>
          </Pressable>

          {editingName ? (
            <View style={styles.nameEditRow}>
              <TextInput
                value={nameDraft}
                onChangeText={setNameDraft}
                autoFocus
                autoCapitalize="none"
                placeholder="Username"
                placeholderTextColor={colors.textTertiary}
                style={styles.nameInput}
                maxLength={24}
              />
              <Pressable onPress={saveName} disabled={savingName} hitSlop={8}>
                {savingName ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <Ionicons name="checkmark-circle" size={26} color={colors.accent} />
                )}
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={startEditName} style={styles.nameRow} hitSlop={6}>
              <Text style={styles.name}>{currentName}</Text>
              <Ionicons name="pencil" size={15} color={colors.textTertiary} />
            </Pressable>
          )}
          <Text style={styles.email}>{email}</Text>

          <View style={styles.statsRow}>
            <Stat label="Plays" value={String(totalPlays)} />
            <Stat label="Tracks" value={String(mostPlayed.length)} />
          </View>
        </View>

        {/* ---- mais ouvidas ---- */}
        <View>
          <Text style={[type.micro, { marginBottom: spacing.sm }]}>MOST PLAYED</Text>
          {mostPlayed.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="musical-notes-outline" size={22} color={colors.textTertiary} />
              <Text style={[type.caption, { textAlign: 'center' }]}>
                Play some music and your most-played tracks show up here.
              </Text>
            </View>
          ) : (
            <View style={styles.card}>
              {mostPlayed.map((e, i) => (
                <Pressable
                  key={`${e.source}:${e.sourceId}`}
                  onPress={() => playEntry(e)}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: colors.surfacePressed },
                  ]}
                >
                  <Text style={styles.rank}>{i + 1}</Text>
                  {e.artworkUrl ? (
                    <Image source={{ uri: e.artworkUrl }} style={styles.art} contentFit="cover" />
                  ) : (
                    <View style={[styles.art, styles.artFallback]}>
                      <Ionicons name="musical-notes" size={13} color={colors.textTertiary} />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={styles.rowTitle}>
                      {e.title}
                    </Text>
                    <Text numberOfLines={1} style={styles.rowArtist}>
                      {e.artist ?? (e.source === 'youtube' ? 'YouTube' : 'Spotify')}
                    </Text>
                  </View>
                  <View style={styles.countPill}>
                    <Ionicons name="play" size={10} color={colors.textSecondary} />
                    <Text style={styles.countText}>{e.count}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const AVATAR = 96;

const styles = StyleSheet.create({
  head: {
    alignItems: 'center',
    paddingTop: spacing.md,
  },
  avatarWrap: {
    width: AVATAR,
    height: AVATAR,
    marginBottom: spacing.md,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: colors.surfaceHigh,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEdit: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  nameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  nameInput: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    borderBottomWidth: 1,
    borderBottomColor: colors.accent,
    minWidth: 160,
    textAlign: 'center',
    paddingVertical: 2,
  },
  email: {
    ...type.caption,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginTop: spacing.lg,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  statLabel: {
    ...type.micro,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
  },
  rank: {
    width: 18,
    textAlign: 'center',
    ...type.caption,
    fontWeight: '700',
    color: colors.textTertiary,
  },
  art: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: colors.surfaceHigh,
  },
  artFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    ...type.body,
    fontSize: 14,
    fontWeight: '600',
  },
  rowArtist: {
    ...type.caption,
    fontSize: 11,
  },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  countText: {
    ...type.caption,
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
});
