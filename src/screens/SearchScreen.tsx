import { useRecommendationFeedback } from '../state/recommendationFeedback';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FILTROS_DE_VERSAO, filtrosComResultados, versaoPassa, type FiltroDeVersao } from '../lib/filtroDeVersao';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMusicSearch } from '../hooks/useMusicSearch';
import { useArtistaEmDestaque, usePesquisaPorTipo, type SeparadorDaPesquisa } from '../hooks/usePesquisaPorTipo';
import { tocarMixDoArtista } from '../state/mixDoArtista';
import { legendaDoAlbumEncontrado, separadorPedidoPelaPergunta, type ArtistaEncontrado } from '../lib/pesquisaPorTipo';

/** Um álbum ou uma playlist na pesquisa por tipo: os dois abrem a mesma folha. */
type ItemEmCapa = { id: string; titulo: string; legenda: string; capa: string | null };
import { lembrarCanalDoArtista } from '../api/albunsDoArtista';
import { YtPlaylistRecommendationSheet } from '../components/YtPlaylistRecommendationSheet';
import { ORDEM_DAS_PRATELEIRAS, temRecomendacoes, useRecomendacoes, type NomeDaPrateleira } from '../state/recomendacoes';
import { useRecentes } from '../state/recentes';
import { useMisturaDoDia } from '../state/misturaDoDia';
import { capasDaFila, chaveDoRecente, recentesParaMostrar, type Recente } from '../lib/recentes';
import { Toque } from '../components/Toque';
import { Animated, useWindowDimensions } from 'react-native';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useDestinos } from '../navigation/destinos';
import { destinoDoRecente } from '../lib/destinos';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { useSaved } from '../state/saved';
import { EmptyState } from '../components/EmptyState';
import { SkeletonDeFaixas, SkeletonDePrateleira } from '../components/Skeleton';
import { AmigosAOuvir } from '../components/AmigosAOuvir';
import { CartaoDaMisturaDoDia } from '../components/CartaoDaMisturaDoDia';
import { NovosLancamentos } from '../components/NovosLancamentos';
import { legendaDoLancamento } from '../lib/novosLancamentos';
import { EscolherArtistas } from '../components/EscolherArtistas';
import { PillButton } from '../components/PillButton';
import { MenuFlutuante, type Ancora } from '../components/MenuFlutuante';
import { ShareFriendSheet } from '../components/ShareFriendSheet';
import { addTracksToPlaylist, createPlaylist } from '../api/playlists';
import type { Playlist } from '../types';
import type { Mistura } from '../lib/misturas';
import { Input } from '../components/Input';
import { Screen, useCabecalhoQueEncolhe } from '../components/Screen';
import { BotaoDasMensagens } from '../components/BotaoDasMensagens';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { TrackRow } from '../components/TrackRow';
import { addSearchHistoryEntry, clearSearchHistory, getSearchHistory } from '../api/searchHistory';
import { hapticImpact, hapticNotification, hapticSelection } from '../lib/haptics';
import { usePlayer } from '../state/player';
import { colors, ESCALA_MAXIMA, MINI_PLAYER_HEIGHT, radii, spacing, type } from '../theme';
import type { Track } from '../types';
import {
  contextoDaPrateleira, contextoParaAnalytics, notaDaPrateleira, type DiscoveryContext,
} from '../lib/contextoDaDescoberta';
import { registar } from '../lib/eventos';
import { useAlturaDosSeparadores } from '../state/doca';
import { avisarErro } from '../lib/avisoDeRemocao';
import { mensagemDeErro } from '../lib/mensagemDeErro';
import { usePuxarParaAtualizar } from '../components/PuxarParaAtualizar';
import { useSocial } from '../state/social';
import { useShallow } from 'zustand/react/shallow';
import { secoesVisiveis, type SecaoDaHome } from '../lib/aparencia';
import { useAparencia } from '../state/aparencia';

/** Quantas linhas por página na primeira secção. */
const LINHAS_NA_LISTA = 3;

/** Maiores do que as do "Never released", como pedido. */
const CAIXA_DA_MISTURA = 178;

/** Largura dos cartões largos das secções de baixo. */
const CARTAO_LARGO = 260;

/** Parte uma lista em páginas de `n`. A última pode vir mais curta. */
function paginasDe<T>(lista: readonly T[], n: number): T[][] {
  const saida: T[][] = [];
  for (let i = 0; i < lista.length; i += n) saida.push(lista.slice(i, i + n));
  return saida;
}

export function SearchScreen() {
  // Tocar no separador onde ja se esta volta ao topo (3/10, como no iOS).
  const topoDaPagina = useRef<any>(null);
  const topoDosResultados = useRef<any>(null);
  useScrollToTop(topoDaPagina);
  useScrollToTop(topoDosResultados);
  // O título encolhe ao rolar a lista que estiver à vista (3/10).
  const cab = useCabecalhoQueEncolhe();
  /**
   * A página é mais estreita do que o ecrã, e a diferença é o ponto.
   *
   * Com `pagingEnabled` cada página ocupava o ecrã inteiro e não sobrava nada
   * para se ver da seguinte -- e três linhas sem nada à direita lêem-se como
   * "só há três músicas". O que diz que há mais não é o "See all": é a capa
   * seguinte a assomar na margem.
   *
   * Por isso o encaixe passa a ser à mão: `snapToInterval` na largura da
   * página mais o intervalo, em vez do `pagingEnabled`, que só sabe encaixar
   * na largura do `ScrollView`.
   */
  /**
   * Quanto da pagina seguinte assoma na margem.
   *
   * Eram 44, e 44 corta a capa seguinte ao meio -- uma capa cortada le-se como
   * um erro de desenho, nao como "ha mais para o lado". O numero certo sai da
   * propria `TrackRow`: 24 de `paddingHorizontal` mais 52 de capa dao 76, e os
   * 80 aqui deixam a capa inteira com uma folga de quatro para nao encostar a
   * borda.
   *
   * E nao pode passar de 88: o titulo comeca 12 depois da capa (76 + 12), e a
   * partir dai comecava a espreitar TEXTO cortado, que e o que se queria
   * evitar. Uma capa inteira diz "ha mais"; meia palavra diz "isto esta mal".
   */
  const espreitadela = 80;
  const larguraDaPagina = useWindowDimensions().width - espreitadela;

  // --- guardar e partilhar uma mistura -------------------------------------
  //
  // Uma mistura não é uma playlist: existe em memória e não tem linha nenhuma
  // na base de dados. É isso que decide o desenho -- o `ShareFriendSheet`
  // precisa de uma playlist com id, por isso PARTILHAR TEM DE GUARDAR ANTES.
  // Não é um atalho: é o que "partilhar" quer dizer quando a coisa ainda não
  // existe do outro lado.
  const molduras = useRef<Record<string, View | null>>({});
  const [misturaAberta, setMisturaAberta] = useState<Mistura | null>(null);
  const [ancoraDaMistura, setAncoraDaMistura] = useState<Ancora | null>(null);
  const [aGuardarMistura, setAGuardarMistura] = useState(false);
  const [playlistAPartilhar, setPlaylistAPartilhar] = useState<Playlist | null>(null);
  /** Uma janela de cada vez -- ver `MenuFlutuante` e o `aoFechado`. */
  const depoisDoMenu = useRef<(() => void) | null>(null);

  const guardarMistura = async (m: Mistura): Promise<Playlist | null> => {
    setAGuardarMistura(true);
    try {
      const nova = await createPlaylist(m.nome);
      await addTracksToPlaylist(nova.id, m.faixas);
      hapticNotification();
      return { ...nova, trackCount: m.faixas.length };
    } catch (e: any) {
      avisarErro(mensagemDeErro(e, 'Could not save this playlist.'));
      return null;
    } finally {
      setAGuardarMistura(false);
    }
  };

  const abrirMistura = (m: Mistura) => {
    hapticSelection();
    molduras.current[m.id]?.measureInWindow((x: number, y: number, width: number, height: number) => {
      setAncoraDaMistura({ x, y, width, height });
      setMisturaAberta(m);
    });
  };
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  // A Home é a raiz da pilha do seu separador (5/10): uma prateleira, uma
  // playlist ou um artista entram por cima, com a barra por baixo. O que é
  // de outro separador (as Liked Songs, o Social) vai pelo `irPara`.
  const { irPara } = useDestinos();
  const insets = useSafeAreaInsets();
  // A barra dos separadores MEDIDA (auditoria 1.3), não um 49 à mão.
  const alturaDosSeparadores = useAlturaDosSeparadores();
  // Tocar numa música: com "Start Radio from a song" é o Radio (ver `tocarMusica`).
  const tocarMusica = usePlayer((s) => s.tocarMusica);
  const refreshSaved = useSaved((s) => s.refresh);
  const savedKeys = useSaved((s) => s.keys);

  const [query, setQuery] = useState('');
  // Só a descoberta: as "Songs of the day" saíram da Home do iPhone (3/10, a
  // pedido do João). No PC continuam a ter página própria.
  const vista = 'discover' as const;
  /** A folha dos tres artistas, para uma conta nova ter por onde comecar. */
  const [escolherAberto, setEscolherAberto] = useState(false);
  const [actionTrack, setActionTrack] = useState<Track | null>(null);
  const [actionContext,setActionContext]=useState<DiscoveryContext|null>(null);
  const [history, setHistory] = useState<string[]>([]);
  
  // Search focus state
  const [isFocused, setIsFocused] = useState(false);

  const hasFeedback=useRecommendationFeedback(s=>s.items.length>0);
  const recs = useRecomendacoes();
  const { descobrir, nuncaLancado, amigos: dosAmigos, ouvirDeNovo: listenAgain, misturas, misturasProntas,
    maisTocadas: heavyRotation, esquecidas: forgottenFavorites, prontas } = recs;
  /** Ja aterrou? Vazia por ter chegado vazia e vazia por vir a caminho sao
   *  coisas diferentes: uma esconde-se, a outra mostra esqueleto. */
  /**
   * As misturas vêm todas numa lista, e separam-se aqui pelo prefixo do id.
   *
   * Numa lista só porque a navegação as encontra pelo id -- o ecrã do "See all"
   * recebe `{tipo:'mistura', id}` e vai buscá-la à store. Duas listas
   * obrigavam a duas fontes na rota, para uma diferença que só existe no
   * título da prateleira.
   */
  /**
   * Os sete atalhos da grelha do topo, mais o "Liked songs" que vai a frente.
   *
   * Sete e nao oito porque o coracao ocupa o primeiro lugar: a grelha e de
   * duas colunas, e um numero impar deixava um buraco na ultima linha.
   */
  const atalhos = React.useMemo(() => misturas.slice(0, 7), [misturas]);
  // O "Jump back in" (3/10): os recentes primeiro, e os atalhos de sempre a
  // encher o que falta (lib/recentes.ts).
  const recentes = useRecentes((s) => s.lista);
  const paraVoltar = React.useMemo(() => recentesParaMostrar(recentes, [
    { chave: chaveDoRecente({ tipo: 'guardadas', nome: 'Liked Songs' }), tipo: 'guardadas', nome: 'Liked Songs', capas: [], quando: 0 },
    ...atalhos.map((m): Recente => ({
      chave: chaveDoRecente({ tipo: 'mistura', nome: m.nome, id: m.id }), tipo: 'mistura', nome: m.nome, id: m.id,
      capas: capasDaFila(m.faixas), quando: 0,
    })),
  ]), [recentes, atalhos]);
  const secoesDaHome = useAparencia(useShallow((s) => secoesVisiveis(s)));
  const temMisturaDoDia = useMisturaDoDia((s) => !(s.estado === 'vazio' || (s.estado === 'pronto' && s.faixas.length === 0)));
  // O mesmo `destinoDoRecente` do "Jump back in" do PC (lib/destinos.ts).
  const voltarA = useCallback((r: Recente) => {
    const destino = destinoDoRecente(r);
    if (destino) irPara(destino);
  }, [irPara]);

  const misturasDeEstilo = React.useMemo(
    () => misturas.filter((m) => m.id.startsWith('estilo:')),
    [misturas],
  );
  const radios = React.useMemo(
    () => misturas.filter((m) => m.id.startsWith('radio:')),
    [misturas],
  );
  const generos = React.useMemo(
    () => misturas.filter((m) => m.id.startsWith('genero:')),
    [misturas],
  );
  const decadas = React.useMemo(
    () => misturas.filter((m) => m.id.startsWith('decada:')),
    [misturas],
  );
  const misturasDeArtista = React.useMemo(
    () => misturas.filter((m) => !m.id.startsWith('estilo:') && !m.id.startsWith('radio:')
      && !m.id.startsWith('decada:') && !m.id.startsWith('genero:')),
    [misturas],
  );

  const jaChegou = (nome: NomeDaPrateleira) => prontas.includes(nome);
  const loadingRecs = recs.estado === 'a-carregar';
  // O filtro por versão (26/9), o mesmo do PC (lib/filtroDeVersao.ts).
  const [versao, setVersao] = useState<FiltroDeVersao>('todas');
  useEffect(() => { setVersao('todas'); }, [query]);
  const { results, naBiblioteca, loading, errorMsg, pesquisarAgora } = useMusicSearch(query, (q) => {
    void addSearchHistoryEntry(q).then(setHistory).catch(() => {});
  });
  useEffect(() => { void recs.carregar(); }, [recs.carregar]);
  // A pesquisa por tipo (29/9, `lib/pesquisaPorTipo.ts`), a mesma do PC: só
  // com texto, e só pede o separador que está à vista.
  const [tipo, setTipo] = useState<SeparadorDaPesquisa>('musicas');
  const tipoAtivo: SeparadorDaPesquisa = query.trim().length < 2 ? 'musicas' : tipo;
  const porTipo = usePesquisaPorTipo(query, tipoAtivo);
  const [albumAberto, setAlbumAberto] = useState<ItemEmCapa | null>(null);
  // "drake playlist" abre as Playlists sozinho; "drake album", os Albums.
  useEffect(() => { const pedido = separadorPedidoPelaPergunta(query); if (pedido) setTipo(pedido); }, [query]);
  // O artista abre pelo CANAL escolhido, sem adivinhar pelo nome (homónimos).
  const abrirArtista = (a: ArtistaEncontrado) => {
    Keyboard.dismiss();
    lembrarCanalDoArtista(a.nome, a.canal);
    navigation.navigate('LibraryGroup', { type: 'artist', name: a.nome });
  };
  // O artista em destaque (29/9): "drake" ou "drake playlist" põem o Drake no
  // topo das Songs e das Playlists, com o Mix dele, como o YouTube faz.
  const destaque = useArtistaEmDestaque(query, tipoAtivo === 'musicas' || tipoAtivo === 'playlists');
  const [aAbrirMix, setAAbrirMix] = useState(false);
  const tocarMixDoDestaque = async (a: ArtistaEncontrado) => {
    if (aAbrirMix) return;
    Keyboard.dismiss();
    hapticSelection();
    setAAbrirMix(true);
    const ok = await tocarMixDoArtista(a.nome, { canal: a.canal }).catch(() => false);
    setAAbrirMix(false);
    if (!ok) avisarErro('Could not load the mix.', 'Check your connection and try again.');
  };
  const cartaoDoDestaque = destaque ? (
    <ArtistaEmDestaque artista={destaque} aoAbrir={() => abrirArtista(destaque)}
      aoTocarMix={() => void tocarMixDoDestaque(destaque)} aAbrirMix={aAbrirMix} />
  ) : null;

  const vistos=useRef(new Set<string>());
  useEffect(()=>{
    if(vista!=='discover')return;
    for(const nome of ORDEM_DAS_PRATELEIRAS){
      const data=recs[nome];
      if(!recs.prontas.includes(nome)||!data.length)continue;
      const contexto=contextoDaPrateleira(nome,savedKeys.has(`${data[0].source}:${data[0].sourceId}`));
      const chave=`${nome}:${recs.carregadoEm}:${data.length}`;
      if(vistos.current.has(chave))continue;
      vistos.current.add(chave);
      registar('recomendacao_mostrada',{...contextoParaAnalytics(contexto),quantidade:data.length});
    }
  },[vista,recs,recs.carregadoEm,recs.prontas,recs.descobrir,recs.nuncaLancado,recs.amigos,recs.ouvirDeNovo,recs.flow,recs.maisTocadas,recs.esquecidas,savedKeys]);

  useEffect(() => {
    getSearchHistory().then(setHistory);
    // Conjunto das faixas já guardadas, para marcar os resultados. Um pedido
    // para a lista toda, em vez de um checkIsSaved por linha.
    refreshSaved();
  }, [refreshSaved]);

  const doClearHistory = () => {
    setHistory([]);
    hapticImpact();
    clearSearchHistory();
  };

  const bottomPad = alturaDosSeparadores + insets.bottom + MINI_PLAYER_HEIGHT + 32;

  /**
   * Uma prateleira de MISTURAS -- estilos, radios ou playlists.
   *
   * Eram tres blocos de JSX quase identicos, com o mosaico de quatro celulas
   * escrito por extenso em cada um. O que muda entre eles e o titulo e a
   * lista; tudo o resto tem de ser igual, e a maneira de garantir isso e
   * haver um so sitio onde esta escrito.
   */
  const renderPrateleiraDeMisturas = (titulo: string, lista: Mistura[]) => {
    if (lista.length === 0) return null;
    return (
      <View style={styles.recsSection}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { flex: 1 }]}>{titulo}</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalScroll}
        >
          {lista.map((m) => (
            <Pressable
              key={m.id}
              ref={(r) => { molduras.current[m.id] = r; }}
              collapsable={false}
              onPress={() => navigation.navigate('Prateleira', {
                titulo: m.nome, fonte: { tipo: 'mistura', id: m.id },
              })}
              onLongPress={() => abrirMistura(m)}
              delayLongPress={350}
              style={({ pressed }) => [{ width: CAIXA_DA_MISTURA }, pressed && { opacity: 0.8 }]}
            >
              {/* Mosaico de quatro. Uma capa so seria a de uma musica a fingir
                  que representa vinte e cinco. */}
              <View style={[styles.mosaico, { width: CAIXA_DA_MISTURA, height: CAIXA_DA_MISTURA }]}>
                {m.faixas.slice(0, 4).map((t, i) => (
                  t.artworkUrl ? (
                    <Image
                      key={i}
                      source={{ uri: capaParaLista(t.artworkUrl)! }}
                      style={{ width: '50%', height: '50%' }}
                      contentFit="cover"
                      transition={200}
                    />
                  ) : (
                    <View key={i} style={{ width: '50%', height: '50%', backgroundColor: colors.surfaceHigh }} />
                  )
                ))}
              </View>
              <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.cardTitle}>{m.nome}</Text>
              <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.cardArtist}>{m.faixas.length} songs</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  };

  // Render horizontal recommendation lists
  const renderRecommendationSection = (
    nome: NomeDaPrateleira, title: string, data: Track[], chegou: boolean,
    { largura = 120, lista = false, largas = false, selo }:
      { largura?: number; lista?: boolean; largas?: boolean; selo?: string } = {},
  ) => {
    // Chegou e veio vazia: a seccao desaparece, sem deixar um titulo orfao.
    if (chegou && data.length === 0) return null;
    // A primeira seccao e uma LISTA e as outras carrosseis, de proposito: seis
    // prateleiras da mesma forma leem-se como um rolo so, e a mudanca de forma
    // e o que diz "isto aqui e outra coisa" sem precisar de o escrever.
    const emLista = lista && chegou;
    const contextoDe=(track:Track)=>contextoDaPrateleira(nome,savedKeys.has(`${track.source}:${track.sourceId}`));
    const abrirAcoes=(track:Track)=>{setActionTrack(track);setActionContext(contextoDe(track));};
    return (
      <View style={styles.recsSection}>
        <View style={[styles.sectionHeader, { alignItems: 'flex-start' }]}>
          {/* O motivo vai aqui, uma vez, e não por baixo de cada cartão: era a
              mesma frase em todos, cortada a meio. Ver `notaDaPrateleira`. */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.sectionTitle}>{title}</Text>
            <Text numberOfLines={1} style={styles.sectionNota}>{notaDaPrateleira(nome)}</Text>
          </View>
          {chegou && data.length > (emLista ? LINHAS_NA_LISTA : 0) && (
            <Pressable
              hitSlop={10}
              onPress={() => navigation.navigate('Prateleira', {
                titulo: title, fonte: { tipo: 'prateleira', nome },
              })}
            >
              {/* Na linha do título, e não ao meio das duas linhas do
                  cabeçalho. */}
              <Text style={[styles.verTudo, { paddingTop: 3 }]}>See all</Text>
            </Pressable>
          )}
        </View>
        {emLista ? (
          // Páginas de três linhas, e desliza-se para a direita. Uma lista
          // vertical cortada em três dava três músicas e um "See all"; assim
          // cabem trinta no espaço de três, sem sair do ecrã.
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={larguraDaPagina}
            snapToAlignment="start"
            disableIntervalMomentum
          >
            {paginasDe(data, LINHAS_NA_LISTA).map((pagina, n) => (
              <View key={n} style={{ width: larguraDaPagina }}>
                {pagina.map((track) => (
                  <TrackRow
                    key={`${track.source}:${track.sourceId}`}
                    track={track}
                    mostrarDuracao={false}
                    onPress={() => tocarMusica(track, data, true, contextoDe(track))}
                    onAction={() => abrirAcoes(track)}
                  />
                ))}
              </View>
            ))}
          </ScrollView>
        ) : !chegou ? (
          // Com a FORMA do que vem. Um esqueleto de carrossel a dar lugar a
          // uma lista é um salto, e um esqueleto existe justamente para não
          // haver salto nenhum.
          lista ? <SkeletonDeFaixas linhas={LINHAS_NA_LISTA} />
                : <SkeletonDePrateleira largura={largas ? CARTAO_LARGO : largura} cartoes={largas ? 2 : 4} />
        ) : largas ? (
          // Capa à esquerda, texto à direita. Depois das playlists a página já
          // deu duas formas -- páginas de linhas e mosaicos grandes -- e uma
          // terceira volta aos quadradinhos seria voltar atrás. Isto lê-se
          // como a fila de reprodução, que é uma forma que já existe na app.
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
            {data.map((track) => (
              <Pressable
                key={`${track.source}:${track.sourceId}`}
                onPress={() => tocarMusica(track, data, true, contextoDe(track))}
                onLongPress={() => { hapticSelection(); abrirAcoes(track); }}
                delayLongPress={350}
                style={({ pressed }) => [styles.cartaoLargo, pressed && { opacity: 0.8 }]}
              >
                {track.artworkUrl ? (
                  <Image source={{ uri: capaParaLista(track.artworkUrl)! }} style={styles.capaLarga} contentFit="cover" transition={200} />
                ) : (
                  <View style={[styles.capaLarga, styles.artFallback]}>
                    <Ionicons name="musical-note" size={20} color={colors.textTertiary} />
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.cardTitle}>{tituloDaFaixa(track)}</Text>
                  <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.cardArtist}>{displayArtist(track)}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalScroll}
        >
          {data.map((track) => (
            <Pressable
              key={`${track.source}:${track.sourceId}`}
              onPress={() => tocarMusica(track, data, true, contextoDe(track))}
              onLongPress={() => {
                hapticSelection();
                abrirAcoes(track);
              }}
              delayLongPress={350}
              style={({ pressed }) => [styles.recCard, { width: largura }, pressed && { opacity: 0.8 }]}
            >
              <View>
                {track.artworkUrl ? (
                  <Image
                    // A mqdefault: a hqdefault traz o vídeo 16:9 com duas faixas
                    // pretas, que num quadrado se viam por baixo da capa.
                    source={{ uri: capaParaLista(track.artworkUrl)! }}
                    style={[styles.cardArt, { width: largura, height: largura }]}
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <View style={[styles.cardArt, { width: largura, height: largura }, styles.artFallback]}>
                    <Ionicons name="musical-note" size={24} color={colors.textTertiary} />
                  </View>
                )}
                {selo ? (
                  <View style={styles.selo} pointerEvents="none">
                    <Text style={styles.seloTexto}>{selo}</Text>
                  </View>
                ) : null}
              </View>
              <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.cardTitle}>
                {tituloDaFaixa(track)}
              </Text>
              <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.cardArtist}>
                {displayArtist(track)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        )}
      </View>
    );
  };



  // A lista à vista muda (descoberta, resultados, histórico...): a nova começa
  // no topo, por isso o cabeçalho volta a abrir (3/10).
  const listaAVista = tipoAtivo !== 'musicas' ? `tipo:${tipoAtivo}`
    : query.trim().length >= 2 ? 'resultados'
    : isFocused ? 'historico' : vista;
  const rolagem = cab.rolagem;
  useEffect(() => { rolagem.setValue(0); }, [listaAVista, rolagem]);
  // Puxar a Home refaz as prateleiras (o mesmo que o botão de refrescar) e
  // relê quem está online.
  const puxar = usePuxarParaAtualizar(
    () => Promise.all([recs.carregar(true), useSocial.getState().refresh()]),
    cab.espaco,
  );

  // A Home por secções (10/10, personalização): a ordem e as escondidas vêm da
  // store (`secoesVisiveis`), e cada secção desenha-se aqui pelo nome. Sem
  // porteiro global: cada prateleira mostra o SEU esqueleto e entra quando
  // chega. O que havia escondia as três rápidas -- consultas diretas à base de
  // dados -- atrás da descoberta, que fala com o YouTube faixa a faixa.
  const blocoDaHome = (secao: SecaoDaHome): React.ReactNode => {
    switch (secao) {
      // O "Jump back in" (3/10, variante A de docs/barra-home-folhas.html): os
      // últimos sítios de onde se ouviu, para voltar onde se estava
      // (lib/recentes.ts). Os atalhos de sempre -- Liked Songs e as misturas --
      // só enchem o que falta: uma conta nova ainda não ouviu nada.
      case 'voltar': return paraVoltar.length >= 2 && (
        <View>
          <View style={styles.sectionHeader}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Jump back in</Text>
          </View>
          <View style={[styles.atalhos, { marginTop: spacing.sm }]}>
            {paraVoltar.map((r) => (
              <Toque
                key={r.chave}
                acende
                accessibilityRole="button"
                accessibilityLabel={r.nome}
                onPress={() => voltarA(r)}
                style={styles.atalho}
              >
                {r.tipo === 'guardadas' ? (
                  <View style={[styles.atalhoCapa, styles.atalhoCoracao]}>
                    <Ionicons name="heart" size={20} color={colors.text} />
                  </View>
                ) : r.tipo === 'artista' ? (
                  <View style={[styles.atalhoCapa, styles.atalhoCoracao]}>
                    {r.capas[0] ? (
                      <Image source={{ uri: capaParaLista(r.capas[0])! }} style={styles.atalhoRedonda} contentFit="cover" transition={200} />
                    ) : <Ionicons name="person" size={20} color={colors.textSecondary} />}
                  </View>
                ) : (
                  <View style={styles.atalhoCapa}>
                    {(r.capas.length >= 4 ? r.capas.slice(0, 4) : r.capas.slice(0, 1)).map((c, i, todas) => (
                      <Image
                        key={i}
                        source={{ uri: capaParaLista(c)! }}
                        style={todas.length === 1 ? { width: '100%', height: '100%' } : { width: '50%', height: '50%' }}
                        contentFit="cover"
                        transition={200}
                      />
                    ))}
                  </View>
                )}
                <Text numberOfLines={2} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.atalhoNome}>{r.nome}</Text>
              </Toque>
            ))}
          </View>
        </View>
      );
      // A Daily mix: a lista que se toca sem escolher nada. Em destaque (3/10):
      // a capa grande e os artistas dela. Some quando não há mix. Sem título
      // por cima (4/10): o cartão já diz "Your Daily mix".
      case 'misturaDoDia': return (
        <View style={{ paddingHorizontal: spacing.xl, marginTop: temMisturaDoDia ? spacing.xl : 0 }}>
          <CartaoDaMisturaDoDia
            destaque
            aoAbrir={() => navigation.navigate('Prateleira', { titulo: 'Daily mix', fonte: { tipo: 'doDia' } })}
          />
        </View>
      );
      // Os novos lançamentos dos teus artistas (10/10): mudam todos os dias. Um
      // álbum abre a mesma folha dos álbuns da página do artista.
      case 'lancamentos': return <NovosLancamentos aoAbrir={(l) => setAlbumAberto({ id: l.id, titulo: l.titulo, legenda: legendaDoLancamento(l), capa: l.capa })} />;
      // Só descoberta: música que ele não tem, escolhida pelo que ele ouve. Muda
      // TODOS OS DIAS (`descobertasDoDia`); o que se viu nos últimos 28 dias não volta.
      case 'descobrir': return renderRecommendationSection('descobrir', 'Discover daily', descobrir, jaChegou('descobrir'), { lista: true });
      // O "Discover daily" vai para FORA (artistas vizinhos, só música que
      // saiu); esta vai para dentro: o que os artistas dele nunca lançaram (ver
      // api/naoLancado.ts). "New to you" é uma promessa que ele cumpre: nada
      // guardado, ouvido há pouco ou ocultado, em versão nenhuma.
      case 'raros': return renderRecommendationSection('nuncaLancado', 'Rare finds', nuncaLancado, jaChegou('nuncaLancado'), { largura: 150, selo: 'New to you' });
      // As playlists que a app monta: três prateleiras da MESMA forma, e a
      // diferença está toda no título (Your styles: artistas teus que partilham
      // vizinhos; Radio: três faixas novas por cada tua; Playlists: a tua
      // biblioteca com descobertas pelo meio). Ver `lib/estilos.ts` e `radiosDeArtista`.
      case 'estilos': return renderPrateleiraDeMisturas('Your styles', misturasDeEstilo);
      case 'radios': return renderPrateleiraDeMisturas('Radio', radios);
      // Géneros e décadas arrumam a biblioteca por uma gaveta que não é o
      // artista, sem perguntar nada a catálogo nenhum (`lib/generos.ts`, `lib/decadas.ts`).
      case 'generos': return renderPrateleiraDeMisturas('Your genres', generos);
      case 'decadas': return renderPrateleiraDeMisturas('Decades', decadas);
      case 'playlists': return (!misturasProntas || misturasDeArtista.length > 0) && (misturasProntas
        ? renderPrateleiraDeMisturas('Playlists', misturasDeArtista)
        : (
          <View style={styles.recsSection}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { flex: 1 }]}>Playlists</Text>
            </View>
            <SkeletonDePrateleira largura={CAIXA_DA_MISTURA} cartoes={2} />
          </View>
        ));
      // Os amigos: a única prateleira daqui que não sai do teu próprio histórico.
      case 'amigos': return renderRecommendationSection('amigos', "Your friends' favourites", dosAmigos, jaChegou('amigos'), { largas: true });
      case 'ouvirDeNovo': return renderRecommendationSection('ouvirDeNovo', 'Listen again', listenAgain, jaChegou('ouvirDeNovo'), { largas: true });
      case 'maisTocadas': return renderRecommendationSection('maisTocadas', 'Heavy rotation', heavyRotation, jaChegou('maisTocadas'), { largas: true });
      case 'esquecidas': return renderRecommendationSection('esquecidas', 'Forgotten favourites', forgottenFavorites, jaChegou('esquecidas'), { largas: true });
    }
  };

  // O refrescar vive no cabecalho, como no PC -- um icone, nao uma linha de
  // texto encostada a direita por cima de tudo. E so aparece quando ha
  // recomendacoes: antes disso nao ha nada para refrescar, e o botao chegava
  // ao ecra antes daquilo que ele refresca.
  return (
    <Screen title="Home"
      encolhe={cab}
      // O campo de pesquisa vive no cabeçalho (3/10): fica preso por baixo da
      // barra compacta e não perde o foco quando a lista por baixo muda.
      fixo={
        <View style={styles.controls}>
          <Input
            icon="search"
            placeholder="Songs, artists, playlists…"
            value={query}
            onChangeText={setQuery}
            onClear={() => setQuery('')}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => { pesquisarAgora(); Keyboard.dismiss(); }}
          />
          {query.trim().length >= 2 ? (
            <View style={styles.vistas} accessibilityRole="tablist">
              {([['musicas', 'Songs'], ['artistas', 'Artists'], ['albuns', 'Albums'], ['playlists', 'Playlists']] as const).map(([id, nome]) => (
                <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: tipo === id }}
                  onPress={() => { hapticSelection(); setTipo(id); }}
                  style={[styles.vista, tipo === id && styles.vistaActiva]}>
                  <Text style={[styles.vistaTexto, tipo === id && styles.vistaTextoActivo]}>{nome}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      }
      right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
        {vista === 'discover' && temRecomendacoes(recs) ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh recommendations"
            hitSlop={12} disabled={loadingRecs} onPress={() => void recs.carregar(true)}
            style={{ opacity: loadingRecs ? 0.4 : 1 }}>
            <Ionicons name="refresh" size={22} color={colors.textSecondary} />
          </Pressable>
        ) : null}
        <BotaoDasMensagens onPress={() => irPara({ tipo: 'social' })} />
      </View>}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {tipoAtivo !== 'musicas' ? (
          porTipo.loading ? <View style={{ paddingTop: cab.espaco }}><SkeletonDeFaixas /></View> : (
            <Animated.FlatList
              onScroll={cab.onScroll}
              scrollEventThrottle={cab.scrollEventThrottle}
              scrollIndicatorInsets={{ top: cab.espaco }}
              data={(tipoAtivo === 'artistas' ? porTipo.artistas
                : tipoAtivo === 'albuns' ? porTipo.albuns.map((a) => ({ id: a.id, titulo: a.titulo, legenda: legendaDoAlbumEncontrado(a), capa: a.capa }))
                : porTipo.playlists) as (ArtistaEncontrado | ItemEmCapa)[]}
              keyExtractor={(x) => ('canal' in x ? x.canal : x.id)}
              contentContainerStyle={{ paddingTop: cab.espaco, paddingBottom: bottomPad, flexGrow: 1 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              ListHeaderComponent={tipoAtivo === 'playlists' ? cartaoDoDestaque : null}
              ListEmptyComponent={
                <EmptyState
                  icon={porTipo.falhou ? 'cloud-offline-outline' : tipoAtivo === 'artistas' ? 'person-outline' : tipoAtivo === 'albuns' ? 'albums-outline' : 'list-outline'}
                  title={porTipo.falhou ? 'Search failed' : tipoAtivo === 'artistas' ? 'No artists found' : tipoAtivo === 'albuns' ? 'No albums found' : 'No playlists found'}
                  subtitle={porTipo.falhou ? 'Check your connection and try again.' : 'Try a different search term.'}
                />
              }
              renderItem={({ item }) => ('canal' in item ? (
                <LinhaDoResultado redonda capa={item.foto} titulo={item.nome} legenda={item.legenda}
                  onPress={() => abrirArtista(item)} />
              ) : (
                <LinhaDoResultado capa={item.capa} titulo={item.titulo} legenda={item.legenda}
                  onPress={() => { Keyboard.dismiss(); setAlbumAberto(item); }} />
              ))}
            />
          )
        ) : loading ? (
          <View style={{ paddingTop: cab.espaco }}><SkeletonDeFaixas /></View>
        ) : errorMsg ? (
          <Pressable style={{ flex: 1, paddingTop: cab.espaco }} onPress={Keyboard.dismiss}>
            <EmptyState
              icon="cloud-offline-outline"
              title="Something went wrong"
              subtitle={errorMsg}
            />
          </Pressable>
        ) : query.trim().length < 2 && isFocused && history.length > 0 ? (
          /* Focused Search input - Show Search History */
          <Animated.ScrollView
            onScroll={cab.onScroll}
            scrollEventThrottle={cab.scrollEventThrottle}
            scrollIndicatorInsets={{ top: cab.espaco }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: cab.espaco, paddingBottom: bottomPad }}
          >
            <View style={styles.historyHeader}>
              <Text style={type.micro}>Recent searches</Text>
              <Pressable hitSlop={8} onPress={doClearHistory}>
                <Text style={[type.caption, { color: colors.text, fontWeight: '700' }]}>
                  Clear
                </Text>
              </Pressable>
            </View>
            {history.map((q) => (
              <Pressable
                key={q}
                onPress={() => {
                  setQuery(q);
                  Keyboard.dismiss();
                }}
                style={({ pressed }) => [
                  styles.historyRow,
                  pressed && { backgroundColor: colors.surface },
                ]}
              >
                <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                <Text numberOfLines={1} style={[type.body, { flex: 1 }]}>
                  {q}
                </Text>
              </Pressable>
            ))}
          </Animated.ScrollView>
        ) : query.trim().length < 2 && !isFocused ? (
          /* Default state - Show Recommendations */
          <Animated.ScrollView
            ref={topoDaPagina}
            refreshControl={puxar}
            onScroll={cab.onScroll}
            scrollEventThrottle={cab.scrollEventThrottle}
            scrollIndicatorInsets={{ top: cab.espaco }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingTop: cab.espaco, paddingBottom: bottomPad }}
            showsVerticalScrollIndicator={false}
          >
            {/* A cabeca de tudo, e so quando ha alguem: quem esta online
                agora, e o que esta a ouvir. Sem ninguem, o componente nao devolve nada e a pagina
                comeca onde sempre comecou -- e por isso que isto pode viver
                no sitio mais caro do ecra sem custar nada nos dias em que
                nao ha ninguem online. */}
            <AmigosAOuvir />
            {/* A grelha de atalhos, a cabeca da pagina.
                ------------------------------------------------------------
                Sao os mesmos mixes que estao nas prateleiras la em baixo, e a
                repeticao e deliberada: la o mosaico e grande e serve para
                olhar, aqui e pequeno e serve para chegar la num toque, sem
                rolar. E o "Liked songs" a abrir, porque e o unico destino que
                se abre sempre e nunca muda de nome.

                So aparece com mixes: uma grelha com um quadrado sozinho nao e
                uma grelha, e no primeiro dia de uma conta nova nao ha mixes
                nenhuns. */}
            {secoesDaHome.map((secao) => <React.Fragment key={secao}>{blocoDaHome(secao)}</React.Fragment>)}
            {/* O vazio deixa de ser so uma frase.
                ------------------------------------------------------------
                Dizia "comeca a ouvir musica" a quem acabou de instalar a
                app -- verdade, e inutil: a pagina que devia mostrar musica
                estava a mandar a pessoa ir descobri-la sozinha. Escolher
                tres artistas da a esta pagina por onde comecar, e o botao
                desaparece assim que houver recomendacoes. */}
            {!loadingRecs && !temRecomendacoes(recs) && (
              <View style={{ alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.xl }}>
                <Text style={styles.emptyRecsText}>
                  {hasFeedback
                    ? 'No suggestions match your current preferences. You can review them in Settings → Recommendations, or search for music above.'
                    : 'Nothing to go on yet. Tell the app three artists you like and it starts from there.'}
                </Text>
                {!hasFeedback && (
                  <PillButton label="Pick 3 artists" onPress={() => setEscolherAberto(true)} />
                )}
              </View>
            )}
          </Animated.ScrollView>
        ) : results.length === 0 && naBiblioteca.length === 0 ? (
          <Pressable style={{ flex: 1, paddingTop: cab.espaco }} onPress={Keyboard.dismiss}>
            <EmptyState
              icon="search-outline"
              title={query.trim().length >= 2 ? 'No results' : 'Start typing to search'}
              subtitle={
                query.trim().length >= 2
                  ? 'Try a different search term.'
                  : 'Search for any song.'
              }
            />
          </Pressable>
        ) : (
          <Animated.FlatList
            ref={topoDosResultados}
            onScroll={cab.onScroll}
            scrollEventThrottle={cab.scrollEventThrottle}
            scrollIndicatorInsets={{ top: cab.espaco }}
            data={results.filter((r) => versaoPassa(r.title, versao))}
            keyExtractor={(t) => `${t.source}:${t.sourceId}`}
            contentContainerStyle={{ paddingTop: cab.espaco, paddingBottom: bottomPad }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            /* O que já é teu vem PRIMEIRO, e sem esperar pela rede. A procura
               ao YouTube continua por baixo, e é a mesma de sempre. */
            ListHeaderComponent={cartaoDoDestaque || naBiblioteca.length > 0 || filtrosComResultados(results.map((r) => r.title)).length > 2 ? (
              <View>
                {cartaoDoDestaque}
                {naBiblioteca.length > 0 ? <>
                <View style={[styles.sectionHeader, { marginBottom: spacing.sm }]}>
                  <Ionicons name="heart" size={18} color={colors.text} />
                  <Text style={styles.sectionTitle}>In your library</Text>
                </View>
                {naBiblioteca.map((t) => (
                  <TrackRow
                    key={`local:${t.source}:${t.sourceId}`}
                    track={t}
                    acompanharATocar
                    onPress={() => {
                      Keyboard.dismiss();
                      tocarMusica(t, naBiblioteca, true);
                    }}
                    onAction={() => setActionTrack(t)}
                  />
                ))}
                {results.length > 0 && (
                  <View style={[styles.sectionHeader, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>
                    <Ionicons name="musical-notes-outline" size={18} color={colors.text} />
                    <Text style={styles.sectionTitle}>More results</Text>
                  </View>
                )}
                </> : null}
                {(() => {
                  const filtros = filtrosComResultados(results.map((r) => r.title));
                  if (filtros.length <= 2) return null;
                  return (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
                      contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.xl, paddingBottom: spacing.md }}>
                      {FILTROS_DE_VERSAO.filter((f) => filtros.includes(f.id)).map((f) => {
                        const sel = versao === f.id;
                        return (
                          <Pressable key={f.id} onPress={() => setVersao(f.id)} accessibilityRole="button" accessibilityState={{ selected: sel }}
                            style={{ paddingHorizontal: 14, height: 32, borderRadius: 16, justifyContent: 'center',
                              backgroundColor: sel ? colors.text : colors.surface, borderWidth: 1, borderColor: sel ? colors.text : colors.border }}>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: sel ? colors.bg : colors.text }}>{f.nome}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  );
                })()}
              </View>
            ) : null}
            renderItem={({ item }) => (
              <TrackRow
                track={item}
                showSavedBadge
                acompanharATocar
                onPress={() => {
                  Keyboard.dismiss();
                  // Só a faixa escolhida, nunca os resultados: ver o mesmo
                  // sítio no BibliotecaPages.web.tsx. O rádio continua daqui.
                  tocarMusica(item, undefined, true);
                }}
                onAction={() => setActionTrack(item)}
                actionIcon="add-circle-outline"
              />
            )}
          />
        )}
      </KeyboardAvoidingView>

      <EscolherArtistas
        visivel={escolherAberto}
        aoFechar={() => setEscolherAberto(false)}
        // Forcar: a store tem as prateleiras como "prontas" (vazias), e sem
        // isto ficava a olhar para o vazio depois de ele deixar de existir.
        aoGuardar={() => { void recs.carregar(true); }}
      />
      <TrackActionsSheet
        visible={!!actionTrack}
        track={actionTrack}
        discoveryContext={actionContext}
        onClose={() => {setActionTrack(null);setActionContext(null);}}
      />

      <MenuFlutuante
        visivel={!!misturaAberta}
        ancora={ancoraDaMistura}
        aoFechar={() => setMisturaAberta(null)}
        aoFechado={() => { const fn = depoisDoMenu.current; depoisDoMenu.current = null; fn?.(); }}
        accoes={[
          { label: aGuardarMistura ? 'Saving…' : 'Save to your library', icon: 'bookmark-outline',
            disabled: aGuardarMistura,
            onPress: () => {
              const m = misturaAberta;
              depoisDoMenu.current = () => { if (m) void guardarMistura(m); };
              setMisturaAberta(null);
            } },
          // Guarda antes, e a etiqueta di-lo. Partilhar uma coisa que só
          // existe neste telemóvel não é possível, e esconder isso atrás de um
          // "Share" seco deixava uma playlist nova na biblioteca sem o
          // utilizador perceber de onde veio.
          { label: 'Save and share', icon: 'paper-plane-outline',
            disabled: aGuardarMistura,
            onPress: () => {
              const m = misturaAberta;
              depoisDoMenu.current = () => {
                if (!m) return;
                void guardarMistura(m).then((pl) => { if (pl) setPlaylistAPartilhar(pl); });
              };
              setMisturaAberta(null);
            } },
        ]}
      />
      <ShareFriendSheet
        visible={!!playlistAPartilhar}
        itemType="playlist"
        item={playlistAPartilhar}
        onClose={() => setPlaylistAPartilhar(null)}
      />
      {/* Um álbum da pesquisa abre a mesma folha dos álbuns da página do artista. */}
      <YtPlaylistRecommendationSheet
        visible={!!albumAberto}
        playlistId={albumAberto?.id ?? null}
        playlistTitle={albumAberto?.titulo ?? null}
        playlistArtwork={albumAberto?.capa ?? null}
        onClose={() => setAlbumAberto(null)}
      />

    </Screen>
  );
}

/**
 * O artista em destaque no topo da pesquisa (29/9): a foto, o nome, o Mix e a
 * página. É o cartão que o YouTube mostra para "drake playlist" -- só quando a
 * pergunta é mesmo o nome dele.
 */
function ArtistaEmDestaque({ artista, aoAbrir, aoTocarMix, aAbrirMix }: {
  artista: ArtistaEncontrado; aoAbrir: () => void; aoTocarMix: () => void; aAbrirMix: boolean;
}) {
  return (
    <View style={styles.destaque}>
      <Pressable onPress={aoAbrir} accessibilityRole="button" accessibilityLabel={`Open ${artista.nome}`}
        style={({ pressed }) => [styles.destaqueArtista, pressed && { opacity: 0.7 }]}>
        {artista.foto ? (
          <Image source={{ uri: artista.foto }} style={styles.destaqueFoto} contentFit="cover" />
        ) : (
          <View style={[styles.destaqueFoto, { alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="person" size={28} color={colors.textSecondary} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.micro, { color: colors.textSecondary }]} maxFontSizeMultiplier={ESCALA_MAXIMA.lista}>ARTIST</Text>
          <Text numberOfLines={1} style={styles.destaqueNome} maxFontSizeMultiplier={ESCALA_MAXIMA.lista}>{artista.nome}</Text>
          {artista.legenda ? <Text numberOfLines={1} style={[type.caption, { color: colors.textSecondary }]} maxFontSizeMultiplier={ESCALA_MAXIMA.lista}>{artista.legenda}</Text> : null}
        </View>
      </Pressable>
      <Pressable onPress={aoTocarMix} disabled={aAbrirMix} accessibilityRole="button" accessibilityLabel={`${artista.nome} Mix`}
        accessibilityState={{ busy: aAbrirMix }} style={({ pressed }) => [styles.destaqueMix, (pressed || aAbrirMix) && { opacity: 0.6 }]}>
        {aAbrirMix ? <ActivityIndicator size="small" color={colors.bg} /> : <Ionicons name="radio-outline" size={16} color={colors.bg} />}
        <Text style={styles.destaqueMixTexto} maxFontSizeMultiplier={ESCALA_MAXIMA.lista}>Mix</Text>
      </Pressable>
    </View>
  );
}

/** Uma linha de artista (foto redonda) ou de álbum (capa quadrada) na pesquisa por tipo. */
function LinhaDoResultado({ capa, titulo, legenda, redonda, onPress }: {
  capa: string | null; titulo: string; legenda: string; redonda?: boolean; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={legenda ? `${titulo}, ${legenda}` : titulo}
      style={({ pressed }) => [styles.linhaPorTipo, pressed && { backgroundColor: colors.surface }]}>
      {capa ? (
        <Image source={{ uri: capa }} style={[styles.capaPorTipo, redonda && { borderRadius: 26 }]} contentFit="cover" />
      ) : (
        <View style={[styles.capaPorTipo, redonda && { borderRadius: 26 }, { alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name={redonda ? 'person' : 'albums-outline'} size={22} color={colors.textSecondary} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={[type.body, { fontWeight: '600' }]}>{titulo}</Text>
        {legenda ? <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={[type.caption, { color: colors.textSecondary }]}>{legenda}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  destaque: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginHorizontal: spacing.xl, marginBottom: spacing.lg,
    padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  destaqueArtista: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  destaqueFoto: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceHigh },
  destaqueNome: { ...type.body, fontSize: 19, fontWeight: '700', color: colors.text },
  destaqueMix: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14,
    borderRadius: 18, backgroundColor: colors.text,
  },
  destaqueMixTexto: { fontSize: 14, fontWeight: '700', color: colors.bg },
  linhaPorTipo: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, minHeight: 68,
  },
  capaPorTipo: { width: 52, height: 52, borderRadius: radii.sm, backgroundColor: colors.surface },
  controls: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  vistas: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    padding: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  vista: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  vistaActiva: { backgroundColor: colors.surfaceHigh },
  vistaTexto: { ...type.caption, fontSize: 12, color: colors.textSecondary },
  vistaTextoActivo: { color: colors.text, fontWeight: '700' },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
    borderRadius: radii.sm,
    borderCurve: 'continuous',
  },
  /**
   * A grelha de atalhos: duas colunas de rectangulos baixos.
   *
   * Rectangulo e nao quadrado, e e essa a diferenca entre isto e as
   * prateleiras: aqui a capa e pequena e o nome vive AO LADO dela, o que faz
   * caber oito destinos na altura que uma prateleira gasta com quatro.
   */
  atalhos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  atalho: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.sm,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  atalhoCapa: {
    width: 52,
    height: 52,
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surfaceHigh,
  },
  // Sem `wrap`: a capa partilha o `flexWrap` da colagem de quatro, e com ele
  // o coração (e a foto do artista) encostava ao topo -- visto nas
  // screenshots de 4/10.
  atalhoCoracao: {
    flexWrap: 'nowrap',
    alignItems: 'center',
    justifyContent: 'center',
  },
  atalhoRedonda: { width: 40, height: 40, borderRadius: 20 },
  atalhoNome: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    paddingRight: spacing.sm,
  },
  recsSection: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  // 22 pt (3/10, auditoria 1.2): a hierarquia saltava do título de 32 para
  // 16, e as prateleiras liam-se como listas.
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: colors.text,
  },
  horizontalScroll: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  recCard: {
    width: 120,
    gap: 4,
  },
  cardArt: {
    width: 120,
    height: 120,
    borderRadius: radii.md,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  artFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginTop: 4,
  },
  cardArtist: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  sectionNota: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  selo: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(10, 10, 14, 0.78)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  seloTexto: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.text,
  },
  cartaoLargo: {
    width: CARTAO_LARGO,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  capaLarga: {
    width: 52,
    height: 52,
    borderRadius: radii.sm,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  mosaico: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: radii.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  verTudo: {
    ...type.caption,
    color: colors.textSecondary,
  },
  emptyRecsText: {
    ...type.caption,
    textAlign: 'center',
    padding: spacing.xl,
    marginTop: 24,
  },
});
