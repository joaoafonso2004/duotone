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
import * as Haptics from 'expo-haptics';
import {
  createPlaylist,
  deletePlaylist,
  listPlaylists,
  renamePlaylist,
} from '../api/playlists';
import { ArtworkCollage } from '../components/ArtworkCollage';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { colors, MINI_PLAYER_HEIGHT, radii, spacing, type } from '../theme';
import type { Playlist } from '../types';

export function PlaylistsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);

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

  const promptCreate = () => {
    Alert.prompt('New playlist', 'Give it a name.', async (name) => {
      if (!name?.trim()) return;
      try {
        const pl = await createPlaylist(name.trim());
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        load();
        navigation.navigate('PlaylistDetail', { id: pl.id, name: pl.name });
      } catch (e: any) {
        Alert.alert('Error', e?.message ?? 'Could not create the playlist.');
      }
    });
  };

  const showOptions = (pl: Playlist) => {
    Alert.alert(pl.name, undefined, [
      {
        text: 'Rename',
        onPress: () =>
          Alert.prompt('Rename playlist', undefined, async (name) => {
            if (!name?.trim()) return;
            try {
              await renamePlaylist(pl.id, name.trim());
              load();
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Could not rename.');
            }
          }),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete playlist', `Delete "${pl.name}"? This cannot be undone.`, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                try {
                  await deletePlaylist(pl.id);
                  load();
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

  const cardSize = (W - spacing.xl * 2 - spacing.lg) / 2;
  const bottomPad = 49 + insets.bottom + MINI_PLAYER_HEIGHT + 32;

  return (
    <Screen
      title="Playlists"
      subtitle={`${playlists.length} ${playlists.length === 1 ? 'playlist' : 'playlists'}`}
      right={
        <Pressable hitSlop={10} onPress={promptCreate} style={{ marginBottom: 4 }}>
          <Ionicons name="add-circle" size={30} color={colors.accent} />
        </Pressable>
      }
    >
      <Pressable
        onPress={() => navigation.navigate('ImportYouTube')}
        style={({ pressed }) => [
          styles.importRow,
          pressed && { backgroundColor: colors.surfacePressed },
        ]}
      >
        <View style={styles.importIcon}>
          <Ionicons name="logo-youtube" size={16} color={colors.youtube} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.body, { fontWeight: '600' }]}>
            Import a YouTube playlist
          </Text>
          <Text style={type.caption}>Paste a link, pick the tracks</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
      </Pressable>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />
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
          contentContainerStyle={{ gap: spacing.lg, paddingBottom: bottomPad, paddingTop: spacing.sm }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                navigation.navigate('PlaylistDetail', {
                  id: item.id,
                  name: item.name,
                })
              }
              onLongPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                showOptions(item);
              }}
              style={({ pressed }) => [{ width: cardSize }, pressed && { opacity: 0.8 }]}
            >
              <ArtworkCollage artworks={item.artworks} size={cardSize} />
              <Text numberOfLines={1} style={[type.headline, { marginTop: 8 }]}>
                {item.name}
              </Text>
              <Text style={type.caption}>
                {item.trackCount} {item.trackCount === 1 ? 'track' : 'tracks'}
              </Text>
            </Pressable>
          )}
        />
      )}
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
});
