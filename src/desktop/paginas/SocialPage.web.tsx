/**
 * Social: caixa de entrada, amigos, pesquisa de utilizadores e conversas.
 *
 * A maior página da app — eram 414 linhas no meio do `RootNavigator.web.tsx`.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import {
  acceptFriendRequest, archiveInboxItem, declineOrRemoveFriendship,
  getChatMessages, getFriendships, getInboxItems, searchProfiles,
  sendFriendRequest, shareItem, type Friendship, type SharedItem,
} from '../../api/social';
import { importSharedPlaylist } from '../../api/playlists';
import { FriendAvatar } from '../../components/FriendAvatar';
import { displayArtist } from '../../lib/artistName';
import { useTheme } from '../../state/theme';
import type { Track } from '../../types';
import { styles } from '../estilos.web';
import { COR, RAIO, TIPO } from '../tokens.web';
import {
  Artwork, Button, ContentScroll, desktop, Dialog, Empty, Field,
  IconButton, Loading, Page, } from '../ui.web';
import { getContrastTextColor, relativeTime } from './comum.web';


export function SocialPage({ notify, play, more }: { notify: (s: string) => void; play: (t: Track, q?: Track[]) => void; more: (t: Track) => void }) {
  const [activeTab, setActiveTab] = useState<'inbox' | 'friends' | 'add'>('inbox');
  const [inbox, setInbox] = useState<SharedItem[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [importingShared, setImportingShared] = useState<string | null>(null);
  const theme = useTheme((s) => s.theme);

  // Chat states
  const [activeChatFriend, setActiveChatFriend] = useState<Friendship | null>(null);
  const [chatMessages, setChatMessages] = useState<SharedItem[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const chatScrollRef = useRef<any>(null);

  const loadSocialData = useCallback(async () => {
    try {
      const [ib, fs] = await Promise.all([getInboxItems(), getFriendships()]);
      setInbox(ib);
      setFriendships(fs);
    } catch (e: any) {
      console.warn(e);
    }
  }, []);

  useEffect(() => {
    loadSocialData();
    const interval = setInterval(loadSocialData, 10000);
    return () => clearInterval(interval);
  }, [loadSocialData]);

  // Load and poll chat messages
  const loadChat = useCallback(async () => {
    if (!activeChatFriend) return;
    setChatLoading(true);
    try {
      const msgs = await getChatMessages(activeChatFriend.friendId);
      setChatMessages(msgs);
      setTimeout(() => chatScrollRef.current?.scrollToEnd?.({ animated: false }), 100);
    } catch (err) {
      console.warn(err);
    } finally {
      setChatLoading(false);
    }
  }, [activeChatFriend]);

  useEffect(() => {
    if (!activeChatFriend) {
      setChatMessages([]);
      return;
    }
    loadChat();
    const chatInterval = setInterval(async () => {
      try {
        const msgs = await getChatMessages(activeChatFriend.friendId);
        setChatMessages(msgs);
      } catch {}
    }, 6000);
    return () => clearInterval(chatInterval);
  }, [activeChatFriend, loadChat]);

  const sendChatMessage = async () => {
    if (!activeChatFriend || !chatInput.trim() || sendingMessage) return;
    const msg = chatInput.trim();
    setChatInput('');
    setSendingMessage(true);
    try {
      await shareItem(activeChatFriend.friendId, 'track', null, msg);
      const msgs = await getChatMessages(activeChatFriend.friendId);
      setChatMessages(msgs);
      setTimeout(() => chatScrollRef.current?.scrollToEnd?.({ animated: true }), 100);
    } catch (err: any) {
      notify(err?.message || 'Could not send message.');
      setChatInput(msg);
    } finally {
      setSendingMessage(false);
    }
  };

  const archiveItem = async (id: string) => {
    try {
      await archiveInboxItem(id);
      notify('Inbox item archived.');
      loadSocialData();
    } catch (e: any) {
      notify(e?.message || 'Could not archive.');
    }
  };

  const importPlaylist = async (playlistId: string) => {
    if (importingShared) return;
    setImportingShared(playlistId);
    try {
      await importSharedPlaylist(playlistId);
      notify('Playlist added to your library.');
      window.dispatchEvent(new Event('duotone:refresh-playlists'));
    } catch (e: any) {
      notify(e?.message || 'Could not import the shared playlist.');
    } finally {
      setImportingShared(null);
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    try {
      await declineOrRemoveFriendship(friendId);
      notify('Friend removed.');
      loadSocialData();
    } catch (e: any) {
      notify(e?.message || 'Could not remove friend.');
    }
  };

  const handleAddFriend = async (targetId: string) => {
    try {
      await sendFriendRequest(targetId);
      notify('Friend request sent!');
      loadSocialData();
    } catch (e: any) {
      notify(e?.message || 'Could not send request.');
    }
  };

  const handleAcceptRequest = async (friendId: string) => {
    try {
      await acceptFriendRequest(friendId);
      notify('Friend request accepted.');
      loadSocialData();
    } catch (e: any) {
      notify(e?.message || 'Could not accept request.');
    }
  };

  const runSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const res = await searchProfiles(searchQuery);
      setSearchResults(res);
    } catch {
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const activeFriends = friendships.filter(f => f.status === 'accepted');
  const pendingRequests = friendships.filter(f => f.status === 'pending');

  return (
    <Page title="Social" subtitle="Connect and share music with friends.">
      <View style={styles.socialTabBar}>
        <Pressable onPress={() => setActiveTab('inbox')} style={[styles.socialTab, activeTab === 'inbox' && { borderBottomColor: theme.color }]}>
          <Text style={[styles.socialTabText, activeTab === 'inbox' && { color: desktop.text }]}>
            Inbox {inbox.length > 0 && `(${inbox.length})`}
          </Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab('friends')} style={[styles.socialTab, activeTab === 'friends' && { borderBottomColor: theme.color }]}>
          <Text style={[styles.socialTabText, activeTab === 'friends' && { color: desktop.text }]}>
            Friends {activeFriends.length > 0 && `(${activeFriends.length})`}
          </Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab('add')} style={[styles.socialTab, activeTab === 'add' && { borderBottomColor: theme.color }]}>
          <Text style={[styles.socialTabText, activeTab === 'add' && { color: desktop.text }]}>Find Profiles</Text>
        </Pressable>
      </View>

      <ContentScroll>
        <View style={{ marginTop: 16 }}>
        {loading && !inbox.length && !friendships.length && <Loading />}

        {activeTab === 'inbox' && (
          <View style={{ gap: 12 }}>
            {inbox.map((item) => (
              <View key={item.id} style={styles.inboxCard}>
                <View style={styles.inboxCardHeader}>
                  <Text style={styles.inboxSender}>{item.sender.name} (@{item.sender.username}) shared:</Text>
                  <IconButton name="archive-outline" label="Archive message" onPress={() => archiveItem(item.id)} />
                </View>
                {item.trackData && (
                  <Pressable onPress={() => play(item.trackData!)} style={styles.inboxTrack}>
                    <Artwork track={item.trackData} size={40} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: desktop.text, fontSize: 12, fontWeight: '600' }}>{item.trackData.title}</Text>
                      <Text numberOfLines={1} style={{ color: desktop.dim, fontSize: 10, marginTop: 2 }}>{item.trackData.artist || 'YouTube'}</Text>
                    </View>
                    <Ionicons name="play-circle" size={24} color={theme.color} />
                  </Pressable>
                )}
                {item.itemType === 'playlist' && item.playlistId && (
                  <Pressable onPress={() => void importPlaylist(item.playlistId!)} style={styles.inboxTrack}>
                    <View style={{ width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: desktop.raised }}>
                      <Ionicons name="albums-outline" size={21} color={theme.color} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: desktop.text, fontSize: 12, fontWeight: '600' }}>Shared playlist</Text>
                      <Text numberOfLines={1} style={{ color: desktop.dim, fontSize: 10, marginTop: 2 }}>Add a copy to your playlists</Text>
                    </View>
                    <Ionicons name={importingShared === item.playlistId ? 'hourglass-outline' : 'download-outline'} size={20} color={theme.color} />
                  </Pressable>
                )}
                {item.message && (
                  <View style={styles.inboxMessageBubble}>
                    <Text style={styles.inboxMessageText}>{item.message}</Text>
                  </View>
                )}
              </View>
            ))}
            {!inbox.length && !loading && <Empty icon="mail-outline" title="Inbox is empty" body="Shared tracks, playlists, and messages from your friends will appear here." />}
          </View>
        )}

        {activeTab === 'friends' && (
          <View style={{ gap: 12 }}>
            {pendingRequests.length > 0 && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.formLabel}>PENDING REQUESTS</Text>
                <View style={{ gap: 6, marginTop: 8 }}>
                  {pendingRequests.map((req) => (
                    <View key={req.friendId} style={styles.friendRow}>
                      <FriendAvatar avatarUrl={req.avatarUrl} name={req.name} size={34} />
                      <View style={{ flex: 1, marginLeft: 11 }}>
                        <Text style={{ color: desktop.text, fontSize: 13, fontWeight: '600' }}>{req.name}</Text>
                        <Text style={{ color: desktop.dim, fontSize: 11 }}>@{req.username}</Text>
                      </View>
                      {req.isSender ? (
                        <Text style={{ color: desktop.dim, fontSize: 11 }}>Request Sent</Text>
                      ) : (
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <Button onPress={() => handleAcceptRequest(req.friendId)}>Accept</Button>
                          <IconButton name="close" label="Decline request" onPress={() => handleRemoveFriend(req.friendId)} />
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            )}

            <Text style={styles.formLabel}>ALL FRIENDS</Text>
            {activeFriends.map((f) => (
              <View key={f.friendId} style={styles.friendRow}>
                <FriendAvatar avatarUrl={f.avatarUrl} name={f.name} size={38} />
                <View style={{ flex: 1, minWidth: 0, marginLeft: 11 }}>
                  <Text numberOfLines={1} style={{ color: desktop.text, fontSize: 13, fontWeight: '600' }}>{f.name} (@{f.username})</Text>
                  {f.currentlyPlaying ? (
                    // A capa em miniatura diz mais depressa o que ele esta a
                    // ouvir do que o titulo escrito — e e a unica cor que a
                    // linha precisa de ter.
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 }}>
                      {f.currentlyPlaying.artworkUrl
                        ? <Image source={{ uri: f.currentlyPlaying.artworkUrl }} style={{ width: 22, height: 22, borderRadius: RAIO.ctrl }} />
                        : <Ionicons name="musical-notes" size={12} color={COR.textoMedio} />}
                      <Text numberOfLines={1} style={{ ...TIPO.legenda, color: COR.textoMedio, flex: 1 }}>
                        {f.currentlyPlaying.title}
                      </Text>
                    </View>
                  ) : (
                    // "Sem tocar" e "offline" são coisas diferentes: com o
                    // filtro de presença, quem está online mas em pausa
                    // apareceria como offline se olhássemos só para a faixa.
                    <Text style={{ color: desktop.dim, fontSize: 11, marginTop: 3 }}>
                      {f.lastSeenAt && Date.now() - new Date(f.lastSeenAt).getTime() < 3 * 60 * 1000
                        ? 'Online'
                        : 'Offline'}
                    </Text>
                  )}
                </View>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  {f.currentlyPlaying && (
                    <Button onPress={() => play({ source: f.currentlyPlaying!.source as any, sourceId: f.currentlyPlaying!.sourceId, title: f.currentlyPlaying!.title, artist: f.currentlyPlaying!.artist, album: null, artworkUrl: f.currentlyPlaying!.artworkUrl, durationSeconds: f.currentlyPlaying!.durationSeconds })}>
                      Listen Along
                    </Button>
                  )}
                  <IconButton name="chatbubble-ellipses-outline" label="Chat" onPress={() => setActiveChatFriend(f)} />
                  <IconButton name="trash-outline" label="Remove friend" onPress={() => handleRemoveFriend(f.friendId)} />
                </View>
              </View>
            ))}
            {!activeFriends.length && !pendingRequests.length && !loading && (
              <Empty icon="people-outline" title="No friends yet" body="Search for profiles to send a friend request." />
            )}
          </View>
        )}

        {activeTab === 'add' && (
          <View style={{ gap: 12 }}>
            <View style={styles.searchBar}>
              <Field icon="search" placeholder="Type username or name…" value={searchQuery} onChangeText={setSearchQuery} onSubmitEditing={runSearch} />
              <Button onPress={runSearch}>Search</Button>
            </View>
            <View style={{ gap: 8 }}>
              {searchResults.map((p) => {
                const friendship = friendships.find(f => f.friendId === p.id);
                return (
                  <View key={p.id} style={styles.friendRow}>
                    <FriendAvatar avatarUrl={p.avatar_url} name={p.name} size={34} />
                    <View style={{ flex: 1, marginLeft: 11 }}>
                      <Text style={{ color: desktop.text, fontSize: 13, fontWeight: '600' }}>{p.name || 'No name'}</Text>
                      <Text style={{ color: desktop.dim, fontSize: 11 }}>@{p.username}</Text>
                    </View>
                    {friendship ? (
                      friendship.status === 'accepted' ? (
                        <Text style={{ color: desktop.dim, fontSize: 12 }}>Friend</Text>
                      ) : friendship.isSender ? (
                        <Text style={{ color: desktop.dim, fontSize: 12 }}>Requested</Text>
                      ) : (
                        <Button onPress={() => handleAcceptRequest(p.id)}>Accept Request</Button>
                      )
                    ) : (
                      <Button onPress={() => handleAddFriend(p.id)}>Add Friend</Button>
                    )}
                  </View>
                );
              })}
              {!searchResults.length && !loading && searchQuery && <Empty icon="search-outline" title="No profiles found" body="Try searching for another name or username." />}
            </View>
          </View>
        )}
        </View>
      </ContentScroll>

      {/* CHAT DIALOG */}
      <Dialog open={!!activeChatFriend} title={activeChatFriend ? `Chat with ${activeChatFriend.name}` : 'Chat'} onClose={() => setActiveChatFriend(null)} width={500}>
        {activeChatFriend && (
          <View style={{ height: 420, justifyContent: 'space-between' }}>
            <ScrollView 
              ref={chatScrollRef}
              contentContainerStyle={{ gap: 10, paddingVertical: 10 }}
              style={{ flex: 1, marginBottom: 12 }}
            >
              {chatLoading && chatMessages.length === 0 ? (
                <Loading />
              ) : chatMessages.map((msg) => {
                const isMe = msg.sender.id !== activeChatFriend.friendId;
                const isDarkText = isMe && getContrastTextColor(theme.color) === '#0F0F14';
                return (
                  <View key={msg.id} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '80%', gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: isMe ? 'flex-end' : 'flex-start' }}>
                      {!isMe && <FriendAvatar avatarUrl={msg.sender.avatarUrl} name={msg.sender.name} size={18} />}
                      <Text style={{ color: desktop.dim, fontSize: 9 }}>
                        {isMe ? 'You' : msg.sender.name} • {relativeTime(new Date(msg.createdAt).getTime())}
                      </Text>
                    </View>
                    <View style={{ 
                      padding: 10, 
                      borderRadius: 12, 
                      backgroundColor: isMe ? theme.color : desktop.raised,
                      borderBottomRightRadius: isMe ? 2 : 12,
                      borderBottomLeftRadius: isMe ? 12 : 2
                    }}>
                      {msg.trackData && (
                        <Pressable onPress={() => play(msg.trackData!)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: msg.message ? 8 : 0, backgroundColor: isMe ? (isDarkText ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.12)') : 'rgba(255,255,255,0.06)', padding: 6, borderRadius: 6 }}>
                          <Artwork track={msg.trackData} size={28} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text numberOfLines={1} style={{ color: isMe ? (isDarkText ? '#0F0F14' : '#FFF') : '#FFF', fontSize: 11, fontWeight: '600' }}>{msg.trackData.title}</Text>
                            <Text numberOfLines={1} style={{ color: isMe ? (isDarkText ? 'rgba(15,15,20,0.65)' : 'rgba(255,255,255,0.65)') : 'rgba(255,255,255,0.65)', fontSize: 9 }}>{displayArtist(msg.trackData)}</Text>
                          </View>
                          <Ionicons name="play-circle" size={18} color={isMe ? (isDarkText ? '#0F0F14' : '#FFF') : '#FFF'} />
                        </Pressable>
                      )}
                      {msg.message && (
                        <Text style={{ color: isMe ? (isDarkText ? '#0F0F14' : '#FFF') : desktop.text, fontSize: 12, lineHeight: 16 }}>{msg.message}</Text>
                      )}
                    </View>
                  </View>
                );
              })}
              {!chatMessages.length && !chatLoading && (
                <Text style={{ color: desktop.dim, fontSize: 12, textAlign: 'center', marginVertical: 60, fontStyle: 'italic' }}>
                  No messages. Say hello to {activeChatFriend.name}!
                </Text>
              )}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', borderTopWidth: 1, borderTopColor: desktop.border, paddingTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Field 
                  placeholder="Send a message…" 
                  value={chatInput} 
                  onChangeText={setChatInput} 
                  onSubmitEditing={sendChatMessage}
                />
              </View>
              <Button onPress={sendChatMessage} disabled={!chatInput.trim() || sendingMessage}>
                Send
              </Button>
            </View>
          </View>
        )}
      </Dialog>
    </Page>
  );
}
