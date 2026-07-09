import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFriendProfile, type FriendProfile } from '../api/social';
import { supabase } from '../lib/supabase';
import { Screen } from '../components/Screen';
import { colors, spacing, type as typography, radii } from '../theme';
import { useTheme } from '../state/theme';
import type { RootStackParamList } from '../navigation/RootNavigator';
import type { Playlist } from '../types';
import { AVATAR_GRADIENTS } from '../lib/avatarPrefs';
import { hapticSelection } from '../lib/haptics';
import { ArtworkCollage } from '../components/ArtworkCollage';

function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) return 'Offline';
  const diffMs = Date.now() - new Date(lastSeenAt).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 2) return 'Online';
  if (diffMins < 60) return `Ativo há ${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Ativo há ${diffHours}h`;
  return `Ativo há ${Math.floor(diffHours / 24)}d`;
}

export function FriendProfileScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'FriendProfile'>>();
  const { friendId } = route.params;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const theme = useTheme((s) => s.theme);
  const { width } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const prof = await getFriendProfile(friendId);
        setProfile(prof);

        // Fetch playlists owned by this friend
        const { data: plData, error: plError } = await supabase
          .from('playlists')
          .select('id, name, created_at, playlist_tracks (position, tracks (artwork_url))')
          .eq('owner_id', friendId)
          .order('created_at', { ascending: false });

        if (plError) throw plError;

        const mappedPls = (plData ?? []).map((row: any) => {
          const pts: any[] = [...(row.playlist_tracks ?? [])].sort(
            (a, b) => a.position - b.position
          );
          return {
            id: row.id,
            name: row.name,
            createdAt: row.created_at,
            trackCount: pts.length,
            artworks: pts
              .map((pt) => pt.tracks?.artwork_url)
              .filter(Boolean)
              .slice(0, 4),
          };
        });

        setPlaylists(mappedPls);
      } catch (err) {
        console.error('Error loading friend profile:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [friendId]);

  if (loading) {
    return (
      <Screen title="Profile" onBack={() => navigation.goBack()}>
        <View style={styles.center}>
          <ActivityIndicator color={theme.color} size="large" />
        </View>
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen title="Profile" onBack={() => navigation.goBack()}>
        <View style={styles.center}>
          <Text style={[typography.body, { color: colors.textSecondary }]}>
            Não foi possível carregar o perfil.
          </Text>
        </View>
      </Screen>
    );
  }

  const isOnline = profile.lastSeenAt
    ? Date.now() - new Date(profile.lastSeenAt).getTime() < 120 * 1000
    : false;

  // Render Friend Avatar
  const renderAvatar = () => {
    const url = profile.avatarUrl;
    if (url && url.startsWith('emoji:')) {
      const [, emoji, gradIdxStr] = url.split(':');
      const gradIdx = parseInt(gradIdxStr, 10);
      const grad = AVATAR_GRADIENTS[gradIdx] || AVATAR_GRADIENTS[0];
      return (
        <LinearGradient colors={grad} style={styles.avatarImg}>
          <Text style={styles.avatarEmoji}>{emoji}</Text>
        </LinearGradient>
      );
    }
    if (url) {
      return <Image source={{ uri: url }} style={styles.avatarImg} />;
    }
    return (
      <View style={[styles.avatarImg, styles.avatarFallback]}>
        <Text style={styles.avatarInitial}>{profile.name.charAt(0).toUpperCase()}</Text>
      </View>
    );
  };

  const handleStartChat = () => {
    hapticSelection();
    navigation.navigate('Social', { openChatWithFriendId: friendId });
  };

  return (
    <Screen title="" onBack={() => navigation.goBack()}>
      <FlatList
        data={playlists}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingBottom: insets.bottom + 120,
        }}
        ListHeaderComponent={
          <View style={styles.headerContainer}>
            {/* Banner/Avatar Container */}
            <View style={styles.avatarWrapper}>
              {renderAvatar()}
              {isOnline && <View style={styles.onlineBadge} />}
            </View>

            {/* Public Name */}
            <Text numberOfLines={1} style={styles.name}>
              {profile.name}
            </Text>

            {/* Username & Online Status */}
            <View style={styles.metaRow}>
              <Text style={styles.username}>@{profile.username}</Text>
              <Text style={styles.dotSeparator}>·</Text>
              <Text style={[styles.statusText, isOnline && styles.statusOnline]}>
                {formatLastSeen(profile.lastSeenAt)}
              </Text>
            </View>

            {/* Quick Action Button: Enviar Mensagem */}
            <Pressable
              onPress={handleStartChat}
              style={({ pressed }) => [
                styles.chatBtn,
                { backgroundColor: theme.color },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Ionicons name="chatbubble-ellipses" size={16} color={colors.bg} />
              <Text style={styles.chatBtnText}>Enviar Mensagem</Text>
            </Pressable>

            {/* Playlist Section Title */}
            <Text style={styles.sectionTitle}>
              PLAYLISTS ({playlists.length})
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              hapticSelection();
              navigation.navigate('PlaylistDetail', { id: item.id, name: item.name });
            }}
            style={({ pressed }) => [
              styles.playlistCard,
              pressed && { backgroundColor: colors.surfacePressed },
            ]}
          >
            <View style={styles.collageBox}>
              <ArtworkCollage artworks={item.artworks} size={64} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.playlistName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.playlistMeta}>
                {item.trackCount} {item.trackCount === 1 ? 'música' : 'músicas'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="albums-outline" size={32} color={colors.textTertiary} />
            <Text style={styles.emptyText}>Sem playlists criadas por este amigo.</Text>
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerContainer: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  avatarImg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallback: {
    backgroundColor: colors.surfaceHigh,
  },
  avatarEmoji: {
    fontSize: 48,
  },
  avatarInitial: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#30D158',
    borderWidth: 3,
    borderColor: '#0A0A0F',
  },
  name: {
    ...typography.largeTitle,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  username: {
    ...typography.body,
    color: colors.textSecondary,
  },
  dotSeparator: {
    color: colors.textTertiary,
  },
  statusText: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  statusOnline: {
    color: '#30D158',
    fontWeight: '600',
  },
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    marginTop: spacing.md,
  },
  chatBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.bg,
  },
  sectionTitle: {
    ...typography.micro,
    alignSelf: 'flex-start',
    marginTop: spacing.xl + spacing.xs,
    letterSpacing: 1.2,
  },
  playlistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  collageBox: {
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  playlistName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  playlistMeta: {
    ...typography.caption,
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: spacing.xs,
  },
  emptyText: {
    ...typography.caption,
    textAlign: 'center',
    color: colors.textTertiary,
  },
});
