import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../components/Screen';
import {
  AVATAR_EMOJIS,
  AVATAR_GRADIENTS,
  CURATED_AVATARS,
  getAvatarChoice,
  setAvatarChoice,
  type AvatarChoice,
} from '../lib/avatarPrefs';
import { hapticNotification, hapticSelection } from '../lib/haptics';
import {
  getProfileMostPlayed,
  getProfilePlayStats,
  getProfileRecentlyPlayed,
  getTopArtists,
  type ProfilePlayEntry,
  type DbPlayStats,
  type TopArtist,
} from '../api/plays';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFriendCount, getInboxItems } from '../api/social';
import { useNotifications } from '../state/notifications';
import { listPlaylists } from '../api/playlists';
import { ArtworkCollage } from '../components/ArtworkCollage';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { AddToPlaylistSheet } from '../components/AddToPlaylistSheet';
import { saveToLibrary } from '../api/library';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../state/auth';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';
import type { Track, Playlist } from '../types';
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
  const [topArtists, setTopArtists] = useState<TopArtist[]>([]);
  const [friendCount, setFriendCount] = useState(0);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  // Ações do TrackActionsSheet
  const [actionTrack, setActionTrack] = useState<Track | null>(null);
  const [playlistTrack, setPlaylistTrack] = useState<Track | null>(null);
  const playNext = usePlayer((s) => s.playNext);
  const addToQueue = usePlayer((s) => s.addToQueue);
  const theme = useTheme((s) => s.theme);

  const scrollY = React.useRef(new Animated.Value(0)).current;

  const avatarScale = scrollY.interpolate({
    inputRange: [-100, 0, 150],
    outputRange: [1.15, 1, 0.6],
    extrapolate: 'clamp',
  });

  const avatarTranslateY = scrollY.interpolate({
    inputRange: [-100, 0, 150],
    outputRange: [0, 0, -15],
    extrapolate: 'clamp',
  });

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const loadStats = useCallback(() => {
    getProfileMostPlayed(20).then(setMostPlayed);
    getProfileRecentlyPlayed(12).then(setRecent);
    getProfilePlayStats().then(setStats);
    getAvatarChoice().then(setAvatar);
    getTopArtists(8).then(setTopArtists);
    getFriendCount().then(setFriendCount).catch(() => {});
    listPlaylists().then(setPlaylists).catch(() => {});
  }, []);

  useEffect(() => {
    if (isFocused) {
      loadStats();
      
      // Se há notificação pendente na barra de baixo, limpa-a e transfere-a para o botão de Social
      if (useNotifications.getState().hasNotification) {
        useNotifications.getState().setHasNotification(false);
        useNotifications.getState().setHasSocialNotification(true);
        
        getInboxItems().then(async (items) => {
          if (items && items.length > 0) {
            await AsyncStorage.setItem('notifications:lastSeenId', items[0].id);
          }
        }).catch(() => {});
      }
    }
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
    playTrack(entryToTrack(e), undefined, true);
  };

  const grad = AVATAR_GRADIENTS[avatar?.gradientIndex ?? 0];
  const totalPlays = stats?.totalPlays ?? 0;
  const hasSocialNotification = useNotifications((s) => s.hasSocialNotification);

  return (
    <Screen
      title="Profile"
      right={
        <View style={{ flexDirection: 'row', gap: 24, alignItems: 'center' }}>
          <Pressable
            hitSlop={12}
            onPress={() => {
              useNotifications.getState().setHasSocialNotification(false);
              navigation.navigate('Social');
            }}
            accessibilityLabel="Social"
          >
            <View style={{ position: 'relative' }}>
              <Ionicons name="people-outline" size={22} color={colors.textSecondary} />
              {hasSocialNotification && (
                <View
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -2,
                    width: 7,
                    height: 7,
                    borderRadius: 3.5,
                    backgroundColor: '#FF3B30',
                  }}
                />
              )}
            </View>
          </Pressable>
          <Pressable
            hitSlop={12}
            onPress={() => navigation.navigate('ListeningStats')}
            accessibilityLabel="A tua escuta"
          >
            <Ionicons name="stats-chart-outline" size={21} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            hitSlop={12}
            onPress={() => navigation.navigate('Settings')}
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
      }
    >
      <Animated.ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingBottom: insets.bottom + 120,
          gap: spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
      >
        {/* ---- cabeçalho ---- */}
        <View style={styles.head}>
          <Animated.View
            style={{
              transform: [{ scale: avatarScale }, { translateY: avatarTranslateY }],
              alignItems: 'center',
            }}
          >
            <Pressable onPress={() => setAvatarEditing(true)} style={styles.avatarWrap}>
              {avatar?.avatarUrl ? (
                <Image
                  source={{ uri: avatar.avatarUrl }}
                  style={styles.avatar}
                  contentFit="cover"
                />
              ) : (
                <LinearGradient
                  colors={grad as [string, string, ...string[]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.avatar}
                >
                  <Text style={styles.avatarEmoji}>{avatar?.emoji ?? '🎧'}</Text>
                </LinearGradient>
              )}
              <View style={styles.avatarEdit}>
                <Ionicons name="pencil" size={13} color="#fff" />
              </View>
            </Pressable>
          </Animated.View>

          <Animated.View style={{ opacity: headerOpacity, alignItems: 'center', width: '100%', marginTop: spacing.xs }}>
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
          </Animated.View>
        </View>

        {/* ---- estatísticas ---- */}
        <View style={styles.statsRow}>
          <Stat label="Plays" value={String(totalPlays)} />
          <Stat label="Tracks" value={String(stats?.uniqueTracks ?? 0)} />
          <Stat label="Friends" value={String(friendCount)} />
          <Stat
            label="Top artist"
            value={stats?.topArtist?.name ?? '—'}
            small
          />
        </View>

        {/* ---- Top Artistas ---- */}
        {topArtists.length > 0 && (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={[type.micro, { marginHorizontal: spacing.md }]}>OS TEUS ARTISTAS</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: spacing.md, gap: 12, paddingTop: spacing.sm }}
            >
              {topArtists.map((artist) => (
                <View key={artist.name} style={{ alignItems: 'center', width: 80 }}>
                  {artist.artworkUrl ? (
                    <Image
                      source={{ uri: artist.artworkUrl }}
                      style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface }}
                    />
                  ) : (
                    <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="person" size={28} color={colors.textSecondary} />
                    </View>
                  )}
                  <Text numberOfLines={1} style={{ color: colors.text, fontSize: 11, fontWeight: '600', marginTop: 6, textAlign: 'center' }}>
                    {artist.name}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 10 }}>
                    {artist.plays} plays
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ---- mais ouvidas ---- */}
        <Section title="MOST PLAYED" empty={mostPlayed.length === 0}>
          {mostPlayed.map((e, i) => (
            <TrackRow
              key={`${e.source}:${e.sourceId}`}
              entry={e}
              rank={i + 1}
              onPress={() => play(e)}
              onLongPress={() => {
                hapticSelection();
                setActionTrack(entryToTrack(e));
              }}
            />
          ))}
        </Section>

        {/* ---- ouvidas recentemente ---- */}
        {recent.length > 0 ? (
          <Section title="RECENTLY PLAYED" empty={false}>
            {recent.map((e) => (
              <TrackRow
                key={`r-${e.source}:${e.sourceId}`}
                entry={e}
                onPress={() => play(e)}
                onLongPress={() => {
                  hapticSelection();
                  setActionTrack(entryToTrack(e));
                }}
              />
            ))}
          </Section>
        ) : null}

        {/* ---- as tuas playlists ---- */}
        <Section title="PLAYLISTS" empty={playlists.length === 0}>
          {playlists.map((playlist) => (
            <Pressable
              key={playlist.id}
              onPress={() => navigation.navigate('PlaylistDetail', { id: playlist.id, name: playlist.name })}
              style={({ pressed }) => [
                styles.row,
                { paddingVertical: spacing.xs },
                pressed && { backgroundColor: colors.surfacePressed },
              ]}
            >
              <ArtworkCollage artworks={playlist.artworks} size={48} />
              <View style={{ flex: 1, minWidth: 0, marginLeft: spacing.md }}>
                <Text numberOfLines={1} style={styles.rowTitle}>
                  {playlist.name}
                </Text>
                <Text numberOfLines={1} style={styles.rowArtist}>
                  {playlist.trackCount} {playlist.trackCount === 1 ? 'música' : 'músicas'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Pressable>
          ))}
        </Section>
      </Animated.ScrollView>

      <TrackActionsSheet
        visible={!!actionTrack}
        track={actionTrack}
        onClose={() => setActionTrack(null)}
        actions={[
          {
            icon: 'play-outline',
            label: 'Tocar a seguir',
            onPress: () => {
              const t = actionTrack;
              setActionTrack(null);
              if (t) playNext(t);
            },
          },
          {
            icon: 'add-circle-outline',
            label: 'Adicionar à fila',
            onPress: () => {
              const t = actionTrack;
              setActionTrack(null);
              if (t) addToQueue(t);
            },
          },
          {
            icon: 'heart-outline',
            label: 'Save to Library',
            onPress: async () => {
              const t = actionTrack;
              setActionTrack(null);
              if (!t) return;
              try {
                await saveToLibrary(t);
                hapticNotification();
              } catch (e: any) {
                Alert.alert('Error', e?.message ?? 'Could not save the track.');
              }
            },
          },
          {
            icon: 'list-outline',
            label: 'Add to playlist…',
            onPress: () => {
              const t = actionTrack;
              setActionTrack(null);
              setPlaylistTrack(t);
            },
          },
        ]}
      />

      <AddToPlaylistSheet
        visible={!!playlistTrack}
        track={playlistTrack}
        onClose={() => setPlaylistTrack(null)}
      />

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
  onLongPress,
}: {
  entry: ProfilePlayEntry;
  rank?: number;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
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
  const avatarUrl = value?.avatarUrl;

  const [inputUrl, setInputUrl] = useState(avatarUrl || '');

  useEffect(() => {
    setInputUrl(value?.avatarUrl || '');
  }, [value?.avatarUrl, visible]);

  const handleApplyUrl = () => {
    onChange({ emoji, gradientIndex, avatarUrl: inputUrl.trim() || undefined });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ width: '100%', justifyContent: 'flex-end', alignItems: 'center' }}
        >
          <Pressable style={[styles.sheet, { maxHeight: '90%' }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: spacing.md, paddingBottom: 24 }}
            >
              <Text style={[type.body, { fontWeight: '700', textAlign: 'center' }]}>Foto de Perfil</Text>

              <View style={{ alignSelf: 'center', marginVertical: spacing.xs }}>
                {avatarUrl ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={styles.preview}
                    contentFit="cover"
                  />
                ) : (
                  <LinearGradient colors={grad as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.preview}>
                    <Text style={{ fontSize: 42 }}>{emoji}</Text>
                  </LinearGradient>
                )}
              </View>

              <Text style={[type.micro, styles.sheetLabel]}>LINK DE IMAGEM PERSONALIZADA (URL)</Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                <TextInput
                  value={inputUrl}
                  onChangeText={setInputUrl}
                  placeholder="https://exemplo.com/foto.jpg"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.urlInput}
                  onSubmitEditing={handleApplyUrl}
                />
                <Pressable
                  onPress={handleApplyUrl}
                  style={({ pressed }) => [
                    styles.applyBtn,
                    { backgroundColor: theme.soft },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text style={{ color: theme.color, fontSize: 13, fontWeight: '700' }}>Aplicar</Text>
                </Pressable>
              </View>

              <Text style={[type.micro, styles.sheetLabel]}>ILUSTRAÇÕES RECOMENDADAS</Text>
              <View style={styles.illustrationGrid}>
                {CURATED_AVATARS.map((url) => (
                  <Pressable
                    key={url}
                    onPress={() => {
                      setInputUrl(url);
                      onChange({ emoji, gradientIndex, avatarUrl: url });
                    }}
                    style={({ pressed }) => [
                      styles.illustrationCell,
                      avatarUrl === url && { borderColor: theme.color },
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <Image source={{ uri: url }} style={styles.illustrationImage} contentFit="cover" />
                  </Pressable>
                ))}
              </View>

              {avatarUrl ? (
                <Pressable
                  onPress={() => {
                    setInputUrl('');
                    onChange({ emoji, gradientIndex, avatarUrl: undefined });
                  }}
                  style={[styles.removeUrlBtn, { borderColor: colors.borderStrong }]}
                >
                  <Ionicons name="trash-outline" size={14} color={colors.textSecondary} />
                  <Text style={styles.removeUrlText}>Voltar para Emoji & Gradiente</Text>
                </Pressable>
              ) : null}

              <View style={styles.divider} />

              <View style={{ opacity: avatarUrl ? 0.35 : 1 }} pointerEvents={avatarUrl ? 'none' : 'auto'}>
                <Text style={[type.micro, styles.sheetLabel]}>CORES DO GRADIENTE</Text>
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

                <Text style={[type.micro, styles.sheetLabel, { marginTop: spacing.md }]}>EMOJIS</Text>
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
              </View>

              <Pressable style={styles.doneBtn} onPress={onClose}>
                <Text style={styles.doneText}>Concluído</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
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
  urlInput: {
    flex: 1,
    height: 40,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  applyBtn: {
    height: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustrationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  illustrationCell: {
    width: '22%',
    aspectRatio: 1,
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  illustrationImage: {
    width: '100%',
    height: '100%',
  },
  removeUrlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.pill,
    marginTop: spacing.sm,
  },
  removeUrlText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
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
