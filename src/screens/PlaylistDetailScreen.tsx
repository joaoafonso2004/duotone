import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  deletePlaylist,
  getPlaylistTracks,
  removeTrackFromPlaylist,
  renamePlaylist,
  setPlaylistOrder,
} from '../api/playlists';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { EmptyState } from '../components/EmptyState';
import { PromptSheet } from '../components/PromptSheet';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../components/Screen';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { TrackRow } from '../components/TrackRow';
import { YtPlaylistShareSheet } from '../components/YtPlaylistShareSheet';
import { hapticNotification, hapticSelection } from '../lib/haptics';
import { useTheme } from '../state/theme';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { usePlayer } from '../state/player';
import { colors, MINI_PLAYER_HEIGHT, spacing, type, gradients, radii } from '../theme';
import type { PlaylistTrack } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'PlaylistDetail'>;

export function PlaylistDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const insets = useSafeAreaInsets();
  const playTrack = usePlayer((s) => s.playTrack);
  const current = usePlayer((s) => s.current);

  const [name, setName] = useState(route.params.name);
  const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [removeFor, setRemoveFor] = useState<PlaylistTrack | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const theme = useTheme((s) => s.theme);

  const load = useCallback(async () => {
    try {
      setTracks(await getPlaylistTracks(id));
    } catch {
      // ignorar
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      if (!editMode) load();
    }, [load, editMode])
  );

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= tracks.length) return;
    const next = [...tracks];
    [next[index], next[j]] = [next[j], next[index]];
    setTracks(next);
    setDirty(true);
    hapticSelection();
  };

  const finishEdit = async () => {
    setEditMode(false);
    if (!dirty) return;
    try {
      await setPlaylistOrder(
        id,
        tracks.map((t) => t.id)
      );
      setDirty(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not save the new order.');
      load();
    }
  };

  const doRename = async (newName: string) => {
    setBusy(true);
    try {
      await renamePlaylist(id, newName);
      hapticNotification();
      setName(newName);
      setRenameOpen(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not rename.');
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await deletePlaylist(id);
      setDeleteOpen(false);
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not delete.');
    } finally {
      setBusy(false);
    }
  };

  const doRemoveTrack = async () => {
    if (!removeFor) return;
    setBusy(true);
    try {
      await removeTrackFromPlaylist(id, removeFor.id);
      setTracks(tracks.filter((t) => t.id !== removeFor.id));
      setRemoveFor(null);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not remove the track.');
    } finally {
      setBusy(false);
    }
  };

  const bottomPad = 49 + insets.bottom + MINI_PLAYER_HEIGHT + 32;

  return (
    <Screen
      title={name}
      subtitle={`${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}`}
      onBack={() => navigation.goBack()}
      right={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          {tracks.length > 0 && (
            <Pressable
              hitSlop={10}
              onPress={() => (editMode ? finishEdit() : setEditMode(true))}
              style={{ padding: 4 }}
            >
              <Text style={[type.body, { fontWeight: '600', color: colors.text }]}>
                {editMode ? 'Done' : 'Edit'}
              </Text>
            </Pressable>
          )}
          {!editMode && (
            <Pressable
              hitSlop={10}
              onPress={() => setOptionsOpen(true)}
              style={{ padding: 4 }}
            >
              <Ionicons
                name="ellipsis-horizontal-circle"
                size={24}
                color={colors.textSecondary}
              />
            </Pressable>
          )}
        </View>
      }
    >
      {tracks.length > 0 && !editMode ? (
        <View style={styles.actionRow}>
          <Pressable
            style={styles.playButton}
            onPress={() => playTrack(tracks[0], tracks)}
          >
            <LinearGradient
              colors={theme.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.buttonGradient}
            >
              <Ionicons name="play" size={18} color={theme.textColorOnGradient} />
              <Text style={[styles.buttonTextPlay, { color: theme.textColorOnGradient }]}>Play</Text>
            </LinearGradient>
          </Pressable>

          <Pressable
            style={styles.shuffleButton}
            onPress={() => {
              const shuffled = [...tracks].sort(() => Math.random() - 0.5);
              playTrack(shuffled[0], shuffled);
            }}
          >
            <Ionicons name="shuffle" size={20} color={colors.text} />
            <Text style={styles.buttonTextShuffle}>Shuffle</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={theme.color} style={{ marginTop: 48 }} />
      ) : tracks.length === 0 ? (
        <EmptyState
          icon="musical-notes-outline"
          title="This playlist is empty"
          subtitle="Add tracks from Search or your Library using the ••• menu on any track."
        />
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingBottom: bottomPad }}
          renderItem={({ item, index }) =>
            editMode ? (
              <View style={styles.editRow}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>
                    {item.title}
                  </Text>
                  <Text numberOfLines={1} style={type.caption}>
                    {item.artist ?? 'YouTube'}
                  </Text>
                </View>
                <Pressable
                  hitSlop={8}
                  onPress={() => move(index, -1)}
                  disabled={index === 0}
                  style={index === 0 && { opacity: 0.25 }}
                >
                  <Ionicons name="chevron-up" size={22} color={colors.text} />
                </Pressable>
                <Pressable
                  hitSlop={8}
                  onPress={() => move(index, 1)}
                  disabled={index === tracks.length - 1}
                  style={index === tracks.length - 1 && { opacity: 0.25 }}
                >
                  <Ionicons name="chevron-down" size={22} color={colors.text} />
                </Pressable>
                <Pressable hitSlop={8} onPress={() => setRemoveFor(item)}>
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </Pressable>
              </View>
            ) : (
              <TrackRow
                track={item}
                active={
                  current?.source === item.source &&
                  current?.sourceId === item.sourceId
                }
                onPress={() => playTrack(item, tracks)}
              />
            )
          }
        />
      )}

      {/* opções da playlist */}
      <TrackActionsSheet
        visible={optionsOpen}
        track={null}
        onClose={() => setOptionsOpen(false)}
        actions={[
          {
            icon: 'share-social-outline',
            label: 'Share playlist',
            onPress: () => {
              setOptionsOpen(false);
              setShareOpen(true);
            },
          },
          {
            icon: 'pencil-outline',
            label: 'Rename playlist',
            onPress: () => {
              setOptionsOpen(false);
              setRenameOpen(true);
            },
          },
          {
            icon: 'trash-outline',
            label: 'Delete playlist',
            destructive: true,
            onPress: () => {
              setOptionsOpen(false);
              setDeleteOpen(true);
            },
          },
        ]}
      />

      <YtPlaylistShareSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        playlistId={id}
        playlistName={name}
      />

      <PromptSheet
        visible={renameOpen}
        title="Rename playlist"
        placeholder="Playlist name"
        initialValue={name}
        submitLabel="Rename"
        loading={busy}
        onClose={() => setRenameOpen(false)}
        onSubmit={doRename}
      />

      <ConfirmSheet
        visible={deleteOpen}
        title="Delete playlist"
        message={`"${name}" will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete playlist"
        destructive
        loading={busy}
        onClose={() => setDeleteOpen(false)}
        onConfirm={doDelete}
      />

      <ConfirmSheet
        visible={!!removeFor}
        title="Remove track"
        message={`Remove "${removeFor?.title ?? ''}" from this playlist?`}
        confirmLabel="Remove"
        destructive
        loading={busy}
        onClose={() => setRemoveFor(null)}
        onConfirm={doRemoveTrack}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  playButton: {
    flex: 1,
    height: 48,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  buttonGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  shuffleButton: {
    flex: 1,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonTextPlay: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.bg,
  },
  buttonTextShuffle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: 10,
  },
});
