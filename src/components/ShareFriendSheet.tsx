import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import {
  getFriendships, getGrupos, shareComGrupo, shareItem,
  type ChatGroup, type Friendship,
} from '../api/social';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { hapticNotification, hapticSelection } from '../lib/haptics';
import { ESCALA } from '../lib/movimento';
import { ordenarConversas } from '../lib/ordemDasConversas';
import { correspondeAPesquisa } from '../lib/searchText';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { usePlaylists } from '../state/playlists';
import { useSocial } from '../state/social';
import { colors, radii, spacing, type } from '../theme';
import { BottomSheet, BottomSheetScrollView } from './BottomSheet';
import { FriendAvatar } from './FriendAvatar';
import { GroupAvatar } from './GroupChat';
import { Input } from './Input';
import { Toque } from './Toque';

type Destino =
  | { kind: 'group'; id: string; nome: string; sub: string; grupo: ChatGroup; quando: number }
  | { kind: 'friend'; id: string; nome: string; sub: string; amigo: Friendship; quando: number };

interface ShareFriendSheetProps {
  visible: boolean;
  itemType: 'playlist' | 'track';
  item: any; // Track ou Playlist
  onClose: () => void;
}

/** Quantas conversas entram em "Recent". */
const RECENTES = 5;

const chaveDe = (d: Destino) => (d.kind === 'group' ? `g:${d.id}` : d.id);

/**
 * Mandar uma música ou uma playlist a amigos, no iPhone (11/10): o mesmo que o
 * diálogo do PC (`ShareFriendSheet.web.tsx`, variante A de
 * `docs/partilhar-pc.html`), numa folha. A de antes mandava logo a quem se
 * tocava, não dizia o que ia, não tinha pesquisa e a mensagem tinha de vir
 * antes de escolher.
 *
 * Aqui: o que vai em cima, a pesquisa, as conversas recentes primeiro, tocar
 * MARCA (várias de uma vez), e a mensagem com o "Send to N" no fim. Os amigos e
 * os grupos vêm da store do Social; só se pedem à rede se ela estiver vazia.
 * "Listen together" usa as pessoas marcadas (só amigos: um grupo não entra numa
 * Jam); já numa Jam, junta a música à fila dela.
 */
export function ShareFriendSheet({ visible, itemType, item, onClose }: ShareFriendSheetProps) {
  const social = useSocial(useShallow((s) => ({ friends: s.friends, groups: s.groups, activity: s.activity })));
  const playlists = usePlaylists((s) => s.items);
  const abrirSessao = useOuvirJuntos((s) => s.abrir);
  const sessaoActual = useOuvirJuntos((s) => s.sessao);
  const sugerir = useOuvirJuntos((s) => s.sugerir);

  const [deFora, setDeFora] = useState<{ friends: Friendship[]; groups: ChatGroup[] } | null>(null);
  const [aCarregar, setACarregar] = useState(false);
  const [procura, setProcura] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [estado, setEstado] = useState<'escolher' | 'a-enviar' | 'enviado'>('escolher');
  const [feito, setFeito] = useState('');
  const [erro, setErro] = useState('');
  const [sugerida, setSugerida] = useState(false);
  const [aAbrir, setAAbrir] = useState(false);
  const fecharDepois = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A store do Social já tem tudo quando a app arrancou com conta. Se ainda
  // estiver vazia (abriu-se a partilha antes de ela carregar), pede-se uma vez.
  const vazia = social.friends.length === 0 && social.groups.length === 0;
  useEffect(() => {
    if (!visible) return;
    setProcura(''); setMensagem(''); setEscolhidos([]); setEstado('escolher'); setErro(''); setSugerida(false);
    let vivo = true;
    if (vazia && !deFora) {
      setACarregar(true);
      // Vão os dois, e um falhar não leva o outro.
      Promise.allSettled([getFriendships(), getGrupos()]).then(([a, g]) => {
        if (!vivo) return;
        setDeFora({
          friends: a.status === 'fulfilled' ? a.value : [],
          groups: g.status === 'fulfilled' ? g.value : [],
        });
      }).finally(() => { if (vivo) setACarregar(false); });
    }
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  useEffect(() => () => { if (fecharDepois.current) clearTimeout(fecharDepois.current); }, []);

  const amigos = (vazia && deFora ? deFora.friends : social.friends).filter((f) => f.status === 'accepted');
  const grupos = vazia && deFora ? deFora.groups : social.groups;

  const destinos: Destino[] = useMemo(() => ordenarConversas<ChatGroup, Friendship>(
    grupos.map((g) => ({ id: g.id, nome: g.name, grupo: g })),
    amigos.map((a) => ({ id: a.friendId, nome: a.name || a.username, amigo: a })),
    social.activity,
  ).map((c) => c.tipo === 'grupo'
    ? { kind: 'group' as const, id: c.id, nome: c.nome, quando: c.quando, grupo: c.grupo,
      sub: `${c.grupo.membros.length} ${c.grupo.membros.length === 1 ? 'member' : 'members'}` }
    : { kind: 'friend' as const, id: c.id, nome: c.nome, quando: c.quando, amigo: c.amigo, sub: `@${c.amigo.username}` }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [amigos.length, grupos.length, social.activity, social.friends, social.groups, deFora]);

  const filtrados = procura.trim()
    ? destinos.filter((d) => correspondeAPesquisa(procura, d.nome, d.sub))
    : destinos;
  const recentes = procura.trim() ? [] : filtrados.filter((d) => d.quando > 0).slice(0, RECENTES);
  const chavesRecentes = new Set(recentes.map(chaveDe));
  const resto = filtrados.filter((d) => !chavesRecentes.has(chaveDe(d)))
    .sort((a, b) => (procura.trim() ? 0 : a.nome.localeCompare(b.nome)));

  const porChave = new Map(destinos.map((d) => [chaveDe(d), d]));
  const escolhidosDestinos = escolhidos.map((k) => porChave.get(k)).filter((d): d is Destino => !!d);
  const alternar = (d: Destino) => {
    hapticSelection();
    const k = chaveDe(d);
    setEscolhidos((e) => (e.includes(k) ? e.filter((x) => x !== k) : [...e, k]));
    setErro('');
  };

  const nomes = (lista: readonly Destino[]) => {
    const n = lista.map((d) => d.nome);
    return n.length <= 2 ? n.join(' and ') : `${n.slice(0, 2).join(', ')} and ${n.length - 2} more`;
  };

  const enviar = async () => {
    if (!escolhidosDestinos.length || estado !== 'escolher') return;
    setEstado('a-enviar'); setErro('');
    const texto = mensagem.trim() || undefined;
    const paraAmigos = escolhidosDestinos.filter((d) => d.kind === 'friend').map((d) => d.id);
    const paraGrupos = escolhidosDestinos.filter((d) => d.kind === 'group');
    // Os amigos numa só inserção (o `shareItem` aceita a lista); cada grupo à parte.
    const resultados = await Promise.allSettled([
      paraAmigos.length ? shareItem(paraAmigos, itemType, item, texto) : Promise.resolve(),
      ...paraGrupos.map((g) => shareComGrupo(g.id, itemType, item, texto)),
    ]);
    const falharam: Destino[] = [];
    if (resultados[0].status === 'rejected') falharam.push(...escolhidosDestinos.filter((d) => d.kind === 'friend'));
    paraGrupos.forEach((g, i) => { if (resultados[i + 1].status === 'rejected') falharam.push(g); });
    if (falharam.length === 0) {
      hapticNotification();
      setFeito(`Sent to ${nomes(escolhidosDestinos)}`);
      setEstado('enviado');
      fecharDepois.current = setTimeout(onClose, 1400);
      return;
    }
    // Fica só quem falhou marcado, para tentar outra vez.
    setEscolhidos(falharam.map(chaveDe));
    setErro(`Couldn't send to ${nomes(falharam)}. Try again.`);
    setEstado('escolher');
  };

  const podeOuvirJuntos = itemType === 'track' && !!item?.sourceId;
  const amigosEscolhidos = escolhidosDestinos.filter((d) => d.kind === 'friend').map((d) => d.id);
  const ouvirJuntos = async () => {
    if (sessaoActual) {
      if (sugerida) return;
      try { hapticSelection(); await sugerir(item); setSugerida(true); hapticNotification(); } catch { /* fica; tentar outra vez */ }
      return;
    }
    if (!amigosEscolhidos.length || aAbrir) return;
    setAAbrir(true);
    try {
      hapticSelection();
      await abrirSessao(item, amigosEscolhidos, mensagem.trim() || undefined);
      hapticNotification();
      onClose();
    } catch {
      setErro('Couldn’t start listening together. Try again.');
    } finally {
      setAAbrir(false);
    }
  };

  const titulo = itemType === 'track' ? 'Send to friends' : 'Send playlist to friends';
  const linha = (d: Destino) => {
    const marcado = escolhidos.includes(chaveDe(d));
    return (
      <Pressable
        key={chaveDe(d)}
        onPress={() => alternar(d)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: marcado }}
        accessibilityLabel={`${d.nome}, ${d.sub}`}
        style={({ pressed }) => [styles.linha, pressed && { backgroundColor: colors.surfacePressed }]}
      >
        <View>
          {d.kind === 'group'
            ? <GroupAvatar group={d.grupo} size={44} />
            : <FriendAvatar avatarUrl={d.amigo.avatarUrl} name={d.nome} size={44} />}
          {d.kind === 'friend' && d.amigo.online ? <View style={styles.online} /> : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>{d.nome}</Text>
          <Text numberOfLines={1} style={type.caption}>{d.sub}</Text>
        </View>
        <View style={[styles.marca, marcado && styles.marcaOn]}>
          {marcado ? <Ionicons name="checkmark" size={15} color={colors.bg} /> : null}
        </View>
      </Pressable>
    );
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} titulo={titulo}>
      {estado === 'enviado' ? (
        <View style={styles.feito}>
          <View style={styles.visto}><Ionicons name="checkmark" size={24} color={colors.online} /></View>
          <Text style={[type.headline, { textAlign: 'center' }]}>{feito}</Text>
          <Text style={type.caption}>It’s in their chats.</Text>
        </View>
      ) : (
        <View>
          <OQueVai itemType={itemType} item={item} playlists={playlists} />

          <Input
            icon="search"
            placeholder="Search friends and groups"
            value={procura}
            onChangeText={setProcura}
            onClear={() => setProcura('')}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />

          {aCarregar ? (
            <ActivityIndicator color={colors.text} style={{ marginVertical: spacing.xl }} />
          ) : destinos.length === 0 ? (
            <View style={styles.vazio}>
              <Ionicons name="people-outline" size={24} color={colors.textTertiary} />
              <Text style={[type.caption, { textAlign: 'center' }]}>Add a friend or create a group to send them music.</Text>
            </View>
          ) : (
            // A altura sai do total e não do que a pesquisa deixa: escrever não
            // pode fazer a folha saltar.
            <BottomSheetScrollView
              style={{ height: Math.min(300, destinos.length * 60 + 70), marginTop: spacing.sm }}
              keyboardShouldPersistTaps="handled"
            >
              {recentes.length ? <Text style={styles.seccao}>RECENT</Text> : null}
              {recentes.map(linha)}
              {resto.length && recentes.length ? <Text style={styles.seccao}>EVERYONE</Text> : null}
              {resto.map(linha)}
              {!filtrados.length ? <Text style={[type.caption, styles.semNinguem]}>No friends or groups called “{procura.trim()}”.</Text> : null}
            </BottomSheetScrollView>
          )}

          {erro ? <Text style={styles.erro}>{erro}</Text> : null}

          <View style={styles.baixo}>
            <TextInput
              value={mensagem}
              onChangeText={setMensagem}
              placeholder="Add a message (optional)"
              placeholderTextColor={colors.textTertiary}
              selectionColor={colors.text}
              maxLength={4000}
              returnKeyType="send"
              onSubmitEditing={() => void enviar()}
              style={styles.mensagem}
              accessibilityLabel="Message"
            />
            <Toque
              escala={ESCALA.botao}
              onPress={() => void enviar()}
              disabled={!escolhidosDestinos.length || estado !== 'escolher'}
              accessibilityRole="button"
              accessibilityLabel={escolhidosDestinos.length ? `Send to ${nomes(escolhidosDestinos)}` : 'Send'}
              style={[styles.enviar, !escolhidosDestinos.length && { opacity: 0.35 }]}
            >
              {estado === 'a-enviar'
                ? <ActivityIndicator size="small" color={colors.bg} />
                : <Text style={styles.enviarTexto}>{escolhidosDestinos.length > 1 ? `Send to ${escolhidosDestinos.length}` : 'Send'}</Text>}
            </Toque>
          </View>

          {podeOuvirJuntos && destinos.length > 0 ? (
            <Toque
              escala={ESCALA.botao}
              onPress={() => void ouvirJuntos()}
              disabled={sessaoActual ? sugerida : (!amigosEscolhidos.length || aAbrir)}
              accessibilityRole="button"
              style={[styles.secundario, (!sessaoActual && !amigosEscolhidos.length) && { opacity: 0.5 }]}
            >
              {aAbrir ? <ActivityIndicator size="small" color={colors.text} /> : (
                <>
                  <Ionicons name={sugerida ? 'checkmark-circle' : sessaoActual ? 'add-circle-outline' : 'headset-outline'} size={17} color={colors.textSecondary} />
                  <Text style={styles.secundarioTexto}>
                    {sessaoActual
                      ? (sugerida ? 'Added to the Jam queue' : 'Add to the Jam queue')
                      : amigosEscolhidos.length
                        ? `Listen together with ${amigosEscolhidos.length === 1 ? escolhidosDestinos.find((d) => d.kind === 'friend')!.nome : `${amigosEscolhidos.length} friends`}`
                        : 'Listen together (choose friends above)'}
                  </Text>
                </>
              )}
            </Toque>
          ) : null}
        </View>
      )}
    </BottomSheet>
  );
}

/** O que se vai mandar: a capa, o nome e o artista (ou a playlist). */
function OQueVai({ itemType, item, playlists }: {
  itemType: 'playlist' | 'track';
  item: any;
  playlists: readonly { id: string; artworks: string[]; trackCount: number }[];
}) {
  if (!item) return null;
  if (itemType === 'track') {
    const capa = capaParaLista(item.artworkUrl) ?? item.artworkUrl ?? null;
    return (
      <View style={styles.oQue}>
        {capa ? <Image source={{ uri: capa }} style={styles.capa} contentFit="cover" />
          : <View style={[styles.capa, styles.semCapa]}><Ionicons name="musical-notes" size={18} color={colors.textTertiary} /></View>}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.tipo}>SONG</Text>
          <Text numberOfLines={1} style={styles.oQueTitulo}>{tituloDaFaixa(item)}</Text>
          <Text numberOfLines={1} style={type.caption}>{displayArtist(item)}</Text>
        </View>
      </View>
    );
  }
  const pl = playlists.find((p) => p.id === item.id);
  const capas = (pl?.artworks ?? item.artworks ?? []).filter(Boolean).slice(0, 4) as string[];
  return (
    <View style={styles.oQue}>
      {capas.length >= 4 ? (
        <View style={[styles.capa, styles.mosaico]}>
          {capas.map((c, i) => <Image key={i} source={{ uri: capaParaLista(c) ?? c }} style={{ width: '50%', height: '50%' }} contentFit="cover" />)}
        </View>
      ) : capas.length ? <Image source={{ uri: capaParaLista(capas[0]) ?? capas[0] }} style={styles.capa} contentFit="cover" />
        : <View style={[styles.capa, styles.semCapa]}><Ionicons name="albums-outline" size={18} color={colors.textTertiary} /></View>}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.tipo}>PLAYLIST</Text>
        <Text numberOfLines={1} style={styles.oQueTitulo}>{item.name}</Text>
        {pl ? <Text numberOfLines={1} style={type.caption}>{pl.trackCount} {pl.trackCount === 1 ? 'song' : 'songs'}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  oQue: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: 10, marginBottom: spacing.md,
    borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  capa: { width: 52, height: 52, borderRadius: 6, backgroundColor: colors.surfacePressed, overflow: 'hidden' },
  mosaico: { flexDirection: 'row', flexWrap: 'wrap' },
  semCapa: { alignItems: 'center', justifyContent: 'center' },
  tipo: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: colors.textTertiary },
  oQueTitulo: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 2 },
  seccao: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: colors.textTertiary,
    marginTop: spacing.md, marginBottom: spacing.xs, marginHorizontal: spacing.xs,
  },
  linha: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: 8, paddingHorizontal: spacing.xs, borderRadius: radii.md, borderCurve: 'continuous',
  },
  online: {
    position: 'absolute', right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7,
    backgroundColor: colors.online, borderWidth: 2, borderColor: colors.surfaceHigh,
  },
  marca: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(245,245,247,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  marcaOn: { backgroundColor: colors.text, borderColor: colors.text },
  vazio: { alignItems: 'center', gap: spacing.sm, paddingVertical: 32, paddingHorizontal: spacing.lg },
  semNinguem: { textAlign: 'center', paddingVertical: spacing.lg },
  erro: { fontSize: 13, color: colors.danger, marginTop: spacing.sm },
  baixo: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  mensagem: {
    flex: 1, height: 44, borderRadius: radii.md, borderCurve: 'continuous', backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong,
    paddingHorizontal: spacing.md, color: colors.text, fontSize: 15,
  },
  enviar: {
    height: 44, minWidth: 80, paddingHorizontal: spacing.lg, borderRadius: radii.md, borderCurve: 'continuous',
    backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center',
  },
  enviarTexto: { fontSize: 15, fontWeight: '700', color: colors.bg },
  secundario: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    height: 44, marginTop: spacing.sm, borderRadius: radii.md, borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong,
  },
  secundarioTexto: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  feito: { alignItems: 'center', gap: 10, paddingTop: spacing.xl, paddingBottom: spacing.xxl },
  visto: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(126,221,183,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
});
