import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLibrary, removeFromLibrary } from '../api/library';
import { AddToPlaylistSheet } from '../components/AddToPlaylistSheet';
import { EmptyState } from '../components/EmptyState';
import { PillButton } from '../components/PillButton';
import { Screen } from '../components/Screen';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { TrackRow } from '../components/TrackRow';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { usePlayer } from '../state/player';
import { colors, MINI_PLAYER_HEIGHT, spacing } from '../theme';
import type { Track } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'LibraryGroup'>;

/** Detalhe de um álbum ou artista (vista sobre as faixas guardadas). */
export function LibraryGroupScreen({ route, navigation }: Props) {
  const { type, name } = route.params;
  const insets = useSafeAreaInsets();
  const playTrack = usePlayer((s) => s.playTrack);
  const current = usePlayer((s) => s.current);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionTrack, setActionTrack] = useState<Track | null>(null);
  const [playlistTrack, setPlaylistTrack] = useState<Track | null>(null);

  const load = useCallback(async () => {
    try {
      const all = await getLibrary();
      setTracks(
        all.filter((t) =>
          type === 'album'
            ? t.album === name
            : (t.artist ?? 'Unknown artist') === name
        )
      );
    } catch {
      // ignorar
    } finally {
      setLoading(false);
    }
  }, [type, name]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const bottomPad = 49 + insets.bottom + MINI_PLAYER_HEIGHT + 32;

  return (
    <Screen
      title={name}
      subtitle={`${type === 'album' ? 'Album' : 'Artist'} · ${tracks.length} ${
        tracks.length === 1 ? 'song' : 'songs'
      }`}
      onBack={() => navigation.goBack()}
    >
      {tracks.length > 0 ? (
        <View style={{ flexDirection: 'row', paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
          <PillButton
            label="Play all"
            small
            onPress={() => playTrack(tracks[0], tracks)}
          />
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />
      ) : tracks.length === 0 ? (
        <EmptyState
          icon="musical-notes-outline"
          title="Nothing here"
          subtitle="These songs may have been removed from your library."
        />
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={(t) => t.id ?? `${t.source}:${t.sourceId}`}
          contentContainerStyle={{ paddingBottom: bottomPad }}
          renderItem={({ item }) => (
            <TrackRow
              track={item}
              active={
                current?.source === item.source &&
                current?.sourceId === item.sourceId
              }
              onPress={() => playTrack(item, tracks)}
              onAction={() => setActionTrack(item)}
            />
          )}
        />
      )}

      <TrackActionsSheet
        visible={!!actionTrack}
        track={actionTrack}
        onClose={() => setActionTrack(null)}
        actions={[
          {
            icon: 'list-outline',
            label: 'Add to playlist…',
            onPress: () => {
              const t = actionTrack;
              setActionTrack(null);
              setPlaylistTrack(t);
            },
          },
          {
            icon: 'trash-outline',
            label: 'Remove from Library',
            destructive: true,
            onPress: async () => {
              const t = actionTrack;
              setActionTrack(null);
              if (!t?.id) return;
              try {
                await removeFromLibrary(t.id);
                load();
              } catch (e: any) {
                Alert.alert('Error', e?.message ?? 'Could not remove the track.');
              }
            },
          },
        ]}
      />

      <AddToPlaylistSheet
        visible={!!playlistTrack}
        track={playlistTrack}
        onClose={() => setPlaylistTrack(null)}
      />
    </Screen>
  );
}
