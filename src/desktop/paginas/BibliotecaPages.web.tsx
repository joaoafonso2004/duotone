import { useRecommendationFeedback } from '../../state/recommendationFeedback';
import { VoltarAOuvir } from '../VoltarAOuvir.web';
/**
 * Biblioteca: Search, Liked Songs, Artists e a página de um artista.
 *
 * Não há entidade "Liked Songs" separada: a `library_tracks` **é** a lista de
 * gostadas e o separador Songs é a vista dela. Não criar uma segunda porta
 * para a mesma coisa.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FILTROS_DE_VERSAO, filtrosComResultados, versaoPassa, type FiltroDeVersao } from '../../lib/filtroDeVersao';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fotoDoArtista, fotoJaConhecida } from '../../api/catalogo';
import { fotoNoTamanho } from '../../lib/catalogo';
import { getLikedSongs } from '../../api/library';
import { fetchYouTubePlaylistById, type YtRecommendedPlaylist } from '../../api/youtube';
import { lembrarCanalDoArtista, paginaDoArtista, type AlbumDaPagina, type PaginaDoArtista } from '../../api/albunsDoArtista';
import { tocarMixDoArtista } from '../../state/mixDoArtista';
import { pesquisarMusica, type DetalheDaPesquisa } from '../../api/search';
import { addTracksToPlaylist, createPlaylist } from '../../api/playlists';
import { getTopArtists } from '../../api/plays';
import { addSearchHistoryEntry, clearSearchHistory, getOrdemDasGostadas, getOrdemDoArtista, getSearchHistory, setOrdemDasGostadas, setOrdemDoArtista, type OrdemDoArtista } from '../../lib/prefs';
import { detalheDaLinha, infoDaPesquisa, infoDe, modosComDados, ordenarMusicasDoArtista } from '../../lib/ordemDoArtista';
import { discografia, legendaDoDisco, metaDoArtista, musicasDoArtista } from '../../lib/musicasDoArtista';
import { useCorDoAmbiente } from '../../hooks/useCorDoAmbiente';
import { degradeDaCorDaCapa } from '../../lib/profileImageCrop';
import { useFotoDoArtista, useVizinhancaDoArtista } from '../../hooks/useVizinhancaDoArtista';
import { useDestinos } from '../../navigation/destinos';
import { chaveDoTitulo } from '../../lib/albunsDoArtista';
import { agruparPorArtista, chaveDeArtista, displayArtist, extractArtist, tituloDaFaixa } from '../../lib/artistName';
import { useArtistasFavoritos } from '../../state/artistasFavoritos';
import { ArtistFavoritesSyncStatus } from '../../components/ArtistFavoritesSyncStatus';
import { comCatalogo, garantirCatalogo, useCatalogoDeFaixas } from '../../state/catalogoDeFaixas';
import { ordenarArtistas, ordenarFaixas } from '../../lib/ordenacao';
import { useAuth } from '../../state/auth';
import { correspondeAPesquisa } from '../../lib/searchText';
import { useMusicSearch } from '../../hooks/useMusicSearch';
import { estadoDaPesquisa, FRASES_DA_PESQUISA } from '../../lib/estadoDaPesquisa';
import { useArtistaEmDestaque, usePesquisaPorTipo, type SeparadorDaPesquisa } from '../../hooks/usePesquisaPorTipo';
import { legendaDoAlbumEncontrado, separadorPedidoPelaPergunta, type ArtistaEncontrado } from '../../lib/pesquisaPorTipo';
import { usePlayer } from '../../state/player';
import { ORDEM_DAS_PRATELEIRAS, temRecomendacoes, useRecomendacoes, type NomeDaPrateleira } from '../../state/recomendacoes';
import { useSaved } from '../../state/saved';
import type { Track } from '../../types';
import { crescer, faltaMostrar, PRIMEIRO_LOTE, quantosMostrar } from '../../lib/grelhaQueCresce';
import { styles } from '../estilos.web';
import { BotaoVoltar,
  Artwork, Button, ContentScroll, Dialog, Empty, Field, IconButton, Loading, marcar, Page,
  PrateleiraDeMisturas, Separadores, Shelf, ShelfDeLancamentos, TrackTable, type ColunaOrdenavel,
} from '../ui.web';
import { useMisturaDoDia } from '../../state/misturaDoDia';
import { marcarArtistaAberto, useNovosLancamentos } from '../../state/novosLancamentos';
import { legendaDoLancamento, type Lancamento } from '../../lib/novosLancamentos';
import { menuDoLancamento, type AcaoDoLancamento } from '../../lib/menuDoLancamento';
import { mensagemDeErro } from '../../lib/mensagemDeErro';
import { useConnectivity } from '../../state/connectivity';
import { MenuDeContexto, pontoDoEvento, type PontoNoEcra } from '../MenuDeContexto.web';
import { useMenuDoArtista } from '../MenuDoArtista.web';
import { menuDaMistura, type AcaoDaMistura } from '../../lib/menuDaMistura';
import { BotaoDeFixar } from '../AtalhosNaLateral.web';
import type { CommonPageProps, NavegarFn, Route } from '../rotas';
import { COR, ESP, ESTADO, FONT, RAIO, TIPO } from '../tokens.web';
import { useLibraryData } from './comum.web';
import { contextoDaMistura, contextoDaPrateleira, contextoParaAnalytics, notaDaPrateleira } from '../../lib/contextoDaDescoberta';
import { registar } from '../../lib/eventos';

export function SearchPage({ play, tocarMusica, notify, more, navigate }: CommonPageProps & { navigate: NavegarFn }) {
  const [query, setQuery] = useState(''); const [history, setHistory] = useState<string[]>([]); const input = useRef<any>(null);
  // As pesquisas recentes só com a caixa em foco (20/10), como no iPhone: na
  // Home, sempre à vista, eram uma fila de etiquetas por cima de tudo. Carregar
  // na lista não tira o foco à caixa (o `mousedown` dela é cancelado), senão a
  // lista desaparecia antes de o clique chegar à etiqueta.
  const [comFoco, setComFoco] = useState(false);
  const semRede = useConnectivity((s) => s.offline);
  // As músicas do dia saíram (7/10): já não existiam no iPhone (3/10), e a
  // Pesquisa sem texto é só a descoberta.
  // **As recomendacoes vivem fora desta pagina** (`state/recomendacoes.ts`).
  // Estavam num `useState` daqui, e esta pagina desmonta ao mudar de
  // separador: ir aos Artists e voltar recomecava o "Preparing
  // recommendations..." do zero, e a espera nao e pequena.
  const hasFeedback=useRecommendationFeedback(s=>s.items.length>0);
  const recs = useRecomendacoes();
  const savedKeys=useSaved((s)=>s.keys);
  const { descobrir, nuncaLancado, amigos, ouvirDeNovo, maisTocadas, esquecidas } = recs;
  /**
   * As quatro familias de misturas, separadas pelo prefixo do id.
   *
   * Vivem todas numa lista so na store -- e de proposito: a navegacao
   * encontra-as pelo id, e duas listas obrigavam a duas fontes para uma
   * diferenca que so existe no titulo da prateleira. E a mesma separacao que o
   * `SearchScreen` do telemovel faz.
   */
  const { estilos, radios, generos, decadas, playlists } = useMemo(() => ({
    estilos: recs.misturas.filter((m) => m.id.startsWith('estilo:')),
    radios: recs.misturas.filter((m) => m.id.startsWith('radio:')),
    generos: recs.misturas.filter((m) => m.id.startsWith('genero:')),
    decadas: recs.misturas.filter((m) => m.id.startsWith('decada:')),
    playlists: recs.misturas.filter((m) => !m.id.startsWith('estilo:') && !m.id.startsWith('radio:')
      && !m.id.startsWith('decada:') && !m.id.startsWith('genero:')),
  }), [recs.misturas]);
  const abrirMistura = (m: { id: string; nome: string }) =>
    navigate({ name: 'mistura', id: m.id, titulo: m.nome });
  const recsCarregadas = recs.estado === 'pronto';
  const misturaDoDiaFaixas = useMisturaDoDia((s) => s.faixas);
  const contextoPrateleira=useCallback((nome:NomeDaPrateleira)=>(track:Track)=>
    contextoDaPrateleira(nome,savedKeys.has(`${track.source}:${track.sourceId}`)),[savedKeys]);
  const vistos=useRef(new Set<string>());
  useEffect(()=>{
    for(const nome of ORDEM_DAS_PRATELEIRAS){
      const tracks=recs[nome];
      if(!recs.prontas.includes(nome)||!tracks.length)continue;
      // O flow não se mostra: no lugar dele está a Daily mix.
      if(nome==='flow')continue;
      const contexto=contextoPrateleira(nome)(tracks[0]);
      const chave=`${nome}:${recs.carregadoEm}:${tracks.length}`;
      if(vistos.current.has(chave))continue;
      vistos.current.add(chave);
      registar('recomendacao_mostrada',{...contextoParaAnalytics(contexto),quantidade:tracks.length});
    }
  },[recs,contextoPrateleira,recs.carregadoEm,recs.prontas,recs.descobrir,recs.nuncaLancado,recs.amigos,recs.ouvirDeNovo,recs.flow,recs.maisTocadas,recs.esquecidas,savedKeys]);
  // Nao repete o trabalho: se ja estao carregadas ou a carregar, isto e um
  // no-op. Existe para o caso de a app nao as ter comecado no arranque.
  useEffect(() => { void recs.carregar(); }, []);
  // Conjunto das faixas já guardadas, para marcar os resultados com um coração.
  useEffect(() => { useSaved.getState().refresh(); getSearchHistory().then(setHistory); const focus = () => input.current?.focus(); window.addEventListener('duotone:focus-search', focus); return () => window.removeEventListener('duotone:focus-search', focus); }, []);
  const { results, naBiblioteca, loading, errorMsg, pesquisarAgora } = useMusicSearch(query, (q) => {
    void addSearchHistoryEntry(q).then(setHistory).catch(() => {});
  });
  const run = (q = query) => { setQuery(q); pesquisarAgora(); };
  const semPesquisa = query.trim().length < 2;
  // O mesmo do iPhone (20/10, lib/estadoDaPesquisa.ts): com resultados da
  // biblioteca, uma falha online calava-se; e nenhuma falha deixava repetir.
  const estado = estadoDaPesquisa({
    pergunta: query, aCarregar: loading, erro: errorMsg, online: results.length, naBiblioteca: naBiblioteca.length,
  });
  // O filtro por versão (26/9): só aparecem os que têm resultados, e volta a
  // "All" a cada pesquisa nova. Ver lib/filtroDeVersao.ts.
  const [versao, setVersao] = useState<FiltroDeVersao>('todas');
  useEffect(() => { setVersao('todas'); }, [query]);
  const filtrosDaVersao = useMemo(() => filtrosComResultados(results.map((r) => r.title)), [results]);
  const resultadosVisiveis = useMemo(() => results.filter((r) => versaoPassa(r.title, versao)), [results, versao]);
  // A pesquisa por tipo (29/9, `lib/pesquisaPorTipo.ts`): Songs, Artists e
  // Albums. Só aparece com texto, e só pede o separador que está à vista.
  const [tipo, setTipo] = useState<SeparadorDaPesquisa>('musicas');
  const tipoAtivo: SeparadorDaPesquisa = semPesquisa ? 'musicas' : tipo;
  // "drake playlist" abre as Playlists sozinho; "drake album", os Albums.
  useEffect(() => { const pedido = separadorPedidoPelaPergunta(query); if (pedido) setTipo(pedido); }, [query]);
  const porTipo = usePesquisaPorTipo(query, tipoAtivo);
  const dialogo = useDialogoDoAlbum({ play, tocarMusica, notify, more });
  const { abrirAlbum, dialogoDoAlbum } = dialogo;
  const albumDoLancamento = (l: Lancamento): YtRecommendedPlaylist =>
    ({ id: l.id, title: l.titulo, artworkUrl: l.capa, channelTitle: legendaDoLancamento(l) });
  // O botão direito num disco (os lançamentos novos, os álbuns e as playlists
  // da pesquisa), num artista e numa mistura (24/10).
  const { abrirMenuDoDisco, menuDoDisco, discoDoMenu } = useMenuDoDisco(dialogo);
  const { abrirMenuDoArtista, menuDoArtista, artistaDoMenu } = useMenuDoArtista(notify);
  const [menuDaMist, setMenuDaMist] = useState<{ id: string; ponto: PontoNoEcra } | null>(null);
  const fazerNaMistura = async (id: string, acao: AcaoDaMistura) => {
    const m = recs.misturas.find((x) => x.id === id);
    if (!m || !m.faixas.length) return;
    const leitor = usePlayer.getState();
    const origem = { tipo: 'mistura' as const, nome: m.nome, id: m.id };
    try {
      if (acao === 'tocar') await leitor.tocarLista(m.faixas, leitor.shuffle, leitor.shuffleInteligente, origem);
      else if (acao === 'baralhar') await leitor.playShuffled(m.faixas, leitor.shuffleInteligente, origem);
      else if (acao === 'fila') { leitor.addManyToQueue(m.faixas); notify(`Added ${m.faixas.length} ${m.faixas.length === 1 ? 'song' : 'songs'} to the queue.`); }
      else {
        const playlist = await createPlaylist(m.nome);
        await addTracksToPlaylist(playlist.id, m.faixas);
        notify(`Saved “${m.nome}” with ${m.faixas.length} tracks.`);
        window.dispatchEvent(new CustomEvent('duotone:refresh-playlists'));
      }
    } catch (e) {
      notify(mensagemDeErro(e, acao === 'guardar' ? "Couldn't save this mix." : "Couldn't play this mix."));
    }
  };
  const lancamentos = useNovosLancamentos((s) => s.itens);
  // O artista abre pelo CANAL escolhido, sem adivinhar pelo nome (homónimos).
  const abrirArtista = (a: ArtistaEncontrado) => { lembrarCanalDoArtista(a.nome, a.canal); navigate({ name: 'artist', value: a.nome }); };
  // O artista em destaque (29/9): "drake" ou "drake playlist" põem o Drake no
  // topo das Songs e das Playlists, com o Mix dele, como o YouTube faz.
  const destaque = useArtistaEmDestaque(query, tipoAtivo === 'musicas' || tipoAtivo === 'playlists');
  const [aAbrirMix, setAAbrirMix] = useState(false);
  const tocarMixDoDestaque = async (a: ArtistaEncontrado) => {
    if (aAbrirMix) return;
    setAAbrirMix(true);
    const ok = await tocarMixDoArtista(a.nome, { canal: a.canal }).catch(() => false);
    setAAbrirMix(false);
    if (!ok) notify('Could not load the mix.');
  };
  return <><Page title="Home"
    action={<IconButton name="refresh" label="Refresh recommendations"
      onPress={() => { void recs.carregar(true); }} active={recs.estado === 'a-carregar'} />}>
    <View style={styles.searchBar}><Field ref={input} icon="search" placeholder="Search songs, artists, playlists" value={query} onChangeText={setQuery} onSubmitEditing={() => run()} onFocus={() => setComFoco(true)} onBlur={() => setComFoco(false)} /><Button onPress={() => run()}>Search</Button></View>
    {comFoco && query.trim().length < 2 && !loading && history.length > 0 && <View style={styles.history} {...({ onMouseDown: (e: any) => e.preventDefault() } as any)}><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Recent searches</Text><Pressable onPress={async () => { await clearSearchHistory(); setHistory([]); }}><Text style={styles.textAction}>Clear</Text></Pressable></View><View style={styles.chips}>{history.map((item) => <Pressable key={item} onPress={() => run(item)} style={({ hovered }) => [styles.chip, hovered && styles.chipHover]}><Ionicons name="time-outline" size={14} color={COR.textoFraco} /><Text style={styles.chipText}>{item}</Text></Pressable>)}</View></View>}
    {!semPesquisa ? <View style={styles.vistasDaPesquisa}><Separadores opcoes={[['musicas', 'Songs'], ['artistas', 'Artists'], ['albuns', 'Albums'], ['playlists', 'Playlists']] as const}
      valor={tipo} aoMudar={setTipo} /></View> : null}
    <ContentScroll>
      {destaque && (tipoAtivo === 'musicas' || tipoAtivo === 'playlists') ? <ArtistaEmDestaque artista={destaque}
        aoAbrir={() => abrirArtista(destaque)} aoTocarMix={() => void tocarMixDoDestaque(destaque)} aAbrirMix={aAbrirMix}
        aoMenu={(e) => abrirMenuDoArtista({ nome: destaque.nome, canal: destaque.canal, capa: destaque.foto }, e)} /> : null}
      {
      tipoAtivo === 'artistas' ? <ResultadosDeArtistas artistas={porTipo.artistas} loading={porTipo.loading} falhou={porTipo.falhou} aoTentar={porTipo.repetir} aoAbrir={abrirArtista}
          aoMenu={(a, e) => abrirMenuDoArtista({ nome: a.nome, canal: a.canal, capa: a.foto }, e)} escolhido={artistaDoMenu} />
      : tipoAtivo === 'albuns' || tipoAtivo === 'playlists' ? <ResultadosEmCapas loading={porTipo.loading} falhou={porTipo.falhou} aoTentar={porTipo.repetir}
          itens={tipoAtivo === 'albuns'
            ? porTipo.albuns.map((a) => ({ id: a.id, titulo: a.titulo, legenda: legendaDoAlbumEncontrado(a), capa: a.capa, tipo: a.tipo, artista: a.artista || null }))
            : porTipo.playlists.map((p) => ({ id: p.id, titulo: p.titulo, legenda: p.legenda, capa: p.capa, tipo: 'Playlist', artista: null }))}
          icone={tipoAtivo === 'albuns' ? 'albums-outline' : 'list-outline'}
          vazio={tipoAtivo === 'albuns' ? 'No albums found' : 'No playlists found'}
          aoAbrir={(a) => void abrirAlbum({ id: a.id, title: a.titulo, artworkUrl: a.capa, channelTitle: a.legenda })}
          aoMenu={abrirMenuDoDisco} escolhido={discoDoMenu} />
      :
      /* O que já é teu vem primeiro e não espera pela rede; o YouTube fica por
         baixo. Ver lib/pesquisaLocal.ts. */
      estado.tipo === 'resultados' ? <>
        {naBiblioteca.length ? <>
          <Text style={styles.sectionTitle}>In your library</Text>
          <TrackTable tracks={naBiblioteca} onPlay={(t) => tocarMusica(t, naBiblioteca, undefined, { tipo: 'pesquisa', nome: query })} onMore={more} />
        </> : null}
        {estado.rodape === 'a-carregar' ? <View style={{ height: 200 }}><Loading /></View>
          : estado.rodape === 'falhou' ? <FalhaDaPesquisaOnline mensagem={errorMsg} aoTentar={pesquisarAgora} />
          : results.length ? <>
            {naBiblioteca.length ? <Text style={[styles.sectionTitle, { marginTop: 24 }]}>More results</Text> : null}
            {filtrosDaVersao.length > 2 ? <View style={[styles.chips, { marginBottom: 12 }]}>{FILTROS_DE_VERSAO.filter((f) => filtrosDaVersao.includes(f.id)).map((f) => (
              <Pressable key={f.id} onPress={() => setVersao(f.id)} accessibilityRole="button" accessibilityState={{ selected: versao === f.id }}
                style={({ hovered }) => [styles.chip, hovered && styles.chipHover, versao === f.id && { backgroundColor: COR.texto }]}>
                <Text style={[styles.chipText, versao === f.id && { color: COR.fundo }]}>{f.nome}</Text>
              </Pressable>))}</View> : null}
            {/* Só a faixa escolhida, NUNCA os resultados: são o que o YouTube
                casou com o texto, não uma lista de ninguém. Procurar "6:30" e
                ter o shuffle ligado dava um temporizador de 7 h a seguir (14/9).
                O rádio continua a partir desta, pelo gosto de quem ouve. */}
            <TrackTable tracks={resultadosVisiveis} showSavedBadge onPlay={(t) => tocarMusica(t, undefined, undefined, { tipo: 'pesquisa', nome: query })} onMore={more} />
          </> : null}
      </>
      : estado.tipo === 'a-carregar' ? <View style={{ height: 320 }}><Loading /></View>
      : estado.tipo === 'falhou' ? <Empty icon="cloud-offline-outline" title={FRASES_DA_PESQUISA.falhou} body={errorMsg ?? FRASES_DA_PESQUISA.semMotivo}
          action={<Button onPress={pesquisarAgora}>{FRASES_DA_PESQUISA.tentarDeNovo}</Button>} />
      : estado.tipo === 'sem-resultados' ? <Empty icon="search-outline" title={FRASES_DA_PESQUISA.semResultados} body={FRASES_DA_PESQUISA.semResultadosCorpo} />
      : temRecomendacoes(recs) ? <>
          {/* Os sítios de onde se ouviu, como na Home do iPhone (5/10). */}
          <VoltarAOuvir />
          <Shelf grelha titulo="Discover daily" nota={notaDaPrateleira('descobrir')} tracks={descobrir} onPlay={tocarMusica} onMore={more} contexto={contextoPrateleira('descobrir')} />
          {/* Ao lado do Discover, e a dizer o contrário: esse vai buscar aos
              vizinhos o que saiu, esta vai buscar aos teus o que nunca saiu. */}
          {/* A Daily mix: a MESMA lista o dia inteiro, e a mesma no iPhone
              (store própria, ver state/misturaDoDia.ts). Tomou o lugar do
              "Daily flow", que era quase a mesma coisa refeita a cada
              arranque e só existia aqui -- duas listas "do dia" lado a lado
              era uma a mais. */}
          <Shelf titulo="Daily mix" nota="new every day, from what you listen to" tracks={misturaDoDiaFaixas} onPlay={tocarMusica} onMore={more} contexto={contextoPrateleira('flow')} />
          {/* Os novos lançamentos dos teus artistas (10/10, state/novosLancamentos.ts):
              abrem a pré-visualização do álbum, como na página do artista. */}
          <ShelfDeLancamentos titulo="New releases" nota="from the artists you listen to"
            itens={lancamentos.map(({ lancamento: l, novo }) => ({ id: l.id, titulo: l.titulo, legenda: legendaDoLancamento(l), capa: l.capa, novo }))}
            onOpen={(id) => { const l = lancamentos.find((x) => x.lancamento.id === id)?.lancamento; if (l) void abrirAlbum(albumDoLancamento(l)); }}
            onMenu={(id, e) => { const l = lancamentos.find((x) => x.lancamento.id === id)?.lancamento; if (l) abrirMenuDoDisco({ id: l.id, titulo: l.titulo, legenda: legendaDoLancamento(l), capa: l.capa, tipo: l.tipo, artista: l.artista }, e); }} />
          <Shelf titulo="Rare finds" nota={notaDaPrateleira('nuncaLancado')} selo="New to you" tracks={nuncaLancado} onPlay={tocarMusica} onMore={more} contexto={contextoPrateleira('nuncaLancado')} />
          {/* AS MISTURAS QUE A APP MONTA. Quatro familias, e a diferenca esta
              toda no titulo -- que e o que elas tem de diferente:
                Your styles -> artistas teus que partilham vizinhos
                Radio       -> tres faixas novas por cada tua
                Your genres -> a gaveta larga do catalogo ("Rap/Hip Hop")
                Decades     -> a TUA musica daquela era, nao musica nova dela
                Playlists   -> a tua biblioteca com descobertas pelo meio
              Ver `lib/estilos.ts`, `radiosDeArtista` e `lib/decadas.ts`. */}
          <PrateleiraDeMisturas titulo="Your styles" misturas={estilos} aoAbrir={abrirMistura}
            aoMenu={(m, e) => setMenuDaMist({ id: m.id, ponto: pontoDoEvento(e) })} escolhido={menuDaMist?.id ?? null} />
          <PrateleiraDeMisturas titulo="Radio" nota="three new tracks for every one of yours" misturas={radios} aoAbrir={abrirMistura}
            aoMenu={(m, e) => setMenuDaMist({ id: m.id, ponto: pontoDoEvento(e) })} escolhido={menuDaMist?.id ?? null} />
          <PrateleiraDeMisturas titulo="Your genres" nota="your library, by genre" misturas={generos} aoAbrir={abrirMistura}
            aoMenu={(m, e) => setMenuDaMist({ id: m.id, ponto: pontoDoEvento(e) })} escolhido={menuDaMist?.id ?? null} />
          <PrateleiraDeMisturas titulo="Decades" nota="your music from that era" misturas={decadas} aoAbrir={abrirMistura}
            aoMenu={(m, e) => setMenuDaMist({ id: m.id, ponto: pontoDoEvento(e) })} escolhido={menuDaMist?.id ?? null} />
          <PrateleiraDeMisturas titulo="Playlists" misturas={playlists} aoAbrir={abrirMistura}
            aoMenu={(m, e) => setMenuDaMist({ id: m.id, ponto: pontoDoEvento(e) })} escolhido={menuDaMist?.id ?? null} />
          {/* A unica prateleira desta pagina que nao sai do teu proprio
              historico. Fica entre a descoberta e o que ja e teu. */}
          <Shelf titulo="Your friends' favourites" nota={notaDaPrateleira('amigos')} tracks={amigos} onPlay={tocarMusica} onMore={more} contexto={contextoPrateleira('amigos')} />
          <Shelf titulo="Listen again" nota={notaDaPrateleira('ouvirDeNovo')} tracks={ouvirDeNovo} onPlay={tocarMusica} onMore={more} contexto={contextoPrateleira('ouvirDeNovo')} />
          <Shelf titulo="Heavy rotation" nota={notaDaPrateleira('maisTocadas')} tracks={maisTocadas} onPlay={tocarMusica} onMore={more} contexto={contextoPrateleira('maisTocadas')} />
          <Shelf titulo="Forgotten favourites" nota={notaDaPrateleira('esquecidas')} tracks={esquecidas} onPlay={tocarMusica} onMore={more} contexto={contextoPrateleira('esquecidas')} />
        </>
      : <Empty icon={recsCarregadas ? 'search-outline' : 'sparkles-outline'}
          title={recsCarregadas ? 'Nothing to recommend yet' : 'Preparing recommendations…'}
          body={recsCarregadas
            ? hasFeedback?'No suggestions match your current preferences. Review them in Settings → Recommendations, or search for music above.':'Listen to a few tracks and this page will learn what you enjoy. Until then, search for any song above.'
            : 'One moment.'} />}
    </ContentScroll></Page>
    {dialogoDoAlbum}
    {menuDoDisco}
    {menuDoArtista}
    {menuDaMist ? <MenuDaMistura mistura={recs.misturas.find((x) => x.id === menuDaMist.id) ?? null} ponto={menuDaMist.ponto} semRede={semRede}
      aoEscolher={(id, acao) => void fazerNaMistura(id, acao)} aoFechar={() => setMenuDaMist(null)} /> : null}
  </>;
}

/** O menu de uma mistura da Home (24/10, `lib/menuDaMistura.ts`). */
function MenuDaMistura({ mistura: m, ponto, semRede, aoEscolher, aoFechar }: {
  mistura: { id: string; nome: string; faixas: Track[] } | null; ponto: PontoNoEcra; semRede: boolean;
  aoEscolher: (id: string, acao: AcaoDaMistura) => void; aoFechar: () => void;
}) {
  if (!m) return null;
  return <MenuDeContexto
    rato={ponto}
    rotulo={`Options for ${m.nome}`}
    cabecalho={<CabecalhoDoMenu capa={m.faixas[0]?.artworkUrl ?? null} titulo={m.nome}
      legenda={`Mix · ${m.faixas.length} ${m.faixas.length === 1 ? 'song' : 'songs'}`} />}
    linhas={menuDaMistura({ semRede }).map((a) => ({ id: a.id, rotulo: a.rotulo, icone: a.icone, inicioDeGrupo: a.inicioDeGrupo, motivo: a.motivo }))}
    aoEscolher={(id) => aoEscolher(m.id, id as AcaoDaMistura)}
    aoFechar={aoFechar}
  />;
}

/** A capa, o título e a legenda no topo do menu de uma lista (um disco, uma mistura). */
function CabecalhoDoMenu({ capa, titulo, legenda }: { capa: string | null; titulo: string; legenda: string }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
    {capa ? <Image source={{ uri: capa }} style={{ width: 40, height: 40, borderRadius: RAIO.ctrl, backgroundColor: COR.elevado }} /> : null}
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={1} style={{ color: COR.texto, fontSize: 14, fontWeight: '700' }}>{titulo}</Text>
      <Text numberOfLines={1} style={{ color: COR.textoMedio, fontSize: 12, marginTop: 1 }}>{legenda}</Text>
    </View>
  </View>;
}

/** Um disco no menu: um lançamento novo, um álbum ou single do artista, um álbum ou uma playlist da pesquisa. */
type DiscoDoMenu = { id: string; titulo: string; legenda: string; capa: string | null; tipo: string; artista: string | null };

/**
 * O botão direito num disco (20/10 nos "New releases"; 24/10 também nos discos
 * da página do artista e nos álbuns e playlists da pesquisa): as linhas de
 * `lib/menuDoLancamento.ts`, e o que fazem é o da pré-visualização do álbum.
 * `discoDoMenu`: o id do que está aberto, para o cartão ficar marcado.
 */
function useMenuDoDisco(dialogo: Pick<ReturnType<typeof useDialogoDoAlbum>, 'abrirAlbum' | 'albumSemAbrir' | 'guardarAlbumSemAbrir'>) {
  const [menu, setMenu] = useState<{ d: DiscoDoMenu; ponto: PontoNoEcra } | null>(null);
  const semRede = useConnectivity((s) => s.offline);
  const { irPara } = useDestinos();
  const abrirMenuDoDisco = useCallback((d: DiscoDoMenu, e: any) => { e?.preventDefault?.(); setMenu({ d, ponto: pontoDoEvento(e) }); }, []);
  const fazer = (d: DiscoDoMenu, acao: AcaoDoLancamento) => {
    const album: YtRecommendedPlaylist = { id: d.id, title: d.titulo, artworkUrl: d.capa, channelTitle: d.legenda };
    if (acao === 'abrir') void dialogo.abrirAlbum(album);
    else if (acao === 'guardar') void dialogo.guardarAlbumSemAbrir(album);
    else if (acao === 'artista') { if (d.artista) irPara({ tipo: 'artista', nome: d.artista }); }
    else void dialogo.albumSemAbrir(album, acao);
  };
  const menuDoDisco = menu ? <MenuDeContexto
    rato={menu.ponto}
    rotulo={`Options for ${menu.d.titulo}`}
    cabecalho={<CabecalhoDoMenu capa={menu.d.capa} titulo={menu.d.titulo} legenda={menu.d.legenda} />}
    linhas={menuDoLancamento(menu.d, { semRede, temArtista: !!menu.d.artista }).map((a) => ({ id: a.id, rotulo: a.rotulo, icone: a.icone, inicioDeGrupo: a.inicioDeGrupo, motivo: a.motivo }))}
    aoEscolher={(id) => fazer(menu.d, id as AcaoDoLancamento)}
    aoFechar={() => setMenu(null)}
  /> : null;
  return { abrirMenuDoDisco, menuDoDisco, discoDoMenu: menu?.d.id ?? null };
}

/**
 * O artista em destaque no topo da pesquisa (29/9): a foto, o nome, a
 * audiência, o Mix dele e a página. É o cartão que o YouTube mostra para
 * "drake playlist" -- só quando a pergunta é mesmo o nome dele.
 */
function ArtistaEmDestaque({ artista, aoAbrir, aoTocarMix, aAbrirMix, aoMenu }: {
  artista: ArtistaEncontrado; aoAbrir: () => void; aoTocarMix: () => void; aAbrirMix: boolean; aoMenu: (e: any) => void;
}) {
  // O cartão não é um botão: os botões estão lá dentro, e botão dentro de
  // botão é HTML inválido. A foto e o nome abrem a página, como o "Open".
  return <View style={artistStyles.destaque} {...({ onContextMenu: aoMenu } as any)}>
    <Pressable onPress={aoAbrir} accessibilityRole="link" accessibilityLabel={`Open ${artista.nome}`}
      style={({ hovered, focused }: any) => [{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: ESP.xl },
        (hovered || focused) && { opacity: 0.88 }]}>
      <CapaSemReferer uri={artista.foto} lado={96} redonda icone="person" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={artistStyles.ultimoRotulo}>ARTIST</Text>
        <Text numberOfLines={1} style={artistStyles.destaqueNome}>{artista.nome}</Text>
        {artista.legenda ? <Text numberOfLines={1} style={artistStyles.albumMeta}>{artista.legenda}</Text> : null}
      </View>
    </Pressable>
    <View style={{ flexDirection: 'row', gap: ESP.sm }}>
      <Button icon="radio-outline" onPress={aoTocarMix} ocupado={aAbrirMix}>{aAbrirMix ? 'Loading…' : 'Mix'}</Button>
      <Button secondary icon="person-outline" onPress={aoAbrir}>Open</Button>
    </View>
  </View>;
}

/** Os artistas da pesquisa por tipo: a foto redonda, o nome e a audiência. */
/**
 * A parte online da pesquisa falhou, por baixo do que já é teu (20/10): antes
 * calava-se, e a lista parecia ser tudo o que havia.
 */
function FalhaDaPesquisaOnline({ mensagem, aoTentar }: { mensagem: string | null; aoTentar: () => void }) {
  return <View style={artistStyles.falhaOnline} accessibilityRole="alert">
    <Ionicons name="cloud-offline-outline" size={18} color={COR.textoMedio} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={[TIPO.corpo, { color: COR.texto, fontWeight: '600' as any }]}>{FRASES_DA_PESQUISA.falhouOnline}</Text>
      <Text style={[TIPO.legenda, { color: COR.textoMedio, marginTop: 2 }]}>{mensagem ?? FRASES_DA_PESQUISA.semMotivo}</Text>
    </View>
    <Button secondary onPress={aoTentar}>{FRASES_DA_PESQUISA.tentarDeNovo}</Button>
  </View>;
}

/** A falha de uma pesquisa por tipo, com o "Try again" que a repete (20/10). */
function FalhaDaPesquisa({ aoTentar }: { aoTentar: () => void }) {
  return <Empty icon="cloud-offline-outline" title={FRASES_DA_PESQUISA.falhou} body={FRASES_DA_PESQUISA.semMotivo}
    action={<Button onPress={aoTentar}>{FRASES_DA_PESQUISA.tentarDeNovo}</Button>} />;
}

function ResultadosDeArtistas({ artistas, loading, falhou, aoTentar, aoAbrir, aoMenu, escolhido }: {
  artistas: ArtistaEncontrado[]; loading: boolean; falhou: boolean; aoTentar: () => void; aoAbrir: (a: ArtistaEncontrado) => void;
  aoMenu: (a: ArtistaEncontrado, e: any) => void;
  /** A chave do artista com o menu aberto: o cartão fica marcado. */
  escolhido: string | null;
}) {
  if (loading) return <View style={{ height: 320 }}><Loading /></View>;
  if (!artistas.length) return falhou
    ? <FalhaDaPesquisa aoTentar={aoTentar} />
    : <Empty icon="person-outline" title="No artists found" body={FRASES_DA_PESQUISA.semResultadosCorpo} />;
  return <View style={artistStyles.albumGrid}>{artistas.map((a) => <Pressable key={a.canal} onPress={() => aoAbrir(a)}
    accessibilityRole="button" accessibilityLabel={a.nome} {...({ onContextMenu: (e: any) => aoMenu(a, e) } as any)}
    style={({ hovered, focused }: any) => [artistStyles.artistaCard, (hovered || focused || escolhido === chaveDeArtista(a.nome)) && artistStyles.albumCardHover]}>
    <CapaSemReferer uri={a.foto} lado={170} redonda icone="person" />
    <Text numberOfLines={1} style={[artistStyles.albumTitle, { textAlign: 'center' }]}>{a.nome}</Text>
    {a.legenda ? <Text numberOfLines={1} style={[artistStyles.albumMeta, { textAlign: 'center' }]}>{a.legenda}</Text> : null}
  </Pressable>)}</View>;
}

type ItemEmCapa = { id: string; titulo: string; legenda: string; capa: string | null; tipo: string; artista: string | null };

/**
 * Uma capa ou foto do YouTube Music SEM `Referer` (29/9). O servidor das capas
 * das playlists e das fotos dos artistas (yt3.ggpht.com,
 * yt3.googleusercontent.com) responde 429 aos pedidos com o Referer da app ao
 * fim de poucas imagens: via-se a primeira capa e as outras ficavam vazias. O
 * mesmo pedido sem Referer dá 200 (medido no Chromium). O `Image` do
 * react-native-web não deixa mudar a política, por isso é um `<img>` a sério.
 * No iPhone não acontece: o expo-image pede pelo código nativo, sem Referer.
 */
function CapaSemReferer({ uri, lado, redonda, icone }: {
  uri: string | null; lado: number; redonda?: boolean; icone: 'person' | 'albums-outline' | 'list-outline';
}) {
  const [falhou, setFalhou] = useState(false);
  useEffect(() => { setFalhou(false); }, [uri]);
  const raio = redonda ? lado / 2 : RAIO.superficie;
  if (!uri || falhou) {
    return <View style={[{ width: lado, height: lado, borderRadius: raio, backgroundColor: COR.elevado }, artistStyles.albumFallback]}>
      <Ionicons name={icone} size={redonda ? 40 : 34} color={COR.textoFraco} />
    </View>;
  }
  return <img src={uri} alt="" referrerPolicy="no-referrer" loading="lazy" decoding="async" draggable={false}
    onError={() => setFalhou(true)}
    style={{
      width: lado, height: lado, borderRadius: raio, objectFit: 'cover', display: 'block', boxSizing: 'border-box',
      backgroundColor: COR.elevado, border: redonda ? 'none' : `1px solid ${COR.linhaSuave}`,
    }} />;
}

/**
 * Os álbuns e as playlists da pesquisa por tipo, em grelha de capas. Os dois
 * abrem o mesmo diálogo (tocar, ou guardar como playlist).
 */
function ResultadosEmCapas({ itens, loading, falhou, aoTentar, icone, vazio, aoAbrir, aoMenu, escolhido }: {
  itens: ItemEmCapa[]; loading: boolean; falhou: boolean; aoTentar: () => void; icone: 'albums-outline' | 'list-outline';
  vazio: string; aoAbrir: (a: ItemEmCapa) => void;
  aoMenu: (a: ItemEmCapa, e: any) => void;
  /** O id com o menu aberto: o cartão fica marcado. */
  escolhido: string | null;
}) {
  if (loading) return <View style={{ height: 320 }}><Loading /></View>;
  if (!itens.length) return falhou
    ? <FalhaDaPesquisa aoTentar={aoTentar} />
    : <Empty icon={icone} title={vazio} body={FRASES_DA_PESQUISA.semResultadosCorpo} />;
  return <View style={artistStyles.albumGrid}>{itens.map((a) => <Pressable key={a.id} onPress={() => aoAbrir(a)}
    accessibilityRole="button" accessibilityLabel={a.legenda ? `${a.titulo}, ${a.legenda}` : a.titulo} {...({ onContextMenu: (e: any) => aoMenu(a, e) } as any)}
    style={({ hovered, focused }: any) => [artistStyles.albumCard, (hovered || focused || escolhido === a.id) && artistStyles.albumCardHover]}>
    <CapaSemReferer uri={a.capa} lado={190} icone={icone} />
    <Text numberOfLines={2} style={artistStyles.albumTitle}>{a.titulo}</Text>
    {a.legenda ? <Text numberOfLines={1} style={artistStyles.albumMeta}>{a.legenda}</Text> : null}
  </Pressable>)}</View>;
}

export function SongsPage(props: CommonPageProps) {
  const data = useLibraryData(getLikedSongs);
  const [query, setQuery] = useState('');
  // Sem coluna escolhida, a ordem é a das gostadas (as mais recentes primeiro).
  // Ordena-se no cabeçalho da tabela; o botão "Sort" e o diálogo dele saíram.
  // Fica guardada (9/10), como no iPhone: voltava sempre às mais recentes.
  const [ordem, setOrdemLocal] = useState<ColunaOrdenavel | null>(null);
  useEffect(() => {
    let vivo = true;
    void getOrdemDasGostadas().then((v) => { if (vivo) setOrdemLocal(v === 'recent' ? null : v); });
    return () => { vivo = false; };
  }, []);
  const setOrdem = (v: ColunaOrdenavel | null) => { setOrdemLocal(v); void setOrdemDasGostadas(v ?? 'recent'); };

  const filteredTracks = useMemo(() => {
    const filtradas = data.tracks.filter(t => correspondeAPesquisa(query, t.title, t.artist));
    if (!ordem) return filtradas;
    return ordenarFaixas(filtradas, ordem, { titulo: (t) => tituloDaFaixa(t), artista: (t) => displayArtist(t) });
  }, [data.tracks, query, ordem]);

  // O Shuffle liga o modo aleatório do player (Fisher-Yates) em vez de
  // baralhar a lista com `sort(() => Math.random() - 0.5)`, que é enviesado e
  // deixava o botão em desacordo com o interruptor do player.
  // O MODO vem do leitor e nao desta pagina: um so sitio decide se o shuffle
  // e inteligente, e o botao daqui mostra-o e respeita-o. Ter cada pagina com
  // a sua opiniao dava dois sitios a discordar.
  const inteligente = usePlayer((s) => s.shuffleInteligente);
  const ligado = usePlayer((s) => s.shuffle);
  const alternarShuffle = usePlayer((s) => s.toggleShuffle);
  // Modelo do Spotify: o botao de shuffle ALTERNA o modo e nao toca; quem
  // toca e o "Play all", que respeita o modo escolhido. Com um botao que
  // tocasse E alternasse, o que se ve no botao seria o que NAO se ia ouvir.
  const playAll = () => {
    if (!filteredTracks.length) return;
    void usePlayer.getState().tocarLista(filteredTracks, ligado, inteligente, { tipo: 'guardadas', nome: 'Liked Songs' });
  };

  return <><Page title="Liked Songs" action={<View style={{ flexDirection: 'row', gap: 8 }}><Button icon="play" onPress={playAll}>Play all</Button><Button secondary marcado={ligado} brilho={inteligente} icon="shuffle" onPress={alternarShuffle}>{inteligente ? 'Smart shuffle' : 'Shuffle'}</Button></View>}>
    <View style={styles.songsToolbar}>
      <View style={styles.songsSearch}><Field icon="search" placeholder="Search your library" value={query} onChangeText={setQuery} /></View>
      {/* "0 songs" só para uma lista que se leu (16/10, auditoria 5). */}
      {data.semLista ? null : <Text style={styles.songsResultCount}>{query ? `${filteredTracks.length} of ` : ''}{data.tracks.length} {data.tracks.length === 1 ? 'song' : 'songs'}</Text>}
      <IconButton name="refresh" label="Refresh library" active={data.aReler} onPress={() => {
        // Com a lista no ecrã, uma falha não a tira: só se avisa.
        const comLista = data.tracks.length > 0;
        void data.refresh().then((ok) => { if (!ok && comLista) props.notify('Could not refresh your liked songs.'); });
      }} />
    </View>
    <ContentScroll scrollKey="songs">{data.loading ? <View style={{ height: 350 }}><Loading /></View> : data.semLista ? <Empty icon="alert-circle-outline" title="Couldn't load your library" body="Check your connection. Nothing was removed: your songs are still saved." action={<Button onPress={() => void data.refresh()}>Try again</Button>} /> : <TrackTable plain listKey={`songs:${ordem ?? 'recent'}`} ordenacao={{ modo: ordem, aoMudar: setOrdem }} tracks={filteredTracks} onPlay={(t) => props.tocarMusica(t, filteredTracks, undefined, { tipo: 'guardadas', nome: 'Liked Songs' })} onMore={props.more} empty={query ? <Empty icon="search-outline" title="No results found" body={`No liked songs match "${query}"`} /> : <Empty icon="heart-outline" title="No liked songs yet" body="Tap the heart on a track and it will appear here." />} />}</ContentScroll>
  </Page></>;
}

/** O ranking dos artistas pelo histórico, entre visitas à página. */
let rankingGuardado: { conta: string | undefined; mapa: Map<string, number>; em: number } | null = null;
/**
 * O agrupamento da biblioteca por artista, entre visitas: aprende o vocabulário
 * da biblioteca inteira e percorre-a toda, e só muda quando a biblioteca (a
 * mesma lista da cache) ou o catálogo mudam.
 */
let gruposGuardados: { faixas: readonly Track[]; versao: unknown; grupos: ReturnType<typeof agruparPorArtista<Track>> } | null = null;
function gruposDaBiblioteca(faixas: readonly Track[], versao: unknown) {
  if (gruposGuardados && gruposGuardados.faixas === faixas && gruposGuardados.versao === versao) return gruposGuardados.grupos;
  const grupos = agruparPorArtista(faixas.map(comCatalogo));
  gruposGuardados = { faixas, versao, grupos };
  return grupos;
}

export function ArtistsPage({ navigate, notify }: { navigate: (route: Route) => void; notify: (texto: string) => void }) {
  const data = useLibraryData();
  // O botão direito num cartão (24/10): o menu de um artista.
  const { abrirMenuDoArtista, menuDoArtista, artistaDoMenu } = useMenuDoArtista(notify);
  const [query, setQuery] = useState('');
  // Ordem por ESCUTA. Alfabetica era neutra e por isso inutil: quem tem 200
  // artistas nao procura pelo nome, procura por quem ouve. O ranking vem do
  // historico (get_top_artists); quem nao aparece la ordena-se pelo numero de
  // faixas na biblioteca, que e o melhor sinal que sobra.
  // Guardado entre visitas (27/9): pedido de novo a cada abertura, chegava
  // depois da grelha e reordenava-a à frente dos olhos. Agora a segunda
  // abertura já sai na ordem certa, e o pedido só se repete passados 5 min.
  const conta = useAuth((st) => st.session?.user.id);
  const [ranking, setRanking] = useState<Map<string, number>>(() => { const g = rankingGuardado; return g && g.conta === conta ? g.mapa : new Map(); });
  useEffect(() => {
    const g = rankingGuardado;
    if (g && g.conta === conta && Date.now() - g.em < 5 * 60_000) return;
    getTopArtists(200)
      // Pela chave canonica e nao por toLowerCase(): o ranking vem do
      // historico, onde o mesmo artista pode estar escrito de outra maneira.
      .then((tops) => {
        const mapa = new Map(tops.map((a, i) => [chaveDeArtista(a.name), i] as [string, number]));
        rankingGuardado = { conta, mapa, em: Date.now() };
        setRanking(mapa);
      })
      .catch(() => {});
  }, [conta]);
  // Agrupado por CHAVE canonica e nao pelo nome mostrado -- era isso que punha
  // `Juice WRLD`, `juice wrld` e `JUICE WRLD` em tres cartoes diferentes.
  const versaoDoCatalogo = useCatalogoDeFaixas((s) => s.versao);
  const favoritos = useArtistasFavoritos((s) => s.chaves);
  const alternarFavorito = useArtistasFavoritos((s) => s.alternar);
  useEffect(() => { void useArtistasFavoritos.getState().carregar(); }, []);
  const comNovidade = useNovosLancamentos((s) => s.comNovidade);
  const artists = useMemo(
    () => ordenarArtistas(gruposDaBiblioteca(data.tracks, versaoDoCatalogo), ranking, favoritos),
    [data.tracks, ranking, versaoDoCatalogo, favoritos],
  );
  // A grelha monta por lotes: com centenas de artistas, montar tudo de uma vez
  // era mandar buscar centenas de capas no mesmo fotograma e a app inteira
  // engasgava-se ao abrir o separador. Ver `lib/grelhaQueCresce.ts`.
  const [pedidos, setPedidos] = useState(PRIMEIRO_LOTE);
  const filteredArtists = useMemo(() => {
    // O mesmo comparador do telemóvel: procurar por `juice` dava listas
    // diferentes nas duas plataformas, porque aqui era um pedaço da chave
    // canónica e lá o comparador de pesquisa sem acentos.
    const q = query.trim();
    return q ? artists.filter((artist) => correspondeAPesquisa(q, artist.nome)) : artists;
  }, [artists, query]);
  // Uma pesquisa nova começa outra vez no primeiro lote: o que interessa está
  // em cima, e quem procurou não quer ver setecentos cartões.
  useEffect(() => { setPedidos(PRIMEIRO_LOTE); }, [query]);
  const aMostrar = quantosMostrar(pedidos, filteredArtists.length);
  const visiveis = useMemo(() => filteredArtists.slice(0, aMostrar), [filteredArtists, aMostrar]);
  const mostrarMais = useCallback(() => setPedidos((n) => {
    // Sem isto, um evento de scroll por pixel redesenhava a página toda.
    if (!faltaMostrar(n, filteredArtists.length)) return n;
    return crescer(quantosMostrar(n, filteredArtists.length), filteredArtists.length);
  }), [filteredArtists.length]);

  return <Page title="Artists" subtitle={data.semLista ? undefined : `${artists.length} ${artists.length === 1 ? 'artist' : 'artists'}`}>
    <ArtistFavoritesSyncStatus />
    <View style={styles.songsToolbar}>
      <View style={styles.songsSearch}><Field icon="search" placeholder="Search artists" value={query} onChangeText={setQuery} /></View>
      {data.semLista ? null : <Text style={styles.songsResultCount}>{query ? `${filteredArtists.length} of ` : ''}{artists.length} {artists.length === 1 ? 'artist' : 'artists'}</Text>}
    </View>
    <ContentScroll scrollKey="artists" aoChegarAoFim={mostrarMais}>{data.loading ? <View style={{ height: 350 }}><Loading /></View> : data.semLista ? <Empty icon="alert-circle-outline" title="Couldn't load your library" body="Check your connection. Nothing was removed: your songs are still saved." action={<Button onPress={() => void data.refresh()}>Try again</Button>} /> : filteredArtists.length ? <View style={styles.playlistGrid}>{visiveis.map(({ nome, chave, faixas }) => { const favorito = favoritos.has(chave); return (
      <Pressable key={chave} onPress={() => navigate({ name: 'artist', value: nome })}
        {...({ onContextMenu: (e: any) => abrirMenuDoArtista({ nome, capa: faixas[0]?.artworkUrl ?? null }, e) } as any)}
        {...marcar('cartao', ...(artistaDoMenu === chave ? ['com-menu'] : []))} style={styles.playlistCard}>
        <View style={styles.playlistArt}>
          <FotoDoCartao nome={nome} faixa={faixas[0]} />
          {/* Um lançamento novo que ainda não se foi ver (10/10). */}
          {comNovidade.has(chave) ? <View accessibilityLabel="New release" style={styles.pontoNovo} /> : null}
          {/* É o MESMO coração das músicas, e não uma estrela: guardar é o
              mesmo gesto em toda a app.

              Está sempre montado, e quem o mostra é o CSS (`coracaoDoCartao`,
              com `fixo` em quem já é favorito). Esteve montado à condição,
              pelo `hovered` do cartão -- e o `hovered` do react-native-web CAI
              ao entrar num filho que também é Pressable. Não é acidente: o
              `Pressable` pede `contain: true` ao `useHover`, e um filho que
              entra atira um evento `react-gui:hover:lock` que o pai ouve e
              trata como uma saída. O coração desmontava-se debaixo do rato --
              favoritar um artista era impossível. O `:hover` do CSS é
              hierárquico e não tem esse problema. */}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: favorito }}
            accessibilityLabel={favorito ? `Unfavourite ${nome}` : `Favourite ${nome}`}
            onPress={(e: any) => { e?.stopPropagation?.(); alternarFavorito(chave); }}
            {...(favorito ? marcar('coracaoDoCartao', 'fixo') : marcar('coracaoDoCartao'))}
            style={({ hovered: h }: any) => [styles.coracaoDoArtista, h && styles.coracaoDoArtistaHover]}>
            <Ionicons name={favorito ? 'heart' : 'heart-outline'} size={16}
              color={favorito ? COR.metalClaro : COR.texto} />
          </Pressable>
        </View>
        <Text numberOfLines={1} style={styles.playlistTitle}>{nome}</Text>
        <Text style={styles.playlistMeta}>{faixas.length} {faixas.length === 1 ? 'track' : 'tracks'}</Text>
      </Pressable>
    ); })}</View> : query ? <Empty icon="search-outline" title="No artists found" body={`No artist matches "${query}".`} /> : <Empty icon="mic-outline" title="No artists yet" body="Artists are collected automatically from the tracks in your library." />}</ContentScroll>
    {menuDoArtista}
  </Page>;
}

/**
 * Uma mistura aberta: a lista das faixas que a app juntou.
 *
 * Curta de propósito, e nada parecida com a `PlaylistPage`. Uma playlist é uma
 * coisa da base de dados que se renomeia, ordena, junta e partilha; uma mistura
 * é uma vista sobre a store das recomendações, que se refaz sozinha. O que se
 * pode fazer a ela é ouvi-la -- e é isso que a página tem.
 *
 * Gémea do `PrateleiraScreen` do telemóvel, e pela mesma razão: há UMA fonte
 * (`state/recomendacoes`), e isto é uma janela para ela. Se a store ainda não
 * as tiver montado, o id não encontra nada e diz-se isso em vez de mostrar uma
 * página vazia sem explicação.
 */
export function MisturaPage({ id, titulo, back, ...props }: {
  id: string; titulo: string; back: () => void;
} & CommonPageProps) {
  const misturas = useRecomendacoes((s) => s.misturas);
  const prontas = useRecomendacoes((s) => s.misturasProntas);
  const mistura = useMemo(() => misturas.find((m) => m.id === id), [misturas, id]);
  const faixas = useMemo(()=>mistura?.faixas ?? [],[mistura]);
  const ligado = usePlayer((s) => s.shuffle);
  const inteligente = usePlayer((s) => s.shuffleInteligente);
  const alternarShuffle = usePlayer((s) => s.toggleShuffle);
  const tocarLista = usePlayer((s) => s.tocarLista);
  const savedKeys=useSaved((s)=>s.keys);
  const contexto=useCallback((track:Track)=>contextoDaMistura(id,mistura?.nome??titulo,savedKeys.has(`${track.source}:${track.sourceId}`)),[id,mistura?.nome,titulo,savedKeys]);
  const impressao=useRef('');
  useEffect(()=>{
    if(!mistura||!faixas.length)return;
    const ctx=contexto(faixas[0]);
    const chave=`${ctx.surface}:${faixas.length}`;
    if(impressao.current===chave)return;
    impressao.current=chave;
    registar('recomendacao_mostrada',{...contextoParaAnalytics(ctx),quantidade:faixas.length});
  },[mistura,faixas,contexto]);

  return <Page
    title={mistura?.nome ?? titulo}
    subtitle={faixas.length ? `${faixas.length} ${faixas.length === 1 ? 'song' : 'songs'} · put together for you` : undefined}
    action={<View style={{ flexDirection: 'row', gap: 8 }}>
      {faixas.length ? <>
        <Button icon="play" onPress={() => void tocarLista(faixas, ligado, inteligente, { tipo: 'mistura', nome: mistura?.nome ?? titulo, id })}>Play</Button>
        <Button secondary marcado={ligado} brilho={inteligente} icon="shuffle" onPress={alternarShuffle}>
          {inteligente ? 'Smart shuffle' : 'Shuffle'}
        </Button>
      </> : null}
      <BotaoVoltar onPress={back} />
    </View>}>
    <ContentScroll scrollKey={`mistura:${id}`}>
      {!prontas && !mistura ? <View style={{ height: 320 }}><Loading /></View>
        : !mistura ? <Empty icon="sparkles-outline" title="This mix is gone"
            body="Mixes are rebuilt as you listen. Go back to Search and pick one of the current ones." />
        : <TrackTable listKey={`mistura:${id}`} tracks={faixas} contexto={contexto}
            onPlay={(t,c) => props.tocarMusica(t, faixas, c, { tipo: 'mistura', nome: mistura.nome, id })} onMore={props.more} />}
    </ContentScroll>
  </Page>;
}

export function ArtistPage({ name, back, ...props }: { name: string; back: () => void } & CommonPageProps) {
  const data = useLibraryData();
  // A página do artista (23/10, variante A de docs/artista-pc-maquete.html,
  // escolhida pelo João): a foto grande à direita, a desfazer-se no fundo, com
  // o nome e as ações; por baixo, TODAS as músicas (sem "See all": a tabela
  // vai montando ao rolar) e, ao lado, uma coluna que fica parada com o último
  // lançamento, a discografia e os parecidos.
  const [filtro, setFiltro] = useState('');
  const [outras, setOutras] = useState<Track[]>([]);
  // As visualizações e a idade de cada vídeo da pesquisa (15/10): a ordem de
  // um artista sem página musical.
  const [detalhesDaPesquisa, setDetalhesDaPesquisa] = useState<Record<string, DetalheDaPesquisa>>({});
  const [pagina, setPagina] = useState<PaginaDoArtista | null>(null);
  const albuns = pagina?.albuns ?? [];
  const favoritos = useArtistasFavoritos((s) => s.chaves);
  const alternarFavorito = useArtistasFavoritos((s) => s.alternar);
  useEffect(() => { void useArtistasFavoritos.getState().carregar(); }, []);
  const chaveDoArtista = chaveDeArtista(name);
  // Abrir o artista tira-lhe o ponto de "lançamento novo" nos Artists (10/10).
  useEffect(() => { marcarArtistaAberto(chaveDoArtista); }, [chaveDoArtista]);
  const favorito = favoritos.has(chaveDoArtista);
  const [aDescobrir, setADescobrir] = useState(true);
  const dialogo = useDialogoDoAlbum(props);
  const { abrirAlbum, fecharAlbum, dialogoDoAlbum } = dialogo;
  // O botão direito num disco, num single e num parecido (24/10).
  const { abrirMenuDoDisco, menuDoDisco, discoDoMenu } = useMenuDoDisco(dialogo);
  const { abrirMenuDoArtista, menuDoArtista } = useMenuDoArtista(props.notify);
  // Na página dele, o "View artist" não iria a lado nenhum.
  const discoNoMenu = (a: AlbumDaPagina): DiscoDoMenu => ({ id: a.id, titulo: a.title, legenda: legendaDoDisco(a), capa: a.artworkUrl, tipo: a.tipo, artista: null });
  // A que já se sabe (no aparelho) desenha-se logo: é a mesma da grelha.
  const [foto, setFoto] = useState<string | null>(() => fotoJaConhecida(name) ?? null);
  useEffect(() => {
    let vivo = true;
    const ja = fotoJaConhecida(name);
    setFoto(ja ?? null);
    if (ja !== undefined) return;
    void fotoDoArtista(name).then((url) => { if (vivo) setFoto(url); });
    return () => { vivo = false; };
  }, [name]);
  // Pela chave e nao pelo nome: a pagina tem de trazer as faixas das TRES
  // grafias, senao o cartao dizia 5 faixas e a pagina abria com 2.
  const tracks = useMemo(() => {
    const alvo = chaveDeArtista(name);
    return agruparPorArtista(data.tracks).find((g) => g.chave === alvo)?.faixas ?? [];
  }, [data.tracks, name]);

  useEffect(() => {
    let cancelado = false;
    setADescobrir(true);
    setOutras([]);
    setDetalhesDaPesquisa({});
    setPagina(null);
    setFiltro('');
    fecharAlbum();
    useSaved.getState().refresh();

    const alvo = chaveDeArtista(name);
    pesquisarMusica(`${name} music`).then(({ faixas: resultados, detalhes }) => {
      if (cancelado) return;
      // Uma pesquisa por nome também devolve reações, covers e entrevistas.
      // Só entram resultados cujo artista extraído é realmente este artista.
      setOutras(resultados.filter((t) => chaveDeArtista(displayArtist(t)) === alvo));
      setDetalhesDaPesquisa(detalhes ?? {});
    }).catch((e: any) => {
      if (!cancelado) props.notify(e?.message || 'Could not discover more from this artist.');
    }).finally(() => {
      if (!cancelado) setADescobrir(false);
    });

    return () => { cancelado = true; };
  }, [name, props.notify, fecharAlbum]);

  // Os álbuns, o mais recente e as músicas vêm do canal do artista no YouTube
  // Music, e quem diz qual é o canal são as músicas dele na biblioteca (28/9 e
  // 29/9, `paginaDoArtista`): pelo nome vinham os de um homónimo (o Isak
  // Danielson na página do Isak). Por isso espera pela biblioteca, e só volta a
  // correr se as provas mudarem.
  const [aProcurarAlbuns, setAProcurarAlbuns] = useState(true);
  const provas = tracks.slice(0, 3).map((t) => t.sourceId).join(',');
  useEffect(() => {
    if (data.loading) return;
    let cancelado = false;
    setAProcurarAlbuns(true);
    void paginaDoArtista(name, tracks).then((p) => {
      if (!cancelado) setPagina(p);
    }).finally(() => {
      if (!cancelado) setAProcurarAlbuns(false);
    });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `provas` resume as faixas que contam
  }, [name, data.loading, provas]);

  const chavesDaBiblioteca = useMemo(
    () => new Set(tracks.map((t) => `${t.source}:${t.sourceId}`)),
    [tracks],
  );
  // As do canal primeiro; sem canal (ou sem lista), a pesquisa pelo nome.
  const doCanal = pagina?.musicas.length ? pagina.musicas : null;
  const outrasSemRepetir = useMemo(
    () => (doCanal ?? outras).filter((t) => !chavesDaBiblioteca.has(`${t.source}:${t.sourceId}`)),
    [doCanal, outras, chavesDaBiblioteca],
  );
  const aProcurarMusicas = aProcurarAlbuns || (!doCanal && aDescobrir);
  // "Most played" ou "Newest" (10/10, lib/ordemDoArtista.ts): as reproduções e
  // o ano vêm da página do canal, sem pedidos a mais. Nas duas abas de músicas.
  const [ordem, setOrdem] = useState<OrdemDoArtista>('ouvidas');
  useEffect(() => { void getOrdemDoArtista().then(setOrdem).catch(() => {}); }, []);
  const escolherOrdem = (o: OrdemDoArtista) => { setOrdem(o); void setOrdemDoArtista(o).catch(() => {}); };
  // Sem lista no canal, as visualizações e a idade dos vídeos da pesquisa
  // (15/10): sem elas os dois botões davam a mesma lista.
  const infoDaBusca = useMemo(() => (doCanal ? null : infoDaPesquisa(outras.map((t) => ({
    videoId: t.sourceId, titulo: tituloDaFaixa(t), ...detalhesDaPesquisa[t.sourceId],
  })), chaveDoTitulo)), [doCanal, outras, detalhesDaPesquisa]);
  const infoDaFaixa = useCallback((t: Track) => (pagina ? infoDe(pagina.info, t.sourceId, tituloDaFaixa(t), chaveDoTitulo) : null)
    ?? (infoDaBusca ? infoDe(infoDaBusca, t.sourceId, tituloDaFaixa(t), chaveDoTitulo) : null), [pagina, infoDaBusca]);
  const guardadasPorOrdem = useMemo(() => ordenarMusicasDoArtista(tracks, ordem, infoDaFaixa), [tracks, ordem, infoDaFaixa]);
  const outrasPorOrdem = useMemo(() => ordenarMusicasDoArtista(outrasSemRepetir, ordem, infoDaFaixa), [outrasSemRepetir, ordem, infoDaFaixa]);
  // As tuas primeiro (o coração da linha marca-as), depois as outras dele --
  // só quando a fonte certa responder (a pesquisa pelo nome chega antes do
  // canal, e trocar uma pela outra mudava a lista debaixo do rato).
  const musicas = useMemo(() => musicasDoArtista(guardadasPorOrdem, aProcurarMusicas ? [] : outrasPorOrdem),
    [guardadasPorOrdem, outrasPorOrdem, aProcurarMusicas]);
  // O botão só aparece quando muda alguma coisa na lista (ou ainda a chegar).
  const mostrarOrdem = aProcurarMusicas || modosComDados(musicas, infoDaFaixa).length > 0;
  const detalheDaFaixa = useCallback((t: Track) => {
    const d = detalheDaLinha(ordem, infoDaFaixa(t));
    return d ? <Text numberOfLines={1} style={artistStyles.detalhe}>{d}</Text> : null;
  }, [ordem, infoDaFaixa]);



  const inteligente = usePlayer((s) => s.shuffleInteligente);
  const ligado = usePlayer((s) => s.shuffle);
  const alternarShuffle = usePlayer((s) => s.toggleShuffle);
  // O Mix do artista (29/9): a rádio do canal dele, 50 músicas dele e de parecidos.
  const [aAbrirMix, setAAbrirMix] = useState(false);
  const tocarMix = async () => {
    if (!pagina?.mix || aAbrirMix) return;
    setAAbrirMix(true);
    const ok = await tocarMixDoArtista(name, { mix: pagina.mix, musicas: pagina.musicas }).catch(() => false);
    setAAbrirMix(false);
    if (!ok) props.notify('Could not load the mix.');
  };
  // O Play toca as músicas da página toda, e não só as que se veem.
  const faixasDaAba = musicas;
  const podeTocarAba = faixasDaAba.length > 0;
  const playAll = () => {
    if (!podeTocarAba) return;
    void usePlayer.getState().tocarLista(faixasDaAba, ligado, inteligente, { tipo: 'artista', nome: name });
  };
  // A foto do catálogo; sem ela, a do canal dele no YouTube Music (30/9); sem
  // as duas, a capa de uma música dele.
  const fotoDoCanal = foto ? null : pagina?.foto ?? null;
  // A ordem é a da grelha dos Artists (23/10): a foto, e sem ela a capa da
  // primeira música dele -- fora e dentro, a mesma imagem.
  const fotoDoHeroi = foto ?? tracks[0]?.artworkUrl ?? fotoDoCanal ?? outras[0]?.artworkUrl ?? null;
  // A cor da foto por trás do cabeçalho (como no iPhone). Só a do catálogo: a
  // do canal vem sem Referer, e não se lê num canvas.
  const cor = useCorDoAmbiente(foto);
  // O filtro procura nas que já estão em memória: nenhum pedido.
  const musicasFiltradas = useMemo(() => {
    const q = filtro.trim();
    return q ? musicas.filter((t) => correspondeAPesquisa(q, tituloDaFaixa(t), displayArtist(t), t.album)) : musicas;
  }, [musicas, filtro]);
  const tuasNaLista = useMemo(() => musicasFiltradas.filter((t) => chavesDaBiblioteca.has(`${t.source}:${t.sourceId}`)).length,
    [musicasFiltradas, chavesDaBiblioteca]);
  // Os fãs e os parecidos (o catálogo, com as tuas como prova de quem ele é),
  // e a discografia partida em álbuns e em singles e EPs.
  const vizinhanca = useVizinhancaDoArtista(name, tracks, !data.loading);
  const discos = useMemo(() => discografia(pagina?.albuns ?? []), [pagina]);
  const meta = metaDoArtista(tracks.length, data.loading, vizinhanca.fas);
  const { irPara } = useDestinos();
  const emCapa = (a: AlbumDaPagina) => ({ id: a.id, titulo: a.title, legenda: legendaDoDisco(a), capa: a.artworkUrl, novo: false });
  const abrirPorId = (id: string) => { const a = albuns.find((x) => x.id === id); if (a) void abrirAlbum(a); };

  return <>
    {/* Sem o título "Artist" por cima: a foto é o cabeçalho, e o voltar vive nela. */}
    <View style={{ flex: 1, minWidth: 0 }}>
      <ContentScroll scrollKey={`artist:${chaveDeArtista(name)}`}>
        {cor ? <View pointerEvents="none" style={[artistStyles.tom, { backgroundImage: tomDoArtista(cor) } as any]} /> : null}
        <View style={artistStyles.heroi}>
          {/* Um `<img>` a sério, sem Referer (as do canal davam 429 com ele, ver
              `CapaSemReferer`), desfeito para a esquerda e para baixo. */}
          {fotoDoHeroi ? <div style={FOTO_DO_HEROI}>
            <img src={fotoDoHeroi} alt="" referrerPolicy="no-referrer" decoding="async" draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 20%', display: 'block' }} />
          </div> : null}
          <View style={artistStyles.voltar}><BotaoVoltar onPress={back} /></View>
          <View style={artistStyles.heroiBaixo}>
            <Text style={styles.detailHeroEyebrow}>ARTIST</Text>
            <Text numberOfLines={2} style={artistStyles.heroiNome}>{name}</Text>
            {/* Os fãs e quantas são tuas, só quando são ("0 saved tracks"
                parecia uma página que não carregou). */}
            {meta ? <Text style={artistStyles.heroiMeta}>{meta}</Text> : null}
            <View style={artistStyles.accoes}>
              <Button icon="play" onPress={playAll} disabled={!podeTocarAba}>Play</Button>
              <Button secondary marcado={ligado} brilho={inteligente} icon="shuffle" onPress={alternarShuffle} disabled={!podeTocarAba}>{inteligente ? 'Smart shuffle' : 'Shuffle'}</Button>
              {pagina?.mix ? <Button secondary icon="radio-outline" onPress={() => void tocarMix()} ocupado={aAbrirMix}>{aAbrirMix ? 'Loading…' : 'Mix'}</Button> : null}
              {/* O mesmo coração dos cartões da página Artists (29/9). */}
              <IconButton name={favorito ? 'heart' : 'heart-outline'} active={favorito}
                label={favorito ? `Unfavourite ${name}` : `Favourite ${name}`}
                onPress={() => alternarFavorito(chaveDoArtista)} />
              <BotaoDeFixar atalho={{ tipo: 'artista', nome: name, capa: tracks[0]?.artworkUrl ?? null }} />
            </View>
          </View>
        </View>

        {data.loading ? <View style={{ height: 320 }}><Loading /></View> : <View style={artistStyles.duas}>
          <View style={artistStyles.colunaDasMusicas}>
            <View style={artistStyles.cabecalhoDaSeccao}>
              <Text style={artistStyles.tituloDaSeccao}>Songs</Text>
              {!aProcurarMusicas && musicas.length ? <Text style={artistStyles.contagem}>{musicas.length}</Text> : null}
              <View style={{ flex: 1 }} />
              {musicas.length > LINHAS_SEM_FILTRO ? <View style={artistStyles.filtro}>
                <Field icon="search" placeholder="Filter songs" value={filtro} onChangeText={setFiltro} />
              </View> : null}
              {mostrarOrdem && <View style={artistStyles.ordem} accessibilityRole={'radiogroup' as any}>
                {([['ouvidas', 'Most played'], ['recentes', 'Newest']] as const).map(([o, rotulo]) => <Pressable key={o}
                  accessibilityRole={'radio' as any} accessibilityState={{ checked: ordem === o }} onPress={() => escolherOrdem(o)}
                  style={({ hovered }: any) => [artistStyles.ordemOpcao, ordem === o && artistStyles.ordemOpcaoAtiva, hovered && ordem !== o && artistStyles.ordemHover]}>
                  <Text style={[artistStyles.ordemTexto, ordem === o && artistStyles.ordemTextoAtivo]}>{rotulo}</Text>
                </Pressable>)}
              </View>}
            </View>
            {/* Todas, sem botão: as tuas primeiro (com o coração), uma linha, e as
                outras dele, que entram quando chegarem. A tabela monta ao rolar. */}
            {aProcurarMusicas && !musicas.length ? <View style={{ height: 280 }}><Loading /></View> : <>
              <TrackTable plain colunaDoArtista={false} showSavedBadge tracks={musicasFiltradas} listKey={`artista:${chaveDoArtista}`}
                divisoria={{ antesDe: tuasNaLista, rotulo: `More from ${name}` }}
                caraDaLinha={detalheDaFaixa} larguraDaCara={96}
                onPlay={(t) => props.tocarMusica(t, musicas, undefined, { tipo: 'artista', nome: name })} onMore={props.more}
                empty={filtro.trim() ? <Empty icon="search" title="No matches" body={`No songs match “${filtro.trim()}”.`} />
                  : <Empty icon="musical-notes-outline" title="No songs found" body="No songs by this artist were found." />} />
              {aProcurarMusicas ? <View style={{ height: 120 }}><Loading /></View> : null}
            </>}
          </View>

          {/* A coluna parada: fica à vista enquanto se rola pelas músicas. */}
          <View style={artistStyles.coluna}>
            {pagina?.maisRecente ? <UltimoLancamento album={pagina.maisRecente} onPress={() => void abrirAlbum(pagina.maisRecente!)}
              aoMenu={(e) => abrirMenuDoDisco(discoNoMenu(pagina.maisRecente!), e)} escolhido={discoDoMenu === pagina.maisRecente.id} /> : null}
            {aProcurarAlbuns ? <View style={{ height: 200 }}><Loading /></View> : <>
              {discos.albuns.length ? <>
                <Text style={artistStyles.subtitulo}>Albums <Text style={artistStyles.contagem}>{discos.albuns.length}</Text></Text>
                <View style={artistStyles.grelhaDeDiscos}>
                  {discos.albuns.map((a) => <Pressable key={a.id} onPress={() => void abrirAlbum(a)} accessibilityRole="button"
                    accessibilityLabel={`${a.title}, ${legendaDoDisco(a)}`} {...({ onContextMenu: (e: any) => abrirMenuDoDisco(discoNoMenu(a), e) } as any)}
                    style={({ hovered, focused }: any) => [artistStyles.disco, (hovered || focused || discoDoMenu === a.id) && artistStyles.discoHover]}>
                    <CapaSemReferer uri={a.artworkUrl} lado={LADO_DO_DISCO} icone="albums-outline" />
                    <Text numberOfLines={1} style={artistStyles.discoTitulo}>{a.title}</Text>
                    <Text numberOfLines={1} style={artistStyles.discoAno}>{legendaDoDisco(a)}</Text>
                  </Pressable>)}
                </View>
              </> : null}
              {discos.singles.length ? <>
                <Text style={artistStyles.subtitulo}>Singles &amp; EPs <Text style={artistStyles.contagem}>{discos.singles.length}</Text></Text>
                {discos.singles.map((a) => <Pressable key={a.id} onPress={() => void abrirAlbum(a)} accessibilityRole="button"
                  accessibilityLabel={`${a.title}, ${legendaDoDisco(a)}`} {...({ onContextMenu: (e: any) => abrirMenuDoDisco(discoNoMenu(a), e) } as any)}
                  style={({ hovered, focused }: any) => [artistStyles.single, (hovered || focused || discoDoMenu === a.id) && artistStyles.discoHover]}>
                  <CapaSemReferer uri={a.artworkUrl} lado={44} icone="albums-outline" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={artistStyles.singleTitulo}>{a.title}</Text>
                    <Text numberOfLines={1} style={artistStyles.discoAno}>{legendaDoDisco(a)}</Text>
                  </View>
                </Pressable>)}
              </> : null}
            </>}
            {vizinhanca.parecidos.length ? <>
              <Text style={artistStyles.subtitulo}>Fans also like</Text>
              <View style={artistStyles.parecidos}>
                {vizinhanca.parecidos.map((n) => <ParecidoNoPc key={n} nome={n} aoAbrir={() => irPara({ tipo: 'artista', nome: n })}
                  aoMenu={(e) => abrirMenuDoArtista({ nome: n }, e)} />)}
              </View>
            </> : null}
          </View>
        </View>}
      </ContentScroll>
    </View>

    {dialogoDoAlbum}
    {menuDoDisco}
    {menuDoArtista}
  </>;
}

/**
 * O diálogo de um álbum (a playlist `OLAK5uy_...`): tocar e guardar como
 * playlist. Nasceu na página do artista e serve também os álbuns da pesquisa
 * por tipo (29/9).
 */
function useDialogoDoAlbum(props: CommonPageProps) {
  const [albumAberto, setAlbumAberto] = useState<YtRecommendedPlaylist | null>(null);
  const [faixasDoAlbum, setFaixasDoAlbum] = useState<Track[]>([]);
  const [aCarregarAlbum, setACarregarAlbum] = useState(false);
  const [aGuardarAlbum, setAGuardarAlbum] = useState(false);
  const pedidoDeAlbum = useRef(0);
  const fecharAlbum = useCallback(() => { pedidoDeAlbum.current++; setAlbumAberto(null); }, []);

  /** As faixas de um álbum: uma ida ao YouTube Music, a mesma da pré-visualização. */
  const faixasDe = async (album: YtRecommendedPlaylist): Promise<Track[]> => {
    const resultado = await fetchYouTubePlaylistById(album.id);
    return resultado.items.map((item) => ({
      source: 'youtube' as const,
      sourceId: item.videoId,
      title: item.title,
      artist: extractArtist(item.title, item.channel || null),
      album: resultado.title,
      artworkUrl: item.thumbnail,
      durationSeconds: null,
    }));
  };

  const abrirAlbum = async (album: YtRecommendedPlaylist) => {
    const pedido = ++pedidoDeAlbum.current;
    setAlbumAberto(album);
    setFaixasDoAlbum([]);
    setACarregarAlbum(true);
    try {
      const faixas = await faixasDe(album);
      if (pedido !== pedidoDeAlbum.current) return;
      setFaixasDoAlbum(faixas);
    } catch (e: any) {
      if (pedido !== pedidoDeAlbum.current) return;
      props.notify(e?.message || 'Could not load this album.');
      setAlbumAberto(null);
    } finally {
      if (pedido === pedidoDeAlbum.current) setACarregarAlbum(false);
    }
  };

  const guardarAlbum = async () => {
    if (!albumAberto || !faixasDoAlbum.length || aGuardarAlbum) return;
    setAGuardarAlbum(true);
    try {
      const playlist = await createPlaylist(albumAberto.title);
      await addTracksToPlaylist(playlist.id, faixasDoAlbum);
      props.notify(`Saved “${albumAberto.title}” with ${faixasDoAlbum.length} tracks.`);
      window.dispatchEvent(new CustomEvent('duotone:refresh-playlists'));
      setAlbumAberto(null);
    } catch (e: any) {
      props.notify(e?.message || 'Could not save this album.');
    } finally {
      setAGuardarAlbum(false);
    }
  };

  const tocarAlbum = () => {
    if (!faixasDoAlbum.length) return;
    props.play(faixasDoAlbum[0], faixasDoAlbum, undefined, { tipo: 'album', nome: albumAberto?.title ?? '' });
    setAlbumAberto(null);
  };

  const dialogoDoAlbum = <>
    <Dialog open={!!albumAberto} title={albumAberto?.title || 'Album'} onClose={fecharAlbum} width={720}>
      {aCarregarAlbum ? <View style={{ height: 260 }}><Loading /></View> : <>
        <View style={artistStyles.albumDialogActions}>
          <Button icon="play" onPress={tocarAlbum} disabled={!faixasDoAlbum.length}>Play</Button>
          <Button secondary icon="download-outline" onPress={() => void guardarAlbum()} disabled={!faixasDoAlbum.length} ocupado={aGuardarAlbum}>
            {aGuardarAlbum ? 'Saving…' : 'Save as playlist'}
          </Button>
          <Text style={artistStyles.albumDialogMeta}>{faixasDoAlbum.length} {faixasDoAlbum.length === 1 ? 'track' : 'tracks'}</Text>
        </View>
        <ScrollView style={artistStyles.albumDialogList}>
          <TrackTable plain colunaDoArtista={false} tracks={faixasDoAlbum} onPlay={(t) => props.tocarMusica(t, faixasDoAlbum, undefined, { tipo: 'album', nome: albumAberto?.title ?? '' })} onMore={props.more} />
        </ScrollView>
      </>}
    </Dialog>
  </>;
  /**
   * Tocar, baralhar ou pôr na fila sem abrir, e guardar como playlist: o menu
   * de um lançamento novo (20/10), como o de uma playlist (`tocarSemAbrir`).
   */
  const albumSemAbrir = async (album: YtRecommendedPlaylist, modo: 'tocar' | 'baralhar' | 'fila') => {
    try {
      const faixas = await faixasDe(album);
      if (!faixas.length) return;
      const leitor = usePlayer.getState();
      if (modo === 'fila') {
        leitor.addManyToQueue(faixas);
        props.notify(`Added ${faixas.length} ${faixas.length === 1 ? 'song' : 'songs'} to the queue.`);
        return;
      }
      const origem = { tipo: 'album' as const, nome: album.title };
      if (modo === 'baralhar') await leitor.playShuffled(faixas, leitor.shuffleInteligente, origem);
      else props.play(faixas[0], faixas, undefined, origem);
    } catch (e) {
      props.notify(mensagemDeErro(e, "Couldn't load this album."));
    }
  };
  const guardarAlbumSemAbrir = async (album: YtRecommendedPlaylist) => {
    try {
      const faixas = await faixasDe(album);
      if (!faixas.length) { props.notify("Couldn't find the songs of this album."); return; }
      const playlist = await createPlaylist(album.title);
      await addTracksToPlaylist(playlist.id, faixas);
      props.notify(`Saved “${album.title}” with ${faixas.length} tracks.`);
      window.dispatchEvent(new CustomEvent('duotone:refresh-playlists'));
    } catch (e) {
      props.notify(mensagemDeErro(e, "Couldn't save this album."));
    }
  };
  return { abrirAlbum, fecharAlbum, dialogoDoAlbum, albumSemAbrir, guardarAlbumSemAbrir };
}

/**
 * O lançamento mais recente do artista, por cima das músicas (29/9). Vem do
 * canal certo (`paginaDoArtista`); abre o mesmo diálogo dos álbuns.
 */
/** Abaixo disto a lista lê-se de uma vez, e o filtro não ajuda. */
const LINHAS_SEM_FILTRO = 12;
/** O lado das capas dos álbuns na coluna parada (duas por linha em 330 px). */
const LADO_DO_DISCO = 158;

/** A foto do cabeçalho: à direita, a desfazer-se para a esquerda e para baixo (máscara do CSS). */
const MASCARA_DO_HEROI = 'linear-gradient(90deg, transparent 0%, #000 45%), linear-gradient(0deg, transparent 0%, #000 42%)';
const FOTO_DO_HEROI: React.CSSProperties = {
  position: 'absolute', top: 0, right: 0, bottom: 0, width: '62%', pointerEvents: 'none',
  WebkitMaskImage: MASCARA_DO_HEROI, WebkitMaskComposite: 'source-in', maskImage: MASCARA_DO_HEROI, maskComposite: 'intersect',
} as any;

/** A cor da foto por trás do cabeçalho, a apagar-se no fundo (os passos do perfil, `degradeDaCorDaCapa`). */
function tomDoArtista(cor: string): string {
  const d = degradeDaCorDaCapa(ALTURA_DO_HEROI, cor);
  return `linear-gradient(180deg, ${d.cores.map((c, k) => `${c} ${Math.round(d.paragens[k] * 100)}%`).join(', ')})`;
}
const ALTURA_DO_HEROI = 400;

/**
 * A imagem de um artista na grelha dos Artists (23/10): a foto do catálogo, a
 * MESMA da página dele; sem ela, a capa da primeira música dele (a de sempre).
 */
function FotoDoCartao({ nome, faixa }: { nome: string; faixa: Track }) {
  const foto = useFotoDoArtista(nome);
  return foto ? <Image source={{ uri: fotoNoTamanho(foto, 250) }} style={{ width: 200, height: 200 }} /> : <Artwork track={faixa} size={200} />;
}

/** Um "Fans also like": a foto do catálogo, redonda, e o nome; abre a página dele. */
function ParecidoNoPc({ nome, aoAbrir, aoMenu }: { nome: string; aoAbrir: () => void; aoMenu: (e: any) => void }) {
  const foto = useFotoDoArtista(nome);
  return <Pressable onPress={aoAbrir} accessibilityRole="button" accessibilityLabel={nome} {...({ onContextMenu: aoMenu } as any)}
    style={({ hovered, focused }: any) => [artistStyles.parecido, (hovered || focused) && artistStyles.parecidoHover]}>
    {foto ? <Image source={{ uri: foto }} style={artistStyles.parecidoFoto} />
      : <View style={[artistStyles.parecidoFoto, artistStyles.albumFallback]}><Ionicons name="person" size={28} color={COR.textoFraco} /></View>}
    <Text numberOfLines={1} style={artistStyles.parecidoNome}>{nome}</Text>
  </Pressable>;
}

function UltimoLancamento({ album, onPress, aoMenu, escolhido }: { album: AlbumDaPagina; onPress: () => void; aoMenu: (e: any) => void; escolhido: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Latest release: ${album.title}`} onPress={onPress}
    {...({ onContextMenu: aoMenu } as any)}
    style={({ hovered, focused }: any) => [artistStyles.ultimo, (hovered || focused || escolhido) && artistStyles.ultimoHover]}>
    {album.artworkUrl ? <Image source={{ uri: album.artworkUrl }} style={artistStyles.ultimoCapa} />
      : <View style={[artistStyles.ultimoCapa, artistStyles.albumFallback]}><Ionicons name="albums-outline" size={24} color={COR.textoFraco} /></View>}
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={artistStyles.ultimoRotulo}>LATEST RELEASE</Text>
      <Text numberOfLines={1} style={artistStyles.ultimoTitulo}>{album.title}</Text>
      <Text numberOfLines={1} style={artistStyles.albumMeta}>{legendaDoDisco(album)}</Text>
    </View>
    <Ionicons name="chevron-forward" size={18} color={COR.textoFraco} />
  </Pressable>;
}

const artistStyles = StyleSheet.create({
  // O cabeçalho (23/10, variante A de docs/artista-pc-maquete.html): sem caixa,
  // de ponta a ponta da página (a margem do `ContentScroll` é anulada).
  // Um absoluto mede-se pela caixa COM a margem do `ContentScroll`: 0 e 0 já é de ponta a ponta
  // (com -48 a página ficava 48 px mais larga e fugia para o lado ao focar o filtro).
  tom: { position: 'absolute', top: 0, left: 0, right: 0, height: ALTURA_DO_HEROI + 520 } as any,
  heroi: { height: ALTURA_DO_HEROI, marginHorizontal: -ESP.xxxl, marginBottom: ESP.lg, overflow: 'hidden' },
  voltar: { position: 'absolute', top: ESP.xl, left: ESP.xxxl },
  heroiBaixo: { position: 'absolute', left: ESP.xxxl, right: ESP.xxxl, bottom: ESP.xl },
  heroiNome: {
    fontFamily: FONT.display, color: COR.texto, fontSize: 72, lineHeight: 74, fontWeight: '800' as any, letterSpacing: -2,
    marginTop: ESP.sm, maxWidth: 900, textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 30,
  },
  heroiMeta: { ...TIPO.corpo, color: COR.textoMedio, marginTop: ESP.sm },
  accoes: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: ESP.sm, marginTop: ESP.xl },
  // As músicas à esquerda; a coluna parada à direita (por baixo delas numa janela estreita).
  duas: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', columnGap: 40, rowGap: ESP.xl },
  colunaDasMusicas: { flexGrow: 1, flexShrink: 1, flexBasis: 480, minWidth: 0 },
  coluna: {
    width: 330, flexShrink: 0, position: 'sticky', top: ESP.lg, maxHeight: 'calc(100vh - 140px)', overflowY: 'auto',
    scrollbarWidth: 'none', paddingTop: ESP.sm, paddingBottom: ESP.xl,
  } as any,
  cabecalhoDaSeccao: { flexDirection: 'row', alignItems: 'center', gap: ESP.md, minHeight: 40, marginBottom: ESP.md },
  // O mesmo título das prateleiras (`ui.shelfTitle`): "Songs" e "Albums" leem-se como irmãos.
  tituloDaSeccao: { ...TIPO.titulo, color: COR.texto },
  contagem: { ...TIPO.numero, color: COR.textoFraco },
  filtro: { width: 220 },
  subtitulo: { ...TIPO.seccao, color: COR.texto, marginTop: ESP.xl, marginBottom: ESP.md },
  grelhaDeDiscos: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  disco: { width: LADO_DO_DISCO, borderRadius: RAIO.cartao, padding: 0 },
  discoHover: { opacity: 0.85 },
  discoTitulo: { ...TIPO.corpo, color: COR.texto, fontWeight: '600' as any, marginTop: ESP.sm },
  discoAno: { ...TIPO.micro, color: COR.textoFraco, marginTop: 2 },
  single: { flexDirection: 'row', alignItems: 'center', gap: ESP.md, paddingVertical: 6, borderRadius: RAIO.cartao },
  singleTitulo: { ...TIPO.corpo, color: COR.texto, fontWeight: '500' as any },
  parecidos: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  parecido: { width: 102, alignItems: 'center', gap: ESP.sm, paddingVertical: ESP.sm, borderRadius: RAIO.cartao },
  parecidoHover: { backgroundColor: COR.hover },
  parecidoFoto: { width: 84, height: 84, borderRadius: 42, backgroundColor: COR.elevado },
  parecidoNome: { ...TIPO.legenda, color: COR.textoMedio, textAlign: 'center', alignSelf: 'stretch' },
  ultimo: {
    flexDirection: 'row', alignItems: 'center', gap: ESP.lg, alignSelf: 'flex-start', minWidth: 320, maxWidth: 520,
    padding: ESP.md, paddingRight: ESP.lg, marginBottom: ESP.xl, borderRadius: RAIO.superficie,
    borderWidth: 1, borderColor: COR.linhaSuave, backgroundColor: 'rgba(255,255,255,0.03)',
  },
  ultimoHover: { backgroundColor: COR.hover },
  // O artista em destaque na pesquisa.
  destaque: {
    flexDirection: 'row', alignItems: 'center', gap: ESP.xl, padding: ESP.lg, paddingRight: ESP.xl,
    marginBottom: ESP.xl, borderRadius: RAIO.superficie, borderWidth: 1, borderColor: COR.linhaSuave,
    backgroundColor: 'rgba(255,255,255,0.03)', maxWidth: 760,
  },
  destaqueNome: { fontFamily: FONT.display, color: COR.texto, fontSize: 26, lineHeight: 32, fontWeight: '700' as any, marginTop: 2 },
  ultimoCapa: { width: 64, height: 64, borderRadius: RAIO.cartao, backgroundColor: COR.elevado },
  ultimoRotulo: { ...TIPO.legenda, color: COR.textoFraco, letterSpacing: 1.2, fontWeight: '700' as any },
  ultimoTitulo: { fontFamily: FONT.display, color: COR.texto, fontSize: 16, lineHeight: 22, fontWeight: '650' as any, marginTop: 2 },
  // "Most played" / "Newest" (10/10), à direita do título "Songs".
  ordem: { flexDirection: 'row', marginLeft: 'auto', gap: 2, padding: 2, borderRadius: 999, borderWidth: 1, borderColor: COR.linhaSuave } as any,
  ordemOpcao: { paddingHorizontal: ESP.md, paddingVertical: 5, borderRadius: 999 },
  ordemOpcaoAtiva: ESTADO.escolhido,
  ordemHover: { backgroundColor: ESTADO.hover },
  ordemTexto: { ...TIPO.legenda, color: COR.textoFraco, fontWeight: '600' as any },
  ordemTextoAtivo: { color: COR.texto },
  detalhe: { ...TIPO.legenda, color: COR.textoFraco, marginRight: ESP.md, fontVariant: ['tabular-nums'] as any },
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: ESP.xxl, rowGap: ESP.xxl },
  /** A falha da parte online, por baixo do que é teu (`FalhaDaPesquisaOnline`). */
  falhaOnline: {
    flexDirection: 'row', alignItems: 'center', gap: ESP.md, marginTop: ESP.xl, padding: ESP.lg,
    borderRadius: RAIO.cartao, borderWidth: 1, borderColor: COR.linhaSuave, backgroundColor: COR.painel,
  },
  albumCard: { width: 190 },
  artistaCard: { width: 170, alignItems: 'center' },
  artistaFoto: { width: 170, height: 170, borderRadius: 85, backgroundColor: COR.elevado },
  albumCardHover: { opacity: .88, transform: [{ translateY: -3 }] },
  albumFallback: { alignItems: 'center', justifyContent: 'center' },
  albumTitle: {
    fontFamily: FONT.display, color: COR.texto, fontSize: 14, lineHeight: 19,
    fontWeight: '650' as any, marginTop: ESP.md,
  },
  albumMeta: { ...TIPO.legenda, color: COR.textoFraco, marginTop: ESP.xs },
  albumDialogActions: {
    flexDirection: 'row', alignItems: 'center', gap: ESP.sm,
    paddingBottom: ESP.lg, borderBottomWidth: 1, borderBottomColor: COR.linhaSuave,
  },
  albumDialogMeta: { ...TIPO.numero, color: COR.textoFraco, marginLeft: 'auto' as any },
  albumDialogList: { maxHeight: 430, marginHorizontal: -ESP.xl, marginBottom: -ESP.xl },
});
