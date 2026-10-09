// Atividade musical e conversas numa só vista, com os dados já recebidos pelo Social.
// O PC (9/10): o iPhone tem a sua (SocialOverview.tsx, docs/PLANO-SOCIAL-IOS.md).
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ChatGroup } from '../api/social';
import type { PublicProfile } from '../api/profiles';
import type { SocialFriend } from '../state/social';
import type { Track } from '../types';
import { musicActivityLabel, type ConversationPreview } from '../lib/socialActivity';
import { previaDaConversa } from '../lib/previaDaConversa';
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
  /** O menu de um amigo no toque longo (iPhone, 5/10); sem ele, o toque longo pede para o remover. */
  onFriendMenu?: (id: string, ancora: { x: number; y: number; width: number; height: number }) => void;
  onDeleteConversation: (id: string) => void;
  onStart: () => void;
}

export function SocialOverview(props: Props) {
  const [filter, setFilter] = useState('');
  const [width, setWidth] = useState(0);
  const listening = useMemo(() => props.friends.filter(f => f.musicActivity).slice().sort((a, b) =>
    Number(b.musicActivity!.listening) - Number(a.musicActivity!.listening)
      || Date.parse(b.musicActivity!.at) - Date.parse(a.musicActivity!.at)), [props.friends]);
  const former = props.contacts.filter(p => !props.friends.some(f => f.friendId === p.id));
  const conversations = ordenarConversas<ChatGroup, Pick<SocialFriend, 'name' | 'avatarUrl' | 'online'>>(
    props.groups.map(g => ({ id: g.id, nome: g.name, grupo: g })),
    [...props.friends.map(f => ({ id: f.friendId, nome: f.name, amigo: f })),
      ...former.map(p => ({ id: p.id, nome: p.name || p.username, amigo: {
        friendId: p.id, name: p.name || p.username, avatarUrl: p.avatar_url, online: false, lastSeenAt: null,
      } }))], props.activity)
    // Mesmo um grupo ainda sem mensagens fica pela sua interação, sem ocupar o topo só por ser grupo.
    .sort((a, b) => b.quando - a.quando || a.nome.localeCompare(b.nome));
  const query = filter.trim().toLowerCase();
  const shown = conversations.filter(c => !query || c.nome.toLowerCase().includes(query));
  const cardWidth = Math.max(80, ((width || 294) - 16) / 3);

  return <View style={styles.root} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
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
      <Text accessibilityRole="header" style={styles.sectionTitle}>Friends</Text>
      {conversations.length >= CONVERSAS_PARA_PESQUISAR && <TextInput value={filter} onChangeText={setFilter}
        accessibilityLabel="Search friends and groups" placeholder="Search friends and groups" placeholderTextColor={colors.textSecondary}
        autoCapitalize="none" style={styles.search}/>}
      {shown.map(c => {
        const group = c.tipo === 'grupo', key = group ? `group:${c.id}` : c.id;
        const preview = props.previews[key], count = props.unread.get(key) ?? 0;
        const friend = group ? undefined : props.friends.find(f => f.friendId === c.id);
        const text = preview ? previaDaConversa(preview, props.myId, { outro: group ? null : c.nome, titulo: tituloDaFaixa, artista: displayArtist }).texto : c.tipo === 'grupo' ? `${c.grupo.membros.length} members`
          : friend?.musicActivity?.listening ? 'Listening now' : friend?.online ? 'Online now' : ultimaAtividade(friend?.lastSeenAt, props.now);
        const open = () => props.onOpen(group ? 'group' : 'friend', c.id);
        const oldContact = former.some(p => p.id === c.id);
        return <View key={key} style={styles.personRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={group ? `Open ${c.nome}` : `View ${c.nome}`}
            onPress={group ? open : () => props.onProfile(c.id)}>
            {c.tipo === 'grupo' ? <GroupAvatar group={c.grupo} size={44}/>
              : <AvatarDeConversa avatarUrl={c.amigo.avatarUrl} nome={c.nome} tamanho={44} online={c.amigo.online}/>}
          </Pressable>
          <Pressable style={styles.personText} accessibilityRole="button" accessibilityLabel={`${c.nome}. ${text}${count ? `. ${count} unread` : ''}`}
            onPress={open} onLongPress={(e) => !group && (oldContact ? props.onDeleteConversation(c.id)
              : props.onFriendMenu ? props.onFriendMenu(c.id, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, width: 1, height: 1 })
              : props.onRemoveFriend(c.id))}>
            <View style={styles.nameRow}><Text numberOfLines={1} style={[styles.personName, styles.flex, count > 0 && styles.unreadText]}>{c.nome}</Text>
              {preview && <Text style={styles.time}>{haQuantoTempo(preview.createdAt, props.now)}</Text>}</View>
            <Text numberOfLines={1} style={[styles.secondary, count > 0 && styles.unreadPreview]}>{text}</Text>
          </Pressable>
          {count > 0 && <Unread count={count}/>}
          <SocialIconButton label={oldContact ? `Delete conversation with ${c.nome}` : `Chat with ${c.nome}`}
            icon={oldContact ? 'trash-outline' : 'chatbubble-outline'} onPress={oldContact ? () => props.onDeleteConversation(c.id) : open}/>
        </View>;
      })}
      {!shown.length && !props.loading && <Pressable accessibilityRole="button" onPress={props.onStart} style={styles.empty}>
        <Text style={styles.secondary}>{query ? 'No friends or groups match.' : 'Add a friend to share music.'}</Text>
        {!query && <Text style={styles.personName}>New chat</Text>}
      </Pressable>}
    </View>
    {props.requests}
  </View>;
}

function Unread({count}: {count: number}) {
  return <View style={styles.unread}><Text style={styles.unreadNumber}>{count > 99 ? '99+' : count}</Text></View>;
}

const styles = StyleSheet.create({
  root: { gap: 24 }, section: { gap: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
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
