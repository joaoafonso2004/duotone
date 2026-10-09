import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import {
  getFriendships, getGrupos, shareComGrupo, shareItem,
  type ChatGroup, type Friendship,
} from '../api/social';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { ordenarConversas } from '../lib/ordemDasConversas';
import { correspondeAPesquisa } from '../lib/searchText';
import { usePlaylists } from '../state/playlists';
import { useSocial } from '../state/social';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { Field, marcar } from '../desktop/ui.web';
import { COR, ESP, FONT, RAIO, TIPO } from '../desktop/tokens.web';
import { BottomSheet } from './BottomSheet';
import { FriendAvatar } from './FriendAvatar';
import { GroupAvatar } from './GroupChat';

interface ShareFriendSheetProps {
  visible: boolean;
  itemType: 'playlist' | 'track';
  item: any; // Track ou Playlist
  onClose: () => void;
}

type Destino =
  | { kind: 'group'; id: string; nome: string; sub: string; grupo: ChatGroup; quando: number }
  | { kind: 'friend'; id: string; nome: string; sub: string; amigo: Friendship; quando: number };

/** Quantas conversas entram em "Recent". */
const RECENTES = 5;

const chaveDe = (d: Destino) => (d.kind === 'group' ? `g:${d.id}` : d.id);

/**
 * Mandar uma música ou uma playlist a amigos, no PC (9/10, variante A de
 * `docs/partilhar-pc.html`). Era a folha do iPhone dentro de um diálogo: não
 * dizia o que se mandava, um clique numa pessoa já enviava, a mensagem tinha
 * de vir antes e não havia pesquisa.
 *
 * Aqui: o que vai em cima, a pesquisa com o cursor, as conversas recentes
 * primeiro, várias pessoas marcadas de uma vez e a mensagem para todas no fim.
 * Os amigos e os grupos vêm da store do Social (já carregada pela lateral);
 * só se pedem à rede se ela estiver vazia. O iPhone continua com a sua folha.
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
  const campo = useRef<any>(null);
  const fecharDepois = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A store do Social já tem tudo quando a app arrancou com conta. Se ainda
  // estiver vazia (abriu-se a partilha antes de ela carregar), pede-se uma vez.
  const vazia = social.friends.length === 0 && social.groups.length === 0;
  useEffect(() => {
    if (!visible) return;
    setProcura(''); setMensagem(''); setEscolhidos([]); setEstado('escolher'); setErro(''); setSugerida(false);
    const t = setTimeout(() => campo.current?.focus?.(), 60);
    let vivo = true;
    if (vazia && !deFora) {
      setACarregar(true);
      Promise.allSettled([getFriendships(), getGrupos()]).then(([a, g]) => {
        if (!vivo) return;
        setDeFora({
          friends: a.status === 'fulfilled' ? a.value : [],
          groups: g.status === 'fulfilled' ? g.value : [],
        });
      }).finally(() => { if (vivo) setACarregar(false); });
    }
    return () => { vivo = false; clearTimeout(t); };
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

  // Ouvir juntos: com as pessoas escolhidas (só amigos; um grupo não entra numa
  // Jam). Já numa Jam, junta a música à fila dela.
  const podeOuvirJuntos = itemType === 'track' && !!item?.sourceId;
  const amigosEscolhidos = escolhidosDestinos.filter((d) => d.kind === 'friend').map((d) => d.id);
  const ouvirJuntos = async () => {
    if (sessaoActual) {
      if (sugerida) return;
      try { await sugerir(item); setSugerida(true); } catch { /* fica; tentar outra vez */ }
      return;
    }
    if (!amigosEscolhidos.length || aAbrir) return;
    setAAbrir(true);
    try {
      await abrirSessao(item, amigosEscolhidos, mensagem.trim() || undefined);
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
        aria-checked={marcado}
        accessibilityLabel={`${d.nome}, ${d.sub}`}
        style={({ hovered }: any) => [s.linha, hovered && { backgroundColor: COR.hover }]}
      >
        <View>
          {d.kind === 'group'
            ? <GroupAvatar group={d.grupo} size={36} />
            : <FriendAvatar avatarUrl={d.amigo.avatarUrl} name={d.nome} size={36} />}
          {d.kind === 'friend' && d.amigo.online ? <View style={s.online} /> : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={s.nome}>{d.nome}</Text>
          <Text numberOfLines={1} style={s.sub}>{d.sub}</Text>
        </View>
        <View style={[s.marca, marcado && s.marcaOn]}>
          {marcado ? <Ionicons name="checkmark" size={13} color={COR.fundo} /> : null}
        </View>
      </Pressable>
    );
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} titulo={titulo}>
      {estado === 'enviado' ? (
        <View style={s.feito} {...marcar('pagina')}>
          <View style={s.visto}><Ionicons name="checkmark" size={22} color={COR.ok} /></View>
          <Text style={s.feitoTitulo}>{feito}</Text>
          <Text style={s.sub}>It’s in their chats.</Text>
        </View>
      ) : (
        <View style={{ minHeight: 0, flexShrink: 1 }}>
          <OQueVai itemType={itemType} item={item} playlists={playlists} />

          <Field
            ref={campo}
            icon="search"
            placeholder="Search friends and groups"
            value={procura}
            onChangeText={setProcura}
            onSubmitEditing={() => { if (filtrados.length === 1) alternar(filtrados[0]); }}
          />

          {aCarregar ? (
            <ActivityIndicator color={COR.texto} style={{ marginVertical: ESP.xl }} />
          ) : destinos.length === 0 ? (
            <Text style={s.vazio}>Add a friend or create a group to send them music.</Text>
          ) : (
            // A altura sai do total e não do que a pesquisa deixa: escrever não
            // pode fazer o diálogo saltar.
            <ScrollView style={[s.lista, { height: Math.min(300, destinos.length * 50 + 64) }]}
              contentContainerStyle={{ paddingBottom: ESP.xs }} keyboardShouldPersistTaps="handled">
              {recentes.length ? <Text style={s.seccao}>Recent</Text> : null}
              {recentes.map(linha)}
              {resto.length && recentes.length ? <Text style={s.seccao}>Everyone</Text> : null}
              {resto.map(linha)}
              {!filtrados.length ? <Text style={s.vazio}>No friends or groups called “{procura.trim()}”.</Text> : null}
            </ScrollView>
          )}

          {escolhidosDestinos.length ? (
            <View style={s.pastilhas}>
              {escolhidosDestinos.map((d) => (
                <Pressable key={chaveDe(d)} onPress={() => alternar(d)} accessibilityLabel={`Remove ${d.nome}`}
                  style={({ hovered }: any) => [s.pastilha, hovered && { backgroundColor: COR.metalEscuro }]}>
                  <Text numberOfLines={1} style={s.pastilhaTexto}>{d.nome}</Text>
                  <Ionicons name="close" size={12} color={COR.textoFraco} />
                </Pressable>
              ))}
            </View>
          ) : null}

          {erro ? <Text style={s.erro}>{erro}</Text> : null}

          <View style={s.baixo}>
            <TextInput
              value={mensagem}
              onChangeText={setMensagem}
              placeholder="Add a message (optional)"
              placeholderTextColor={COR.textoFraco}
              selectionColor={COR.texto}
              maxLength={4000}
              onSubmitEditing={() => void enviar()}
              style={s.mensagem}
              accessibilityLabel="Message"
            />
            <Pressable
              onPress={() => void enviar()}
              disabled={!escolhidosDestinos.length || estado !== 'escolher'}
              accessibilityRole="button"
              style={({ hovered }: any) => [s.enviar, hovered && { opacity: 0.9 }, (!escolhidosDestinos.length) && { opacity: 0.35 }]}
            >
              {estado === 'a-enviar'
                ? <ActivityIndicator size="small" color={COR.fundo} />
                : <Text style={s.enviarTexto}>{escolhidosDestinos.length > 1 ? `Send to ${escolhidosDestinos.length}` : 'Send'}</Text>}
            </Pressable>
          </View>

          {podeOuvirJuntos ? (
            <Pressable
              onPress={() => void ouvirJuntos()}
              disabled={sessaoActual ? sugerida : (!amigosEscolhidos.length || aAbrir)}
              accessibilityRole="button"
              style={({ hovered }: any) => [s.secundario, hovered && { backgroundColor: COR.hover },
                (!sessaoActual && !amigosEscolhidos.length) && { opacity: 0.5 }]}
            >
              {aAbrir ? <ActivityIndicator size="small" color={COR.texto} /> : (
                <>
                  <Ionicons name={sugerida ? 'checkmark-circle' : sessaoActual ? 'add-circle-outline' : 'headset-outline'} size={15} color={COR.textoMedio} />
                  <Text style={s.secundarioTexto}>
                    {sessaoActual
                      ? (sugerida ? 'Added to the Jam queue' : 'Add to the Jam queue')
                      : amigosEscolhidos.length
                        ? `Listen together with ${amigosEscolhidos.length === 1 ? escolhidosDestinos.find((d) => d.kind === 'friend')!.nome : `${amigosEscolhidos.length} friends`}`
                        : 'Listen together (choose friends above)'}
                  </Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>
      )}
    </BottomSheet>
  );
}

/** O que se vai mandar: a capa, o nome e o artista (ou a playlist). */
function OQueVai({ itemType, item, playlists }: { itemType: 'playlist' | 'track'; item: any; playlists: readonly { id: string; artworks: string[]; trackCount: number }[] }) {
  if (!item) return null;
  if (itemType === 'track') {
    const capa = capaParaLista(item.artworkUrl) ?? item.artworkUrl ?? null;
    return (
      <View style={s.oQue}>
        {capa ? <Image source={{ uri: capa }} style={s.capa} resizeMode="cover" />
          : <View style={[s.capa, s.semCapa]}><Ionicons name="musical-notes" size={18} color={COR.textoFraco} /></View>}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.tipo}>Song</Text>
          <Text numberOfLines={1} style={s.oQueTitulo}>{tituloDaFaixa(item)}</Text>
          <Text numberOfLines={1} style={s.sub}>{displayArtist(item)}</Text>
        </View>
      </View>
    );
  }
  const pl = playlists.find((p) => p.id === item.id);
  const capas = (pl?.artworks ?? item.artworks ?? []).filter(Boolean).slice(0, 4) as string[];
  return (
    <View style={s.oQue}>
      {capas.length >= 4 ? (
        <View style={[s.capa, s.mosaico]}>
          {capas.map((c, i) => <Image key={i} source={{ uri: capaParaLista(c) ?? c }} style={{ width: '50%', height: '50%' }} resizeMode="cover" />)}
        </View>
      ) : capas.length ? <Image source={{ uri: capaParaLista(capas[0]) ?? capas[0] }} style={s.capa} resizeMode="cover" />
        : <View style={[s.capa, s.semCapa]}><Ionicons name="albums-outline" size={18} color={COR.textoFraco} /></View>}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.tipo}>Playlist</Text>
        <Text numberOfLines={1} style={s.oQueTitulo}>{item.name}</Text>
        {pl ? <Text numberOfLines={1} style={s.sub}>{pl.trackCount} {pl.trackCount === 1 ? 'song' : 'songs'}</Text> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  oQue: {
    flexDirection: 'row', alignItems: 'center', gap: ESP.md, padding: 10, marginBottom: ESP.md,
    borderRadius: RAIO.cartao + 4, backgroundColor: COR.painel, borderWidth: 1, borderColor: COR.linhaSuave,
  },
  capa: { width: 48, height: 48, borderRadius: 6, backgroundColor: COR.hover, overflow: 'hidden' },
  mosaico: { flexDirection: 'row', flexWrap: 'wrap' },
  semCapa: { alignItems: 'center', justifyContent: 'center' },
  tipo: { ...TIPO.micro, color: COR.textoFraco },
  oQueTitulo: { fontFamily: FONT.display, fontSize: 15, fontWeight: '700', color: COR.texto, marginTop: 2 },
  lista: { maxHeight: 300, marginTop: ESP.xs, marginHorizontal: -6 },
  seccao: { ...TIPO.micro, color: COR.textoFraco, marginTop: ESP.md, marginBottom: ESP.xs, marginHorizontal: 10 },
  linha: {
    flexDirection: 'row', alignItems: 'center', gap: ESP.md, paddingVertical: 7, paddingHorizontal: 8,
    borderRadius: RAIO.cartao, cursor: 'pointer' as any,
  },
  online: {
    position: 'absolute', right: -1, bottom: -1, width: 11, height: 11, borderRadius: 6,
    backgroundColor: COR.ok, borderWidth: 2, borderColor: COR.elevado,
  },
  nome: { fontFamily: FONT.body, fontSize: 14, fontWeight: '600', color: COR.texto },
  sub: { fontFamily: FONT.body, fontSize: 12.5, color: COR.textoFraco, marginTop: 1 },
  marca: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(233,234,238,0.28)',
    alignItems: 'center', justifyContent: 'center',
  },
  marcaOn: { backgroundColor: COR.texto, borderColor: COR.texto },
  vazio: { fontFamily: FONT.body, fontSize: 13, color: COR.textoFraco, textAlign: 'center', paddingVertical: ESP.lg },
  pastilhas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: ESP.sm },
  pastilha: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 26, paddingLeft: 10, paddingRight: 8,
    borderRadius: RAIO.pilula, backgroundColor: COR.hover, maxWidth: 200,
  },
  pastilhaTexto: { fontFamily: FONT.body, fontSize: 12.5, fontWeight: '600', color: COR.texto, flexShrink: 1 },
  erro: { fontFamily: FONT.body, fontSize: 12.5, color: COR.erro, marginTop: ESP.sm },
  baixo: {
    flexDirection: 'row', alignItems: 'center', gap: ESP.sm, marginTop: ESP.md, paddingTop: ESP.md,
    borderTopWidth: 1, borderColor: COR.linhaSuave,
  },
  mensagem: {
    flex: 1, height: 38, borderRadius: RAIO.cartao, backgroundColor: COR.painel, borderWidth: 1, borderColor: COR.linha,
    paddingHorizontal: ESP.md, color: COR.texto, fontFamily: FONT.body, fontSize: 13.5, outlineStyle: 'none' as any,
  },
  enviar: {
    height: 38, minWidth: 72, paddingHorizontal: ESP.lg, borderRadius: RAIO.cartao, backgroundColor: COR.texto,
    alignItems: 'center', justifyContent: 'center',
  },
  enviarTexto: { fontFamily: FONT.body, fontSize: 13.5, fontWeight: '700', color: COR.fundo },
  secundario: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 34, marginTop: ESP.sm,
    borderRadius: RAIO.cartao, borderWidth: 1, borderColor: COR.linha,
  },
  secundarioTexto: { fontFamily: FONT.body, fontSize: 12.5, fontWeight: '600', color: COR.textoMedio },
  feito: { alignItems: 'center', gap: 10, paddingTop: ESP.xl, paddingBottom: ESP.lg },
  visto: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(127,176,105,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  feitoTitulo: { fontFamily: FONT.display, fontSize: 15, fontWeight: '700', color: COR.texto, textAlign: 'center' },
});
