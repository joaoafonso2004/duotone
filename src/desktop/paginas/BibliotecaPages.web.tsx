import { useRecommendationFeedback } from '../../state/recommendationFeedback';
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
import { fotoDoArtista } from '../../api/catalogo';
import { getLikedSongs } from '../../api/library';
import { fetchYouTubePlaylistById, type YtRecommendedPlaylist } from '../../api/youtube';
import { lembrarCanalDoArtista, paginaDoArtista, type AlbumDaPagina, type PaginaDoArtista } from '../../api/albunsDoArtista';
import { tocarMixDoArtista } from '../../state/mixDoArtista';
import { pesquisarFaixas } from '../../api/search';
import { addTracksToPlaylist, createPlaylist } from '../../api/playlists';
import { getTopArtists } from '../../api/plays';
import { addSearchHistoryEntry, clearSearchHistory, getSearchHistory } from '../../lib/prefs';
import { agruparPorArtista, chaveDeArtista, displayArtist, extractArtist, tituloDaFaixa } from '../../lib/artistName';
import { useArtistasFavoritos } from '../../state/artistasFavoritos';
import { ArtistFavoritesSyncStatus } from '../../components/ArtistFavoritesSyncStatus';
import { comCatalogo, garantirCatalogo, useCatalogoDeFaixas } from '../../state/catalogoDeFaixas';
import { ordenarArtistas, ordenarFaixas } from '../../lib/ordenacao';
import { useAuth } from '../../state/auth';
import { correspondeAPesquisa } from '../../lib/searchText';
import { useMusicSearch } from '../../hooks/useMusicSearch';
import { useArtistaEmDestaque, usePesquisaPorTipo, type SeparadorDaPesquisa } from '../../hooks/usePesquisaPorTipo';
import { legendaDoAlbumEncontrado, separadorPedidoPelaPergunta, type ArtistaEncontrado } from '../../lib/pesquisaPorTipo';
import { usePlayer } from '../../state/player';
import { ORDEM_DAS_PRATELEIRAS, temRecomendacoes, useRecomendacoes, type NomeDaPrateleira } from '../../state/recomendacoes';
import { useSaved } from '../../state/saved';
import type { Track } from '../../types';
import { crescer, faltaMostrar, PRIMEIRO_LOTE, quantosMostrar } from '../../lib/grelhaQueCresce';
import { styles } from '../estilos.web';
import {
  Artwork, Button, ContentScroll, desktop, Dialog, Empty, Field, IconButton, Loading, marcar, Page,
  PrateleiraDeMisturas, Separadores, Shelf, TrackTable, type ColunaOrdenavel,
} from '../ui.web';
import { MusicasDoDia } from '../MusicasDoDia.web';
import { useMisturaDoDia } from '../../state/misturaDoDia';
import { BotaoDeFixar } from '../AtalhosNaLateral.web';
import type { CommonPageProps, NavegarFn, Route } from '../rotas';
import { COR, ESP, FONT, RAIO, TIPO } from '../tokens.web';
import { useLibraryData } from './comum.web';
import { contextoDaMistura, contextoDaPrateleira, contextoParaAnalytics, notaDaPrateleira } from '../../lib/contextoDaDescoberta';
import { registar } from '../../lib/eventos';

export function SearchPage({ play, notify, more, navigate }: CommonPageProps & { navigate: NavegarFn }) {
  const [query, setQuery] = useState(''); const [history, setHistory] = useState<string[]>([]); const input = useRef<any>(null);
  // As Músicas do dia, que no PC não existiam. Uma vista da Pesquisa, como no
  // telemóvel, e não mais uma entrada na barra lateral: é sobre descobrir o
  // que os amigos puseram, e a Pesquisa é a página de descobrir.
  const [vista, setVista] = useState<'descobrir' | 'dia'>('descobrir');
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
    if(vista!=='descobrir')return;
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
  },[vista,recs,contextoPrateleira,recs.carregadoEm,recs.prontas,recs.descobrir,recs.nuncaLancado,recs.amigos,recs.ouvirDeNovo,recs.flow,recs.maisTocadas,recs.esquecidas,savedKeys]);
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
  const { abrirAlbum, dialogoDoAlbum } = useDialogoDoAlbum({ play, notify, more });
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
  return <><Page title="Search"
    action={vista === 'descobrir' ? <IconButton name="refresh" label="Refresh recommendations"
      onPress={() => { void recs.carregar(true); }} active={recs.estado === 'a-carregar'} /> : undefined}>
    <View style={styles.searchBar}><Field ref={input} icon="search" placeholder="Search songs, artists, or videos" value={query} onChangeText={setQuery} onSubmitEditing={() => run()} /><Button onPress={() => run()}>Search</Button></View>
    {query.trim().length < 2 && !loading && history.length > 0 && <View style={styles.history}><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Recent searches</Text><Pressable onPress={async () => { await clearSearchHistory(); setHistory([]); }}><Text style={styles.textAction}>Clear</Text></Pressable></View><View style={styles.chips}>{history.map((item) => <Pressable key={item} onPress={() => run(item)} style={({ hovered }) => [styles.chip, hovered && styles.chipHover]}><Ionicons name="time-outline" size={14} color={desktop.dim} /><Text style={styles.chipText}>{item}</Text></Pressable>)}</View></View>}
    {semPesquisa && !loading ? <View style={styles.vistasDaPesquisa}><Separadores opcoes={[['descobrir', 'Discover'], ['dia', 'Songs of the day']] as const}
      valor={vista} aoMudar={setVista} /></View> : null}
    {!semPesquisa ? <View style={styles.vistasDaPesquisa}><Separadores opcoes={[['musicas', 'Songs'], ['artistas', 'Artists'], ['albuns', 'Albums'], ['playlists', 'Playlists']] as const}
      valor={tipo} aoMudar={setTipo} /></View> : null}
    <ContentScroll>
      {destaque && (tipoAtivo === 'musicas' || tipoAtivo === 'playlists') ? <ArtistaEmDestaque artista={destaque}
        aoAbrir={() => abrirArtista(destaque)} aoTocarMix={() => void tocarMixDoDestaque(destaque)} aAbrirMix={aAbrirMix} /> : null}
      {
      tipoAtivo === 'artistas' ? <ResultadosDeArtistas artistas={porTipo.artistas} loading={porTipo.loading} falhou={porTipo.falhou} aoAbrir={abrirArtista} />
      : tipoAtivo === 'albuns' || tipoAtivo === 'playlists' ? <ResultadosEmCapas loading={porTipo.loading} falhou={porTipo.falhou}
          itens={tipoAtivo === 'albuns'
            ? porTipo.albuns.map((a) => ({ id: a.id, titulo: a.titulo, legenda: legendaDoAlbumEncontrado(a), capa: a.capa }))
            : porTipo.playlists}
          icone={tipoAtivo === 'albuns' ? 'albums-outline' : 'list-outline'}
          vazio={tipoAtivo === 'albuns' ? 'No albums found' : 'No playlists found'}
          aoAbrir={(a) => void abrirAlbum({ id: a.id, title: a.titulo, artworkUrl: a.capa, channelTitle: a.legenda })} />
      :
      /* O que já é teu vem primeiro e não espera pela rede; o YouTube fica por
         baixo. Ver lib/pesquisaLocal.ts. */
      naBiblioteca.length || (results.length && !loading) ? <>
        {naBiblioteca.length ? <>
          <Text style={styles.sectionTitle}>In your library</Text>
          <TrackTable tracks={naBiblioteca} onPlay={(t) => play(t, naBiblioteca, undefined, { tipo: 'pesquisa', nome: query })} onMore={more} />
        </> : null}
        {loading ? <View style={{ height: 200 }}><Loading /></View>
          : results.length ? <>
            {naBiblioteca.length ? <Text style={[styles.sectionTitle, { marginTop: 24 }]}>More results</Text> : null}
            {filtrosDaVersao.length > 2 ? <View style={[styles.chips, { marginBottom: 12 }]}>{FILTROS_DE_VERSAO.filter((f) => filtrosDaVersao.includes(f.id)).map((f) => (
              <Pressable key={f.id} onPress={() => setVersao(f.id)} accessibilityRole="button" accessibilityState={{ selected: versao === f.id }}
                style={({ hovered }) => [styles.chip, hovered && styles.chipHover, versao === f.id && { backgroundColor: desktop.text }]}>
                <Text style={[styles.chipText, versao === f.id && { color: desktop.bg }]}>{f.nome}</Text>
              </Pressable>))}</View> : null}
            {/* Só a faixa escolhida, NUNCA os resultados: são o que o YouTube
                casou com o texto, não uma lista de ninguém. Procurar "6:30" e
                ter o shuffle ligado dava um temporizador de 7 h a seguir (14/9).
                O rádio continua a partir desta, pelo gosto de quem ouve. */}
            <TrackTable tracks={resultadosVisiveis} showSavedBadge onPlay={(t) => play(t, undefined, undefined, { tipo: 'pesquisa', nome: query })} onMore={more} />
          </> : null}
      </>
      : loading ? <View style={{ height: 320 }}><Loading /></View>
      : errorMsg ? <Empty icon="cloud-offline-outline" title="Search failed" body={errorMsg} />
      : query.trim().length >= 2 ? <Empty icon="search-outline" title="No results" body="Try a different search term." />
      : vista === 'dia' ? <MusicasDoDia play={play} notify={notify} />
      : temRecomendacoes(recs) ? <>
          <Shelf grelha titulo="Discover daily" nota={notaDaPrateleira('descobrir')} tracks={descobrir} onPlay={play} onMore={more} contexto={contextoPrateleira('descobrir')} />
          {/* Ao lado do Discover, e a dizer o contrário: esse vai buscar aos
              vizinhos o que saiu, esta vai buscar aos teus o que nunca saiu. */}
          {/* A Daily mix: a MESMA lista o dia inteiro, e a mesma no iPhone
              (store própria, ver state/misturaDoDia.ts). Tomou o lugar do
              "Daily flow", que era quase a mesma coisa refeita a cada
              arranque e só existia aqui -- duas listas "do dia" lado a lado
              era uma a mais. */}
          <Shelf titulo="Daily mix" nota="new every day, from what you listen to" tracks={misturaDoDiaFaixas} onPlay={play} onMore={more} contexto={contextoPrateleira('flow')} />
          <Shelf titulo="Rare finds" nota={notaDaPrateleira('nuncaLancado')} selo="New to you" tracks={nuncaLancado} onPlay={play} onMore={more} contexto={contextoPrateleira('nuncaLancado')} />
          {/* AS MISTURAS QUE A APP MONTA. Quatro familias, e a diferenca esta
              toda no titulo -- que e o que elas tem de diferente:
                Your styles -> artistas teus que partilham vizinhos
                Radio       -> tres faixas novas por cada tua
                Your genres -> a gaveta larga do catalogo ("Rap/Hip Hop")
                Decades     -> a TUA musica daquela era, nao musica nova dela
                Playlists   -> a tua biblioteca com descobertas pelo meio
              Ver `lib/estilos.ts`, `radiosDeArtista` e `lib/decadas.ts`. */}
          <PrateleiraDeMisturas titulo="Your styles" misturas={estilos} aoAbrir={abrirMistura} />
          <PrateleiraDeMisturas titulo="Radio" nota="three new tracks for every one of yours" misturas={radios} aoAbrir={abrirMistura} />
          <PrateleiraDeMisturas titulo="Your genres" nota="your library, by genre" misturas={generos} aoAbrir={abrirMistura} />
          <PrateleiraDeMisturas titulo="Decades" nota="your music from that era" misturas={decadas} aoAbrir={abrirMistura} />
          <PrateleiraDeMisturas titulo="Playlists" misturas={playlists} aoAbrir={abrirMistura} />
          {/* A unica prateleira desta pagina que nao sai do teu proprio
              historico. Fica entre a descoberta e o que ja e teu. */}
          <Shelf titulo="Your friends' favourites" nota={notaDaPrateleira('amigos')} tracks={amigos} onPlay={play} onMore={more} contexto={contextoPrateleira('amigos')} />
          <Shelf titulo="Listen again" nota={notaDaPrateleira('ouvirDeNovo')} tracks={ouvirDeNovo} onPlay={play} onMore={more} contexto={contextoPrateleira('ouvirDeNovo')} />
          <Shelf titulo="Heavy rotation" nota={notaDaPrateleira('maisTocadas')} tracks={maisTocadas} onPlay={play} onMore={more} contexto={contextoPrateleira('maisTocadas')} />
          <Shelf titulo="Forgotten favourites" nota={notaDaPrateleira('esquecidas')} tracks={esquecidas} onPlay={play} onMore={more} contexto={contextoPrateleira('esquecidas')} />
        </>
      : <Empty icon={recsCarregadas ? 'search-outline' : 'sparkles-outline'}
          title={recsCarregadas ? 'Nothing to recommend yet' : 'Preparing recommendations…'}
          body={recsCarregadas
            ? hasFeedback?'No suggestions match your current preferences. Review them in Settings → Recommendations, or search for music above.':'Listen to a few tracks and this page will learn what you enjoy. Until then, search for any song above.'
            : 'One moment.'} />}
    </ContentScroll></Page>
    {dialogoDoAlbum}
  </>;
}

/**
 * O artista em destaque no topo da pesquisa (29/9): a foto, o nome, a
 * audiência, o Mix dele e a página. É o cartão que o YouTube mostra para
 * "drake playlist" -- só quando a pergunta é mesmo o nome dele.
 */
function ArtistaEmDestaque({ artista, aoAbrir, aoTocarMix, aAbrirMix }: {
  artista: ArtistaEncontrado; aoAbrir: () => void; aoTocarMix: () => void; aAbrirMix: boolean;
}) {
  // O cartão não é um botão: os botões estão lá dentro, e botão dentro de
  // botão é HTML inválido. A foto e o nome abrem a página, como o "Open".
  return <View style={artistStyles.destaque}>
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
      <Button icon="radio-outline" onPress={aoTocarMix} disabled={aAbrirMix}>{aAbrirMix ? 'Loading…' : 'Mix'}</Button>
      <Button secondary icon="person-outline" onPress={aoAbrir}>Open</Button>
    </View>
  </View>;
}

/** Os artistas da pesquisa por tipo: a foto redonda, o nome e a audiência. */
function ResultadosDeArtistas({ artistas, loading, falhou, aoAbrir }: {
  artistas: ArtistaEncontrado[]; loading: boolean; falhou: boolean; aoAbrir: (a: ArtistaEncontrado) => void;
}) {
  if (loading) return <View style={{ height: 320 }}><Loading /></View>;
  if (!artistas.length) return falhou
    ? <Empty icon="cloud-offline-outline" title="Search failed" body="Check your connection and try again." />
    : <Empty icon="person-outline" title="No artists found" body="Try a different search term." />;
  return <View style={artistStyles.albumGrid}>{artistas.map((a) => <Pressable key={a.canal} onPress={() => aoAbrir(a)}
    accessibilityRole="button" accessibilityLabel={a.nome}
    style={({ hovered, focused }: any) => [artistStyles.artistaCard, (hovered || focused) && artistStyles.albumCardHover]}>
    <CapaSemReferer uri={a.foto} lado={170} redonda icone="person" />
    <Text numberOfLines={1} style={[artistStyles.albumTitle, { textAlign: 'center' }]}>{a.nome}</Text>
    {a.legenda ? <Text numberOfLines={1} style={[artistStyles.albumMeta, { textAlign: 'center' }]}>{a.legenda}</Text> : null}
  </Pressable>)}</View>;
}

type ItemEmCapa = { id: string; titulo: string; legenda: string; capa: string | null };

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
      <Ionicons name={icone} size={redonda ? 40 : 34} color={desktop.dim} />
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
function ResultadosEmCapas({ itens, loading, falhou, icone, vazio, aoAbrir }: {
  itens: ItemEmCapa[]; loading: boolean; falhou: boolean; icone: 'albums-outline' | 'list-outline';
  vazio: string; aoAbrir: (a: ItemEmCapa) => void;
}) {
  if (loading) return <View style={{ height: 320 }}><Loading /></View>;
  if (!itens.length) return falhou
    ? <Empty icon="cloud-offline-outline" title="Search failed" body="Check your connection and try again." />
    : <Empty icon={icone} title={vazio} body="Try a different search term." />;
  return <View style={artistStyles.albumGrid}>{itens.map((a) => <Pressable key={a.id} onPress={() => aoAbrir(a)}
    accessibilityRole="button" accessibilityLabel={a.legenda ? `${a.titulo}, ${a.legenda}` : a.titulo}
    style={({ hovered, focused }: any) => [artistStyles.albumCard, (hovered || focused) && artistStyles.albumCardHover]}>
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
  const [ordem, setOrdem] = useState<ColunaOrdenavel | null>(null);

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
      <Text style={styles.songsResultCount}>{query ? `${filteredTracks.length} of ` : ''}{data.tracks.length} {data.tracks.length === 1 ? 'song' : 'songs'}</Text>
      <IconButton name="refresh" label="Refresh library" onPress={data.refresh} />
    </View>
    <ContentScroll scrollKey="songs">{data.loading ? <View style={{ height: 350 }}><Loading /></View> : <TrackTable plain listKey={`songs:${ordem ?? 'recent'}`} ordenacao={{ modo: ordem, aoMudar: setOrdem }} tracks={filteredTracks} onPlay={(t) => props.play(t, filteredTracks, undefined, { tipo: 'guardadas', nome: 'Liked Songs' })} onMore={props.more} empty={query ? <Empty icon="search-outline" title="No results found" body={`No liked songs match "${query}"`} /> : <Empty icon="heart-outline" title="No liked songs yet" body="Tap the heart on a track and it will appear here." />} />}</ContentScroll>
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

export function ArtistsPage({ navigate }: { navigate: (route: Route) => void }) {
  const data = useLibraryData();
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

  return <Page title="Artists" subtitle={`${artists.length} ${artists.length === 1 ? 'artist' : 'artists'}`}>
    <ArtistFavoritesSyncStatus />
    <View style={styles.songsToolbar}>
      <View style={styles.songsSearch}><Field icon="search" placeholder="Search artists" value={query} onChangeText={setQuery} /></View>
      <Text style={styles.songsResultCount}>{query ? `${filteredArtists.length} of ` : ''}{artists.length} {artists.length === 1 ? 'artist' : 'artists'}</Text>
    </View>
    <ContentScroll scrollKey="artists" aoChegarAoFim={mostrarMais}>{data.loading ? <View style={{ height: 350 }}><Loading /></View> : filteredArtists.length ? <View style={styles.playlistGrid}>{visiveis.map(({ nome, chave, faixas }) => { const favorito = favoritos.has(chave); return (
      <Pressable key={chave} onPress={() => navigate({ name: 'artist', value: nome })}
        {...marcar('cartao')} style={styles.playlistCard}>
        <View style={styles.playlistArt}>
          <Artwork track={faixas[0]} size={200} />
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
              color={favorito ? desktop.accent : COR.texto} />
          </Pressable>
        </View>
        <Text numberOfLines={1} style={styles.playlistTitle}>{nome}</Text>
        <Text style={styles.playlistMeta}>{faixas.length} {faixas.length === 1 ? 'track' : 'tracks'}</Text>
      </Pressable>
    ); })}</View> : query ? <Empty icon="search-outline" title="No artists found" body={`No artist matches "${query}".`} /> : <Empty icon="people-outline" title="No artists yet" body="Artists are collected automatically from the tracks in your library." />}</ContentScroll>
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
      <Button secondary icon="arrow-back" onPress={back}>Back</Button>
    </View>}>
    <ContentScroll scrollKey={`mistura:${id}`}>
      {!prontas && !mistura ? <View style={{ height: 320 }}><Loading /></View>
        : !mistura ? <Empty icon="sparkles-outline" title="This mix is gone"
            body="Mixes are rebuilt as you listen. Go back to Search and pick one of the current ones." />
        : <TrackTable listKey={`mistura:${id}`} tracks={faixas} contexto={contexto}
            onPlay={(t,c) => props.play(t, faixas, c, { tipo: 'mistura', nome: mistura.nome, id })} onMore={props.more} />}
    </ContentScroll>
  </Page>;
}

export function ArtistPage({ name, back, ...props }: { name: string; back: () => void } & CommonPageProps) {
  const data = useLibraryData();
  const [separador, setSeparador] = useState<'library' | 'tracks' | 'albums'>('library');
  const [outras, setOutras] = useState<Track[]>([]);
  const [pagina, setPagina] = useState<PaginaDoArtista | null>(null);
  const albuns = pagina?.albuns ?? [];
  const favoritos = useArtistasFavoritos((s) => s.chaves);
  const alternarFavorito = useArtistasFavoritos((s) => s.alternar);
  useEffect(() => { void useArtistasFavoritos.getState().carregar(); }, []);
  const chaveDoArtista = chaveDeArtista(name);
  const favorito = favoritos.has(chaveDoArtista);
  const [aDescobrir, setADescobrir] = useState(true);
  const { abrirAlbum, fecharAlbum, dialogoDoAlbum } = useDialogoDoAlbum(props);
  const [foto, setFoto] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    setFoto(null);
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
    setPagina(null);
    setSeparador('library');
    fecharAlbum();
    useSaved.getState().refresh();

    const alvo = chaveDeArtista(name);
    pesquisarFaixas(`${name} music`).then((resultados) => {
      if (cancelado) return;
      // Uma pesquisa por nome também devolve reações, covers e entrevistas.
      // Só entram resultados cujo artista extraído é realmente este artista.
      setOutras(resultados.filter((t) => chaveDeArtista(displayArtist(t)) === alvo));
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



  const inteligente = usePlayer((s) => s.shuffleInteligente);
  const ligado = usePlayer((s) => s.shuffle);
  const alternarShuffle = usePlayer((s) => s.toggleShuffle);
  // O Mix do artista (29/9): a rádio do canal dele, 50 músicas dele e de parecidos.
  const [aAbrirMix, setAAbrirMix] = useState(false);
  const tocarMix = async () => {
    if (!pagina?.mix || aAbrirMix) return;
    setAAbrirMix(true);
    const ok = await tocarMixDoArtista(name, { mix: pagina.mix }).catch(() => false);
    setAAbrirMix(false);
    if (!ok) props.notify('Could not load the mix.');
  };
  // O Play do topo toca o artista, e não só o que se guardou dele (30/9): as
  // guardadas primeiro, e depois as outras músicas que a página mostra. Tocava
  // só as da biblioteca -- com uma guardada, era uma música e mais nada.
  const todas = useMemo(() => [...tracks, ...outrasSemRepetir], [tracks, outrasSemRepetir]);
  const playAll = () => {
    if (!todas.length) return;
    void usePlayer.getState().tocarLista(todas, ligado, inteligente, { tipo: 'artista', nome: name });
  };
  // A foto do catálogo; sem ela, a do canal dele no YouTube Music (30/9).
  const fotoDoCanal = foto ? null : pagina?.foto ?? null;

  return <>
    <Page title="Artist" action={<Button secondary icon="arrow-back" onPress={back}>Back to artists</Button>}>
      <ContentScroll scrollKey={`artist:${chaveDeArtista(name)}`}>{data.loading ? <View style={{ height: 350 }}><Loading /></View> : <>
        <View style={styles.detailHero}>
          {/* A foto do catálogo (27/9, `fotoDoArtista`); sem ela, a do canal
              (sem Referer, como as outras do YouTube Music); sem as duas, uma
              música dele. */}
          <View style={[styles.detailHeroArt, !foto && !fotoDoCanal && !tracks[0] && !outras[0] && artistStyles.heroFallback]}>{foto
            ? <Image source={{ uri: foto }} style={{ width: 176, height: 176 }} />
            : fotoDoCanal ? <CapaSemReferer uri={fotoDoCanal} lado={176} icone="person" />
            : tracks[0] ? <Artwork track={tracks[0]} size={176} />
            : outras[0] ? <Artwork track={outras[0]} size={176} />
            : <Ionicons name="person" size={48} color={desktop.dim} />}</View>
          <View style={styles.detailHeroBody}>
            <Text style={styles.detailHeroEyebrow}>ARTIST</Text>
            <Text numberOfLines={2} style={styles.detailHeroTitle}>{name}</Text>
            <Text style={styles.detailHeroMeta}>{tracks.length} saved {tracks.length === 1 ? 'track' : 'tracks'}</Text>
            <View style={styles.detailHeroActions}>
              <Button icon="play" onPress={playAll} disabled={!todas.length}>Play</Button>
              <Button secondary marcado={ligado} brilho={inteligente} icon="shuffle" onPress={alternarShuffle} disabled={!todas.length}>{inteligente ? 'Smart shuffle' : 'Shuffle'}</Button>
              {pagina?.mix ? <Button secondary icon="radio-outline" onPress={() => void tocarMix()} disabled={aAbrirMix}>{aAbrirMix ? 'Loading…' : 'Mix'}</Button> : null}
              {/* O mesmo coração dos cartões da página Artists (29/9): só lá se
                  favoritava, e quem estava dentro do artista tinha de voltar atrás. */}
              <IconButton name={favorito ? 'heart' : 'heart-outline'} active={favorito}
                label={favorito ? `Unfavourite ${name}` : `Favourite ${name}`}
                onPress={() => alternarFavorito(chaveDoArtista)} />
              <BotaoDeFixar atalho={{ tipo: 'artista', nome: name, capa: tracks[0]?.artworkUrl ?? null }} />
            </View>
          </View>
        </View>

        {pagina?.maisRecente ? <UltimoLancamento album={pagina.maisRecente} onPress={() => void abrirAlbum(pagina.maisRecente!)} /> : null}

        <View style={artistStyles.tabs}>
          {([
            ['library', 'In your library', 'heart-outline'],
            ['tracks', 'More tracks', 'musical-notes-outline'],
            ['albums', 'Albums', 'albums-outline'],
          ] as const).map(([id, label, icon]) => <Pressable key={id} onPress={() => setSeparador(id)}
            style={({ hovered }) => [artistStyles.tab, separador === id && artistStyles.tabActive, hovered && artistStyles.tabHover]}>
            <Ionicons name={icon} size={15} color={separador === id ? desktop.text : desktop.dim} />
            <Text style={[artistStyles.tabText, separador === id && artistStyles.tabTextActive]}>{label}</Text>
          </Pressable>)}
        </View>

        {separador === 'library' && <TrackTable plain colunaDoArtista={false} tracks={tracks} onPlay={(t) => props.play(t, tracks, undefined, { tipo: 'artista', nome: name })} onMore={props.more}
          empty={<Empty icon="heart-outline" title="Nothing saved" body="Save a track by this artist and it will appear here." />} />}

        {separador === 'tracks' && (aProcurarMusicas ? <View style={{ height: 280 }}><Loading /></View> :
          <TrackTable plain colunaDoArtista={false} showSavedBadge tracks={outrasSemRepetir} onPlay={(t) => props.play(t, outrasSemRepetir, undefined, { tipo: 'artista', nome: name })} onMore={props.more}
            empty={<Empty icon="search-outline" title="No other tracks found" body="No other songs by this artist were found." />} />)}

        {separador === 'albums' && (aProcurarAlbuns ? <View style={{ height: 280 }}><Loading /></View> : albuns.length ?
          <View style={artistStyles.albumGrid}>{albuns.map((album) => <Pressable key={album.id} onPress={() => void abrirAlbum(album)}
            style={({ hovered, focused }) => [artistStyles.albumCard, (hovered || focused) && artistStyles.albumCardHover]}>
            {album.artworkUrl ? <Image source={{ uri: album.artworkUrl }} style={artistStyles.albumArt} /> :
              <View style={[artistStyles.albumArt, artistStyles.albumFallback]}><Ionicons name="albums-outline" size={34} color={desktop.dim} /></View>}
            <Text numberOfLines={2} style={artistStyles.albumTitle}>{album.title}</Text>
            <Text numberOfLines={1} style={artistStyles.albumMeta}>{album.channelTitle || 'Album'}</Text>
          </Pressable>)}</View> :
          <Empty icon="albums-outline" title="No albums found" body="No albums by this artist were found." />)}
      </>}</ContentScroll>
    </Page>

    {dialogoDoAlbum}
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

  const abrirAlbum = async (album: YtRecommendedPlaylist) => {
    const pedido = ++pedidoDeAlbum.current;
    setAlbumAberto(album);
    setFaixasDoAlbum([]);
    setACarregarAlbum(true);
    try {
      const resultado = await fetchYouTubePlaylistById(album.id);
      if (pedido !== pedidoDeAlbum.current) return;
      setFaixasDoAlbum(resultado.items.map((item) => ({
        source: 'youtube' as const,
        sourceId: item.videoId,
        title: item.title,
        artist: extractArtist(item.title, item.channel || null),
        album: resultado.title,
        artworkUrl: item.thumbnail,
        durationSeconds: null,
      })));
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
          <Button secondary icon="download-outline" onPress={() => void guardarAlbum()} disabled={!faixasDoAlbum.length || aGuardarAlbum}>
            {aGuardarAlbum ? 'Saving…' : 'Save as playlist'}
          </Button>
          <Text style={artistStyles.albumDialogMeta}>{faixasDoAlbum.length} {faixasDoAlbum.length === 1 ? 'track' : 'tracks'}</Text>
        </View>
        <ScrollView style={artistStyles.albumDialogList}>
          <TrackTable plain colunaDoArtista={false} tracks={faixasDoAlbum} onPlay={(t) => props.play(t, faixasDoAlbum, undefined, { tipo: 'album', nome: albumAberto?.title ?? '' })} onMore={props.more} />
        </ScrollView>
      </>}
    </Dialog>
  </>;
  return { abrirAlbum, fecharAlbum, dialogoDoAlbum };
}

/**
 * O lançamento mais recente do artista, por cima dos separadores (29/9). Vem do
 * canal certo (`paginaDoArtista`); abre o mesmo diálogo dos álbuns.
 */
function UltimoLancamento({ album, onPress }: { album: AlbumDaPagina; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Latest release: ${album.title}`} onPress={onPress}
    style={({ hovered, focused }: any) => [artistStyles.ultimo, (hovered || focused) && artistStyles.ultimoHover]}>
    {album.artworkUrl ? <Image source={{ uri: album.artworkUrl }} style={artistStyles.ultimoCapa} />
      : <View style={[artistStyles.ultimoCapa, artistStyles.albumFallback]}><Ionicons name="albums-outline" size={24} color={desktop.dim} /></View>}
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={artistStyles.ultimoRotulo}>LATEST RELEASE</Text>
      <Text numberOfLines={1} style={artistStyles.ultimoTitulo}>{album.title}</Text>
      <Text numberOfLines={1} style={artistStyles.albumMeta}>{album.channelTitle}</Text>
    </View>
    <Ionicons name="chevron-forward" size={18} color={COR.textoFraco} />
  </Pressable>;
}

const artistStyles = StyleSheet.create({
  heroFallback: { alignItems: 'center', justifyContent: 'center' },
  ultimo: {
    flexDirection: 'row', alignItems: 'center', gap: ESP.lg, alignSelf: 'flex-start', minWidth: 320, maxWidth: 520,
    padding: ESP.md, paddingRight: ESP.lg, marginBottom: ESP.xl, borderRadius: RAIO.superficie,
    borderWidth: 1, borderColor: COR.linhaSuave, backgroundColor: 'rgba(255,255,255,0.03)',
  },
  ultimoHover: { backgroundColor: COR.hover },
  destaque: {
    flexDirection: 'row', alignItems: 'center', gap: ESP.xl, padding: ESP.lg, paddingRight: ESP.xl,
    marginBottom: ESP.xl, borderRadius: RAIO.superficie, borderWidth: 1, borderColor: COR.linhaSuave,
    backgroundColor: 'rgba(255,255,255,0.03)', maxWidth: 760,
  },
  destaqueNome: { fontFamily: FONT.display, color: COR.texto, fontSize: 26, lineHeight: 32, fontWeight: '700' as any, marginTop: 2 },
  ultimoCapa: { width: 64, height: 64, borderRadius: RAIO.cartao, backgroundColor: COR.elevado },
  ultimoRotulo: { ...TIPO.legenda, color: COR.textoFraco, letterSpacing: 1.2, fontWeight: '700' as any },
  ultimoTitulo: { fontFamily: FONT.display, color: COR.texto, fontSize: 16, lineHeight: 22, fontWeight: '650' as any, marginTop: 2 },
  tabs: {
    flexDirection: 'row', alignItems: 'center', gap: ESP.sm,
    paddingBottom: ESP.xl, marginBottom: ESP.lg, borderBottomWidth: 1, borderBottomColor: COR.linhaSuave,
  },
  tab: {
    minHeight: 38, paddingHorizontal: ESP.lg, borderRadius: RAIO.pilula,
    borderWidth: 1, borderColor: COR.linha, flexDirection: 'row', alignItems: 'center', gap: ESP.sm,
  },
  tabActive: { backgroundColor: COR.metalSuave, borderColor: 'rgba(233,234,238,0.24)' },
  tabHover: { backgroundColor: COR.hover },
  tabText: { ...TIPO.corpo, color: COR.textoFraco, fontWeight: '600' as any },
  tabTextActive: { color: COR.texto },
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: ESP.xxl, rowGap: ESP.xxl },
  albumCard: { width: 190 },
  artistaCard: { width: 170, alignItems: 'center' },
  artistaFoto: { width: 170, height: 170, borderRadius: 85, backgroundColor: COR.elevado },
  albumCardHover: { opacity: .88, transform: [{ translateY: -3 }] },
  albumArt: {
    width: 190, height: 190, borderRadius: RAIO.superficie, backgroundColor: COR.elevado,
    borderWidth: 1, borderColor: COR.linhaSuave,
  },
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
