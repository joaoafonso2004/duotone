// Atividade musical e conversas numa só vista, com os dados já recebidos pelo Social.
// O PC (9/10): o iPhone tem a sua (SocialOverview.tsx, docs/PLANO-SOCIAL-IOS.md).
//
// A pele da B4 (22/11, `.claude/planos/PLANO-SOCIAL-B4.md`): as fontes da app em
// todo o texto (antes quase tudo saía em Segoe UI, porque o react-native-web
// impõe a dele a cada `<Text>` sem família), as etiquetas mono da lateral e da
// Home, as linhas de 56 px, e quem ouve com a linha dos amigos da lateral.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ChatGroup } from '../api/social';
import type { PublicProfile } from '../api/profiles';
import { agoraNoServidor, type SocialFriend } from '../state/social';
import type { Track } from '../types';
import { musicActivityLabel, type ConversationPreview } from '../lib/socialActivity';
import { previaDaConversa } from '../lib/previaDaConversa';
import { ultimaAtividade } from '../lib/socialPresence';
import { haQuantoTempo } from '../lib/social';
import { ordenarConversas, CONVERSAS_PARA_PESQUISAR } from '../lib/ordemDasConversas';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { posicaoDoAmigo } from '../lib/posicaoDoAmigo';
import { ESCALA_MAXIMA } from '../theme';
import { CapaDuotone } from '../desktop/duotone.web';
import { marcar } from '../desktop/ui.web';
import { useFlip } from '../desktop/useFlip.web';
import { COR, ESP, ESTADO, FONT, LINHA_LISTA, RAIO, TIPO } from '../desktop/tokens.web';
import { jamsDosAmigos } from '../state/jamsDosAmigos';
import { ouvirComAmigo } from '../state/ouvirComAmigo';
import { useSeguirAmigo } from '../state/seguirAmigo';
import { FriendAvatar } from './FriendAvatar';
import { SocialIconButton } from './socialUI';
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
  /** A conversa aberta (a chave: o id do amigo, ou `group:<id>`), acesa na lista. */
  aberta?: string;
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

/** Quantos amigos cabem em "Listening now": os outros ativos estão nas conversas, com o estado deles. */
const CARTOES_A_OUVIR = 5;

/**
 * Ir ouvir com ele: a Jam dele se tiver uma aberta, senão seguir (a mesma porta
 * do menu do botão direito). A pergunta das Jams é a partilhada com a Home
 * (`state/jamsDosAmigos.ts`, 2 min): só se faz ao carregar, e uma vez por 2 min.
 */
export async function ouvirJunto(amigo: SocialFriend): Promise<void> {
  const jams = await jamsDosAmigos().catch(() => new Map<string, string>());
  await ouvirComAmigo(amigo, jams.get(amigo.friendId) ?? null);
}

/** As três barrinhas que mexem enquanto ele ouve (o `eq` da casca). */
export function Barrinhas({ cor = COR.texto }: { cor?: string }) {
  return <View {...marcar('eq')} aria-hidden style={styles.eq}>
    <View style={[styles.eqBarra, { backgroundColor: cor }]}/><View style={[styles.eqBarra, { backgroundColor: cor }]}/><View style={[styles.eqBarra, { backgroundColor: cor }]}/>
  </View>;
}

/**
 * Quem ouve (B4): a linha dos amigos da lateral, maior. A capa com a cara no
 * canto, o nome com as barrinhas, "Title · Artist", o fio do progresso e o ▶
 * branco do Listen along (aparece com o rato, como na lateral). A seguir este
 * amigo: "Listening along", e o ▶ passa a ×, que deixa de o seguir. Quem ouviu
 * há pouco fica a dois tons, sem barrinhas nem botão. A linha abre a conversa
 * com ele; a capa abre as opções da música, como o cartão de antes.
 */
function QuemOuve({ amigo, agora, aoAbrir, aoTrack, aoMenu }: {
  amigo: SocialFriend; agora: number; aoAbrir: () => void; aoTrack: (t: Track) => void; aoMenu?: (e: any) => void;
}) {
  const a = amigo.musicActivity!;
  const title = tituloDaFaixa(a.track), artist = displayArtist(a.track);
  const status = musicActivityLabel(a, agora);
  const cover = capaParaLista(a.track.artworkUrl) ?? a.track.artworkUrl;
  const sigo = useSeguirAmigo((s) => s.seguindo?.id === amigo.friendId);
  const onde = a.listening ? posicaoDoAmigo((amigo.currentlyPlaying ?? a.track) as any, agoraNoServidor()) : null;
  // Três botões irmãos (a capa, o texto, o ▶), nunca um dentro do outro: um <button> dentro de
  // outro é HTML inválido. O hover da linha inteira é do CSS (`ouvinte`, no casca).
  return <View {...marcar('ouvinte', ...(sigo ? ['a-seguir'] : []))} {...(aoMenu ? { onContextMenu: aoMenu } : {}) as any}
    style={styles.ouvinte}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}. Song options`} onPress={() => aoTrack(a.track)}
      style={styles.ouvinteCapa}>
      <CapaDuotone uri={cover} viva={a.listening} style={{ borderRadius: RAIO.cartao }}/>
      <View style={styles.ouvinteCara}><FriendAvatar avatarUrl={amigo.avatarUrl} name={amigo.name} size={20}/></View>
    </Pressable>
    <Pressable accessibilityRole="button" onPress={aoAbrir} style={styles.ouvinteTexto}
      accessibilityLabel={`${amigo.name}, ${title}, ${artist}, ${sigo ? 'listening along' : status}. Open chat`}>
      <View style={styles.linhaDoNome}>
        <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.nome}>{amigo.name}</Text>
        {a.listening ? <Barrinhas/> : null}
      </View>
      <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.legenda}>
        {sigo ? 'Listening along' : a.listening ? `${title} · ${artist}` : `${title} · ${status}`}
      </Text>
      {/* O fio do progresso, por `scaleX` (no compositor), como na lateral. */}
      {onde ? <View style={styles.fio}>
        <View style={[styles.fioCheio, { transform: [{ scaleX: Math.round(onde.fracao * 1000) / 1000 }] } as any]}/>
      </View> : null}
    </Pressable>
    {a.listening ? <Pressable {...marcar('ouvinte-play', ...(sigo ? ['a-seguir'] : []))} accessibilityRole="button"
      accessibilityLabel={sigo ? `Stop listening along with ${amigo.name}` : `Listen along with ${amigo.name}`}
      onPress={() => { if (sigo) useSeguirAmigo.getState().parar(null); else void ouvirJunto(amigo); }}
      style={styles.ouvintePlay}>
      <View {...marcar('vira')} style={styles.vira}><Ionicons name={sigo ? 'close' : 'play'} size={sigo ? 14 : 12} color={COR.fundo}/></View>
    </Pressable> : null}
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
  const mostrados = listening.slice(0, CARTOES_A_OUVIR);

  // O fio do progresso anda de segundo a segundo, só com alguém a ouvir.
  const [, setTique] = useState(0);
  useEffect(() => {
    if (!aOuvirAgora) return;
    const id = setInterval(() => setTique((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [aOuvirAgora]);

  // Alguém começa a ouvir: a linha dele abre o lugar (`revelar`, como nas
  // Definições), em vez de o resto saltar. Só depois do primeiro desenho.
  const conhecidos = useRef<Set<string> | null>(null);
  const novos = conhecidos.current ? new Set(mostrados.filter(f => !conhecidos.current!.has(f.friendId)).map(f => f.friendId)) : new Set<string>();
  useEffect(() => { conhecidos.current = new Set(mostrados.map(f => f.friendId)); });

  // A ordem das conversas muda (uma mensagem nova sobe a dela): as linhas deslizam.
  const lista = useFlip<any>();
  const ouvintes = useFlip<any>();

  const menuDoAmigo = (id: string) => (e: any) => {
    e.preventDefault();
    props.onFriendMenu?.(id, { x: e.nativeEvent?.clientX ?? e.clientX ?? 0, y: e.nativeEvent?.clientY ?? e.clientY ?? 0, width: 1, height: 1 }, e);
  };

  return <View style={styles.root}>
      {listening.length > 0 && <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.etiqueta}>{aOuvirAgora ? `LISTENING NOW · ${aOuvirAgora}` : 'RECENTLY PLAYED'}</Text>
        <View ref={ouvintes} style={styles.ouvintes} accessibilityLabel="Friends’ music activity">
          {mostrados.map(f => {
            const linha = <QuemOuve amigo={f} agora={props.now} aoTrack={props.onTrack} aoAbrir={() => props.onOpen('friend', f.friendId)}
              aoMenu={props.onFriendMenu ? menuDoAmigo(f.friendId) : undefined}/>;
            return <View key={f.friendId} {...({ dataSet: { chave: `ouve:${f.friendId}` } } as any)}>
              {novos.has(f.friendId) ? <div data-dt="revelar a-entrar"><div>{linha}</div></div> : linha}
            </View>;
          })}
        </View>
      </View>}
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.etiqueta}>CONVERSATIONS</Text>
      {conversations.length >= CONVERSAS_PARA_PESQUISAR && <TextInput value={filter} onChangeText={setFilter}
        accessibilityLabel="Search friends and groups" placeholder="Search friends and groups" placeholderTextColor={COR.textoFraco}
        autoCapitalize="none" style={styles.search}/>}
      <View ref={lista} style={styles.conversas}>
      {shown.map(c => {
        const group = c.tipo === 'grupo', key = group ? `group:${c.id}` : c.id;
        const preview = props.previews[key], count = props.unread.get(key) ?? 0;
        const friend = group ? undefined : props.friends.find(f => f.friendId === c.id);
        const text = preview ? previaDaConversa(preview, props.myId, { outro: group ? null : c.nome, titulo: tituloDaFaixa, artista: displayArtist }).texto : c.tipo === 'grupo' ? `${c.grupo.membros.length} members`
          : friend?.musicActivity?.listening ? 'Listening now' : friend?.online ? 'Online now' : ultimaAtividade(friend?.lastSeenAt, props.now);
        const open = () => props.onOpen(group ? 'group' : 'friend', c.id);
        const oldContact = former.some(p => p.id === c.id);
        const aberta = props.aberta === key;
        // O botão direito num amigo abre o menu dele (24/10); num grupo, ou numa conversa antiga, nada.
        const menu = !group && !oldContact && props.onFriendMenu ? { onContextMenu: menuDoAmigo(c.id) } : {};
        return <View key={key} {...({ dataSet: { ...marcar('conversa').dataSet, chave: key } } as any)} {...(menu as any)}
          style={[styles.conversa, aberta && ESTADO.escolhido]}>
          <Pressable accessibilityRole="button" accessibilityLabel={group ? `Open ${c.nome}` : `View ${c.nome}`}
            onPress={group ? open : () => props.onProfile(c.id)}>
            {c.tipo === 'grupo' ? <GroupAvatar group={c.grupo} size={40}/>
              : <View><FriendAvatar avatarUrl={c.amigo.avatarUrl} name={c.nome} size={40}/>
                {c.amigo.online ? <View style={styles.ponto}/> : null}</View>}
          </Pressable>
          <Pressable style={styles.conversaTexto} accessibilityRole="button" accessibilityState={{ selected: aberta }}
            accessibilityLabel={`${c.nome}. ${text}${count ? `. ${count} unread` : ''}`}
            onPress={open} onLongPress={(e) => !group && (oldContact ? props.onDeleteConversation(c.id)
              : props.onFriendMenu ? props.onFriendMenu(c.id, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, width: 1, height: 1 })
              : props.onRemoveFriend(c.id))}>
            <View style={styles.linhaDoNome}>
              <Text numberOfLines={1} style={[styles.nome, styles.flex, count > 0 && styles.porLer]}>{c.nome}</Text>
              {preview && <Text style={styles.hora}>{haQuantoTempo(preview.createdAt, props.now)}</Text>}
            </View>
            <Text numberOfLines={1} style={[styles.previa, count > 0 && { color: COR.texto }]}>{text}</Text>
          </Pressable>
          {/* O contador entra com a mola SOLTAR (`contador`, na casca). */}
          {count > 0 && <View {...marcar('contador')} style={styles.contador}><Text style={styles.contadorNumero}>{count > 99 ? '99+' : count}</Text></View>}
          {/* Sem o balão em cada linha (30/10): a linha inteira abre a conversa. Só o lixo de uma conversa antiga. */}
          {oldContact && <SocialIconButton label={`Delete conversation with ${c.nome}`} icon="trash-outline" onPress={() => props.onDeleteConversation(c.id)}/>}
        </View>;
      })}
      </View>
      {!shown.length && !props.loading && <Pressable accessibilityRole="button" onPress={props.onStart} style={styles.empty}>
        <Text style={styles.previa}>{query ? 'No friends or groups match.' : 'Add a friend to share music.'}</Text>
        {!query && <Text style={styles.nome}>New chat</Text>}
      </Pressable>}
    </View>
    {props.requests}
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: ESP.xl }, section: { gap: ESP.sm },
  etiqueta: { ...TIPO.micro, color: COR.textoFraco, paddingHorizontal: ESP.sm },
  ouvintes: { gap: 2 },
  ouvinte: { flexDirection: 'row', alignItems: 'center', gap: ESP.md, paddingVertical: ESP.sm, paddingHorizontal: ESP.sm, borderRadius: RAIO.cartao },
  ouvinteCapa: { width: 44, height: 44, flexShrink: 0 },
  ouvinteCara: { position: 'absolute', right: -4, bottom: -4, borderRadius: 999, borderWidth: 2, borderColor: COR.painel, overflow: 'hidden' },
  ouvinteTexto: { flex: 1, minWidth: 0, gap: 2 },
  ouvintePlay: { width: 26, height: 26, borderRadius: 13, backgroundColor: COR.texto, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  vira: { alignItems: 'center', justifyContent: 'center' },
  fio: { height: 2, borderRadius: 1, backgroundColor: 'rgba(233,234,238,0.14)', marginTop: 5, overflow: 'hidden' },
  fioCheio: { height: 2, width: '100%', transformOrigin: 'left', backgroundColor: COR.texto } as any,
  linhaDoNome: { flexDirection: 'row', alignItems: 'center', gap: ESP.sm },
  eq: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 11 }, eqBarra: { width: 3, height: 11, borderRadius: 1 },
  nome: { fontFamily: FONT.body, fontSize: 14, fontWeight: '600', color: COR.texto, flexShrink: 1 },
  legenda: { ...TIPO.legenda, color: COR.textoMedio },
  conversas: { gap: 2 },
  conversa: { height: LINHA_LISTA, paddingHorizontal: ESP.sm, borderRadius: RAIO.cartao, flexDirection: 'row', gap: ESP.md, alignItems: 'center' },
  ponto: { position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: COR.ok, borderWidth: 2, borderColor: COR.painel },
  conversaTexto: { flex: 1, minWidth: 0, height: LINHA_LISTA, justifyContent: 'center', gap: 2 },
  flex: { flex: 1, minWidth: 0 },
  porLer: { fontWeight: '750' as any },
  previa: { fontFamily: FONT.body, fontSize: 13, color: COR.textoMedio },
  hora: { fontFamily: FONT.mono, fontSize: 10, color: COR.textoFraco },
  contador: { minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: COR.texto, alignItems: 'center', justifyContent: 'center' },
  contadorNumero: { fontFamily: FONT.mono, fontSize: 10, fontWeight: '700', color: COR.fundo },
  empty: { minHeight: 76, gap: 10, paddingVertical: 12, paddingHorizontal: ESP.sm },
  search: { height: 40, borderRadius: RAIO.cartao, backgroundColor: COR.elevado, color: COR.texto, paddingHorizontal: ESP.md, fontFamily: FONT.body, fontSize: 14, marginBottom: ESP.xs },
});
