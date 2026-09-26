import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { getLibrary } from '../api/library';
import { listPlaylists } from '../api/playlists';
import { FriendAvatar } from '../components/FriendAvatar';
import { agruparPorArtista, displayArtist, tituloDaFaixa } from '../lib/artistName';
import { chaveDoAtalho, estaFixado, MAXIMO_DE_ATALHOS, type Atalho } from '../lib/atalhosDaLateral';
import { lerFaixas } from '../lib/cacheDaBiblioteca';
import { capaComBarras, molduraSemBarras } from '../lib/modoLimpo';
import { useAtalhosDaLateral } from '../state/atalhosDaLateral';
import { useMisturaDoDia } from '../state/misturaDoDia';
import { usePlayer } from '../state/player';
import { useSocial } from '../state/social';
import type { Playlist, Track } from '../types';
import type { Route } from './rotas';
import { COR, ESP, FONT, TIPO } from './tokens.web';
import { Dialog, Field, IconButton, marcar } from './ui.web';

// Sem tipos instalados para o react-dom; só se usa o portal.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createPortal } = require('react-dom') as { createPortal: (filho: React.ReactNode, onde: Element) => React.ReactElement };

/**
 * O espaço livre da lateral, por baixo dos amigos, passa a ser do utilizador
 * (26/9, ideia do João): atalhos para o que quiser -- playlists, músicas,
 * artistas, amigos, a Daily mix. As regras vivem em `lib/atalhosDaLateral.ts`.
 *
 * - Acrescenta-se pelo "+" (uma janela com pesquisa sobre as playlists, as
 *   Liked Songs, os artistas e os amigos).
 * - Tira-se pelo × que aparece com o rato na linha; o botão direito abre
 *   "Move up / Move down / Unpin".
 * - O × mostra-se pelo CSS (`atalho`/`atalho-tirar`), e não pelo `hovered` do
 *   RNW: é clicável dentro de uma linha clicável (ver "O movimento do PC").
 */
export function AtalhosNaLateral({ navigate }: { navigate: (r: Route) => void }) {
  const lista = useAtalhosDaLateral((s) => s.lista);
  const carregados = useAtalhosDaLateral((s) => s.carregados);
  const amigos = useSocial((s) => s.friends);
  const [escolher, setEscolher] = useState(false);
  const [menu, setMenu] = useState<Atalho | null>(null);
  useEffect(() => { if (!carregados) void useAtalhosDaLateral.getState().carregar(); }, [carregados]);

  const online = useMemo(() => new Set(amigos.filter((a) => a.online).map((a) => a.friendId)), [amigos]);

  const abrir = (a: Atalho) => {
    switch (a.tipo) {
      case 'playlist': navigate({ name: 'playlist', id: a.id, title: a.nome }); break;
      case 'artista': navigate({ name: 'artist', value: a.nome }); break;
      case 'amigo': navigate({ name: 'social', friendId: a.id }); break;
      case 'faixa': void usePlayer.getState().playTrack(a.faixa as Track, [a.faixa as Track], false, false, undefined, null); break;
      case 'mistura-do-dia': void tocarMisturaDoDia(); break;
    }
  };

  return (
    <View style={{ flex: 1, minHeight: 0, paddingHorizontal: ESP.md, paddingTop: ESP.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: ESP.sm, paddingBottom: ESP.sm }}>
        <Text style={{ ...TIPO.micro, color: COR.textoFraco }}>PINNED</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Pin something" onPress={() => setEscolher(true)}
          style={({ hovered }: any) => ({ width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? COR.hover : 'transparent' })}>
          <Ionicons name="add" size={16} color={COR.textoMedio} />
        </Pressable>
      </View>
      {lista.length === 0 ? (
        carregados ? (
          <Pressable onPress={() => setEscolher(true)} {...marcar('amigo')}
            style={{ marginHorizontal: ESP.xs, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: COR.linha, paddingVertical: 16, paddingHorizontal: 14, alignItems: 'center', gap: 6 }}>
            <Ionicons name="pin-outline" size={17} color={COR.textoFraco} />
            <Text style={{ fontFamily: FONT.body, fontSize: 11.5, lineHeight: 16, color: COR.textoFraco, textAlign: 'center' }}>
              Pin playlists, songs, artists and friends here
            </Text>
          </Pressable>
        ) : null
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 2, paddingBottom: ESP.md }}>
          {lista.map((a) => (
            <Pressable key={chaveDoAtalho(a)} {...marcar('atalho')} onPress={() => abrir(a)}
              onContextMenu={((e: any) => { e.preventDefault(); setMenu(a); }) as any}
              accessibilityLabel={`${nomeDoAtalho(a)}, ${subtituloDoAtalho(a, online)}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: ESP.sm, borderRadius: 8 }}>
              <Miniatura a={a} online={a.tipo === 'amigo' && online.has(a.id)} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: FONT.body, fontSize: 13, fontWeight: '600', color: COR.texto }}>{nomeDoAtalho(a)}</Text>
                <Text numberOfLines={1} style={{ fontFamily: FONT.body, fontSize: 11.5, marginTop: 1, color: COR.textoFraco }}>{subtituloDoAtalho(a, online)}</Text>
              </View>
              <Pressable {...marcar('atalho-tirar')} accessibilityRole="button" accessibilityLabel={`Unpin ${nomeDoAtalho(a)}`}
                onPress={(e: any) => { e?.stopPropagation?.(); useAtalhosDaLateral.getState().tirar(chaveDoAtalho(a)); }}
                style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={14} color={COR.textoMedio} />
              </Pressable>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <PorCimaDeTudo aberto={!!menu}><Dialog open={!!menu} title={menu ? nomeDoAtalho(menu) : ''} width={320} onClose={() => setMenu(null)}>
        {menu ? <View style={{ paddingBottom: ESP.sm }}>
          <LinhaDoMenu icone="arrow-up" texto="Move up" aoCarregar={() => { useAtalhosDaLateral.getState().mover(chaveDoAtalho(menu), -1); setMenu(null); }} />
          <LinhaDoMenu icone="arrow-down" texto="Move down" aoCarregar={() => { useAtalhosDaLateral.getState().mover(chaveDoAtalho(menu), 1); setMenu(null); }} />
          <LinhaDoMenu icone="close-circle-outline" texto="Unpin" aoCarregar={() => { useAtalhosDaLateral.getState().tirar(chaveDoAtalho(menu)); setMenu(null); }} />
        </View> : null}
      </Dialog></PorCimaDeTudo>
      <PorCimaDeTudo aberto={escolher}><EscolherAtalho aberto={escolher} aoFechar={() => setEscolher(false)} /></PorCimaDeTudo>
    </View>
  );
}

/**
 * Os diálogos cobrem o ancestral posicionado mais próximo, e aqui é a lateral:
 * abertos dentro dela ficavam presos nos 232 px, e mesmo fixos ficavam por
 * baixo do conteúdo (a lateral vive num empilhamento abaixo dele). Vão por um
 * portal para o `body`, por cima da janela inteira.
 */
function PorCimaDeTudo({ aberto, children }: { aberto: boolean; children: React.ReactNode }) {
  if (!aberto || typeof document === 'undefined') return <>{children}</>;
  return createPortal(
    <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200 } as any}>{children}</View>,
    document.body,
  );
}

async function tocarMisturaDoDia(): Promise<void> {
  const loja = useMisturaDoDia.getState();
  if (!loja.faixas.length) await loja.carregar();
  const faixas = useMisturaDoDia.getState().faixas;
  if (faixas.length) await usePlayer.getState().tocarLista(faixas, false, false, { tipo: 'prateleira', nome: 'Daily mix' });
}

function nomeDoAtalho(a: Atalho): string {
  switch (a.tipo) {
    case 'playlist': case 'artista': case 'amigo': return a.nome;
    case 'faixa': return tituloDaFaixa(a.faixa as Track);
    case 'mistura-do-dia': return 'Daily mix';
  }
}

function subtituloDoAtalho(a: Atalho, online: ReadonlySet<string>): string {
  switch (a.tipo) {
    case 'playlist': return 'Playlist';
    case 'artista': return 'Artist';
    case 'amigo': return online.has(a.id) ? 'Friend · Online' : 'Friend';
    case 'faixa': return `Song · ${displayArtist(a.faixa as Track)}`;
    case 'mistura-do-dia': return 'New every day';
  }
}

function capaDoAtalho(a: Atalho): string | null {
  switch (a.tipo) {
    case 'playlist': case 'artista': return a.capa ?? null;
    case 'faixa': return a.faixa.artworkUrl ?? (a.faixa.source === 'youtube' ? `https://i.ytimg.com/vi/${a.faixa.sourceId}/mqdefault.jpg` : null);
    default: return null;
  }
}

function Miniatura({ a, online }: { a: Atalho; online: boolean }) {
  if (a.tipo === 'amigo') {
    return <View style={{ width: 32, height: 32 }}>
      <FriendAvatar avatarUrl={a.avatar ?? null} name={a.nome} size={32} />
      {online ? <View style={{ position: 'absolute', right: -1, bottom: -1, width: 10, height: 10, borderRadius: 5, backgroundColor: COR.ok, borderWidth: 2, borderColor: COR.painel }} /> : null}
    </View>;
  }
  if (a.tipo === 'mistura-do-dia') {
    return <View style={{ width: 32, height: 32, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: COR.elevado }}>
      <Ionicons name="sparkles" size={15} color={COR.texto} />
    </View>;
  }
  const capa = capaDoAtalho(a);
  const redondo = a.tipo === 'artista';
  const icone = a.tipo === 'playlist' ? 'musical-notes' : a.tipo === 'artista' ? 'person' : 'musical-note';
  return <View style={{ width: 32, height: 32, borderRadius: redondo ? 16 : 6, overflow: 'hidden', backgroundColor: COR.elevado, alignItems: 'center', justifyContent: 'center' }}>
    {capa ? (capaComBarras(capa)
      ? (() => { const m = molduraSemBarras(32); return <Image source={{ uri: capa }} style={{ position: 'absolute', width: m.largura, height: m.altura, left: m.esquerda, top: m.topo }} />; })()
      : <Image source={{ uri: capa }} style={{ width: 32, height: 32 }} />)
      : <Ionicons name={icone} size={14} color={COR.textoFraco} />}
  </View>;
}

function LinhaDoMenu({ icone, texto, aoCarregar }: { icone: keyof typeof Ionicons.glyphMap; texto: string; aoCarregar: () => void }) {
  return <Pressable onPress={aoCarregar} style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, height: 42, paddingHorizontal: ESP.lg, backgroundColor: hovered ? COR.hover : 'transparent' })}>
    <Ionicons name={icone} size={16} color={COR.textoMedio} />
    <Text style={{ fontFamily: FONT.body, fontSize: 13.5, color: COR.texto }}>{texto}</Text>
  </Pressable>;
}

type Filtro = 'tudo' | 'playlist' | 'faixa' | 'artista' | 'amigo';
const FILTROS: [Filtro, string][] = [['tudo', 'All'], ['playlist', 'Playlists'], ['faixa', 'Songs'], ['artista', 'Artists'], ['amigo', 'Friends']];
/** Por categoria, sem pesquisa: o resto encontra-se escrevendo. */
const POR_CATEGORIA = 40;

/**
 * A janela do "+": o que se pode fixar, com pesquisa. As playlists e as Liked
 * Songs vêm das mesmas leituras (e da mesma cache) que as páginas usam; os
 * artistas saem das Liked Songs, pelos que têm mais músicas.
 */
function EscolherAtalho({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const lista = useAtalhosDaLateral((s) => s.lista);
  const amigos = useSocial((s) => s.friends);
  const [texto, setTexto] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('tudo');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [faixas, setFaixas] = useState<Track[]>([]);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setTexto(''); setAviso('');
    void listPlaylists().then((p) => { if (vivo) setPlaylists(p); }).catch(() => {});
    void lerFaixas(getLibrary).then((f) => { if (vivo) setFaixas(f); }).catch(() => {});
    return () => { vivo = false; };
  }, [aberto]);

  const artistas = useMemo(() => agruparPorArtista(faixas)
    .sort((a, b) => b.faixas.length - a.faixas.length), [faixas]);

  const candidatos = useMemo(() => {
    const q = texto.trim().toLocaleLowerCase();
    const casa = (...partes: (string | null | undefined)[]) => !q || partes.some((p) => p?.toLocaleLowerCase().includes(q));
    const saida: Atalho[] = [];
    if ((filtro === 'tudo') && casa('Daily mix')) saida.push({ tipo: 'mistura-do-dia' });
    if (filtro === 'tudo' || filtro === 'playlist') {
      saida.push(...playlists.filter((p) => casa(p.name)).slice(0, POR_CATEGORIA)
        .map((p): Atalho => ({ tipo: 'playlist', id: p.id, nome: p.name, capa: p.artworks?.[0] ?? null })));
    }
    if (filtro === 'tudo' || filtro === 'artista') {
      saida.push(...artistas.filter((g) => casa(g.nome)).slice(0, POR_CATEGORIA)
        .map((g): Atalho => ({ tipo: 'artista', nome: g.nome, capa: g.faixas[0]?.artworkUrl ?? null })));
    }
    if (filtro === 'tudo' || filtro === 'amigo') {
      saida.push(...amigos.filter((a) => a.status === 'accepted' && casa(a.name, a.username)).slice(0, POR_CATEGORIA)
        .map((a): Atalho => ({ tipo: 'amigo', id: a.friendId, nome: a.name || a.username, avatar: a.avatarUrl ?? null })));
    }
    if (filtro === 'tudo' || filtro === 'faixa') {
      saida.push(...faixas.filter((t) => casa(tituloDaFaixa(t), displayArtist(t))).slice(0, POR_CATEGORIA)
        .map((t): Atalho => ({
          tipo: 'faixa',
          faixa: { source: t.source, sourceId: t.sourceId, title: t.title, artist: t.artist, artworkUrl: t.artworkUrl, durationSeconds: t.durationSeconds, album: t.album ?? null },
        })));
    }
    return saida;
  }, [texto, filtro, playlists, artistas, amigos, faixas]);

  const alternar = (a: Atalho) => {
    const ok = useAtalhosDaLateral.getState().alternar(a);
    setAviso(ok ? '' : `You can pin up to ${MAXIMO_DE_ATALHOS}. Unpin one first.`);
  };

  return (
    <Dialog open={aberto} title="Pin to sidebar" width={520} onClose={aoFechar}>
      <View style={{ paddingHorizontal: ESP.lg, gap: ESP.md }}>
        <Field icon="search" placeholder="Playlists, songs, artists, friends" value={texto} onChangeText={setTexto} autoFocus />
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {FILTROS.map(([id, nome]) => (
            <Pressable key={id} onPress={() => setFiltro(id)}
              style={({ hovered }: any) => ({ height: 30, paddingHorizontal: 12, borderRadius: 15, justifyContent: 'center', borderWidth: 1,
                borderColor: filtro === id ? COR.texto : COR.linha, backgroundColor: filtro === id ? COR.texto : hovered ? COR.hover : 'transparent' })}>
              <Text style={{ fontFamily: FONT.body, fontSize: 12, fontWeight: '600', color: filtro === id ? COR.fundo : COR.textoMedio }}>{nome}</Text>
            </Pressable>
          ))}
        </View>
        {aviso ? <Text style={{ fontFamily: FONT.body, fontSize: 12, color: COR.aviso }}>{aviso}</Text> : null}
      </View>
      <ScrollView style={{ height: 420, marginTop: ESP.sm }} contentContainerStyle={{ paddingHorizontal: ESP.sm, paddingBottom: ESP.md }}>
        {candidatos.length === 0 ? (
          <Text style={{ fontFamily: FONT.body, fontSize: 13, color: COR.textoFraco, textAlign: 'center', marginTop: 40 }}>Nothing found.</Text>
        ) : candidatos.map((a) => {
          const fixado = estaFixado(lista, chaveDoAtalho(a));
          return (
            <Pressable key={chaveDoAtalho(a)} onPress={() => alternar(a)} accessibilityRole="button"
              accessibilityState={{ selected: fixado }}
              style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7, paddingHorizontal: ESP.sm, borderRadius: 8, backgroundColor: hovered ? COR.hover : 'transparent' })}>
              <Miniatura a={a} online={false} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: FONT.body, fontSize: 13.5, fontWeight: '600', color: COR.texto }}>{nomeDoAtalho(a)}</Text>
                <Text numberOfLines={1} style={{ fontFamily: FONT.body, fontSize: 11.5, marginTop: 1, color: COR.textoFraco }}>{subtituloDoAtalho(a, new Set())}</Text>
              </View>
              <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: fixado ? COR.texto : 'transparent', borderWidth: fixado ? 0 : 1, borderColor: COR.linha }}>
                <Ionicons name={fixado ? 'checkmark' : 'pin-outline'} size={14} color={fixado ? COR.fundo : COR.textoMedio} />
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </Dialog>
  );
}

/**
 * O alfinete nas páginas de uma playlist e de um artista: fixa (ou tira) sem
 * passar pelo "+". Aceso quando já está na lateral.
 */
export function BotaoDeFixar({ atalho }: { atalho: Atalho }) {
  const fixado = useAtalhosDaLateral((s) => estaFixado(s.lista, chaveDoAtalho(atalho)));
  const carregados = useAtalhosDaLateral((s) => s.carregados);
  useEffect(() => { if (!carregados) void useAtalhosDaLateral.getState().carregar(); }, [carregados]);
  return <IconButton name={fixado ? 'pin' : 'pin-outline'} active={fixado}
    label={fixado ? 'Unpin from sidebar' : 'Pin to sidebar'}
    onPress={() => { useAtalhosDaLateral.getState().alternar(atalho); }} />;
}
