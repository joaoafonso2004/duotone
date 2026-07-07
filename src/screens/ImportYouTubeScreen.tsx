import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useState } from 'react';
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
  addTracksToPlaylist,
  createPlaylist,
  listPlaylists,
} from '../api/playlists';
import { fetchYouTubePlaylist, YtPlaylistImport } from '../api/youtube';
import { ArtworkCollage } from '../components/ArtworkCollage';
import { BottomSheet } from '../components/BottomSheet';
import { EmptyState } from '../components/EmptyState';
import { Input } from '../components/Input';
import { PillButton } from '../components/PillButton';
import { Screen } from '../components/Screen';
import { hapticNotification } from '../lib/haptics';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { colors, radii, spacing, type } from '../theme';
import type { Playlist, Track } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ImportYouTube'>;

export function ImportYouTubeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<YtPlaylistImport | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  const fetchList = async () => {
    setLoading(true);
    setData(null);
    try {
      const result = await fetchYouTubePlaylist(url);
      setData(result);
      setSelected(new Set(result.items.map((i) => i.videoId)));
    } catch (e: any) {
      Alert.alert('Import', e?.message ?? 'Could not fetch the playlist.');
    } finally {
      setLoading(false);
    }
  };

  const toggle = (videoId: string) => {
    const next = new Set(selected);
    if (next.has(videoId)) next.delete(videoId);
    else next.add(videoId);
    setSelected(next);
  };

  const selectedTracks = (): Track[] =>
    (data?.items ?? [])
      .filter((i) => selected.has(i.videoId))
      .map((i) => ({
        source: 'youtube' as const,
        sourceId: i.videoId,
        title: i.title,
        artist: i.channel || null,
        album: null,
        artworkUrl: i.thumbnail,
        durationSeconds: null,
      }));

  const doImport = async (playlistId: string, playlistName: string) => {
    const items = selectedTracks();
    setImporting(true);
    try {
      await addTracksToPlaylist(playlistId, items);
      hapticNotification();
      Alert.alert(
        'Imported',
        `${items.length} ${items.length === 1 ? 'track' : 'tracks'} added to "${playlistName}".`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Import failed.');
    } finally {
      setImporting(false);
      setPickerOpen(false);
    }
  };

  const importToNew = async () => {
    if (!data) return;
    setImporting(true);
    try {
      const pl = await createPlaylist(data.title);
      await doImport(pl.id, pl.name);
    } catch (e: any) {
      setImporting(false);
      Alert.alert('Error', e?.message ?? 'Import failed.');
    }
  };

  const openPicker = async () => {
    try {
      setPlaylists(await listPlaylists());
      setPickerOpen(true);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not load playlists.');
    }
  };

  const count = selected.size;

  return (
    <Screen
      title="Import from YouTube"
      subtitle="Metadata only — playback stays on YouTube"
      onBack={() => navigation.goBack()}
    >
      <View style={styles.inputRow}>
        <Input
          icon="link-outline"
          placeholder="Paste a YouTube playlist link…"
          value={url}
          onChangeText={setUrl}
          onClear={() => setUrl('')}
          autoCapitalize="none"
          autoCorrect={false}
          containerStyle={{ flex: 1 }}
          returnKeyType="go"
          onSubmitEditing={fetchList}
        />
        <PillButton
          label="Fetch"
          small
          onPress={fetchList}
          loading={loading}
          disabled={!url.trim()}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />
      ) : !data ? (
        <EmptyState
          icon="logo-youtube"
          title="Paste a playlist link"
          subtitle={'Anything with "list=" works — e.g.\nyoutube.com/playlist?list=PL…'}
        />
      ) : (
        <>
          <View style={styles.listHeader}>
            <Text style={[type.headline, { flex: 1 }]} numberOfLines={1}>
              {data.title}
            </Text>
            <Pressable
              onPress={() =>
                setSelected(
                  count === data.items.length
                    ? new Set()
                    : new Set(data.items.map((i) => i.videoId))
                )
              }
            >
              <Text style={[type.caption, { color: colors.accent, fontWeight: '700' }]}>
                {count === data.items.length ? 'Deselect all' : 'Select all'}
              </Text>
            </Pressable>
          </View>

          <FlatList
            data={data.items}
            keyExtractor={(i) => i.videoId}
            contentContainerStyle={{ paddingBottom: 170 + insets.bottom }}
            renderItem={({ item }) => {
              const on = selected.has(item.videoId);
              return (
                <Pressable
                  onPress={() => toggle(item.videoId)}
                  style={({ pressed }) => [
                    styles.itemRow,
                    pressed && { backgroundColor: colors.surface },
                  ]}
                >
                  <Ionicons
                    name={on ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={on ? colors.accent : colors.textTertiary}
                  />
                  {item.thumbnail ? (
                    <Image
                      source={{ uri: item.thumbnail }}
                      style={styles.thumb}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.thumb, styles.thumbFallback]}>
                      <Ionicons
                        name="musical-notes"
                        size={14}
                        color={colors.textTertiary}
                      />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={2} style={[type.body, { fontSize: 14, fontWeight: '600' }]}>
                      {item.title}
                    </Text>
                    <Text numberOfLines={1} style={type.caption}>
                      {item.channel}
                    </Text>
                  </View>
                </Pressable>
              );
            }}
          />

          <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
            <PillButton
              label={`Import ${count} to new playlist`}
              onPress={importToNew}
              loading={importing}
              disabled={count === 0}
            />
            <PillButton
              label="Add to existing playlist…"
              variant="ghost"
              onPress={openPicker}
              disabled={count === 0 || importing}
            />
          </View>
        </>
      )}

      <BottomSheet visible={pickerOpen} onClose={() => setPickerOpen(false)}>
        <Text style={[type.title, { marginBottom: spacing.md }]}>
          Choose a playlist
        </Text>
        {playlists.length === 0 ? (
          <Text style={[type.caption, { textAlign: 'center', padding: 24 }]}>
            No playlists yet.
          </Text>
        ) : (
          playlists.map((pl) => (
            <Pressable
              key={pl.id}
              onPress={() => doImport(pl.id, pl.name)}
              style={({ pressed }) => [
                styles.pickerRow,
                pressed && { backgroundColor: colors.surfacePressed },
              ]}
            >
              <ArtworkCollage artworks={pl.artworks} size={40} />
              <Text style={[type.body, { fontWeight: '600', flex: 1 }]} numberOfLines={1}>
                {pl.name}
              </Text>
              <Text style={type.caption}>{pl.trackCount}</Text>
            </Pressable>
          ))
        )}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: 8,
  },
  thumb: {
    width: 71,
    height: 40,
    borderRadius: 6,
    backgroundColor: colors.surfaceHigh,
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.sm,
    backgroundColor: 'rgba(10,10,15,0.94)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.md,
  },
});
