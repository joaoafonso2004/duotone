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
import {
  addTrackToPlaylist,
  addTracksToPlaylist,
  createPlaylist,
  listPlaylists,
} from '../api/playlists';
import { supabase } from '../lib/supabase';
import { hapticNotification } from '../lib/haptics';
import { colors, radii, spacing, type } from '../theme';
import type { Playlist, Track } from '../types';
import { ArtworkCollage } from './ArtworkCollage';
import { BottomSheet } from './BottomSheet';
import { Input } from './Input';
import { PillButton } from './PillButton';

interface Props {
  visible: boolean;
  track?: Track | null;
  tracks?: Track[] | null;
  onClose: () => void;
  onDone?: () => void;
}

export function AddToPlaylistSheet({ visible, track, tracks, onClose, onDone }: Props) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [activePlaylistIds, setActivePlaylistIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const allPl = await listPlaylists();
      setPlaylists(allPl);

      // If we have a single track, check which playlists it belongs to
      if (track) {
        const { data: trackData } = await supabase
          .from('tracks')
          .select('id')
          .match({ source: track.source, source_id: track.sourceId })
          .maybeSingle();

        if (trackData) {
          const { data: ptData } = await supabase
            .from('playlist_tracks')
            .select('playlist_id')
            .eq('track_id', trackData.id);

          const activeIds = new Set((ptData ?? []).map((r) => r.playlist_id));
          setActivePlaylistIds(activeIds);
        }
      } else {
        setActivePlaylistIds(new Set());
      }
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, [track]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const togglePlaylistAssociation = async (playlistId: string) => {
    if (!track && (!tracks || tracks.length === 0)) return;

    // If it's multiple tracks, we just perform standard batch add (no toggle)
    if (tracks && tracks.length > 0) {
      try {
        await addTracksToPlaylist(playlistId, tracks);
        hapticNotification();
        onDone?.();
        onClose();
      } catch (e: any) {
        Alert.alert('Error', e?.message ?? 'Could not add to playlist.');
      }
      return;
    }

    if (!track) return;
    const isAdded = activePlaylistIds.has(playlistId);

    try {
      if (isAdded) {
        // Remove track from playlist
        const { data: trackData } = await supabase
          .from('tracks')
          .select('id')
          .match({ source: track.source, source_id: track.sourceId })
          .maybeSingle();

        if (trackData) {
          const { error } = await supabase
            .from('playlist_tracks')
            .delete()
            .match({ playlist_id: playlistId, track_id: trackData.id });
          
          if (error) throw error;
          
          setActivePlaylistIds((prev) => {
            const next = new Set(prev);
            next.delete(playlistId);
            return next;
          });
          hapticNotification();
          onDone?.();
        }
      } else {
        // Add track to playlist
        await addTrackToPlaylist(playlistId, track);
        setActivePlaylistIds((prev) => {
          const next = new Set(prev);
          next.add(playlistId);
          return next;
        });
        hapticNotification();
        onDone?.();
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not update playlist.');
    }
  };

  const createAndAdd = async () => {
    if (!newName.trim() || (!track && (!tracks || tracks.length === 0))) return;
    setCreating(true);
    try {
      const pl = await createPlaylist(newName.trim());
      setNewName('');
      
      // If we have a single track, add it to the newly created playlist
      if (track) {
        await addTrackToPlaylist(pl.id, track);
        setActivePlaylistIds((prev) => {
          const next = new Set(prev);
          next.add(pl.id);
          return next;
        });
        hapticNotification();
        onDone?.();
      } else if (tracks && tracks.length > 0) {
        // For multiple tracks, add them in batch
        await addTracksToPlaylist(pl.id, tracks);
        hapticNotification();
        onDone?.();
        onClose();
      }
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
        <ActivityIndicator color={colors.text} style={{ marginVertical: 24 }} />
      ) : (
        <ScrollView style={{ maxHeight: 320 }}>
          {playlists.map((pl) => {
            const isAssociated = activePlaylistIds.has(pl.id);
            return (
              <Pressable
                key={pl.id}
                onPress={() => togglePlaylistAssociation(pl.id)}
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
                  name={isAssociated ? 'checkmark-circle' : 'chevron-forward'}
                  size={isAssociated ? 20 : 16}
                  color={isAssociated ? colors.text : colors.textTertiary}
                />
              </Pressable>
            );
          })}
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
