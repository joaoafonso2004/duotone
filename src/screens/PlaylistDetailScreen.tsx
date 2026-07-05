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
import * as Haptics from 'expo-haptics';
import {
  deletePlaylist,
  getPlaylistTracks,
  removeTrackFromPlaylist,
  renamePlaylist,
  setPlaylistOrder,
} from '../api/playlists';
import { EmptyState } from '../components/EmptyState';
import { PillButton } from '../components/PillButton';
import { Screen } from '../components/Screen';
import { TrackRow } from '../components/TrackRow';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { usePlayer } from '../state/player';
import { colors, MINI_PLAYER_HEIGHT, spacing, type } from '../theme';
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
    Haptics.selectionAsync();
  };

  const removeAt = (index: number) => {
    const t = tracks[index];
    Alert.alert('Remove track', `Remove "${t.title}" from this playlist?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeTrackFromPlaylist(id, t.id);
            setTracks(tracks.filter((_, i) => i !== index));
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Could not remove the track.');
          }
        },
      },
    ]);
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

  const showOptions = () => {
    Alert.alert(name, undefined, [
      {
        text: 'Rename',
        onPress: () =>
          Alert.prompt('Rename playlist', undefined, async (newName) => {
            if (!newName?.trim()) return;
            try {
              await renamePlaylist(id, newName.trim());
              setName(newName.trim());
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Could not rename.');
            }
          }),
      },
      {
        text: 'Delete playlist',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete playlist', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                try {
                  await deletePlaylist(id);
                  navigation.goBack();
                } catch (e: any) {
                  Alert.alert('Error', e?.message ?? 'Could not delete.');
                }
              },
            },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const bottomPad = 49 + insets.bottom + MINI_PLAYER_HEIGHT + 32;

  return (
    <Screen
      title={name}
      subtitle={`${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}`}
      onBack={() => navigation.goBack()}
      right={
        <Pressable hitSlop={10} onPress={showOptions} style={{ marginBottom: 4 }}>
          <Ionicons
            name="ellipsis-horizontal-circle"
            size={26}
            color={colors.textSecondary}
          />
        </Pressable>
      }
    >
      {tracks.length > 0 ? (
        <View style={styles.actions}>
          <PillButton
            label="Play all"
            small
            onPress={() => playTrack(tracks[0], tracks)}
          />
          <PillButton
            label={editMode ? 'Done' : 'Edit'}
            small
            variant="ghost"
            onPress={() => (editMode ? finishEdit() : setEditMode(true))}
          />
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />
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
                    {item.artist ?? (item.source === 'youtube' ? 'YouTube' : 'Spotify')}
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
                <Pressable hitSlop={8} onPress={() => removeAt(index)}>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: 10,
  },
});
