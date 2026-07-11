import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { fetchYouTubePlaylistById } from '../api/youtube';
import {
  createPlaylist,
  addTracksToPlaylist,
  getPlaylistName,
  getPlaylistTracks,
  importSharedPlaylist,
} from '../api/playlists';
import { usePlayer } from '../state/player';
import { colors, spacing, type, radii, gradients } from '../theme';
import { useTheme } from '../state/theme';
import { BottomSheet } from './BottomSheet';
import { TrackRow } from './TrackRow';
import { hapticNotification } from '../lib/haptics';
import { extractArtist } from '../lib/artistName';
import type { Track } from '../types';

interface Props {
  visible: boolean;
  playlistId: string | null;
  playlistTitle: string | null;
  playlistArtwork: string | null;
  onClose: () => void;
  onImportDone?: () => void;
}

export function YtPlaylistRecommendationSheet({
  visible,
  playlistId,
  playlistTitle,
  playlistArtwork,
  onClose,
  onImportDone,
}: Props) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loadedTitle, setLoadedTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const playTrack = usePlayer((s) => s.playTrack);
  const theme = useTheme((s) => s.theme);

  // shared_items.playlist_id tanto pode ser um ID de playlist do YOUTUBE
  // (partilha via pesquisa) como o UUID de uma playlist INTERNA do Duotone
  // (partilha das playlists próprias). Mandar um UUID à YouTube Data API dava
  // "400 Invalid Value" — cada tipo tem o seu caminho de carregamento/import.
  const isInternalPlaylist = !!playlistId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(playlistId);

  useEffect(() => {
    if (!visible || !playlistId) return;
    setLoading(true);
    setTracks([]);
    setLoadedTitle(null);

    const load = async (): Promise<void> => {
      if (isInternalPlaylist) {
        // Playlist interna partilhada — lê do Supabase (exige as políticas
        // de supabase/shared-playlists-read.sql para o destinatário).
        const [name, pts] = await Promise.all([
          getPlaylistName(playlistId),
          getPlaylistTracks(playlistId),
        ]);
        if (pts.length === 0) {
          throw new Error(
            name
              ? 'A playlist partilhada está vazia.'
              : 'Sem acesso à playlist partilhada — corre a migração shared-playlists-read.sql no Supabase.'
          );
        }
        setLoadedTitle(name);
        setTracks(pts);
        return;
      }
      const res = await fetchYouTubePlaylistById(playlistId);
      setLoadedTitle(res.title);
      setTracks(
        res.items.map((i) => ({
          source: 'youtube' as const,
          sourceId: i.videoId,
          title: i.title,
          artist: extractArtist(i.title, i.channel || null),
          album: null,
          artworkUrl: i.thumbnail,
          durationSeconds: null,
        }))
      );
    };

    load()
      .catch((err) => {
        Alert.alert('Error', err?.message ?? 'Could not load playlist items.');
        onClose();
      })
      .finally(() => setLoading(false));
  }, [visible, playlistId]);

  const handlePlay = () => {
    if (tracks.length === 0) return;
    playTrack(tracks[0], tracks, true);
    onClose();
  };

  const handleSave = async () => {
    if (saving || tracks.length === 0) return;
    setSaving(true);
    try {
      const name = loadedTitle ?? playlistTitle ?? 'Playlist';
      if (isInternalPlaylist && playlistId) {
        // Copia a playlist partilhada (nome + faixas) para as do utilizador
        await importSharedPlaylist(playlistId);
      } else {
        const pl = await createPlaylist(name);
        await addTracksToPlaylist(pl.id, tracks);
      }
      hapticNotification();
      Alert.alert(
        'Success',
        `Playlist "${name}" saved locally with ${tracks.length} tracks!`
      );
      onImportDone?.();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not save playlist.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.header}>
        {playlistArtwork ? (
          <Image source={{ uri: playlistArtwork }} style={styles.art} />
        ) : (
          <View style={[styles.art, styles.artFallback]}>
            <Ionicons name="albums" size={32} color={colors.textTertiary} />
          </View>
        )}
        <View style={styles.meta}>
          <Text numberOfLines={2} style={type.title}>
            {loadedTitle ?? playlistTitle ?? 'Playlist'}
          </Text>
          <Text style={type.caption}>
            {isInternalPlaylist ? 'Playlist partilhada' : 'YouTube Recommendation'}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.text} />
          <Text style={[type.caption, { marginTop: spacing.sm }]}>Loading tracks...</Text>
        </View>
      ) : (
        <>
          <View style={styles.actions}>
            <Pressable style={styles.btnPlay} onPress={handlePlay}>
              <LinearGradient
                colors={theme.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.btnGradient}
              >
                <Ionicons name="play" size={18} color={theme.textColorOnGradient} />
                <Text style={[styles.btnTextPlay, { color: theme.textColorOnGradient }]}>Play</Text>
              </LinearGradient>
            </Pressable>

            <Pressable style={styles.btnSave} onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <>
                  <Ionicons name="download-outline" size={18} color={colors.text} />
                  <Text style={styles.btnTextSave}>Save Playlist</Text>
                </>
              )}
            </Pressable>
          </View>

          <Text style={[type.micro, styles.previewTitle]}>
            TRACKS PREVIEW ({tracks.length})
          </Text>

          <FlatList
            data={tracks}
            keyExtractor={(item, index) => `${item.sourceId}-${index}`}
            style={styles.list}
            contentContainerStyle={{ paddingBottom: 40 }}
            renderItem={({ item }) => (
              <TrackRow
                track={item}
                onPress={() => playTrack(item, tracks, true)}
              />
            )}
          />
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  art: {
    width: 72,
    height: 72,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  artFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    flex: 1,
    gap: 4,
  },
  loader: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  btnPlay: {
    flex: 1,
    height: 44,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  btnGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnSave: {
    flex: 1,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnTextPlay: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.bg,
  },
  btnTextSave: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  previewTitle: {
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    letterSpacing: 0.5,
  },
  list: {
    maxHeight: 220,
  },
});
