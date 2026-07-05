import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  addTrackToPlaylist,
  createPlaylist,
  listPlaylists,
} from '../api/playlists';
import { colors, radii, spacing, type } from '../theme';
import type { Playlist, Track } from '../types';
import { ArtworkCollage } from './ArtworkCollage';
import { BottomSheet } from './BottomSheet';
import { Input } from './Input';
import { PillButton } from './PillButton';

interface Props {
  visible: boolean;
  track: Track | null;
  onClose: () => void;
  onDone?: () => void;
}

export function AddToPlaylistSheet({ visible, track, onClose, onDone }: Props) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPlaylists(await listPlaylists());
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const addTo = async (playlistId: string) => {
    if (!track) return;
    try {
      await addTrackToPlaylist(playlistId, track);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone?.();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not add the track.');
    }
  };

  const createAndAdd = async () => {
    if (!newName.trim() || !track) return;
    setCreating(true);
    try {
      const pl = await createPlaylist(newName.trim());
      setNewName('');
      await addTo(pl.id);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not create the playlist.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[type.title, { marginBottom: spacing.md }]}>
        Add to playlist
      </Text>

      <View style={styles.newRow}>
        <Input
          icon="add"
          placeholder="New playlist name"
          value={newName}
          onChangeText={setNewName}
          containerStyle={{ flex: 1 }}
          returnKeyType="done"
          onSubmitEditing={createAndAdd}
        />
        <PillButton
          label="Create"
          small
          loading={creating}
          disabled={!newName.trim()}
          onPress={createAndAdd}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginVertical: 24 }} />
      ) : (
        <ScrollView style={{ maxHeight: 320 }}>
          {playlists.map((pl) => (
            <Pressable
              key={pl.id}
              onPress={() => addTo(pl.id)}
              style={({ pressed }) => [
                styles.row,
                pressed && { backgroundColor: colors.surfacePressed },
              ]}
            >
              <ArtworkCollage artworks={pl.artworks} size={44} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>
                  {pl.name}
                </Text>
                <Text style={type.caption}>
                  {pl.trackCount} {pl.trackCount === 1 ? 'track' : 'tracks'}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textTertiary}
              />
            </Pressable>
          ))}
          {playlists.length === 0 ? (
            <Text style={[type.caption, { textAlign: 'center', padding: 24 }]}>
              No playlists yet — create your first one above.
            </Text>
          ) : null}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.md,
  },
});
