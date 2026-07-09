import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getFriendships,
  getInboxItems,
  acceptFriendRequest,
  declineOrRemoveFriendship,
  sendFriendRequest,
  deleteInboxItem,
  type Friendship,
  type SharedItem,
} from '../api/social';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { TrackRow } from '../components/TrackRow';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { AddToPlaylistSheet } from '../components/AddToPlaylistSheet';
import { YtPlaylistRecommendationSheet } from '../components/YtPlaylistRecommendationSheet';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';
import { colors, radii, spacing, type as typography } from '../theme';
import { hapticNotification, hapticSelection } from '../lib/haptics';
import type { Track } from '../types';

export function SocialScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const playTrack = usePlayer((s) => s.playTrack);
  const playNext = usePlayer((s) => s.playNext);
  const addToQueue = usePlayer((s) => s.addToQueue);
  const current = usePlayer((s) => s.current);
  const theme = useTheme((s) => s.theme);

  const [activeTab, setActiveTab] = useState<'inbox' | 'friends' | 'add'>('inbox');
  const [inboxItems, setInboxItems] = useState<SharedItem[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingFriends, setLoadingFriends] = useState(true);

  // Search & add states
  const [searchUsername, setSearchUsername] = useState('');
  const [sendingRequest, setSendingRequest] = useState(false);

  // Track actions sheet states
  const [actionTrack, setActionTrack] = useState<Track | null>(null);
  const [playlistTrack, setPlaylistTrack] = useState<Track | null>(null);

  // Shared playlist sheet preview state
  const [selectedYtPlaylistId, setSelectedYtPlaylistId] = useState<string | null>(null);

  const loadInbox = useCallback(async () => {
    try {
      const items = await getInboxItems();
      setInboxItems(items);
    } catch {
      // ignore
    } finally {
      setLoadingInbox(false);
    }
  }, []);

  const loadFriends = useCallback(async () => {
    try {
      const list = await getFriendships();
      setFriendships(list);
    } catch {
      // ignore
    } finally {
      setLoadingFriends(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadInbox();
      loadFriends();
    }, [loadInbox, loadFriends])
  );

  const handleSendRequest = async () => {
    const uname = searchUsername.trim();
    if (!uname) return;
    setSendingRequest(true);
    Keyboard.dismiss();
    try {
      await sendFriendRequest(uname);
      hapticNotification();
      Alert.alert('Sucesso', `Pedido de amizade enviado para @${uname}!`);
      setSearchUsername('');
      loadFriends();
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível enviar o pedido.');
    } finally {
      setSendingRequest(false);
    }
  };

  const handleAcceptRequest = async (friendId: string) => {
    hapticSelection();
    try {
      await acceptFriendRequest(friendId);
      loadFriends();
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Falha ao aceitar pedido.');
    }
  };

  const handleRemoveFriend = async (friendId: string, isPending: boolean) => {
    Alert.alert(
      isPending ? 'Cancelar Pedido' : 'Remover Amigo',
      isPending
        ? 'Tem a certeza que deseja cancelar este pedido de amizade?'
        : 'Tem a certeza que deseja remover este utilizador da sua lista de amigos?',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Confirmar',
          style: 'destructive',
          onPress: async () => {
            hapticSelection();
            try {
              await declineOrRemoveFriendship(friendId);
              loadFriends();
            } catch (e: any) {
              Alert.alert('Erro', e?.message ?? 'Falha ao remover.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteInboxItem = async (itemId: string) => {
    hapticSelection();
    try {
      await deleteInboxItem(itemId);
      loadInbox();
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Falha ao apagar partilha.');
    }
  };

  const activeFriends = friendships.filter((f) => f.status === 'accepted');
  const pendingRequests = friendships.filter((f) => f.status === 'pending');

  const bottomPad = insets.bottom + 84 + 20;

  return (
    <Screen title="Social" onBack={() => navigation.goBack()}>
      {/* Sub-Tabs Switch */}
      <View style={styles.tabsContainer}>
        <Pressable
          style={[styles.tabChip, activeTab === 'inbox' && styles.tabChipActive]}
          onPress={() => setActiveTab('inbox')}
        >
          <Text style={[styles.tabLabel, activeTab === 'inbox' && { color: colors.text }]}>
            Caixa de Entrada
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabChip, activeTab === 'friends' && styles.tabChipActive]}
          onPress={() => setActiveTab('friends')}
        >
          <Text style={[styles.tabLabel, activeTab === 'friends' && { color: colors.text }]}>
            Amigos {pendingRequests.length > 0 && `(${pendingRequests.length})`}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabChip, activeTab === 'add' && styles.tabChipActive]}
          onPress={() => setActiveTab('add')}
        >
          <Text style={[styles.tabLabel, activeTab === 'add' && { color: colors.text }]}>
            Adicionar
          </Text>
        </Pressable>
      </View>

      {/* Tab Contents */}
      {activeTab === 'inbox' && (
        <>
          {loadingInbox ? (
            <ActivityIndicator color={theme.color} style={{ marginTop: 48 }} />
          ) : inboxItems.length === 0 ? (
            <EmptyState
              icon="mail-unread-outline"
              title="Inbox Vazia"
              subtitle="Quando os teus amigos partilharem músicas ou playlists, elas aparecem aqui!"
            />
          ) : (
            <FlatList
              data={inboxItems}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: bottomPad }}
              renderItem={({ item }) => (
                <View style={styles.shareCard}>
                  {/* Sender Details Header */}
                  <View style={styles.shareHeader}>
                    {item.sender.avatarUrl ? (
                      <Image source={{ uri: item.sender.avatarUrl }} style={styles.senderAvatar} />
                    ) : (
                      <View style={[styles.senderAvatar, styles.avatarFallback]}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textSecondary }}>
                          {item.sender.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[typography.body, { fontWeight: '700' }]}>{item.sender.name}</Text>
                      <Text style={[typography.caption, { fontSize: 11 }]}>@{item.sender.username}</Text>
                    </View>
                    <Pressable onPress={() => handleDeleteInboxItem(item.id)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color={colors.textTertiary} />
                    </Pressable>
                  </View>

                  {/* Caption Message if exists */}
                  {item.message ? (
                    <View style={styles.messageBubble}>
                      <Text style={styles.messageText}>"{item.message}"</Text>
                    </View>
                  ) : null}

                  {/* Shared Item Box */}
                  {item.itemType === 'track' && item.trackData && (
                    <View style={styles.innerTrackBox}>
                      <TrackRow
                        track={item.trackData}
                        active={
                          current?.source === item.trackData.source &&
                          current?.sourceId === item.trackData.sourceId
                        }
                        onPress={() => playTrack(item.trackData!, [item.trackData!])}
                        onAction={() => setActionTrack(item.trackData!)}
                      />
                    </View>
                  )}

                  {item.itemType === 'playlist' && item.playlistId && (
                    <Pressable
                      onPress={() => {
                        hapticSelection();
                        setSelectedYtPlaylistId(item.playlistId);
                      }}
                      style={({ pressed }) => [
                        styles.innerPlaylistBox,
                        pressed && { backgroundColor: colors.surfacePressed },
                      ]}
                    >
                      <View style={[styles.playlistIconBox, { backgroundColor: theme.soft }]}>
                        <Ionicons name="albums-outline" size={24} color={theme.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[typography.body, { fontWeight: '600' }]} numberOfLines={1}>
                          Playlist Partilhada
                        </Text>
                        <Text style={typography.caption}>Toca para abrir e importar</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                    </Pressable>
                  )}
                </View>
              )}
            />
          )}
        </>
      )}

      {activeTab === 'friends' && (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: bottomPad }}
          showsVerticalScrollIndicator={false}
        >
          {loadingFriends ? (
            <ActivityIndicator color={theme.color} style={{ marginTop: 24 }} />
          ) : friendships.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title="Sem Amigos"
              subtitle="Vai à aba 'Adicionar' e pesquisa o username de uma conta para adicionares amigos."
            />
          ) : (
            <View style={{ gap: spacing.lg }}>
              {/* Pending Requests */}
              {pendingRequests.length > 0 && (
                <View>
                  <Text style={[typography.micro, { marginBottom: spacing.sm }]}>PEDIDOS PENDENTES</Text>
                  <View style={styles.listCard}>
                    {pendingRequests.map((req) => (
                      <View key={req.friendId} style={styles.friendRow}>
                        {req.avatarUrl ? (
                          <Image source={{ uri: req.avatarUrl }} style={styles.friendAvatar} />
                        ) : (
                          <View style={[styles.friendAvatar, styles.avatarFallback]}>
                            <Text style={{ fontSize: 13, color: colors.textSecondary }}>{req.name.charAt(0).toUpperCase()}</Text>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={[typography.body, { fontWeight: '700' }]}>{req.name}</Text>
                          <Text style={typography.caption}>@{req.username}</Text>
                        </View>
                        {req.isSender ? (
                          <Pressable
                            onPress={() => handleRemoveFriend(req.friendId, true)}
                            style={styles.actionBtnSmall}
                          >
                            <Text style={styles.actionBtnSmallText}>Cancelar</Text>
                          </Pressable>
                        ) : (
                          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                            <Pressable
                              onPress={() => handleAcceptRequest(req.friendId)}
                              style={[styles.actionBtnSmall, { backgroundColor: theme.color }]}
                            >
                              <Text style={[styles.actionBtnSmallText, { color: colors.bg }]}>Aceitar</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => handleRemoveFriend(req.friendId, true)}
                              style={styles.actionBtnSmall}
                            >
                              <Text style={styles.actionBtnSmallText}>Recusar</Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Active Friends */}
              {activeFriends.length > 0 && (
                <View>
                  <Text style={[typography.micro, { marginBottom: spacing.sm }]}>OS MEUS AMIGOS</Text>
                  <View style={styles.listCard}>
                    {activeFriends.map((friend) => {
                      const isOnline = friend.lastSeenAt
                        ? (Date.now() - new Date(friend.lastSeenAt).getTime()) < 3 * 60 * 1000
                        : false;

                      return (
                        <View key={friend.friendId} style={styles.friendRow}>
                          <View style={styles.avatarContainer}>
                            {friend.avatarUrl ? (
                              <Image source={{ uri: friend.avatarUrl }} style={styles.friendAvatar} />
                            ) : (
                              <View style={[styles.friendAvatar, styles.avatarFallback]}>
                                <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                                  {friend.name.charAt(0).toUpperCase()}
                                </Text>
                              </View>
                            )}
                            {isOnline && <View style={styles.onlineBadge} />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[typography.body, { fontWeight: '700' }]}>{friend.name}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Text style={typography.caption}>@{friend.username}</Text>
                              {isOnline && (
                                <>
                                  <Text style={[typography.caption, { color: colors.textTertiary }]}>·</Text>
                                  <Text style={[typography.caption, { color: '#30D158', fontWeight: '600' }]}>
                                    Online
                                  </Text>
                                </>
                              )}
                            </View>
                          </View>
                          <Pressable
                            onPress={() => handleRemoveFriend(friend.friendId, false)}
                            hitSlop={6}
                          >
                            <Ionicons name="person-remove-outline" size={18} color={colors.danger} />
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {activeFriends.length === 0 && pendingRequests.length > 0 && (
                <Text style={styles.hintText}>Começa a adicionar amigos para veres a tua lista completa!</Text>
              )}
            </View>
          )}
        </ScrollView>
      )}

      {activeTab === 'add' && (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[typography.micro, { marginBottom: spacing.sm }]}>ADICIONAR POR USERNAME</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            <View style={{ flex: 1, position: 'relative' }}>
              <TextInput
                value={searchUsername}
                onChangeText={setSearchUsername}
                placeholder="Username do amigo..."
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.searchInput}
                onSubmitEditing={handleSendRequest}
              />
              {searchUsername.length > 0 && (
                <Pressable
                  onPress={() => setSearchUsername('')}
                  style={styles.searchClearBtn}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={handleSendRequest}
              disabled={sendingRequest || !searchUsername.trim()}
              style={({ pressed }) => [
                styles.sendRequestBtn,
                { backgroundColor: theme.color },
                (sendingRequest || !searchUsername.trim()) && { opacity: 0.4 },
                pressed && { opacity: 0.8 },
              ]}
            >
              {sendingRequest ? (
                <ActivityIndicator color={colors.bg} size="small" />
              ) : (
                <Text style={[typography.body, { color: colors.bg, fontWeight: '700' }]}>Enviar</Text>
              )}
            </Pressable>
          </View>
          <Text style={styles.addFriendHint}>
            Insere o nome de utilizador (username) do teu amigo para lhe enviares um pedido de amizade. Podem ver o vosso username nas Definições ou no topo do vosso Perfil.
          </Text>
        </ScrollView>
      )}

      {/* Sheets Integration */}
      <TrackActionsSheet
        visible={!!actionTrack}
        track={actionTrack}
        onClose={() => setActionTrack(null)}
        actions={[
          {
            icon: 'play-outline',
            label: 'Tocar a seguir',
            onPress: () => {
              const t = actionTrack;
              setActionTrack(null);
              if (t) playNext(t);
            },
          },
          {
            icon: 'add-circle-outline',
            label: 'Adicionar à fila',
            onPress: () => {
              const t = actionTrack;
              setActionTrack(null);
              if (t) addToQueue(t);
            },
          },
          {
            icon: 'list-outline',
            label: 'Add to playlist…',
            onPress: () => {
              const t = actionTrack;
              setActionTrack(null);
              setPlaylistTrack(t);
            },
          },
        ]}
      />

      <AddToPlaylistSheet
        visible={!!playlistTrack}
        track={playlistTrack}
        onClose={() => setPlaylistTrack(null)}
      />

      <YtPlaylistRecommendationSheet
        visible={!!selectedYtPlaylistId}
        playlistId={selectedYtPlaylistId}
        playlistTitle="Playlist Partilhada"
        playlistArtwork={null}
        onClose={() => setSelectedYtPlaylistId(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabsContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  tabChipActive: {
    backgroundColor: colors.surfacePressed,
    borderColor: colors.borderStrong,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  shareCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  shareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  senderAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceHigh,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBubble: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginTop: 2,
  },
  messageText: {
    ...typography.caption,
    fontStyle: 'italic',
    color: colors.text,
    lineHeight: 16,
  },
  innerTrackBox: {
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    marginTop: 4,
  },
  innerPlaylistBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    marginTop: 4,
  },
  playlistIconBox: {
    width: 42,
    height: 42,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  friendAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceHigh,
  },
  actionBtnSmall: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceHigh,
  },
  actionBtnSmallText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  hintText: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.xl,
    color: colors.textTertiary,
  },
  searchInput: {
    height: 42,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingLeft: spacing.md,
    paddingRight: 32,
    color: colors.text,
    fontSize: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  searchClearBtn: {
    position: 'absolute',
    right: 10,
    top: 13,
  },
  sendRequestBtn: {
    height: 42,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addFriendHint: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textTertiary,
    lineHeight: 16,
    marginTop: spacing.md,
  },
  avatarContainer: {
    position: 'relative',
    width: 36,
    height: 36,
  },
  onlineBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: '#30D158',
    borderWidth: 2,
    borderColor: colors.surface,
  },
});
