import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { playlistsComAFaixa } from '../api/playlists';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { criarMarcasDasPlaylists } from '../lib/marcasDasPlaylists';
import { correspondeAPesquisa, normalizarPesquisa } from '../lib/searchText';
import { usePlaylists } from '../state/playlists';
import type { Playlist, Track } from '../types';
import { TECLAS_PROPRIAS } from './MenuDeContexto.web';
import { COR, ESP, RAIO, TIPO } from './tokens.web';
import { marcar } from './ui.web';

const CAPA = 28;

/**
 * "Add to playlist" no PC (24/10, variante B de docs/add-to-playlist-pc-maquete.html):
 * um painel ao lado do menu da música, como no menu de um sistema operativo.
 * Era um diálogo ao centro com caixas iguais, sem capas, sem saber onde a
 * música já estava e sem forma de criar uma playlist ali.
 *
 * - Procura em cima, com o foco: escrever filtra logo. Enter com uma só põe-na lá.
 * - "New playlist": escreve-se o nome ali; com a procura escrita e sem nenhuma
 *   com esse nome, a linha já é `New playlist "…"` e cria de uma vez.
 * - O ✓ nas que já têm a música, pelas regras da folha do iPhone
 *   (`lib/marcasDasPlaylists.ts`): duas leituras por abertura, nada em polling.
 *   Escolher uma com ✓ não a põe outra vez: diz que já lá está.
 * - Escolher fecha o menu, como qualquer linha de um menu.
 *
 * Trata das suas teclas (`TECLAS_PROPRIAS`): ↑↓ andam pelo campo e pelas
 * linhas, Esc limpa a procura e depois volta ao menu, ← volta ao menu.
 */
export function EscolherPlaylist({ faixa, aoEscolher, aoCriar, aoFechar, aoVoltar }: {
  faixa: Track;
  /** Com o menu já fechado. `jaLaEsta`: tinha o ✓. */
  aoEscolher: (playlist: Playlist, jaLaEsta: boolean) => void;
  /** Criar a playlist e pôr lá a música, com o menu já fechado. */
  aoCriar: (nome: string) => void;
  aoFechar: () => void;
  /** Esc e ←: de volta ao menu de onde se veio. Sem ele, fecham tudo. */
  aoVoltar?: () => void;
}) {
  const playlists = usePlaylists((s) => s.items);
  const aCarregar = usePlaylists((s) => s.estado === 'a-carregar' && s.items.length === 0);
  const [procura, setProcura] = useState('');
  const [nome, setNome] = useState<string | null>(null);
  const [dentro, setDentro] = useState<Set<string>>(() => new Set());
  const raiz = useRef<any>(null);
  const campoDaProcura = useRef<any>(null);
  const campoDoNome = useRef<any>(null);

  useEffect(() => {
    // A lista da store (fresca 30 s); as marcas só desta música, e só a resposta desta abertura.
    usePlaylists.getState().carregar().catch(() => {});
    const marcas = criarMarcasDasPlaylists<Track>(playlistsComAFaixa, (ids) => setDentro(ids));
    void marcas.abrir(faixa);
    return () => marcas.esquecer();
  }, [faixa]);

  const visiveis = useMemo(() => playlists.filter((p) => correspondeAPesquisa(procura, p.name)), [playlists, procura]);
  const pedido = procura.trim();
  const haComEsseNome = !!pedido && playlists.some((p) => normalizarPesquisa(p.name) === normalizarPesquisa(pedido));

  const escolher = (p: Playlist) => { aoFechar(); aoEscolher(p, dentro.has(p.id)); };
  const criar = (texto: string) => {
    const limpo = texto.trim();
    if (!limpo) return;
    aoFechar();
    aoCriar(limpo);
  };

  // As teclas leem o estado de agora, não o do primeiro desenho.
  const agora = useRef({ procura, nome, aoVoltar, aoFechar });
  agora.current = { procura, nome, aoVoltar, aoFechar };
  useEffect(() => {
    const no = raiz.current as HTMLElement | null;
    if (!no?.addEventListener) return;
    const tecla = (e: KeyboardEvent) => {
      const noCampo = (e.target as HTMLElement)?.tagName === 'INPUT';
      const { procura: p, nome: n, aoVoltar: voltar, aoFechar: fechar } = agora.current;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const lista = Array.from(no.querySelectorAll('input, [role="menuitem"]')) as HTMLElement[];
        if (!lista.length) return;
        const i = lista.indexOf(document.activeElement as HTMLElement);
        const j = e.key === 'ArrowDown' ? (i + 1) % lista.length : (i <= 0 ? lista.length - 1 : i - 1);
        lista[j]?.focus();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (n !== null) { setNome(null); campoDaProcura.current?.focus?.(); return; }
        if (noCampo && p) { setProcura(''); return; }
        (voltar ?? fechar)();
        return;
      }
      if (e.key === 'ArrowLeft' && !noCampo) { e.preventDefault(); (voltar ?? fechar)(); }
    };
    no.addEventListener('keydown', tecla);
    return () => no.removeEventListener('keydown', tecla);
  }, []);

  useEffect(() => { if (nome !== null) campoDoNome.current?.focus?.(); }, [nome !== null]);

  return (
    <View ref={raiz} {...TECLAS_PROPRIAS}>
      <View style={{ height: 34, flexDirection: 'row', alignItems: 'center', gap: ESP.sm, paddingHorizontal: 10, marginBottom: ESP.xs,
        borderRadius: RAIO.cartao, borderWidth: 1, borderColor: COR.linha, backgroundColor: COR.fundo }}>
        <Ionicons name="search" size={15} color={COR.textoFraco} />
        <TextInput
          ref={campoDaProcura}
          value={procura}
          onChangeText={setProcura}
          placeholder="Find a playlist"
          placeholderTextColor={COR.textoFraco}
          selectionColor={COR.metalClaro}
          accessibilityLabel="Find a playlist"
          onSubmitEditing={() => {
            if (visiveis.length === 1) escolher(visiveis[0]);
            else if (!visiveis.length && pedido) criar(pedido);
          }}
          style={{ flex: 1, minWidth: 0, ...TIPO.corpo, color: COR.texto, outlineStyle: 'none' } as any}
        />
      </View>

      {nome !== null ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 5, paddingLeft: 10, paddingRight: 5,
          borderRadius: RAIO.cartao, backgroundColor: 'rgba(233,234,238,.07)' }}>
          <Ionicons name="add" size={17} color={COR.textoMedio} />
          <TextInput
            ref={campoDoNome}
            value={nome}
            onChangeText={setNome}
            placeholder="Playlist name"
            placeholderTextColor={COR.textoFraco}
            selectionColor={COR.metalClaro}
            accessibilityLabel="New playlist name"
            onSubmitEditing={() => criar(nome)}
            style={{ flex: 1, minWidth: 0, ...TIPO.corpo, color: COR.texto, outlineStyle: 'none' } as any}
          />
          <Pressable
            accessibilityRole="button"
            disabled={!nome.trim()}
            onPress={() => criar(nome)}
            {...marcar('premir')}
            style={{ paddingHorizontal: 10, height: 26, justifyContent: 'center', borderRadius: RAIO.ctrl,
              backgroundColor: COR.metalClaro, opacity: nome.trim() ? 1 : 0.4 }}
          >
            <Text style={{ ...TIPO.legenda, fontWeight: '600', color: COR.fundo }}>Create</Text>
          </Pressable>
        </View>
      ) : (
        <Linha
          icone="add"
          rotulo={pedido && !haComEsseNome ? `New playlist "${pedido}"` : 'New playlist'}
          aoCarregar={() => (pedido && !haComEsseNome ? criar(pedido) : setNome(''))}
        />
      )}

      <View style={{ height: 1, backgroundColor: COR.linhaSuave, marginVertical: 5, marginHorizontal: 6 }} />

      <ScrollView style={{ maxHeight: 320 }}>
        {visiveis.map((p) => (
          <Linha
            key={p.id}
            capa={<CapaPequena capas={p.artworks} />}
            rotulo={p.name}
            marcada={dentro.has(p.id)}
            aoCarregar={() => escolher(p)}
          />
        ))}
        {!visiveis.length ? (
          <Text style={{ ...TIPO.legenda, color: COR.textoFraco, paddingHorizontal: 10, paddingVertical: ESP.sm }}>
            {aCarregar ? 'Loading your playlists…' : pedido ? 'No playlist with that name.' : 'No playlists yet.'}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Linha({ icone, capa, rotulo, marcada = false, aoCarregar }: {
  icone?: string;
  capa?: React.ReactNode;
  rotulo: string;
  marcada?: boolean;
  aoCarregar: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={'menuitem' as any}
      accessibilityState={{ checked: marcada }}
      accessibilityLabel={marcada ? `${rotulo}, already has this song` : rotulo}
      {...marcar('menu-linha')}
      onPress={aoCarregar}
      style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.md, minHeight: 38, paddingVertical: capa ? 5 : 9,
        paddingHorizontal: 10, borderRadius: RAIO.cartao }}
    >
      {capa ?? <Ionicons name={icone as any} size={17} color={COR.textoMedio} />}
      <Text numberOfLines={1} style={{ ...TIPO.corpo, color: COR.texto, flex: 1, minWidth: 0 }}>{rotulo}</Text>
      {marcada ? <Ionicons name="checkmark" size={17} color={COR.texto} /> : null}
    </Pressable>
  );
}

/** A colagem das Playlists, em pequeno: quatro capas, uma, ou a nota. */
function CapaPequena({ capas }: { capas: string[] }) {
  const unicas = Array.from(new Set(capas.map(capaParaLista).filter((u): u is string => !!u))).slice(0, 4);
  const moldura = { width: CAPA, height: CAPA, borderRadius: RAIO.ctrl, overflow: 'hidden', backgroundColor: COR.elevado,
    alignItems: 'center', justifyContent: 'center' } as const;
  if (!unicas.length) return <View style={moldura}><Ionicons name="musical-notes" size={13} color={COR.textoFraco} /></View>;
  if (unicas.length < 4) return <View style={moldura}><Image source={{ uri: unicas[0] }} style={{ width: CAPA, height: CAPA }} resizeMode="cover" /></View>;
  return (
    <View style={[moldura, { flexDirection: 'row', flexWrap: 'wrap' }]}>
      {unicas.map((u) => <Image key={u} source={{ uri: u }} style={{ width: CAPA / 2, height: CAPA / 2 }} resizeMode="cover" />)}
    </View>
  );
}
