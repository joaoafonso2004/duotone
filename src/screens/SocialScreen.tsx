import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useState } from 'react';
import { useNotifications } from '../state/notifications';
import { AVATAR_GRADIENTS } from '../lib/avatarPrefs';
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
  Modal,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getFriendships,
  getInboxItems,
  acceptFriendRequest,
  declineOrRemoveFriendship,
  sendFriendRequest,
  deleteInboxItem,
  shareItem,
  getChatMessages,
  searchProfiles,
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
import { hapticNotification, hapticSelection, hapticImpact } from '../lib/haptics';
import type { Track } from '../types';

export function SocialScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Social'>>();
  const openChatWithFriendId = route.params?.openChatWithFriendId;

  const playTrack = usePlayer((s) => s.playTrack);
  const playNext = usePlayer((s) => s.playNext);
  const addToQueue = usePlayer((s) => s.addToQueue);
  const current = usePlayer((s) => s.current);
  const theme = useTheme((s) => s.theme);

  const renderFriendAvatar = (avatarUrl: string | null, name: string, size = 36) => {
    if (avatarUrl && avatarUrl.startsWith('emoji:')) {
      const [, emoji, gradIdxStr] = avatarUrl.split(':');
      const gradIdx = parseInt(gradIdxStr, 10);
      const grad = AVATAR_GRADIENTS[gradIdx] || AVATAR_GRADIENTS[0];
      return (
        <LinearGradient
          colors={grad}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: size * 0.48 }}>{emoji}</Text>
        </LinearGradient>
      );
    }
    if (avatarUrl) {
      return (
        <Image
          source={{ uri: avatarUrl }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      );
    }
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.surfaceHigh,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: size * 0.38, fontWeight: '700', color: colors.textSecondary }}>
          {name ? name.charAt(0).toUpperCase() : '?'}
        </Text>
      </View>
    );
  };

  const [activeTab, setActiveTab] = useState<'inbox' | 'friends' | 'add'>('inbox');
  const [inboxItems, setInboxItems] = useState<SharedItem[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingFriends, setLoadingFriends] = useState(true);

  // Search & add states
  const [searchUsername, setSearchUsername] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingProfiles, setSearchingProfiles] = useState(false);

  // Track actions sheet states
  const [actionTrack, setActionTrack] = useState<Track | null>(null);
  const [playlistTrack, setPlaylistTrack] = useState<Track | null>(null);

  // Shared playlist sheet preview state
  const [selectedYtPlaylistId, setSelectedYtPlaylistId] = useState<string | null>(null);

  // Chat states
  const [activeChatFriend, setActiveChatFriend] = useState<Friendship | null>(null);
  const [chatMessages, setChatMessages] = useState<SharedItem[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  useEffect(() => {
    // Clear notifications when entering SocialScreen
    useNotifications.getState().setHasSocialNotification(false);
    useNotifications.getState().setHasNotification(false);
  }, []);

  useEffect(() => {
    if (openChatWithFriendId && friendships.length > 0) {
      const friendObj = friendships.find((f) => f.friendId === openChatWithFriendId);
      if (friendObj) {
        setActiveChatFriend(friendObj);
        // Clear route params so it doesn't trigger again on subsequent renders
        navigation.setParams({ openChatWithFriendId: undefined });
      }
    }
  }, [openChatWithFriendId, friendships, navigation]);

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

  const loadChat = useCallback(async () => {
    if (!activeChatFriend) return;
    setChatLoading(true);
    try {
      const messages = await getChatMessages(activeChatFriend.friendId);
      setChatMessages(messages);
    } catch {
      // ignore
    } finally {
      setChatLoading(false);
    }
  }, [activeChatFriend]);

  useEffect(() => {
    if (activeChatFriend) {
      loadChat();
      
      // Poll chat messages every 6 seconds for a live chat feel
      const interval = setInterval(() => {
        getChatMessages(activeChatFriend.friendId)
          .then(setChatMessages)
          .catch(() => {});
      }, 6000);

      return () => clearInterval(interval);
    }
  }, [activeChatFriend, loadChat]);

  const handleSendMessage = async () => {
    if (!activeChatFriend || !chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput('');
    setSendingMessage(false);
    hapticImpact();
    try {
      // Send text-only messages as track items with null trackData
      await shareItem(activeChatFriend.friendId, 'track', null, msg);
      const messages = await getChatMessages(activeChatFriend.friendId);
      setChatMessages(messages);
      loadInbox();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not send message.');
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadInbox();
      loadFriends();
    }, [loadInbox, loadFriends])
  );

  useEffect(() => {
    const q = searchUsername.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchingProfiles(true);
      try {
        const res = await searchProfiles(q);
        setSearchResults(res);
      } catch {
        // ignore
      } finally {
        setSearchingProfiles(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchUsername]);

  const handleAddFriend = async (targetUserId: string, targetUsername: string) => {
    hapticSelection();
    try {
      await sendFriendRequest(targetUserId);
      hapticNotification();
      Alert.alert('Sucesso', `Pedido de amizade enviado para @${targetUsername}!`);
      loadFriends();
      // Refrescar resultados da pesquisa localmente para marcar como pendente
      setSearchResults((prev) =>
        prev.map((p) =>
          p.id === targetUserId
            ? { ...p } // Forçar re-render, o friendships vai atualizar o estado visual
            : p
        )
      );
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível enviar o pedido.');
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
              renderItem={({ item }) => {
                const handleOpenChat = () => {
                  hapticSelection();
                  const friendObj: Friendship = {
                    friendId: item.sender.id,
                    username: item.sender.username,
                    name: item.sender.name,
                    avatarUrl: item.sender.avatarUrl,
                    status: 'accepted',
                    isSender: false,
                    lastSeenAt: null,
                  };
                  setActiveChatFriend(friendObj);
                };

                return (
                  <View style={styles.shareCard}>
                    {/* Sender Details Header */}
                    <View style={styles.shareHeader}>
                      <Pressable
                        onPress={handleOpenChat}
                        style={({ pressed }) => [
                          { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
                          pressed && { opacity: 0.7 }
                        ]}
                      >
                        {renderFriendAvatar(item.sender.avatarUrl, item.sender.name, 36)}
                        <View style={{ flex: 1 }}>
                          <Text style={[typography.body, { fontWeight: '700' }]}>{item.sender.name}</Text>
                          <Text style={[typography.caption, { fontSize: 11 }]}>@{item.sender.username}</Text>
                        </View>
                      </Pressable>
                      <Pressable onPress={() => handleDeleteInboxItem(item.id)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={18} color={colors.textTertiary} />
                      </Pressable>
                    </View>

                    {/* Caption Message if exists */}
                    {item.message ? (
                      <Pressable onPress={handleOpenChat}>
                        <View style={styles.messageBubble}>
                          <Text style={styles.messageText}>"{item.message}"</Text>
                        </View>
                      </Pressable>
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
                );
              }}
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
                        {renderFriendAvatar(req.avatarUrl, req.name, 36)}
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
                        <Pressable
                           key={friend.friendId}
                           onPress={() => {
                             hapticSelection();
                             setActiveChatFriend(friend);
                           }}
                           style={({ pressed }) => [
                             styles.friendRow,
                             pressed && { backgroundColor: colors.surfacePressed },
                           ]}
                         >
                           <View style={styles.avatarContainer}>
                              {renderFriendAvatar(friend.avatarUrl, friend.name, 36)}
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
                         </Pressable>
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
          <Text style={[typography.micro, { marginBottom: spacing.sm }]}>PESQUISAR AMIGOS</Text>
          <View style={{ position: 'relative', marginBottom: spacing.md }}>
            <TextInput
              value={searchUsername}
              onChangeText={setSearchUsername}
              placeholder="Escreve um nome ou username..."
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.searchInput}
            />
            {searchUsername.length > 0 && (
              <Pressable
                onPress={() => setSearchUsername('')}
                style={styles.searchClearBtn}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
              </Pressable>
            )}
          </View>

          {searchingProfiles && searchResults.length === 0 ? (
            <ActivityIndicator color={theme.color} style={{ marginVertical: 32 }} />
          ) : searchUsername.trim().length >= 2 && searchResults.length === 0 && !searchingProfiles ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={24} color={colors.textTertiary} />
              <Text style={styles.emptyText}>Nenhum utilizador encontrado com "{searchUsername}".</Text>
            </View>
          ) : searchResults.length > 0 ? (
            <View style={styles.listCard}>
              {searchResults.map((profile) => {
                const existingFriendship = friendships.find((f) => f.friendId === profile.id);
                const isAccepted = existingFriendship?.status === 'accepted';
                const isPending = existingFriendship?.status === 'pending';

                return (
                  <View key={profile.id} style={styles.friendRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
                      {renderFriendAvatar(profile.avatar_url, profile.name || '', 36)}
                      <View style={{ flex: 1 }}>
                        <Text style={[typography.body, { fontWeight: '700' }]} numberOfLines={1}>
                          {profile.name}
                        </Text>
                        <Text style={[typography.caption, { fontSize: 11 }]} numberOfLines={1}>
                          @{profile.username}
                        </Text>
                      </View>
                    </View>

                    {isAccepted ? (
                      <View style={[styles.actionBtnSmall, { backgroundColor: 'rgba(48, 209, 88, 0.15)' }]}>
                        <Text style={[styles.actionBtnSmallText, { color: '#30D158' }]}>Amigos</Text>
                      </View>
                    ) : isPending ? (
                      <View style={[styles.actionBtnSmall, { backgroundColor: 'rgba(255, 159, 10, 0.15)' }]}>
                        <Text style={[styles.actionBtnSmallText, { color: '#FF9F0A' }]}>Pendente</Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => handleAddFriend(profile.id, profile.username)}
                        style={({ pressed }) => [
                          styles.actionBtnSmall,
                          { backgroundColor: theme.color },
                          pressed && { opacity: 0.8 },
                        ]}
                      >
                        <Text style={[styles.actionBtnSmallText, { color: colors.bg }]}>Adicionar</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.addFriendHint}>
              Digita pelo menos 2 letras do nome ou username da pessoa que pretendes adicionar para a pesquisar em tempo real.
            </Text>
          )}
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

      {/* Chat modal */}
      <Modal
        visible={!!activeChatFriend}
        animationType="slide"
        onRequestClose={() => setActiveChatFriend(null)}
      >
        <View style={styles.chatRoot}>
          {/* Full Screen Blurred Background */}
          <Image
            source={require('../../assets/login_bg.png')}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10, 10, 15, 0.90)' }]} />

          {/* Header */}
          <View style={[styles.chatHeader, { paddingTop: insets.top + spacing.sm }]}>
            <Pressable
              onPress={() => setActiveChatFriend(null)}
              hitSlop={10}
              style={styles.chatBackBtn}
            >
              <Ionicons name="chevron-back" size={28} color={colors.text} />
            </Pressable>

            {activeChatFriend && (
              <Pressable
                onPress={() => {
                  hapticSelection();
                  const fid = activeChatFriend.friendId;
                  setActiveChatFriend(null);
                  navigation.navigate('FriendProfile', { friendId: fid });
                }}
                style={({ pressed }) => [
                  styles.chatHeaderInfo,
                  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
                  pressed && { opacity: 0.7 }
                ]}
              >
                <View style={styles.avatarContainer}>
                  {renderFriendAvatar(activeChatFriend.avatarUrl, activeChatFriend.name, 36)}
                  {((Date.now() - new Date(activeChatFriend.lastSeenAt || 0).getTime()) < 3 * 60 * 1000) && (
                    <View style={styles.onlineBadge} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[typography.body, { fontWeight: '700' }]}>
                    {activeChatFriend.name}
                  </Text>
                  <Text numberOfLines={1} style={typography.caption}>
                    @{activeChatFriend.username}
                  </Text>
                </View>
              </Pressable>
            )}
          </View>

          {/* Messages list */}
          {chatLoading && chatMessages.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator color={theme.color} size="large" />
            </View>
          ) : chatMessages.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl }}>
              <Ionicons name="chatbubbles-outline" size={48} color={colors.textTertiary} style={{ marginBottom: spacing.sm }} />
              <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', fontWeight: '600' }]}>
                Sem mensagens ainda
              </Text>
              <Text style={[typography.caption, { textAlign: 'center', marginTop: 4, color: colors.textTertiary }]}>
                Partilha uma música ou envia uma mensagem para começar a conversa!
              </Text>
            </View>
          ) : (
            <FlatList
              data={chatMessages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isMe = item.sender.id !== activeChatFriend?.friendId;
                return (
                  <View style={[styles.msgContainer, isMe ? styles.msgMe : styles.msgFriend]}>
                    {!isMe && (
                      <View style={{ marginRight: spacing.xs }}>
                        {renderFriendAvatar(activeChatFriend?.avatarUrl || null, activeChatFriend?.name || '', 24)}
                      </View>
                    )}

                    <View style={{ maxWidth: '80%', gap: 4 }}>
                      {/* Text Message Bubble (only if message is not empty) */}
                      {item.message ? (
                        <View style={[styles.msgBubble, isMe ? [styles.msgBubbleMe, { backgroundColor: theme.color }] : styles.msgBubbleFriend]}>
                          <Text style={[typography.body, { color: '#fff' }]}>{item.message}</Text>
                        </View>
                      ) : null}

                      {/* Shared Track Card */}
                      {item.itemType === 'track' && item.trackData && (
                        <View style={[styles.chatTrackBox, isMe && { alignSelf: 'flex-end' }]}>
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

                      {/* Shared Playlist Card */}
                      {item.itemType === 'playlist' && item.playlistId && (
                        <Pressable
                          onPress={() => {
                            hapticSelection();
                            setSelectedYtPlaylistId(item.playlistId);
                          }}
                          style={({ pressed }) => [
                            styles.chatPlaylistCard,
                            isMe && { alignSelf: 'flex-end' },
                            pressed && { opacity: 0.8 },
                          ]}
                        >
                          <View style={[styles.chatPlaylistIcon, { backgroundColor: theme.soft }]}>
                            <Ionicons name="albums-outline" size={20} color={theme.color} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[typography.body, { fontWeight: '600', fontSize: 13 }]} numberOfLines={1}>
                              Playlist Partilhada
                            </Text>
                            <Text style={[typography.caption, { fontSize: 10 }]}>Toca para importar</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              }}
            />
          )}

          {/* Bottom input bar */}
          <View style={[styles.chatInputBar, { paddingBottom: insets.bottom + spacing.md }]}>
            <TextInput
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="Escreve uma mensagem..."
              placeholderTextColor={colors.textTertiary}
              style={styles.chatInput}
              autoCorrect={false}
              onSubmitEditing={handleSendMessage}
            />
            <Pressable
              onPress={handleSendMessage}
              disabled={sendingMessage || !chatInput.trim()}
              style={({ pressed }) => [
                styles.chatSendBtn,
                { backgroundColor: theme.color },
                (sendingMessage || !chatInput.trim()) && { opacity: 0.4 },
                pressed && { opacity: 0.8 },
              ]}
            >
              {sendingMessage ? (
                <ActivityIndicator color={colors.bg} size="small" />
              ) : (
                <Ionicons name="send" size={16} color={colors.bg} />
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
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
  chatRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  chatBackBtn: {
    padding: spacing.xs,
    marginLeft: -4,
  },
  chatHeaderInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: spacing.xs,
  },
  msgContainer: {
    flexDirection: 'row',
    marginVertical: 6,
    width: '100%',
  },
  msgMe: {
    justifyContent: 'flex-end',
  },
  msgFriend: {
    justifyContent: 'flex-start',
  },
  msgAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginTop: 4,
  },
  msgBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  msgBubbleMe: {
    borderTopRightRadius: 4,
  },
  msgBubbleFriend: {
    backgroundColor: colors.surfaceHigh,
    borderTopLeftRadius: 4,
  },
  chatTrackBox: {
    width: 260,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  chatPlaylistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    width: 220,
  },
  chatPlaylistIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: 'rgba(10, 10, 15, 0.95)',
  },
  chatInput: {
    flex: 1,
    height: 40,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    color: colors.text,
    fontSize: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  chatSendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: spacing.xs,
  },
  emptyText: {
    ...typography.caption,
    textAlign: 'center',
    color: colors.textTertiary,
  },
  listeningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(48, 209, 88, 0.08)',
    borderColor: 'rgba(48, 209, 88, 0.2)',
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    maxWidth: '90%',
    gap: 4,
  },
  listeningText: {
    fontSize: 11,
    color: '#30D158',
    fontWeight: '600',
  },
});
