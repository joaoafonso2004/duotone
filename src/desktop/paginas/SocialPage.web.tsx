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
import type { Track } from '../../types';
import { styles } from '../estilos.web';
import { COR, ESP, RAIO, TIPO } from '../tokens.web';
import {
  Artwork, Button, ContentScroll, desktop, Dialog, Empty, Field,
  IconButton, Loading, Page, ui,
} from '../ui.web';
import { relativeTime } from './comum.web';

const P = Pressable as any;


export function SocialPage({ notify, play, more }: { notify: (s: string) => void; play: (t: Track, q?: Track[]) => void; more: (t: Track) => void }) {
  const [activeTab, setActiveTab] = useState<'inbox' | 'friends' | 'add'>('inbox');
  const [inbox, setInbox] = useState<SharedItem[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [importingShared, setImportingShared] = useState<string | null>(null);

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
      {/* Os separadores alinham com a margem do resto da pagina (48) e o
          activo marca-se com LUZ, nao com o roxo do tema — a identidade da app
          e o metal, e a cor fica reservada a significado. */}
      <View style={styles.socialTabBar}>
        {([
          ['inbox', 'Inbox', inbox.length],
          ['friends', 'Friends', activeFriends.length],
          ['add', 'Find profiles', 0],
        ] as const).map(([id, rotulo, conta]) => (
          <Pressable key={id} onPress={() => setActiveTab(id)} style={[styles.socialTab, activeTab === id && styles.socialTabAtivo]}>
            <Text style={[styles.socialTabText, activeTab === id && styles.socialTabTextAtivo]}>{rotulo}</Text>
            {conta > 0 && <Text style={styles.socialTabConta}>{conta}</Text>}
          </Pressable>
        ))}
      </View>

      <ContentScroll>
        <View style={{ marginTop: 16 }}>
        {loading && !inbox.length && !friendships.length && <Loading />}

        {activeTab === 'inbox' && (
          <View>
            {inbox.map((item) => (
              <View key={item.id} style={styles.socialItem}>
                <View style={styles.socialItemCabeca}>
                  <Text style={styles.socialRemetente}>{item.sender.name} · @{item.sender.username}</Text>
                  <IconButton name="archive-outline" label="Archive message" onPress={() => archiveItem(item.id)} />
                </View>
                {item.trackData && (
                  <P onPress={() => play(item.trackData!)} style={({ hovered }: any) => [styles.socialPartilha, hovered && { opacity: .82 }]}>
                    <Artwork track={item.trackData} size={44} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={styles.socialPartilhaTitulo}>{item.trackData.title}</Text>
                      <Text numberOfLines={1} style={styles.socialPartilhaNota}>{displayArtist(item.trackData)}</Text>
                    </View>
                    <IconButton name="play" label="Play" onPress={() => play(item.trackData!)} />
                  </P>
                )}
                {item.itemType === 'playlist' && item.playlistId && (
                  <P onPress={() => void importPlaylist(item.playlistId!)} style={({ hovered }: any) => [styles.socialPartilha, hovered && { opacity: .82 }]}>
                    <View style={styles.socialIconeCaixa}>
                      <Ionicons name="albums-outline" size={20} color={COR.textoMedio} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={styles.socialPartilhaTitulo}>Shared playlist</Text>
                      <Text numberOfLines={1} style={styles.socialPartilhaNota}>Add a copy to your playlists</Text>
                    </View>
                    <IconButton
                      name={importingShared === item.playlistId ? 'hourglass-outline' : 'download-outline'}
                      label="Import playlist"
                      onPress={() => void importPlaylist(item.playlistId!)}
                    />
                  </P>
                )}
                {item.message && <Text style={styles.socialMensagem}>{item.message}</Text>}
              </View>
            ))}
            {!inbox.length && !loading && <Empty icon="mail-outline" title="Inbox is empty" body="Shared tracks, playlists, and messages from your friends will appear here." />}
          </View>
        )}

        {activeTab === 'friends' && (
          <View>
            {pendingRequests.length > 0 && (
              <>
                <Text style={[ui.eyebrow, { marginTop: ESP.lg, marginBottom: ESP.xs }]}>PENDING REQUESTS</Text>
                {pendingRequests.map((req) => (
                  <View key={req.friendId} style={styles.socialLinha}>
                    <FriendAvatar avatarUrl={req.avatarUrl} name={req.name} size={40} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={styles.socialNome}>{req.name}</Text>
                      <Text numberOfLines={1} style={styles.socialUtilizador}>@{req.username}</Text>
                    </View>
                    {req.isSender ? (
                      <Text style={styles.socialEtiqueta}>REQUEST SENT</Text>
                    ) : (
                      <View style={styles.socialAcoes}>
                        <Button onPress={() => handleAcceptRequest(req.friendId)}>Accept</Button>
                        <IconButton name="close" label="Decline request" onPress={() => handleRemoveFriend(req.friendId)} />
                      </View>
                    )}
                  </View>
                ))}
              </>
            )}

            {activeFriends.length > 0 && (
              <Text style={[ui.eyebrow, { marginTop: ESP.xl, marginBottom: ESP.xs }]}>ALL FRIENDS</Text>
            )}
            {activeFriends.map((f) => (
              <View key={f.friendId} style={styles.socialLinha}>
                <FriendAvatar avatarUrl={f.avatarUrl} name={f.name} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={styles.socialNome}>{f.name}</Text>
                  {f.currentlyPlaying ? (
                    // A capa em miniatura diz mais depressa o que ele esta a
                    // ouvir do que o titulo escrito — e e a unica cor que a
                    // linha precisa de ter.
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.sm, marginTop: 3 }}>
                      {f.currentlyPlaying.artworkUrl
                        ? <Image source={{ uri: f.currentlyPlaying.artworkUrl }} style={{ width: 20, height: 20, borderRadius: RAIO.ctrl }} />
                        : <Ionicons name="musical-notes" size={12} color={COR.textoFraco} />}
                      <Text numberOfLines={1} style={{ ...TIPO.legenda, color: COR.textoMedio, flex: 1 }}>
                        {f.currentlyPlaying.title}
                      </Text>
                    </View>
                  ) : (
                    // "Sem tocar" e "offline" sao coisas diferentes: com o
                    // filtro de presenca, quem esta online mas em pausa
                    // apareceria como offline se olhassemos so para a faixa.
                    <Text style={styles.socialEstado}>
                      {f.lastSeenAt && Date.now() - new Date(f.lastSeenAt).getTime() < 3 * 60 * 1000
                        ? 'Online'
                        : 'Offline'}
                    </Text>
                  )}
                </View>
                <View style={styles.socialAcoes}>
                  {f.currentlyPlaying && (
                    <Button secondary onPress={() => play({ source: f.currentlyPlaying!.source as any, sourceId: f.currentlyPlaying!.sourceId, title: f.currentlyPlaying!.title, artist: f.currentlyPlaying!.artist, album: null, artworkUrl: f.currentlyPlaying!.artworkUrl, durationSeconds: f.currentlyPlaying!.durationSeconds })}>
                      Listen along
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
          <View>
            <View style={{ flexDirection: 'row', gap: ESP.md, marginTop: ESP.lg, marginBottom: ESP.sm }}>
              {/* O `Field` dimensiona-se ao conteudo; sem este invólucro com
                  flex ficava uma caixa estreita ao lado de um botao grande. */}
              <View style={{ flex: 1, maxWidth: 420 }}>
                <Field icon="search" placeholder="Type username or name…" value={searchQuery} onChangeText={setSearchQuery} onSubmitEditing={runSearch} />
              </View>
              <Button onPress={runSearch}>Search</Button>
            </View>
            {searchResults.map((p) => {
              const friendship = friendships.find((f) => f.friendId === p.id);
              return (
                <View key={p.id} style={styles.socialLinha}>
                  <FriendAvatar avatarUrl={p.avatar_url} name={p.name} size={40} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={styles.socialNome}>{p.name || 'No name'}</Text>
                    <Text numberOfLines={1} style={styles.socialUtilizador}>@{p.username}</Text>
                  </View>
                  {friendship ? (
                    friendship.status === 'accepted' ? (
                      <Text style={styles.socialEtiqueta}>FRIEND</Text>
                    ) : friendship.isSender ? (
                      <Text style={styles.socialEtiqueta}>REQUESTED</Text>
                    ) : (
                      <Button onPress={() => handleAcceptRequest(p.id)}>Accept request</Button>
                    )
                  ) : (
                    <Button secondary onPress={() => handleAddFriend(p.id)}>Add friend</Button>
                  )}
                </View>
              );
            })}
            {!searchResults.length && !loading && searchQuery.trim() !== '' && (
              <Empty icon="search-outline" title="No profiles found" body={`Nothing matches "${searchQuery}". Try the exact username.`} />
            )}
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
                const minha = msg.sender.id !== activeChatFriend.friendId;
                const corTexto = minha ? COR.fundo : COR.texto;
                return (
                  <View key={msg.id} style={{ alignSelf: minha ? 'flex-end' : 'flex-start', maxWidth: '80%', gap: ESP.xs }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.sm, alignSelf: minha ? 'flex-end' : 'flex-start' }}>
                      {!minha && <FriendAvatar avatarUrl={msg.sender.avatarUrl} name={msg.sender.name} size={18} />}
                      <Text style={styles.socialBolhaMeta}>
                        {minha ? 'YOU' : msg.sender.name} · {relativeTime(new Date(msg.createdAt).getTime())}
                      </Text>
                    </View>
                    <View style={[styles.socialBolha, minha ? styles.socialBolhaMinha : styles.socialBolhaDele]}>
                      {msg.trackData && (
                        <P
                          onPress={() => play(msg.trackData!)}
                          style={({ hovered }: any) => [
                            styles.socialFaixaNaBolha,
                            { backgroundColor: minha ? 'rgba(6,6,8,.07)' : COR.hover, marginBottom: msg.message ? ESP.sm : 0 },
                            hovered && { opacity: .82 },
                          ]}
                        >
                          <Artwork track={msg.trackData} size={28} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text numberOfLines={1} style={{ ...TIPO.legenda, color: corTexto, fontWeight: '550' as any }}>{msg.trackData.title}</Text>
                            <Text numberOfLines={1} style={{ ...TIPO.micro, color: corTexto, opacity: .7 }}>{displayArtist(msg.trackData)}</Text>
                          </View>
                          <Ionicons name="play" size={15} color={corTexto} />
                        </P>
                      )}
                      {msg.message && (
                        <Text style={[styles.socialBolhaTexto, { color: corTexto }]}>{msg.message}</Text>
                      )}
                    </View>
                  </View>
                );
              })}
              {!chatMessages.length && !chatLoading && (
                <Text style={styles.socialSemMensagens}>
                  No messages yet. Say hello to {activeChatFriend.name}.
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
