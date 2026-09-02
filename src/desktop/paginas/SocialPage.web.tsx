/**
 * Social: caixa de entrada, amigos, pesquisa de utilizadores e conversas.
 *
 * A maior página da app — eram 414 linhas no meio do `RootNavigator.web.tsx`.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import {
  acceptFriendRequest, declineOrRemoveFriendship,
  acrescentarAoGrupo, criarGrupo, getChatMessages, getFriendships, getGroupMessages,
  getGrupos, getInboxItems, sairDoGrupo, searchProfiles, sendFriendRequest,
  shareComGrupo, shareItem, type ChatGroup, type Friendship, type SharedItem,
} from '../../api/social';
import { importSharedPlaylist } from '../../api/playlists';
import { FriendAvatar } from '../../components/FriendAvatar';
import { supabase } from '../../lib/supabase';
import { displayArtist } from '../../lib/artistName';
import { getChatsVistos, marcarChatVisto } from '../../lib/prefs';
import { naoLidasPorAmigo, totalNaoLidas } from '../../lib/social';
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
  // A aba Inbox foi-se: o que te mandam vive na conversa de cada amigo,
  // que e onde se procura por isso. O que ela fazia de util -- dizer que
  // chegou coisa nova -- passa a ser uma marca por amigo (ver lib/social).
  const [activeTab, setActiveTab] = useState<'friends' | 'add'>('friends');
  const [vistos, setVistos] = useState<Record<string, string>>({});
  const [inbox, setInbox] = useState<SharedItem[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [importingShared, setImportingShared] = useState<string | null>(null);

  // Chat states
  /**
   * A conversa aberta -- de um amigo OU de um grupo.
   *
   * Um so estado e nao dois: o dialogo, o envio e o ciclo de recarregar sao os
   * mesmos, e a unica coisa que muda e para onde vai a mensagem. Com dois
   * estados havia sessenta linhas de JSX duplicadas e dois sitios para
   * corrigir de cada vez.
   */
  const [conversa, setConversa] = useState<
    { tipo: 'amigo'; amigo: Friendship } | { tipo: 'grupo'; grupo: ChatGroup } | null
  >(null);
  const [grupos, setGrupos] = useState<ChatGroup[]>([]);
  /** Precisa-se do proprio id para saber que bolhas sao nossas: num grupo nao
   * chega dizer "nao e do outro", porque ha varios outros. */
  const [meuId, setMeuId] = useState<string | null>(null);
  const [novoGrupoAberto, setNovoGrupoAberto] = useState(false);
  const [nomeDoGrupo, setNomeDoGrupo] = useState('');
  const [membrosEscolhidos, setMembrosEscolhidos] = useState<string[]>([]);
  const [aCriarGrupo, setACriarGrupo] = useState(false);

  const abrirConversa = async (f: Friendship) => {
    setConversa({ tipo: 'amigo', amigo: f });
    setVistos(await marcarChatVisto(f.friendId));
  };
  const abrirGrupo = (g: ChatGroup) => setConversa({ tipo: 'grupo', grupo: g });
  const [chatMessages, setChatMessages] = useState<SharedItem[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const chatScrollRef = useRef<any>(null);

  // O proprio id, uma vez. Sem ele nao se sabe que bolhas sao nossas
  // num grupo -- e ha varios "outros".
  useEffect(() => {
    supabase.auth.getUser()
      .then(({ data }) => setMeuId(data.user?.id ?? null))
      .catch(() => {});
  }, []);

  const loadSocialData = useCallback(async () => {
    try {
      const [ib, fs, vs, gs] = await Promise.all([
        getInboxItems(), getFriendships(), getChatsVistos(), getGrupos(),
      ]);
      setGrupos(gs);
      // O `inbox` deixa de ter aba propria, mas continua a ser a consulta
      // "o que me mandaram" -- e dela que sai a contagem de nao-lidas.
      setInbox(ib);
      setFriendships(fs);
      setVistos(vs);
    } catch (e: any) {
      console.warn(e);
    }
  }, []);

  useEffect(() => {
    loadSocialData();
    const interval = setInterval(loadSocialData, 10000);
    return () => clearInterval(interval);
  }, [loadSocialData]);

  /** Ler a conversa aberta, seja ela de um amigo ou de um grupo. */
  const lerMensagens = useCallback(async () => {
    if (!conversa) return [] as SharedItem[];
    return conversa.tipo === 'amigo'
      ? getChatMessages(conversa.amigo.friendId)
      : getGroupMessages(conversa.grupo.id);
  }, [conversa]);

  const loadChat = useCallback(async () => {
    if (!conversa) return;
    setChatLoading(true);
    try {
      setChatMessages(await lerMensagens());
      setTimeout(() => chatScrollRef.current?.scrollToEnd?.({ animated: false }), 100);
    } catch (err) {
      console.warn(err);
    } finally {
      setChatLoading(false);
    }
  }, [conversa, lerMensagens]);

  useEffect(() => {
    if (!conversa) {
      setChatMessages([]);
      return;
    }
    loadChat();
    const chatInterval = setInterval(async () => {
      try {
        setChatMessages(await lerMensagens());
      } catch {}
    }, 6000);
    return () => clearInterval(chatInterval);
  }, [conversa, loadChat, lerMensagens]);

  const sendChatMessage = async () => {
    if (!conversa || !chatInput.trim() || sendingMessage) return;
    const msg = chatInput.trim();
    setChatInput('');
    setSendingMessage(true);
    try {
      // Uma mensagem de texto e um item sem faixa -- e como o chat ja
      // funcionava antes dos grupos existirem.
      if (conversa.tipo === 'amigo') await shareItem(conversa.amigo.friendId, 'track', null, msg);
      else await shareComGrupo(conversa.grupo.id, 'track', null, msg);
      setChatMessages(await lerMensagens());
      setTimeout(() => chatScrollRef.current?.scrollToEnd?.({ animated: true }), 100);
    } catch (err: any) {
      notify(err?.message || 'Could not send message.');
      // A mensagem volta para a caixa: perde-se o que se escreveu se nao.
      setChatInput(msg);
    } finally {
      setSendingMessage(false);
    }
  };

  /** Criar o grupo e abri-lo logo -- que e o que se quer a seguir. */
  const criarGrupoAgora = async () => {
    if (!nomeDoGrupo.trim() || membrosEscolhidos.length === 0 || aCriarGrupo) return;
    setACriarGrupo(true);
    try {
      await criarGrupo(nomeDoGrupo, membrosEscolhidos);
      const gs = await getGrupos();
      setGrupos(gs);
      setNovoGrupoAberto(false);
      setNomeDoGrupo('');
      setMembrosEscolhidos([]);
      notify('Group created.');
    } catch (e: any) {
      notify(e?.message || 'Could not create the group.');
    } finally {
      setACriarGrupo(false);
    }
  };

  const sairGrupo = async (g: ChatGroup) => {
    try {
      await sairDoGrupo(g.id);
      setConversa(null);
      setGrupos(await getGrupos());
      notify(`Left ${g.name}.`);
    } catch (e: any) {
      notify(e?.message || 'Could not leave the group.');
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
  // O que chegou depois da ultima vez que abriste cada conversa.
  const naoLidas = naoLidasPorAmigo(inbox, vistos);
  const porLer = totalNaoLidas(naoLidas);

  return (
    <Page
      title="Social"
      subtitle="Connect and share music with friends."
      action={activeTab === 'friends' && activeFriends.length > 0 ? (
        <Button icon="people-outline" secondary onPress={() => setNovoGrupoAberto(true)}>New group</Button>
      ) : undefined}
    >
      {/* Os separadores alinham com a margem do resto da pagina (48) e o
          activo marca-se com LUZ, nao com o roxo do tema — a identidade da app
          e o metal, e a cor fica reservada a significado. */}
      <View style={styles.socialTabBar}>
        {([
          // A conta dos Friends e o que esta por LER e nao quantos amigos ha:
          // um numero que nao muda nao e informacao, e era isso que dizia.
          ['friends', 'Friends', porLer],
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


        {activeTab === 'friends' && (
          <View>
            {pendingRequests.length > 0 && (
              <>
                <Text style={[ui.eyebrow, { marginTop: ESP.lg, marginBottom: ESP.xs }]}>
                  PENDING REQUESTS · {pendingRequests.length}
                </Text>
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
                      // Acoes de linha sao ICONES em toda a app (ver a TrackTable).
                      // Uma pastilha branca no meio de uma lista aberta le-se
                      // como uma caixa colada por cima dela.
                      <View style={styles.socialAcoes}>
                        <IconButton name="checkmark" label={`Accept request from ${req.name}`} onPress={() => handleAcceptRequest(req.friendId)} />
                        <IconButton name="close" label={`Decline request from ${req.name}`} onPress={() => handleRemoveFriend(req.friendId)} />
                      </View>
                    )}
                  </View>
                ))}
              </>
            )}

            {/* Os grupos vem ANTES dos amigos: sao poucos e sao onde a
                conversa costuma estar viva. */}
            {grupos.length > 0 && (
              <>
                <Text style={[ui.eyebrow, { marginTop: ESP.lg, marginBottom: ESP.xs }]}>
                  GROUPS · {grupos.length}
                </Text>
                {grupos.map((g) => (
                  <P
                    key={g.id}
                    onPress={() => abrirGrupo(g)}
                    style={({ hovered, focused }: any) => [styles.socialLinha, (hovered || focused) && styles.socialLinhaHover]}
                  >
                    <View style={styles.socialIconeCaixa}>
                      <Ionicons name="people" size={20} color={COR.textoMedio} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={styles.socialNome}>{g.name}</Text>
                      <Text numberOfLines={1} style={styles.socialUtilizador}>
                        {g.membros.map((m) => m.name).join(', ')}
                      </Text>
                    </View>
                    <IconButton name="exit-outline" label={`Leave ${g.name}`} onPress={() => void sairGrupo(g)} />
                  </P>
                ))}
              </>
            )}

            {activeFriends.length > 0 && (
              <Text style={[ui.eyebrow, { marginTop: ESP.xl, marginBottom: ESP.xs }]}>
                ALL FRIENDS · {activeFriends.length}
              </Text>
            )}
            {activeFriends.map((f) => {
              const online = !!f.lastSeenAt && Date.now() - new Date(f.lastSeenAt).getTime() < 3 * 60 * 1000;
              const porLerDele = naoLidas.get(f.friendId) ?? 0;
              return (
              // A linha inteira abre a conversa, como em qualquer outra lista
              // da app. Antes so o icone respondia, e nada dizia que a linha
              // era clicavel.
              <P
                key={f.friendId}
                onPress={() => void abrirConversa(f)}
                style={({ hovered, focused }: any) => [styles.socialLinha, (hovered || focused) && styles.socialLinhaHover]}
              >
                <FriendAvatar avatarUrl={f.avatarUrl} name={f.name} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.sm }}>
                    <Text numberOfLines={1} style={[styles.socialNome, porLerDele > 0 && { fontWeight: '700' as any }]}>{f.name}</Text>
                    {/* O que substitui a aba Inbox. Sem isto, tirar a aba
                        fazia as partilhas aterrarem em silencio. */}
                    {porLerDele > 0 && (
                      <View style={styles.socialPorLer}>
                        <Text style={styles.socialPorLerTexto}>{porLerDele > 99 ? '99+' : porLerDele}</Text>
                      </View>
                    )}
                  </View>
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
                    <View style={styles.socialLinhaEstado}>
                      <View style={[styles.socialPonto, online ? styles.socialPontoOn : styles.socialPontoOff]} />
                      <Text style={styles.socialEstado}>{online ? 'Online' : 'Offline'}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.socialAcoes}>
                  {f.currentlyPlaying && (
                    <IconButton
                      name="headset-outline"
                      label={`Listen along with ${f.name}`}
                      onPress={() => play({ source: f.currentlyPlaying!.source as any, sourceId: f.currentlyPlaying!.sourceId, title: f.currentlyPlaying!.title, artist: f.currentlyPlaying!.artist, album: null, artworkUrl: f.currentlyPlaying!.artworkUrl, durationSeconds: f.currentlyPlaying!.durationSeconds })}
                    />
                  )}
                  <IconButton name="chatbubble-ellipses-outline" label="Chat" onPress={() => void abrirConversa(f)} />
                  <IconButton name="trash-outline" label="Remove friend" onPress={() => handleRemoveFriend(f.friendId)} />
                </View>
              </P>
              );
            })}
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
            {searchResults.length > 0 && (
              <Text style={[ui.eyebrow, { marginTop: ESP.md, marginBottom: ESP.xs }]}>
                RESULTS · {searchResults.length}
              </Text>
            )}
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
                      <IconButton name="checkmark" label={`Accept request from ${p.name || p.username}`} onPress={() => handleAcceptRequest(p.id)} />
                    )
                  ) : (
                    <IconButton name="person-add-outline" label={`Add ${p.name || p.username}`} onPress={() => handleAddFriend(p.id)} />
                  )}
                </View>
              );
            })}
            {!searchResults.length && !loading && searchQuery.trim() !== '' && (
              <Empty icon="search-outline" title="No profiles found" body={`Nothing matches "${searchQuery}". Try the exact username.`} />
            )}
            {/* Antes desta, a aba ficava em branco ate se escrever alguma
                coisa — um campo sozinho no meio do nada, sem dizer o que
                espera. */}
            {!searchResults.length && !loading && searchQuery.trim() === '' && (
              <Empty
                icon="person-add-outline"
                title="Find someone to share music with"
                body="Search by username or name. Usernames are exact — @rita finds Rita, rita finds nothing."
              />
            )}
          </View>
        )}
        </View>
      </ContentScroll>

      {/* CHAT DIALOG */}
      {/* CRIAR GRUPO */}
      <Dialog
        open={novoGrupoAberto}
        title="New group"
        onClose={() => { setNovoGrupoAberto(false); setMembrosEscolhidos([]); setNomeDoGrupo(''); }}
      >
        <View style={{ gap: ESP.md }}>
          <Text style={styles.formLabel}>GROUP NAME</Text>
          <Field
            placeholder="Give it a name"
            value={nomeDoGrupo}
            onChangeText={setNomeDoGrupo}
            onSubmitEditing={() => void criarGrupoAgora()}
          />
          <Text style={styles.formLabel}>MEMBERS</Text>
          {activeFriends.length === 0 ? (
            <Text style={styles.dialogBody}>Add friends first, then you can group them.</Text>
          ) : (
            <View style={{ gap: 6, maxHeight: 220, overflow: 'auto' as any }}>
              {activeFriends.map((f) => {
                const dentro = membrosEscolhidos.includes(f.friendId);
                return (
                  <Pressable
                    key={f.friendId}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: dentro }}
                    onPress={() => setMembrosEscolhidos((antes) => dentro
                      ? antes.filter((id) => id !== f.friendId)
                      : [...antes, f.friendId])}
                    style={[styles.destination, dentro && { borderColor: COR.texto }]}
                  >
                    <Ionicons name={dentro ? 'checkbox' : 'square-outline'} size={18} color={dentro ? COR.texto : COR.textoFraco} />
                    <Text style={styles.destinationText}>{f.name} (@{f.username})</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <View style={styles.dialogActions}>
            <Button secondary onPress={() => { setNovoGrupoAberto(false); setMembrosEscolhidos([]); setNomeDoGrupo(''); }}>Cancel</Button>
            <Button
              onPress={() => void criarGrupoAgora()}
              disabled={!nomeDoGrupo.trim() || membrosEscolhidos.length === 0 || aCriarGrupo}
            >
              {aCriarGrupo ? 'Creating…' : `Create with ${membrosEscolhidos.length}`}
            </Button>
          </View>
        </View>
      </Dialog>

      {/* CHAT */}
      <Dialog
        open={!!conversa}
        title={!conversa ? 'Chat'
          : conversa.tipo === 'amigo' ? `Chat with ${conversa.amigo.name}`
          : `${conversa.grupo.name} · ${conversa.grupo.membros.length} members`}
        onClose={() => setConversa(null)}
        width={500}
      >
        {conversa && (
          <View style={{ height: 420, justifyContent: 'space-between' }}>
            <ScrollView 
              ref={chatScrollRef}
              contentContainerStyle={{ gap: 10, paddingVertical: 10 }}
              style={{ flex: 1, marginBottom: 12 }}
            >
              {chatLoading && chatMessages.length === 0 ? (
                <Loading />
              ) : chatMessages.map((msg) => {
                // Numa conversa a dois bastava "nao e do outro". Num grupo ha
                // varios outros, por isso compara-se com o proprio id.
                const minha = conversa.tipo === 'amigo'
                  ? msg.sender.id !== conversa.amigo.friendId
                  : msg.sender.id === meuId;
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
                  {conversa.tipo === 'amigo'
                    ? `No messages yet. Say hello to ${conversa.amigo.name}.`
                    : `No messages yet in ${conversa.grupo.name}.`}
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
