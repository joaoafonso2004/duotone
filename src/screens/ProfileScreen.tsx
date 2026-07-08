import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../components/Screen';
import {
  AVATAR_EMOJIS,
  AVATAR_GRADIENTS,
  getAvatarChoice,
  setAvatarChoice,
  type AvatarChoice,
} from '../lib/avatarPrefs';
import { hapticNotification, hapticSelection } from '../lib/haptics';
import {
  getProfileMostPlayed,
  getProfilePlayStats,
  getProfileRecentlyPlayed,
  type ProfilePlayEntry,
  type DbPlayStats,
} from '../api/plays';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../state/auth';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';
import type { Track } from '../types';
import { colors, radii, spacing, type } from '../theme';

function entryToTrack(e: ProfilePlayEntry): Track {
  return {
    id: e.id,
    source: e.source,
    sourceId: e.sourceId,
    title: e.title,
    artist: e.artist,
    album: null,
    artworkUrl: e.artworkUrl,
    durationSeconds: e.durationSeconds ?? null,
  };
}

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
  const memberSince = formatMemberSince(session?.user?.created_at);

  const [avatar, setAvatar] = useState<AvatarChoice | null>(null);
  const [avatarEditing, setAvatarEditing] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(currentName);
  const [savingName, setSavingName] = useState(false);
  const [mostPlayed, setMostPlayed] = useState<ProfilePlayEntry[]>([]);
  const [recent, setRecent] = useState<ProfilePlayEntry[]>([]);
  const [stats, setStats] = useState<DbPlayStats | null>(null);
  const theme = useTheme((s) => s.theme);

  const musicDNA = useMemo(() => {
    if (mostPlayed.length === 0) {
      return {
        vibe: 'Explorador Curioso',
        description: 'Começa a ouvir músicas no Duotone para revelares o teu ADN musical!',
        emoji: '🚶‍♂️',
        gradient: ['#7c3aed', '#db2777'],
      };
    }

    let chillCount = 0;
    let energyCount = 0;
    let electronicCount = 0;

    mostPlayed.forEach((t) => {
      const text = `${t.title} ${t.artist}`.toLowerCase();
      if (
        text.includes('lofi') ||
        text.includes('chill') ||
        text.includes('relax') ||
        text.includes('sleep') ||
        text.includes('ambient') ||
        text.includes('study')
      ) {
        chillCount += 2;
      }
      if (
        text.includes('electronic') ||
        text.includes('dance') ||
        text.includes('synth') ||
        text.includes('techno') ||
        text.includes('remix') ||
        text.includes('beat')
      ) {
        electronicCount += 1;
      }
      if (
        text.includes('rock') ||
        text.includes('pop') ||
        text.includes('energy') ||
        text.includes('rap') ||
        text.includes('hip hop') ||
        text.includes('trap')
      ) {
        energyCount += 1;
      }
    });

    if (chillCount > energyCount && chillCount > electronicCount) {
      return {
        vibe: 'Foco & Meditação',
        description: 'Procuras a tranquilidade. O teu ADN é feito de batidas lofi e melodias calmas.',
        emoji: '🧘‍♂️',
        gradient: ['#06b6d4', '#3b82f6'],
      };
    } else if (electronicCount > chillCount && electronicCount > energyCount) {
      return {
        vibe: 'Sintetizadores & Dance',
        description: 'Sentes o ritmo na pele. Preferes graves profundos e sintetizadores espaciais.',
        emoji: '⚡',
        gradient: ['#ec4899', '#8b5cf6'],
      };
    } else if (energyCount > chillCount) {
      return {
        vibe: 'Ritmo & Energia',
        description: 'O teu som é dinâmico. Adoras melodias cativantes e batidas vibrantes.',
        emoji: '🔥',
        gradient: ['#f97316', '#ef4444'],
      };
    } else {
      return {
        vibe: 'Explorador Eclético',
        description: 'A tua mente musical não tem fronteiras. Descobres e misturas todos os géneros.',
        emoji: '🌌',
        gradient: ['#a855f7', '#ec4899'],
      };
    }
  }, [mostPlayed]);

  const loadStats = useCallback(() => {
    getProfileMostPlayed(20).then(setMostPlayed);
    getProfileRecentlyPlayed(12).then(setRecent);
    getProfilePlayStats().then(setStats);
    getAvatarChoice().then(setAvatar);
  }, []);

  useEffect(() => {
    if (isFocused) loadStats();
  }, [isFocused, loadStats]);

  const saveAvatar = async (choice: AvatarChoice) => {
    setAvatar(choice);
    hapticSelection();
    await setAvatarChoice(choice);
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

  const play = (e: ProfilePlayEntry) => {
    hapticSelection();
    playTrack(entryToTrack(e));
  };

  const grad = AVATAR_GRADIENTS[avatar?.gradientIndex ?? 0];
  const totalPlays = stats?.totalPlays ?? 0;

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
        {/* ---- cabeçalho ---- */}
        <View style={styles.head}>
          <Pressable onPress={() => setAvatarEditing(true)} style={styles.avatarWrap}>
            <LinearGradient
              colors={grad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatar}
            >
              <Text style={styles.avatarEmoji}>{avatar?.emoji ?? '🎧'}</Text>
            </LinearGradient>
            <View style={styles.avatarEdit}>
              <Ionicons name="pencil" size={13} color="#fff" />
            </View>
          </Pressable>

          {editingName ? (
            <View style={styles.nameEditRow}>
              <TextInput
                value={nameDraft}
                onChangeText={setNameDraft}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Username"
                placeholderTextColor={colors.textTertiary}
                style={[styles.nameInput, { borderBottomColor: theme.color }]}
                maxLength={24}
              />
              <Pressable onPress={saveName} disabled={savingName} hitSlop={8}>
                {savingName ? (
                  <ActivityIndicator color={theme.color} />
                ) : (
                  <Ionicons name="checkmark-circle" size={26} color={theme.color} />
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
          {memberSince ? (
            <Text style={styles.since}>Member since {memberSince}</Text>
          ) : null}
        </View>

        {/* ---- estatísticas ---- */}
        <View style={styles.statsRow}>
          <Stat label="Plays" value={String(totalPlays)} />
          <Stat label="Tracks" value={String(stats?.uniqueTracks ?? 0)} />
          <Stat
            label="Top artist"
            value={stats?.topArtist?.name ?? '—'}
            small
          />
        </View>

        {/* ---- Vibe / ADN Musical ---- */}
        <View style={styles.dnaCard}>
          <LinearGradient
            colors={musicDNA.gradient as [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.dnaGradient}
          />
          <View style={styles.dnaContent}>
            <View style={styles.dnaHeaderRow}>
              <Text style={styles.dnaTitle}>ADN MUSICAL</Text>
              <Text style={styles.dnaEmoji}>{musicDNA.emoji}</Text>
            </View>
            <Text style={styles.dnaVibe}>{musicDNA.vibe}</Text>
            <Text style={styles.dnaDesc}>{musicDNA.description}</Text>
          </View>
        </View>

        {/* ---- mais ouvidas ---- */}
        <Section title="MOST PLAYED" empty={mostPlayed.length === 0}>
          {mostPlayed.map((e, i) => (
            <TrackRow key={`${e.source}:${e.sourceId}`} entry={e} rank={i + 1} onPress={() => play(e)} />
          ))}
        </Section>

        {/* ---- ouvidas recentemente ---- */}
        {recent.length > 0 ? (
          <Section title="RECENTLY PLAYED" empty={false}>
            {recent.map((e) => (
              <TrackRow key={`r-${e.source}:${e.sourceId}`} entry={e} onPress={() => play(e)} />
            ))}
          </Section>
        ) : null}
      </ScrollView>

      {/* ---- editor de avatar ---- */}
      <AvatarEditor
        visible={avatarEditing}
        value={avatar}
        onClose={() => setAvatarEditing(false)}
        onChange={saveAvatar}
      />
    </Screen>
  );
}

function formatMemberSince(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text numberOfLines={1} style={[styles.statValue, small && { fontSize: 14 }]}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Text style={[type.micro, { marginBottom: spacing.sm }]}>{title}</Text>
      {empty ? (
        <View style={styles.emptyCard}>
          <Ionicons name="musical-notes-outline" size={22} color={colors.textTertiary} />
          <Text style={[type.caption, { textAlign: 'center' }]}>
            Play some music and it shows up here.
          </Text>
        </View>
      ) : (
        <View style={styles.card}>{children}</View>
      )}
    </View>
  );
}

function TrackRow({
  entry,
  rank,
  onPress,
}: {
  entry: ProfilePlayEntry;
  rank?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfacePressed }]}
    >
      {rank ? <Text style={styles.rank}>{rank}</Text> : null}
      {entry.artworkUrl ? (
        <Image source={{ uri: entry.artworkUrl }} style={styles.art} contentFit="cover" />
      ) : (
        <View style={[styles.art, styles.artFallback]}>
          <Ionicons name="musical-notes" size={13} color={colors.textTertiary} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {entry.title}
        </Text>
        <Text numberOfLines={1} style={styles.rowArtist}>
          {entry.artist ?? 'YouTube'}
        </Text>
      </View>
      <View style={styles.countPill}>
        <Ionicons name="play" size={10} color={colors.textSecondary} />
        <Text style={styles.countText}>{entry.count}</Text>
      </View>
    </Pressable>
  );
}

function AvatarEditor({
  visible,
  value,
  onClose,
  onChange,
}: {
  visible: boolean;
  value: AvatarChoice | null;
  onClose: () => void;
  onChange: (c: AvatarChoice) => void;
}) {
  const theme = useTheme((s) => s.theme);
  const emoji = value?.emoji ?? AVATAR_EMOJIS[0];
  const gradientIndex = value?.gradientIndex ?? 0;
  const grad = AVATAR_GRADIENTS[gradientIndex];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.sheetHandle} />
          <Text style={[type.body, { fontWeight: '700', textAlign: 'center' }]}>Your avatar</Text>

          <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.preview}>
            <Text style={{ fontSize: 42 }}>{emoji}</Text>
          </LinearGradient>

          <Text style={[type.micro, styles.sheetLabel]}>COLOR</Text>
          <View style={styles.swatchRow}>
            {AVATAR_GRADIENTS.map((g, i) => (
              <Pressable key={i} onPress={() => onChange({ emoji, gradientIndex: i })}>
                <LinearGradient
                  colors={g}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.swatch, i === gradientIndex && styles.swatchActive]}
                />
              </Pressable>
            ))}
          </View>

          <Text style={[type.micro, styles.sheetLabel]}>EMOJI</Text>
          <View style={styles.emojiGrid}>
            {AVATAR_EMOJIS.map((em) => (
              <Pressable
                key={em}
                onPress={() => onChange({ emoji: em, gradientIndex })}
                style={[styles.emojiCell, em === emoji && [styles.emojiCellActive, { borderColor: theme.color }]]}
              >
                <Text style={{ fontSize: 24 }}>{em}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={styles.doneBtn} onPress={onClose}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const AVATAR = 96;

const styles = StyleSheet.create({
  head: { alignItems: 'center', paddingTop: spacing.md },
  avatarWrap: { width: AVATAR, height: AVATAR, marginBottom: spacing.md },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 44 },
  avatarEdit: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 22, fontWeight: '800', color: colors.text },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
  email: { ...type.caption, marginTop: 4 },
  since: { ...type.micro, marginTop: 4 },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: spacing.md,
  },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.text },
  statLabel: { ...type.micro, marginTop: 2 },
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
  splitBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: colors.surfaceHigh,
  },
  splitLegend: { flexDirection: 'row', gap: spacing.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
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
  art: { width: 40, height: 40, borderRadius: 6, backgroundColor: colors.surfaceHigh },
  artFallback: { alignItems: 'center', justifyContent: 'center' },
  rowTitle: { ...type.body, fontSize: 14, fontWeight: '600' },
  rowArtist: { ...type.caption, fontSize: 11 },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  countText: { ...type.caption, fontSize: 12, fontWeight: '700', color: colors.text },
  // ---- sheet do avatar ----
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.sm,
  },
  preview: {
    alignSelf: 'center',
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.sm,
  },
  sheetLabel: { marginTop: spacing.sm },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'transparent' },
  swatchActive: { borderColor: colors.text },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  emojiCell: {
    width: 46,
    height: 46,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  emojiCellActive: { borderColor: colors.accent, backgroundColor: colors.surfacePressed },
  doneBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radii.pill,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneText: { ...type.body, fontWeight: '700' },
  dnaCard: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    position: 'relative',
    minHeight: 100,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  dnaGradient: {
    ...StyleSheet.absoluteFill,
    opacity: 0.15,
  },
  dnaContent: {
    padding: spacing.md,
    gap: 4,
  },
  dnaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dnaTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: colors.textSecondary,
  },
  dnaEmoji: {
    fontSize: 22,
  },
  dnaVibe: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginTop: 2,
  },
  dnaDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
    marginTop: 4,
  },
});
