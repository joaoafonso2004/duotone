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
import { fetchYouTubePlaylistById, YtPlaylistImport } from '../api/youtube';
import { createPlaylist, addTracksToPlaylist } from '../api/playlists';
import { usePlayer } from '../state/player';
import { colors, spacing, type, radii, gradients } from '../theme';
import { BottomSheet } from './BottomSheet';
import { TrackRow } from './TrackRow';
import { hapticNotification } from '../lib/haptics';
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
  const [data, setData] = useState<YtPlaylistImport | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const playTrack = usePlayer((s) => s.playTrack);

  useEffect(() => {
    if (visible && playlistId) {
      setLoading(true);
      setData(null);
      fetchYouTubePlaylistById(playlistId)
        .then((res) => setData(res))
        .catch((err) => {
          Alert.alert('Error', err?.message ?? 'Could not load playlist items.');
          onClose();
        })
        .finally(() => setLoading(false));
    }
  }, [visible, playlistId]);

  const playlistTracks = (): Track[] => {
    if (!data) return [];
    return data.items.map((i) => ({
      source: 'youtube' as const,
      sourceId: i.videoId,
      title: i.title,
      artist: i.channel || null,
      album: null,
      artworkUrl: i.thumbnail,
      durationSeconds: null,
    }));
  };

  const handlePlay = () => {
    const tracks = playlistTracks();
    if (tracks.length === 0) return;
    playTrack(tracks[0], tracks);
    onClose();
  };

  const handleSave = async () => {
    if (!data || saving) return;
    const tracks = playlistTracks();
    if (tracks.length === 0) return;

    setSaving(true);
    try {
      // Create local playlist
      const pl = await createPlaylist(data.title);
      // Import tracks
      await addTracksToPlaylist(pl.id, tracks);
      hapticNotification();
      Alert.alert(
        'Success',
        `Playlist "${data.title}" saved locally with ${tracks.length} tracks!`
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
            {playlistTitle ?? 'YouTube Playlist'}
          </Text>
          <Text style={type.caption}>YouTube Recommendation</Text>
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
                colors={gradients.aurora}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.btnGradient}
              >
                <Ionicons name="play" size={18} color={colors.bg} />
                <Text style={styles.btnTextPlay}>Play</Text>
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
            TRACKS PREVIEW ({data?.items.length ?? 0})
          </Text>

          <FlatList
            data={playlistTracks()}
            keyExtractor={(item, index) => `${item.sourceId}-${index}`}
            style={styles.list}
            contentContainerStyle={{ paddingBottom: 40 }}
            renderItem={({ item }) => (
              <TrackRow
                track={item}
                onPress={() => playTrack(item, playlistTracks())}
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
