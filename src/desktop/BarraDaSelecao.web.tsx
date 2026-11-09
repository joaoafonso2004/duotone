import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { guardarMuitasNasGostadas } from '../api/library';
import { addTracksToPlaylist, createPlaylist } from '../api/playlists';
import { avisarErro } from '../lib/avisoDeRemocao';
import { mensagemDeErro } from '../lib/mensagemDeErro';
import { usePlayer } from '../state/player';
import { usePlaylists } from '../state/playlists';
import { useSaved } from '../state/saved';
import type { Playlist, Track } from '../types';
import { musicas } from './acoesDasEscolhidas.web';
import { EscolherPlaylist } from './EscolherPlaylist.web';
import { MenuDeContexto, pontoDoEvento, type LinhaDoMenu, type PontoNoEcra } from './MenuDeContexto.web';
import { mudouAPlaylist } from './porNaPlaylist.web';
import { useSelecao } from './selecao.web';
import { COR, ESP, ESTADO, TIPO } from './tokens.web';
import { marcar } from './ui.web';

type Acao = 'tocar' | 'seguinte' | 'fila' | 'playlist' | 'gostar' | 'remover';

/**
 * A barra das escolhidas (9/11, maquete `docs/melhorias-de-uso-maquete.html`,
 * secção 1, opção B, a escolha do João): uma pílula por cima do leitor enquanto
 * há músicas escolhidas numa lista (Ctrl+clique, Shift+clique, Ctrl+A). Vê-se
 * role-se para onde se rolar. As ações mais usadas à vista; o botão direito
 * numa escolhida abre o menu com todas (também o "Play next" e o "Like").
 * Esc ou o × largam-nas. Cada ação larga-as no fim.
 */
export function BarraDaSelecao({ notify }: { notify: (texto: string) => void }) {
  const faixas = useSelecao((s) => s.faixas);
  const remover = useSelecao((s) => s.remover);
  const saoGostadas = useSelecao((s) => s.saoGostadas);
  const menu = useSelecao((s) => s.menu);
  const [playlists, setPlaylists] = useState<PontoNoEcra | null>(null);

  // Esc larga-as. Em captura, antes do painel da fila (que também fecha com Esc):
  // com escolhidas, o Esc é delas.
  useEffect(() => {
    if (!faixas.length) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[role="menu"], [role="dialog"], [aria-modal="true"]')) return;
      e.preventDefault();
      useSelecao.getState().limpar();
    };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [faixas.length > 0]);

  const fazer = async (acao: Acao, onde?: PontoNoEcra) => {
    // Lidas antes de as largar: o `limpar` apaga também o "Remove" da lista.
    const { faixas: lista, remover: tirar } = useSelecao.getState();
    if (!lista.length) return;
    const n = musicas(lista.length);
    if (acao === 'playlist') { setPlaylists(onde ?? { x: window.innerWidth / 2, y: window.innerHeight - 160 }); return; }
    useSelecao.getState().limpar();
    const leitor = usePlayer.getState();
    try {
      if (acao === 'tocar') await leitor.tocarLista(lista, false);
      else if (acao === 'seguinte') { [...lista].reverse().forEach((t) => leitor.playNext(t)); notify(`${n} will play next.`); }
      else if (acao === 'fila') { leitor.addManyToQueue(lista); notify(`Added ${n} to the queue.`); }
      else if (acao === 'gostar') {
        await guardarMuitasNasGostadas(lista);
        lista.forEach((t) => useSaved.getState().markSaved(t, true));
        window.dispatchEvent(new Event('duotone:refresh-library'));
        notify(`Added ${n} to Liked Songs.`);
      } else if (acao === 'remover') await tirar?.fazer(lista);
    } catch (e) {
      avisarErro(mensagemDeErro(e, "Couldn't do that with the songs you picked."));
    }
  };
  const porNa = async (lista: Track[], p: Playlist) => {
    useSelecao.getState().limpar();
    try {
      await addTracksToPlaylist(p.id, lista);
      mudouAPlaylist(p.id);
      notify(`Added ${musicas(lista.length)} to ${p.name}.`);
    } catch (e) { avisarErro(mensagemDeErro(e, "Couldn't add them to the playlist.")); }
  };
  const criarCom = async (lista: Track[], nome: string) => {
    useSelecao.getState().limpar();
    try {
      const p = await createPlaylist(nome);
      await addTracksToPlaylist(p.id, lista);
      void usePlaylists.getState().carregar(true).catch(() => {});
      mudouAPlaylist(p.id);
      notify(`Added ${musicas(lista.length)} to ${nome}.`);
    } catch (e) { avisarErro(mensagemDeErro(e, "Couldn't create the playlist.")); }
  };

  const linhasDoMenu: LinhaDoMenu[] = [
    { id: 'tocar', rotulo: 'Play', icone: 'play' },
    { id: 'seguinte', rotulo: 'Play next', icone: 'play-forward-outline' },
    { id: 'fila', rotulo: 'Add to queue', icone: 'list-outline' },
    { id: 'playlist', rotulo: 'Add to playlist', icone: 'add', inicioDeGrupo: true, submenu: true },
    ...(saoGostadas ? [] : [{ id: 'gostar', rotulo: 'Add to Liked Songs', icone: 'heart-outline' }]),
    ...(remover ? [{ id: 'remover', rotulo: remover.rotulo, icone: 'trash-outline', perigo: true }] : []),
  ];
  const painelDasPlaylists = (fechar: () => void, voltar?: () => void) => {
    const lista = useSelecao.getState().faixas;
    return <EscolherPlaylist faixa={lista[0]!} semMarcas aoFechar={fechar} aoVoltar={voltar}
      aoEscolher={(p) => void porNa(lista, p)} aoCriar={(nome) => void criarCom(lista, nome)} />;
  };

  return <>
    {faixas.length ? (
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: ESP.lg, alignItems: 'center', zIndex: 40 }}>
        <View {...marcar('barra-das-escolhidas')} accessibilityRole="toolbar" accessibilityLabel={`${musicas(faixas.length)} selected`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: ESP.lg, paddingRight: 6, paddingVertical: 6, borderRadius: 999,
            backgroundColor: COR.hover, borderWidth: 1, borderColor: COR.linha, boxShadow: '0 16px 50px rgba(0,0,0,.6)' } as any}>
          <Text style={{ ...TIPO.legenda, color: COR.texto, fontWeight: '650', marginRight: ESP.sm } as any}>{faixas.length} selected</Text>
          <Botao icone="play" rotulo="Play" aoCarregar={() => void fazer('tocar')} />
          <Botao icone="list-outline" rotulo="Queue" aoCarregar={() => void fazer('fila')} />
          <Botao icone="add" rotulo="Add to playlist" aoCarregar={(e) => void fazer('playlist', pontoDoEvento(e))} />
          {saoGostadas ? null : <Botao icone="heart-outline" rotulo="Like" aoCarregar={() => void fazer('gostar')} />}
          {remover ? <Botao icone="trash-outline" rotulo="Remove" titulo={remover.rotulo} aoCarregar={() => void fazer('remover')} /> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Clear selection" onPress={() => useSelecao.getState().limpar()}
            style={({ hovered, focused }: any) => [{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, (hovered || focused) && { backgroundColor: ESTADO.hover }]}>
            <Ionicons name="close" size={16} color={COR.textoMedio} />
          </Pressable>
        </View>
      </View>
    ) : null}
    {menu && faixas.length ? (
      <MenuDeContexto rato={menu} rotulo={`Options for ${musicas(faixas.length)}`}
        cabecalho={<Text style={{ ...TIPO.micro, color: COR.textoFraco }}>{musicas(faixas.length).toUpperCase()}</Text>}
        linhas={linhasDoMenu} submenu={({ fechar, voltar }) => painelDasPlaylists(fechar, voltar)}
        aoEscolher={(id) => { useSelecao.getState().fecharMenu(); if (id !== 'playlist') void fazer(id as Acao); }}
        aoFechar={() => useSelecao.getState().fecharMenu()} />
    ) : null}
    {playlists && faixas.length ? (
      <MenuDeContexto rato={playlists} rotulo={`Add ${musicas(faixas.length)} to a playlist`} linhas={[]}
        corpo={painelDasPlaylists(() => setPlaylists(null))} aoEscolher={() => {}} aoFechar={() => setPlaylists(null)} />
    ) : null}
  </>;
}

function Botao({ icone, rotulo, titulo, aoCarregar }: { icone: string; rotulo: string; titulo?: string; aoCarregar: (e: any) => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={titulo ?? rotulo} onPress={aoCarregar}
    style={({ hovered, focused }: any) => [{ height: 32, paddingHorizontal: 10, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 6 }, (hovered || focused) && { backgroundColor: ESTADO.hover }]}>
    <Ionicons name={icone as any} size={15} color={COR.texto} />
    <Text style={{ ...TIPO.legenda, color: COR.texto, fontWeight: '600' } as any}>{rotulo}</Text>
  </Pressable>;
}
