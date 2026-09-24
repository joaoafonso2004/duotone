import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  addTrackToPlaylist,
  addTracksToPlaylist,
  createPlaylist,
  removeTrackFromPlaylist,
} from '../api/playlists';
import { supabase } from '../lib/supabase';
import { usePlaylists } from '../state/playlists';
import { hapticNotification } from '../lib/haptics';
import { colors, radii, spacing, type } from '../theme';
import type { Playlist, Track } from '../types';
import { ArtworkCollage } from './ArtworkCollage';
import { BottomSheet, BottomSheetScrollView } from './BottomSheet';
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
  /** O id da faixa no catálogo, lido ao abrir: tirar não volta a perguntá-lo. */
  const trackIdRef = useRef<string | null>(null);
  /** Playlists com uma mudança a caminho do servidor: um segundo toque espera. */
  const aMudar = useRef(new Set<string>());
  const marcar = (playlistId: string, dentro: boolean) => setActivePlaylistIds((prev) => {
    const next = new Set(prev);
    if (dentro) next.add(playlistId); else next.delete(playlistId);
    return next;
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Pela store, e não por uma chamada só desta folha. Abrir isto de dentro
      // do ecrã de Playlists pedia a MESMA lista uma segunda vez, com a
      // primeira ainda quente. A store devolve o que tem e só vai à rede se
      // estiver velha -- ver `state/playlists.ts`.
      await usePlaylists.getState().carregar();
      const allPl = usePlaylists.getState().items;
      setPlaylists(allPl);

      // If we have a single track, check which playlists it belongs to
      trackIdRef.current = null;
      if (track) {
        const { data: trackData } = await supabase
          .from('tracks')
          .select('id')
          .match({ source: track.source, source_id: track.sourceId })
          .maybeSingle();

        if (trackData) {
          trackIdRef.current = trackData.id;
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

    if (!track || aMudar.current.has(playlistId)) return;
    const isAdded = activePlaylistIds.has(playlistId);
    // Otimista (24/9): a marca muda no toque e volta atrás se o servidor
    // recusar. Esperava pelo pedido, e para tirar ainda voltava a perguntar o
    // id da faixa que já se tinha lido ao abrir a folha.
    aMudar.current.add(playlistId);
    marcar(playlistId, !isAdded);
    hapticNotification();
    try {
      if (isAdded) {
        let trackId = trackIdRef.current;
        if (!trackId) {
          const { data: trackData } = await supabase
            .from('tracks')
            .select('id')
            .match({ source: track.source, source_id: track.sourceId })
            .maybeSingle();
          trackId = trackData?.id ?? null;
        }
        // Pela API, que é quem avisa a descoberta de que a playlist mudou.
        if (trackId) await removeTrackFromPlaylist(playlistId, trackId);
      } else {
        trackIdRef.current = await addTrackToPlaylist(playlistId, track);
      }
      onDone?.();
    } catch (e: any) {
      marcar(playlistId, isAdded);
      Alert.alert('Error', e?.message ?? 'Could not update playlist.');
    } finally {
      aMudar.current.delete(playlistId);
    }
  };

  const createAndAdd = async () => {
    if (!newName.trim() || (!track && (!tracks || tracks.length === 0))) return;
    setCreating(true);
    try {
      const pl = await createPlaylist(newName.trim());
      // A store tem de saber da playlist nova: sem isto, o ecrã de Playlists
      // podia ficar até trinta segundos sem ela, que é o tempo que uma lista
      // se considera fresca.
      void usePlaylists.getState().carregar(true);
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
        <BottomSheetScrollView style={{ maxHeight: 320 }}>
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
        </BottomSheetScrollView>
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
