import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createPlaylist,
  deletePlaylist,
  listPlaylists,
  renamePlaylist,
  importSharedPlaylist,
} from '../api/playlists';
import { ArtworkCollage } from '../components/ArtworkCollage';
import { BottomSheet } from '../components/BottomSheet';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { EmptyState } from '../components/EmptyState';
import { PromptSheet } from '../components/PromptSheet';
import { Screen } from '../components/Screen';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { hapticImpact, hapticNotification, ImpactFeedbackStyle } from '../lib/haptics';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { colors, MINI_PLAYER_HEIGHT, radii, spacing, type } from '../theme';
import { useTheme } from '../state/theme';
import type { Playlist } from '../types';

export function PlaylistsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const theme = useTheme((s) => s.theme);

  const [createOpen, setCreateOpen] = useState(false);
  const [optionsFor, setOptionsFor] = useState<Playlist | null>(null);
  const [renameFor, setRenameFor] = useState<Playlist | null>(null);
  const [deleteFor, setDeleteFor] = useState<Playlist | null>(null);
  const [importSharedOpen, setImportSharedOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const doImportShared = async (input: string) => {
    let id = input.trim();
    if (id.includes('id=')) {
      const parts = id.split('id=');
      id = parts[parts.length - 1];
    }
    if (!id) {
      Alert.alert('Error', 'Please enter a valid playlist ID or shared link.');
      return;
    }
    setBusy(true);
    try {
      const newPlId = await importSharedPlaylist(id);
      hapticNotification();
      setImportSharedOpen(false);
      load();
      navigation.navigate('PlaylistDetail', { id: newPlId, name: 'Shared Playlist' });
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not import the shared playlist.');
    } finally {
      setBusy(false);
    }
  };

  const load = useCallback(async () => {
    try {
      setPlaylists(await listPlaylists());
    } catch {
      // ignorar
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const doCreate = async (name: string) => {
    setBusy(true);
    try {
      const pl = await createPlaylist(name);
      hapticNotification();
      setCreateOpen(false);
      load();
      navigation.navigate('PlaylistDetail', { id: pl.id, name: pl.name });
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not create the playlist.');
    } finally {
      setBusy(false);
    }
  };

  const doRename = async (name: string) => {
    if (!renameFor) return;
    setBusy(true);
    try {
      await renamePlaylist(renameFor.id, name);
      hapticNotification();
      setRenameFor(null);
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not rename the playlist.');
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!deleteFor) return;
    setBusy(true);
    try {
      await deletePlaylist(deleteFor.id);
      hapticNotification();
      setDeleteFor(null);
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not delete the playlist.');
    } finally {
      setBusy(false);
    }
  };

  const cardSize = (W - spacing.xl * 2 - spacing.lg) / 2;
  const bottomPad = 49 + insets.bottom + MINI_PLAYER_HEIGHT + 32;

  return (
    <Screen
      title="Playlists"
      subtitle={`${playlists.length} ${playlists.length === 1 ? 'playlist' : 'playlists'}`}
      right={
        <Pressable
          hitSlop={10}
          onPress={() => setAddMenuOpen(true)}
          style={{ marginBottom: 4 }}
        >
          <Ionicons name="add-circle" size={30} color={theme.color} />
        </Pressable>
      }
    >

      {loading ? (
        <ActivityIndicator color={theme.color} style={{ marginTop: 48 }} />
      ) : playlists.length === 0 ? (
        <EmptyState
          icon="albums-outline"
          title="No playlists yet"
          subtitle="Create a playlist or import one from YouTube — tracks from both sources live side by side."
        />
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.lg, paddingHorizontal: spacing.xl }}
          contentContainerStyle={{
            gap: spacing.lg,
            paddingBottom: bottomPad,
            paddingTop: spacing.sm,
          }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                navigation.navigate('PlaylistDetail', {
                  id: item.id,
                  name: item.name,
                })
              }
              onLongPress={() => {
                hapticImpact(ImpactFeedbackStyle.Medium);
                setOptionsFor(item);
              }}
              style={({ pressed }) => [
                { width: cardSize },
                pressed && { opacity: 0.8 },
              ]}
            >
              <ArtworkCollage artworks={item.artworks} size={cardSize} />
              <View style={styles.cardTitleRow}>
                <Text numberOfLines={1} style={[type.headline, { flex: 1 }]}>
                  {item.name}
                </Text>
                <Pressable
                  hitSlop={8}
                  onPress={() => setOptionsFor(item)}
                  style={{ padding: 2 }}
                >
                  <Ionicons
                    name="ellipsis-horizontal"
                    size={16}
                    color={colors.textTertiary}
                  />
                </Pressable>
              </View>
              <Text style={type.caption}>
                {item.trackCount} {item.trackCount === 1 ? 'track' : 'tracks'}
              </Text>
            </Pressable>
          )}
        />
      )}

      {/* opções da playlist (long-press ou •••) */}
      <TrackActionsSheet
        visible={!!optionsFor}
        track={null}
        onClose={() => setOptionsFor(null)}
        actions={[
          {
            icon: 'pencil-outline',
            label: 'Rename playlist',
            onPress: () => {
              const p = optionsFor;
              setOptionsFor(null);
              setRenameFor(p);
            },
          },
          {
            icon: 'trash-outline',
            label: 'Delete playlist',
            destructive: true,
            onPress: () => {
              const p = optionsFor;
              setOptionsFor(null);
              setDeleteFor(p);
            },
          },
        ]}
      />

      <PromptSheet
        visible={createOpen}
        title="New playlist"
        placeholder="Playlist name"
        submitLabel="Create"
        loading={busy}
        onClose={() => setCreateOpen(false)}
        onSubmit={doCreate}
      />

      <PromptSheet
        visible={importSharedOpen}
        title="Import Shared Playlist"
        placeholder="Paste link or playlist ID"
        submitLabel="Import"
        loading={busy}
        onClose={() => setImportSharedOpen(false)}
        onSubmit={doImportShared}
      />

      <PromptSheet
        visible={!!renameFor}
        title="Rename playlist"
        placeholder="Playlist name"
        initialValue={renameFor?.name}
        submitLabel="Rename"
        loading={busy}
        onClose={() => setRenameFor(null)}
        onSubmit={doRename}
      />

      <ConfirmSheet
        visible={!!deleteFor}
        title="Delete playlist"
        message={`"${deleteFor?.name ?? ''}" will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete playlist"
        destructive
        loading={busy}
        onClose={() => setDeleteFor(null)}
        onConfirm={doDelete}
      />

      <BottomSheet visible={addMenuOpen} onClose={() => setAddMenuOpen(false)}>
        <Text style={[type.title, { marginBottom: spacing.md }]}>
          Playlists
        </Text>
        
        <Pressable
          onPress={() => {
            setAddMenuOpen(false);
            setCreateOpen(true);
          }}
          style={({ pressed }) => [
            styles.menuOption,
            pressed && { backgroundColor: colors.surfacePressed }
          ]}
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.text} />
          <Text style={[type.body, { fontWeight: '600', marginLeft: 8 }]}>Create new playlist</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            setAddMenuOpen(false);
            navigation.navigate('ImportYouTube');
          }}
          style={({ pressed }) => [
            styles.menuOption,
            pressed && { backgroundColor: colors.surfacePressed }
          ]}
        >
          <Ionicons name="logo-youtube" size={20} color={colors.youtube} />
          <Text style={[type.body, { fontWeight: '600', marginLeft: 8 }]}>Import from YouTube</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            setAddMenuOpen(false);
            setImportSharedOpen(true);
          }}
          style={({ pressed }) => [
            styles.menuOption,
            pressed && { backgroundColor: colors.surfacePressed }
          ]}
        >
          <Ionicons name="share-social-outline" size={20} color={theme.color} />
          <Text style={[type.body, { fontWeight: '600', marginLeft: 8 }]}>Import shared playlist</Text>
        </Pressable>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  importRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  importIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.youtubeSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    marginVertical: 2,
  },
});
