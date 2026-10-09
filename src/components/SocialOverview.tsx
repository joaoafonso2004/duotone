// O Social do iPhone (9/10, docs/PLANO-SOCIAL-IOS.md e docs/social-ios.html).
// O PC tem o seu (SocialOverview.web.tsx). Só usa dados já recebidos pelo Social.
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ChatGroup } from '../api/social';
import type { PublicProfile } from '../api/profiles';
import type { SocialFriend } from '../state/social';
import type { Track } from '../types';
import type { ConversationPreview } from '../lib/socialActivity';
import { previaDaConversa } from '../lib/previaDaConversa';
import { ultimaAtividade } from '../lib/socialPresence';
import { haQuantoTempo } from '../lib/social';
import { ordenarConversas, CONVERSAS_PARA_PESQUISAR } from '../lib/ordemDasConversas';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { textoSobre } from '../lib/corDaCapa';
import { useTheme } from '../state/theme';
import { colors } from './socialTokens';
import { ESCALA_MAXIMA } from '../theme';
import { FriendAvatar } from './FriendAvatar';
import { GroupAvatar } from './GroupChat';
import { OuvirAgora } from './OuvirAgora';

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
  /** Pedidos de amizade recebidos: a pastilha por baixo do título. */
  pedidos?: number;
  /** A lupa do cabeçalho: mostra o campo de pesquisa. */
  procurar?: boolean;
  /** A margem da página: a fila "Listening now" vai de ponta a ponta. */
  gutter?: number;
  onOpen: (kind: 'friend' | 'group', id: string) => void;
  onProfile: (id: string) => void;
  onTrack: (track: Track) => void;
  onRemoveFriend: (id: string) => void;
  /** O menu de um amigo no toque longo (iPhone, 5/10); sem ele, o toque longo pede para o remover. */
  onFriendMenu?: (id: string, ancora: { x: number; y: number; width: number; height: number }) => void;
  onDeleteConversation: (id: string) => void;
  onStart: () => void;
}

const CARA = 54;

export function SocialOverview(props: Props) {
  const tema = useTheme((s) => s.theme);
  const [filter, setFilter] = useState('');
  const [verPedidos, setVerPedidos] = useState(false);
  const gutter = props.gutter ?? 24;
  const former = props.contacts.filter((p) => !props.friends.some((f) => f.friendId === p.id));
  const conversations = useMemo(() => ordenarConversas<ChatGroup, Pick<SocialFriend, 'name' | 'avatarUrl' | 'online'> & { musicActivity?: SocialFriend['musicActivity'] }>(
    props.groups.map((g) => ({ id: g.id, nome: g.name, grupo: g })),
    [...props.friends.map((f) => ({ id: f.friendId, nome: f.name || f.username, amigo: f })),
      ...former.map((p) => ({ id: p.id, nome: p.name || p.username, amigo: {
        name: p.name || p.username, avatarUrl: p.avatar_url, online: false, musicActivity: null,
      } }))], props.activity)
    .sort((a, b) => b.quando - a.quando || a.nome.localeCompare(b.nome)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [props.groups, props.friends, props.contacts, props.activity]);

  const query = filter.trim().toLowerCase();
  const filtradas = conversations.filter((c) => !query || c.nome.toLowerCase().includes(query));
  const chave = (c: (typeof conversations)[number]) => (c.tipo === 'grupo' ? `group:${c.id}` : c.id);
  // Com conversa (ou um grupo): "Chats". Amigos com quem nunca se falou: "Friends", no fim.
  const comConversa = filtradas.filter((c) => c.tipo === 'grupo' || props.previews[chave(c)] || c.quando > 0);
  const semConversa = filtradas.filter((c) => !comConversa.includes(c))
    .sort((a, b) => Number(b.tipo === 'amigo' && b.amigo.online) - Number(a.tipo === 'amigo' && a.amigo.online));
  const mostrarPesquisa = props.procurar ?? conversations.length >= CONVERSAS_PARA_PESQUISAR;
  const nomeDe = (id: string) => props.friends.find((f) => f.friendId === id)?.name ?? null;

  const linha = (c: (typeof conversations)[number]) => {
    const grupo = c.tipo === 'grupo';
    const key = chave(c);
    const preview = props.previews[key];
    const count = props.unread.get(key) ?? 0;
    const amigo = grupo ? undefined : props.friends.find((f) => f.friendId === c.id);
    const aOuvir = !!amigo?.musicActivity?.listening;
    const previa = preview
      ? previaDaConversa(preview, props.myId, {
        outro: grupo ? null : c.nome, nomeDe: grupo ? nomeDe : undefined,
        titulo: tituloDaFaixa, artista: displayArtist,
      })
      : null;
    const texto = previa?.texto
      ?? (grupo ? `${c.grupo.membros.length} members`
        : aOuvir ? `Listening to ${tituloDaFaixa(amigo!.musicActivity!.track)}`
          : amigo?.online ? 'Online' : ultimaAtividade(amigo?.lastSeenAt, props.now));
    const capa = previa?.musica ? capaParaLista(previa.capa ?? null) : null;
    const antigo = former.some((p) => p.id === c.id);
    return (
      <Pressable
        key={key}
        accessibilityRole="button"
        accessibilityLabel={`${c.nome}. ${texto}${count ? `. ${count} unread` : ''}`}
        accessibilityHint={grupo ? undefined : 'Hold for more options'}
        onPress={() => props.onOpen(grupo ? 'group' : 'friend', c.id)}
        onLongPress={(e) => {
          if (grupo) return;
          if (antigo) props.onDeleteConversation(c.id);
          else if (props.onFriendMenu) props.onFriendMenu(c.id, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, width: 1, height: 1 });
          else props.onRemoveFriend(c.id);
        }}
        style={({ pressed }) => [styles.linha, { marginHorizontal: -gutter, paddingHorizontal: gutter }, pressed && styles.premida]}
      >
        {grupo ? <GroupAvatar group={c.grupo} size={CARA} /> : (
          <View style={[styles.anel, aOuvir && { borderColor: tema.color }]}>
            <FriendAvatar avatarUrl={c.amigo.avatarUrl} name={c.nome} size={CARA - 6} />
            {c.amigo.online ? <View style={styles.online} /> : null}
          </View>
        )}
        <View style={styles.meio}>
          <View style={styles.cima}>
            <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={[styles.nome, count > 0 && styles.nomeNaoLido]}>{c.nome}</Text>
            {preview ? <Text maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={[styles.hora, count > 0 && { color: tema.color }]}>{haQuantoTempo(preview.createdAt, props.now)}</Text> : null}
          </View>
          <View style={styles.baixo}>
            {previa?.musica ? (capa
              ? <Image source={{ uri: capa }} style={styles.miniCapa} contentFit="cover" cachePolicy="memory-disk" />
              : <Ionicons name="musical-note" size={14} color={count > 0 ? colors.text : colors.textTertiary} />) : null}
            <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={[styles.previa, count > 0 && styles.previaNaoLida]}>{texto}</Text>
            {count > 0 ? (
              <View style={[styles.contagem, { backgroundColor: tema.color }]}>
                <Text style={[styles.contagemTexto, { color: textoSobre(tema.color) }]}>{count > 99 ? '99+' : count}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.raiz}>
      {props.pedidos ? (
        <View style={{ gap: 12 }}>
          <Pressable accessibilityRole="button" onPress={() => setVerPedidos((v) => !v)}
            style={({ pressed }) => [styles.pedidos, { backgroundColor: tema.soft }, pressed && styles.premida]}>
            <Ionicons name="person-add" size={14} color={colors.text} />
            <Text style={styles.pedidosTexto}>{props.pedidos} friend {props.pedidos === 1 ? 'request' : 'requests'}</Text>
            <Ionicons name={verPedidos ? 'chevron-up' : 'chevron-forward'} size={14} color={colors.textSecondary} />
          </Pressable>
          {verPedidos ? props.requests : null}
        </View>
      ) : props.requests}

      {mostrarPesquisa ? (
        <TextInput value={filter} onChangeText={setFilter} autoFocus={!!props.procurar}
          accessibilityLabel="Search friends and groups" placeholder="Search friends and groups"
          placeholderTextColor={colors.textSecondary} autoCapitalize="none" autoCorrect={false}
          clearButtonMode="while-editing" style={styles.pesquisa} />
      ) : null}

      {!query ? <OuvirAgora amigos={props.friends} gutter={gutter} /> : null}

      {comConversa.length ? (
        <View>
          <Text accessibilityRole="header" style={styles.titulo}>Chats</Text>
          {comConversa.map(linha)}
        </View>
      ) : null}

      {semConversa.length ? (
        <View>
          <Text accessibilityRole="header" style={styles.subtitulo}>Friends</Text>
          {semConversa.map(linha)}
        </View>
      ) : null}

      {!filtradas.length && !props.loading ? (
        <Pressable accessibilityRole="button" onPress={props.onStart} style={styles.vazio}>
          <Ionicons name={query ? 'search' : 'people-outline'} size={28} color={colors.textTertiary} />
          <Text style={styles.vazioTexto}>{query ? 'No friends or groups match.' : 'Add a friend to share music and listen together.'}</Text>
          {!query ? <Text style={[styles.nome, { color: tema.color }]}>Add a friend</Text> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { gap: 26 },
  titulo: { fontSize: 20, fontWeight: '700', color: colors.text, letterSpacing: -0.3, marginBottom: 4 },
  subtitulo: { fontSize: 13, fontWeight: '600', color: colors.textTertiary, marginBottom: 2 },
  pedidos: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, height: 32,
    paddingHorizontal: 12, borderRadius: 16, borderCurve: 'continuous',
  },
  pedidosTexto: { fontSize: 13, fontWeight: '600', color: colors.text },
  pesquisa: {
    minHeight: 40, borderRadius: 12, borderCurve: 'continuous', backgroundColor: colors.surface,
    color: colors.text, paddingHorizontal: 14, fontSize: 15,
  },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 8, minHeight: 72 },
  premida: { backgroundColor: 'rgba(255,255,255,0.04)' },
  anel: {
    width: CARA, height: CARA, borderRadius: CARA / 2, borderWidth: 2, borderColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
  },
  online: {
    position: 'absolute', right: -1, bottom: -1, width: 15, height: 15, borderRadius: 8,
    backgroundColor: colors.online, borderWidth: 3, borderColor: colors.bg,
  },
  meio: { flex: 1, minWidth: 0, gap: 3 },
  cima: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  nome: { flex: 1, minWidth: 0, fontSize: 16, fontWeight: '600', color: colors.text },
  nomeNaoLido: { fontWeight: '800' },
  hora: { fontSize: 13, color: colors.textTertiary },
  baixo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  miniCapa: { width: 16, height: 16, borderRadius: 3 },
  previa: { flex: 1, minWidth: 0, fontSize: 14, color: colors.textSecondary },
  previaNaoLida: { color: colors.text, fontWeight: '500' },
  contagem: { minWidth: 21, height: 21, paddingHorizontal: 6, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  contagemTexto: { fontSize: 12, fontWeight: '800' },
  vazio: { alignItems: 'center', gap: 10, paddingVertical: 36 },
  vazioTexto: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
});
