// Atividade musical e conversas numa só vista, com os dados já recebidos pelo Social.
// O PC (9/10): o iPhone tem a sua (SocialOverview.tsx, docs/PLANO-SOCIAL-IOS.md).
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { colors, radii } from './socialTokens';
import { ESCALA_MAXIMA } from '../theme';
import { CapaDuotone } from '../desktop/duotone.web';
import { useCorDoAmbiente } from '../hooks/useCorDoAmbiente';
import { marcar } from '../desktop/ui.web';
import { jamsDosAmigos } from '../state/jamsDosAmigos';
import { ouvirComAmigo } from '../state/ouvirComAmigo';
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
  /** `e`: o evento do botão direito (24/10), para o menu abrir onde está o rato. */
  onFriendMenu?: (id: string, ancora: { x: number; y: number; width: number; height: number }, e?: any) => void;
  onDeleteConversation: (id: string) => void;
  onStart: () => void;
}

/** Quantos cartões "Listening now" cabem em cima: os outros amigos ativos estão nas conversas, com o estado deles. */
const CARTOES_A_OUVIR = 5;

/**
 * Ir ouvir com ele: a Jam dele se tiver uma aberta, senão seguir (a mesma porta
 * do menu do botão direito). A pergunta das Jams é a partilhada com a Home
 * (`state/jamsDosAmigos.ts`, 2 min): só se faz ao carregar, e uma vez por 2 min.
 */
async function ouvirJunto(amigo: SocialFriend): Promise<void> {
  const jams = await jamsDosAmigos().catch(() => new Map<string, string>());
  await ouvirComAmigo(amigo, jams.get(amigo.friendId) ?? null);
}

/**
 * Um amigo que está a ouvir (30/10, passo 7 de `docs/PLANO-ELEVAR-PC.md`): a
 * capa a cores e as barrinhas a mexer enquanto ouve, e "Listen along" ao passar
 * o rato (CSS: `cartao-ouvir` / `ouvir-ja`). Quem ouviu há pouco fica a dois
 * tons, sem o botão (não há nada a que se juntar). Tocar no cartão abre as
 * opções da música, como antes.
 */
function CartaoAOuvir({ amigo, agora, aoAbrir }: { amigo: SocialFriend; agora: number; aoAbrir: (t: Track) => void }) {
  const a = amigo.musicActivity!;
  const title = tituloDaFaixa(a.track), artist = displayArtist(a.track);
  const status = musicActivityLabel(a, agora);
  const cover = capaParaLista(a.track.artworkUrl) ?? a.track.artworkUrl;
  // A cor da capa a lavar o cartão da esquerda para a direita (30/10, da maquete): só quem ouve agora.
  const cor = useCorDoAmbiente(a.listening ? cover : null);
  const lavagem = cor ? { backgroundImage: `linear-gradient(90deg, color-mix(in oklab, ${cor} 30%, transparent), ${colors.surface} 75%)` } : null;
  return <View {...marcar('cartao-ouvir')} style={[styles.activityCard, lavagem as any]}>
    <Pressable style={({pressed}) => [styles.activityMain, pressed && styles.pressed]} accessibilityRole="button"
      accessibilityLabel={`${amigo.name}, ${title}, ${artist}, ${status}. Song options`} onPress={() => aoAbrir(a.track)}>
      <View style={styles.activityCover}><CapaDuotone uri={cover} viva={a.listening} style={{ borderRadius: 8 }}/></View>
      <View style={styles.activityText}>
        <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.cardName}>{amigo.name}</Text>
        <View style={styles.activityLine}>
          {a.listening && <View {...marcar('eq')} aria-hidden style={styles.eq}><View style={styles.eqBarra}/><View style={styles.eqBarra}/><View style={styles.eqBarra}/></View>}
          <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.cardTitle}>{title} · {artist}</Text>
        </View>
        {!a.listening && <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.cardStatus}>{status}</Text>}
      </View>
    </Pressable>
    {a.listening && <Pressable {...marcar('ouvir-ja')} accessibilityRole="button" accessibilityLabel={`Listen along with ${amigo.name}`}
      style={({pressed}) => [styles.ouvirJa, pressed && styles.pressed]} onPress={() => void ouvirJunto(amigo)}>
      <Text style={styles.ouvirJaTexto}>Listen along</Text>
    </Pressable>}
  </View>;
}

export function SocialOverview(props: Props) {
  const [filter, setFilter] = useState('');
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
  const aOuvirAgora = listening.filter(f => f.musicActivity!.listening).length;

  return <View style={styles.root}>
      {listening.length > 0 && <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{aOuvirAgora ? `Listening now · ${aOuvirAgora}` : 'Recently played'}</Text>
        <View style={styles.cartoes} accessibilityLabel="Friends’ music activity">
          {listening.slice(0, CARTOES_A_OUVIR).map(f => <CartaoAOuvir key={f.friendId} amigo={f} agora={props.now} aoAbrir={props.onTrack}/>)}
        </View>
      </View>}
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>Conversations</Text>
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
        // O botão direito num amigo abre o menu dele (24/10); num grupo, ou numa conversa antiga, nada.
        const menu = !group && !oldContact && props.onFriendMenu
          ? { onContextMenu: (e: any) => { e.preventDefault(); props.onFriendMenu!(c.id, { x: e.nativeEvent?.clientX ?? 0, y: e.nativeEvent?.clientY ?? 0, width: 1, height: 1 }, e); } }
          : {};
        return <View key={key} style={styles.personRow} {...marcar('conversa')} {...(menu as any)}>
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
          {/* Sem o balão em cada linha (30/10): a linha inteira abre a conversa. Só o lixo de uma conversa antiga. */}
          {oldContact && <SocialIconButton label={`Delete conversation with ${c.nome}`} icon="trash-outline" onPress={() => props.onDeleteConversation(c.id)}/>}
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
  cartoes: { gap: 8 },
  activityCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: 16, paddingRight: 10 },
  activityMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
  activityCover: { width: 48, height: 48, flexShrink: 0 },
  activityText: { flex: 1, minWidth: 0, gap: 2 }, activityLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eq: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 12 }, eqBarra: { width: 3, height: 12, borderRadius: 2, backgroundColor: colors.online },
  ouvirJa: { height: 30, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  ouvirJaTexto: { color: colors.text, fontSize: 12, fontWeight: '600' },
  cardName: { color: colors.text, fontSize: 14, fontWeight: '700' }, cardTitle: { color: colors.textSecondary, fontSize: 12, flexShrink: 1 },
  cardStatus: { color: colors.textSecondary, fontSize: 12 }, pressed: { opacity: 0.7 },
  personRow: { minHeight: 60, paddingVertical: 6, paddingHorizontal: 8, marginHorizontal: -8, borderRadius: 14, flexDirection: 'row', gap: 12, alignItems: 'center' },
  personText: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center', gap: 3 },
  personName: { fontSize: 15, fontWeight: '600', color: colors.text }, secondary: { fontSize: 13, color: colors.textSecondary },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 }, flex: { flex: 1, minWidth: 0 },
  time: { fontSize: 11, color: colors.textSecondary }, unreadText: { fontWeight: '700' }, unreadPreview: { color: colors.text },
  unread: { minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  unreadNumber: { fontSize: 11, fontWeight: '700', color: colors.bg }, empty: { minHeight: 76, gap: 10, paddingVertical: 12 },
  search: { minHeight: 44, borderRadius: 12, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 12, fontSize: 15 },
});
