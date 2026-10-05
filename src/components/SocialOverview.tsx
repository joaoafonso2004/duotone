// Friends e Chats partilham os dados do Social; mudar de separador não relê a conta.
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ChatGroup } from '../api/social';
import type { PublicProfile } from '../api/profiles';
import type { SocialFriend } from '../state/social';
import type { Track } from '../types';
import { musicActivityLabel, previewText, type ConversationPreview } from '../lib/socialActivity';
import { ultimaAtividade } from '../lib/socialPresence';
import { haQuantoTempo } from '../lib/social';
import { ordenarConversas, CONVERSAS_PARA_PESQUISAR } from '../lib/ordemDasConversas';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { colors } from './socialTokens';
import { ESCALA_MAXIMA } from '../theme';
import { AvatarDeConversa, SocialIconButton } from './socialUI';
import { GroupAvatar } from './GroupChat';

interface Props {
  friends: readonly SocialFriend[];
  groups: readonly ChatGroup[];
  contacts: readonly PublicProfile[];
  previews: Readonly<Record<string, ConversationPreview>>;
  activity: Readonly<Record<string, number>>;
  unread: ReadonlyMap<string, number>;
  now: number;
  myId: string | undefined;
  loading: boolean;
  requests: React.ReactNode;
  onOpen: (kind: 'friend' | 'group', id: string) => void;
  onProfile: (id: string) => void;
  onTrack: (track: Track) => void;
  onRemoveFriend: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onStart: () => void;
}

export function SocialOverview(props: Props) {
  const [tab, setTab] = useState<'friends' | 'chats'>('friends');
  const [allFriends, setAllFriends] = useState(false);
  const [filter, setFilter] = useState('');
  const [width, setWidth] = useState(0);
  const listening = useMemo(() => props.friends.filter(f => f.musicActivity).slice().sort((a, b) =>
    Number(b.musicActivity!.listening) - Number(a.musicActivity!.listening)
      || Date.parse(b.musicActivity!.at) - Date.parse(a.musicActivity!.at)), [props.friends]);
  const friends = useMemo(() => props.friends.slice().sort((a, b) =>
    Number(b.musicActivity?.listening ?? false) - Number(a.musicActivity?.listening ?? false)
      || Number(b.online ?? false) - Number(a.online ?? false)
      || Date.parse(b.lastSeenAt ?? '') - Date.parse(a.lastSeenAt ?? '') || a.name.localeCompare(b.name)), [props.friends]);
  const former = props.contacts.filter(p => !props.friends.some(f => f.friendId === p.id));
  const conversations = ordenarConversas<ChatGroup, Pick<SocialFriend, 'name' | 'avatarUrl' | 'online'>>(
    props.groups.map(g => ({ id: g.id, nome: g.name, grupo: g })),
    [...props.friends.map(f => ({ id: f.friendId, nome: f.name, amigo: f })),
      ...former.map(p => ({ id: p.id, nome: p.name || p.username, amigo: {
        friendId: p.id, name: p.name || p.username, avatarUrl: p.avatar_url, online: false, lastSeenAt: null,
      } }))], props.activity);
  const query = filter.trim().toLowerCase();
  const shown = conversations.filter(c => (!query || c.nome.toLowerCase().includes(query))
    && (c.tipo === 'grupo' || props.previews[c.id] || props.activity[c.id] || props.unread.get(c.id)));
  const cardWidth = Math.max(80, ((width || 294) - 16) / 3);

  const friendRow = (f: typeof friends[number]) => <View key={f.friendId} style={styles.personRow}>
    <Pressable accessibilityRole="button" accessibilityLabel={`View ${f.name}`} onPress={() => props.onProfile(f.friendId)}>
      <AvatarDeConversa avatarUrl={f.avatarUrl} nome={f.name} tamanho={44} online={f.online}/>
    </Pressable>
    <Pressable style={styles.personText} accessibilityRole="button" accessibilityLabel={`Chat with ${f.name}`}
      onPress={() => props.onOpen('friend', f.friendId)} onLongPress={() => props.onRemoveFriend(f.friendId)} delayLongPress={350}>
      <Text numberOfLines={1} style={styles.personName}>{f.name}</Text>
      <Text numberOfLines={1} style={styles.secondary}>{f.musicActivity?.listening ? 'Listening now'
        : f.online ? 'Online now' : ultimaAtividade(f.lastSeenAt, props.now)}</Text>
    </Pressable>
    {!!props.unread.get(f.friendId) && <Unread count={props.unread.get(f.friendId)!}/>}
    <SocialIconButton label={`Chat with ${f.name}`} icon="chatbubble-outline" onPress={() => props.onOpen('friend', f.friendId)}/>
  </View>;

  return <View style={styles.root} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
    <View accessibilityRole="tablist" style={styles.tabs}>
      {(['friends', 'chats'] as const).map(value => <Pressable key={value} accessibilityRole="tab"
        accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)}
        style={[styles.tab, tab === value && styles.selectedTab]}>
        <Text style={[styles.tabText, tab === value && styles.selectedText]}>{value === 'friends' ? 'Friends' : 'Chats'}</Text>
      </Pressable>)}
    </View>
    {tab === 'friends' ? <>
      {listening.length > 0 && <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Music activity</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}
          accessibilityLabel="Friends’ music activity">
          {listening.map(f => {
            const a = f.musicActivity!;
            const title = tituloDaFaixa(a.track), artist = displayArtist(a.track);
            const status = musicActivityLabel(a, props.now);
            const cover = capaParaLista(a.track.artworkUrl) ?? a.track.artworkUrl;
            return <Pressable key={f.friendId} style={({pressed}) => [styles.activityCard, { width: cardWidth }, pressed && styles.pressed]}
              accessibilityRole="button" accessibilityLabel={`${f.name}, ${title}, ${artist}, ${status}. Song options`}
              onPress={() => props.onTrack(a.track)}>
              {cover ? <Image source={{uri: cover}} cachePolicy="memory-disk" contentFit="cover" style={styles.artwork}/>
                : <View style={[styles.artwork, styles.noArtwork]}><Ionicons name="musical-note" size={20} color={colors.textSecondary}/></View>}
              <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.cardName}>{f.name}</Text>
              <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.cardTitle}>{title}</Text>
              <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.cardArtist}>{artist}</Text>
              <View style={styles.activityStatus}>
                {a.listening && <View style={styles.listeningDot}/>}
                <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.cardStatus}>{status}</Text>
              </View>
            </Pressable>;
          })}
        </ScrollView>
      </View>}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Friends</Text>
          {friends.length > 3 && <Pressable accessibilityRole="button" style={styles.sectionAction} onPress={() => setAllFriends(v => !v)}>
            <Text style={styles.sectionTitle}>{allFriends ? 'Show less' : 'See all'}</Text>
          </Pressable>}
        </View>
        {(allFriends ? friends : friends.slice(0, 3)).map(friendRow)}
        {!friends.length && !props.loading && <Pressable onPress={props.onStart} accessibilityRole="button" style={styles.empty}>
          <Text style={styles.secondary}>Add a friend to share music.</Text>
          <Text style={styles.personName}>Find friends</Text>
        </Pressable>}
      </View>
      {props.requests}
    </> : <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>Conversations</Text>
      {conversations.length >= CONVERSAS_PARA_PESQUISAR && <TextInput value={filter} onChangeText={setFilter}
        accessibilityLabel="Search conversations" placeholder="Search conversations" placeholderTextColor={colors.textSecondary}
        autoCapitalize="none" style={styles.search}/>}
      {shown.map(c => {
        const group = c.tipo === 'grupo', key = group ? `group:${c.id}` : c.id;
        const preview = props.previews[key], count = props.unread.get(key) ?? 0;
        const text = preview ? previewText(preview, props.myId) : group ? `${c.grupo.membros.length} members` : 'Start a conversation';
        return <Pressable key={key} style={styles.personRow} accessibilityRole="button" accessibilityLabel={`${c.nome}. ${text}${count ? `. ${count} unread` : ''}`}
          onPress={() => props.onOpen(group ? 'group' : 'friend', c.id)}
          onLongPress={() => !group && (former.some(p => p.id === c.id) ? props.onDeleteConversation(c.id) : props.onRemoveFriend(c.id))}>
          {c.tipo === 'grupo' ? <GroupAvatar group={c.grupo} size={44}/>
            : <AvatarDeConversa avatarUrl={c.amigo.avatarUrl} nome={c.nome} tamanho={44} online={c.amigo.online}/>}
          <View style={styles.personText}>
            <View style={styles.nameRow}><Text numberOfLines={1} style={[styles.personName, styles.flex, count > 0 && styles.unreadText]}>{c.nome}</Text>
              {preview && <Text style={styles.time}>{haQuantoTempo(preview.createdAt, props.now)}</Text>}</View>
            <Text numberOfLines={1} style={[styles.secondary, count > 0 && styles.unreadPreview]}>{text}</Text>
          </View>
          {count > 0 && <Unread count={count}/>}
          {former.some(p => p.id === c.id) && <SocialIconButton label={`Delete conversation with ${c.nome}`} icon="trash-outline" onPress={() => props.onDeleteConversation(c.id)}/>}
        </Pressable>;
      })}
      {!shown.length && !props.loading && <Pressable accessibilityRole="button" onPress={props.onStart} style={styles.empty}>
        <Text style={styles.secondary}>{query ? 'No conversations match.' : 'Share a song or say hello.'}</Text>
        {!query && <Text style={styles.personName}>New chat</Text>}
      </Pressable>}
    </View>}
  </View>;
}

function Unread({count}: {count: number}) {
  return <View style={styles.unread}><Text style={styles.unreadNumber}>{count > 99 ? '99+' : count}</Text></View>;
}

const styles = StyleSheet.create({
  root: { gap: 24 }, tabs: { flexDirection: 'row', gap: 24 },
  tab: { minHeight: 44, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  selectedTab: { borderBottomColor: colors.text }, tabText: { fontSize: 14, color: colors.textSecondary }, selectedText: { color: colors.text },
  section: { gap: 12 }, sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 28 },
  sectionTitle: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  sectionAction: { minHeight: 44, paddingLeft: 12, justifyContent: 'center' },
  shelf: { gap: 8, paddingBottom: 2 }, activityCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 8, gap: 4, minHeight: 140 },
  artwork: { width: 44, height: 44, borderRadius: 7, marginBottom: 5 }, noArtwork: { backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  cardName: { color: colors.text, fontSize: 12, fontWeight: '600' }, cardTitle: { color: colors.text, fontSize: 12 },
  cardArtist: { color: colors.textSecondary, fontSize: 11 }, activityStatus: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  listeningDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.online },
  cardStatus: { color: colors.textSecondary, fontSize: 11, flexShrink: 1 }, pressed: { opacity: 0.7 },
  personRow: { minHeight: 60, paddingVertical: 6, flexDirection: 'row', gap: 12, alignItems: 'center' },
  personText: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center', gap: 3 },
  personName: { fontSize: 15, fontWeight: '600', color: colors.text }, secondary: { fontSize: 13, color: colors.textSecondary },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 }, flex: { flex: 1, minWidth: 0 },
  time: { fontSize: 11, color: colors.textSecondary }, unreadText: { fontWeight: '700' }, unreadPreview: { color: colors.text },
  unread: { minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  unreadNumber: { fontSize: 11, fontWeight: '700', color: colors.bg }, empty: { minHeight: 76, gap: 10, paddingVertical: 12 },
  search: { minHeight: 44, borderRadius: 12, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 12, fontSize: 15 },
});
