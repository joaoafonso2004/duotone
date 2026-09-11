import { useRecommendationFeedback } from '../state/recommendationFeedback';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { saveToLibrary } from '../api/library';
import { useMusicSearch } from '../hooks/useMusicSearch';
import { ORDEM_DAS_PRATELEIRAS, temRecomendacoes, useRecomendacoes, type NomeDaPrateleira } from '../state/recomendacoes';
import { useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MaterialTopTabNavigationProp } from '@react-navigation/material-top-tabs';
import type { RootStackParamList, TabsParamList } from '../navigation/RootNavigator';
import { displayArtist } from '../lib/artistName';
import { useSaved } from '../state/saved';
import { AddToPlaylistSheet } from '../components/AddToPlaylistSheet';
import { EmptyState } from '../components/EmptyState';
import { SkeletonDeFaixas, SkeletonDePrateleira } from '../components/Skeleton';
import { AmigosAOuvir } from '../components/AmigosAOuvir';
import { EscolhasDoDia } from '../components/EscolhasDoDia';
import { EscolherArtistas } from '../components/EscolherArtistas';
import { PillButton } from '../components/PillButton';
import { MenuFlutuante, type Ancora } from '../components/MenuFlutuante';
import { ShareFriendSheet } from '../components/ShareFriendSheet';
import { addTracksToPlaylist, createPlaylist } from '../api/playlists';
import type { Playlist } from '../types';
import type { Mistura } from '../lib/misturas';
import { Input } from '../components/Input';
import { Screen } from '../components/Screen';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { TrackRow } from '../components/TrackRow';
import { addSearchHistoryEntry, clearSearchHistory, getSearchHistory } from '../api/searchHistory';
import { hapticImpact, hapticNotification, hapticSelection } from '../lib/haptics';
import { usePlayer } from '../state/player';
import { colors, MINI_PLAYER_HEIGHT, radii, spacing, type } from '../theme';
import type { Track } from '../types';
import { DiscoveryControl } from '../components/DiscoveryControl';
import { useDiscoveryControl } from '../state/discoveryControl';
import {
  contextoDaPrateleira, contextoParaAnalytics, type DiscoveryContext,
} from '../lib/discoveryControl';
import { registar } from '../lib/eventos';

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
      Alert.alert('Error', e?.message ?? 'Could not save this playlist.');
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
  /**
   * O MESMO objecto de navegacao, visto como o navegador de separadores.
   *
   * A Pesquisa vive dentro dos separadores, por isso este `navigation` e o
   * deles -- o `navigate('Prateleira')` la em baixo so funciona porque o React
   * Navigation faz subir o que nao reconhece. Para ir ao Songs, que e um IRMAO
   * e nao um ecra do stack de raiz, o tipo tem de ser o dos separadores; com o
   * do stack, o TypeScript recusa o nome. E `getParent()` nao serve: esse e o
   * stack de raiz, que tambem nao conhece o Songs.
   */
  const separadores = useNavigation<MaterialTopTabNavigationProp<TabsParamList>>();
  const insets = useSafeAreaInsets();
  const playTrack = usePlayer((s) => s.playTrack);
  const playNext = usePlayer((s) => s.playNext);
  const addToQueue = usePlayer((s) => s.addToQueue);
  const current = usePlayer((s) => s.current);
  const refreshSaved = useSaved((s) => s.refresh);
  const markSaved = useSaved((s) => s.markSaved);
  const savedKeys = useSaved((s) => s.keys);
  const discoveryMode=useDiscoveryControl((s)=>s.mode);

  const [query, setQuery] = useState('');
  const [vista, setVista] = useState<'discover' | 'daily'>('discover');
  /** A folha dos tres artistas, para uma conta nova ter por onde comecar. */
  const [escolherAberto, setEscolherAberto] = useState(false);
  const [actionTrack, setActionTrack] = useState<Track | null>(null);
  const [actionContext,setActionContext]=useState<DiscoveryContext|null>(null);
  const [playlistTrack, setPlaylistTrack] = useState<Track | null>(null);
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
  const { results, naBiblioteca, loading, errorMsg, pesquisarAgora } = useMusicSearch(query, (q) => {
    void addSearchHistoryEntry(q).then(setHistory).catch(() => {});
  });
  useEffect(() => { void recs.carregar(); }, [recs.carregar]);

  const vistos=useRef(new Set<string>());
  useEffect(()=>{
    if(vista!=='discover')return;
    for(const nome of ORDEM_DAS_PRATELEIRAS){
      const data=recs[nome];
      if(!recs.prontas.includes(nome)||!data.length)continue;
      const contexto=contextoDaPrateleira(nome,discoveryMode,savedKeys.has(`${data[0].source}:${data[0].sourceId}`));
      const chave=`${discoveryMode}:${nome}:${recs.carregadoEm}:${data.length}`;
      if(vistos.current.has(chave))continue;
      vistos.current.add(chave);
      registar('recomendacao_mostrada',{...contextoParaAnalytics(contexto),quantidade:data.length});
    }
  },[vista,discoveryMode,recs,recs.carregadoEm,recs.prontas,recs.descobrir,recs.nuncaLancado,recs.amigos,recs.ouvirDeNovo,recs.flow,recs.maisTocadas,recs.esquecidas,savedKeys]);

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

  const bottomPad = 49 + insets.bottom + MINI_PLAYER_HEIGHT + 32;

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
                      source={{ uri: t.artworkUrl }}
                      style={{ width: '50%', height: '50%' }}
                      contentFit="cover"
                      transition={200}
                    />
                  ) : (
                    <View key={i} style={{ width: '50%', height: '50%', backgroundColor: colors.surfaceHigh }} />
                  )
                ))}
              </View>
              <Text numberOfLines={1} style={styles.cardTitle}>{m.nome}</Text>
              <Text numberOfLines={1} style={styles.cardArtist}>{m.faixas.length} songs</Text>
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
    const contextoDe=(track:Track)=>contextoDaPrateleira(nome,discoveryMode,savedKeys.has(`${track.source}:${track.sourceId}`));
    const abrirAcoes=(track:Track)=>{setActionTrack(track);setActionContext(contextoDe(track));};
    return (
      <View style={styles.recsSection}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { flex: 1 }]}>{title}</Text>
          {chegou && data.length > (emLista ? LINHAS_NA_LISTA : 0) && (
            <Pressable
              hitSlop={10}
              onPress={() => navigation.navigate('Prateleira', {
                titulo: title, fonte: { tipo: 'prateleira', nome },
              })}
            >
              <Text style={styles.verTudo}>See all</Text>
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
                    onPress={() => playTrack(track, data, true, false, contextoDe(track))}
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
                onPress={() => playTrack(track, data, true, false, contextoDe(track))}
                onLongPress={() => { hapticSelection(); abrirAcoes(track); }}
                delayLongPress={350}
                style={({ pressed }) => [styles.cartaoLargo, pressed && { opacity: 0.8 }]}
              >
                {track.artworkUrl ? (
                  <Image source={{ uri: track.artworkUrl }} style={styles.capaLarga} contentFit="cover" transition={200} />
                ) : (
                  <View style={[styles.capaLarga, styles.artFallback]}>
                    <Ionicons name="musical-note" size={20} color={colors.textTertiary} />
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={styles.cardTitle}>{track.title}</Text>
                  <Text numberOfLines={1} style={styles.cardArtist}>{displayArtist(track)}</Text>
                  <Text numberOfLines={1} style={styles.discoveryReason}>{contextoDe(track).reason}</Text>
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
              onPress={() => playTrack(track, data, true, false, contextoDe(track))}
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
                    source={{ uri: track.artworkUrl }}
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
              <Text numberOfLines={1} style={styles.cardTitle}>
                {track.title}
              </Text>
              <Text numberOfLines={1} style={styles.cardArtist}>
                {displayArtist(track)}
              </Text>
              <Text numberOfLines={1} style={styles.discoveryReason}>{contextoDe(track).reason}</Text>
            </Pressable>
          ))}
        </ScrollView>
        )}
      </View>
    );
  };



  // O refrescar vive no cabecalho, como no PC -- um icone, nao uma linha de
  // texto encostada a direita por cima de tudo. E so aparece quando ha
  // recomendacoes: antes disso nao ha nada para refrescar, e o botao chegava
  // ao ecra antes daquilo que ele refresca.
  return (
    <Screen title="Search" subtitle="Find tracks on YouTube"
      right={vista === 'discover' && temRecomendacoes(recs) ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh recommendations"
          hitSlop={12} disabled={loadingRecs} onPress={() => void recs.carregar(true)}
          style={{ opacity: loadingRecs ? 0.4 : 1 }}>
          <Ionicons name="refresh" size={22} color={colors.textSecondary} />
        </Pressable>
      ) : undefined}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.controls}>
          <Input
            icon="search"
            placeholder="Search YouTube…"
            value={query}
            onChangeText={setQuery}
            onClear={() => setQuery('')}
            onFocus={() => { setVista('discover'); setIsFocused(true); }}
            onBlur={() => setIsFocused(false)}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => { pesquisarAgora(); Keyboard.dismiss(); }}
          />
          {query.length === 0 && !isFocused ? (
            <View style={styles.vistas} accessibilityRole="tablist">
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: vista === 'discover' }}
                onPress={() => setVista('discover')}
                style={[styles.vista, vista === 'discover' && styles.vistaActiva]}
              >
                <Text style={[styles.vistaTexto, vista === 'discover' && styles.vistaTextoActivo]}>Discover</Text>
              </Pressable>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: vista === 'daily' }}
                onPress={() => setVista('daily')}
                style={[styles.vista, vista === 'daily' && styles.vistaActiva]}
              >
                <Text style={[styles.vistaTexto, vista === 'daily' && styles.vistaTextoActivo]}>Songs of the day</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {loading ? (
          <SkeletonDeFaixas />
        ) : errorMsg ? (
          <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss}>
            <EmptyState
              icon="cloud-offline-outline"
              title="Something went wrong"
              subtitle={errorMsg}
            />
          </Pressable>
        ) : query.trim().length < 2 && isFocused && history.length > 0 ? (
          /* Focused Search input - Show Search History */
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: bottomPad }}
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
          </ScrollView>
        ) : query.trim().length < 2 && !isFocused && vista === 'daily' ? (
          <EscolhasDoDia bottomPadding={bottomPad} />
        ) : query.trim().length < 2 && !isFocused ? (
          /* Default state - Show Recommendations */
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingBottom: bottomPad }}
            showsVerticalScrollIndicator={false}
          >
            {/* A cabeca de tudo, e so quando ha alguem: quem esta a ouvir
                agora. Sem ninguem, o componente nao devolve nada e a pagina
                comeca onde sempre comecou -- e por isso que isto pode viver
                no sitio mais caro do ecra sem custar nada nos dias em que
                nao ha ninguem online. */}
            <View style={{paddingHorizontal:spacing.xl,marginBottom:spacing.xl}}><DiscoveryControl /></View>
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
            {atalhos.length > 0 && (
              <View style={styles.atalhos}>
                <Pressable
                  onPress={() => separadores.navigate('Songs')}
                  style={({ pressed }) => [styles.atalho, pressed && { opacity: 0.75 }]}
                >
                  <View style={[styles.atalhoCapa, styles.atalhoCoracao]}>
                    <Ionicons name="heart" size={20} color={colors.text} />
                  </View>
                  <Text numberOfLines={2} style={styles.atalhoNome}>Liked songs</Text>
                </Pressable>
                {atalhos.map((m) => (
                  <Pressable
                    key={m.id}
                    onPress={() => navigation.navigate('Prateleira', {
                      titulo: m.nome, fonte: { tipo: 'mistura', id: m.id },
                    })}
                    style={({ pressed }) => [styles.atalho, pressed && { opacity: 0.75 }]}
                  >
                    <View style={styles.atalhoCapa}>
                      {m.faixas.slice(0, 4).map((t, i) => (
                        t.artworkUrl ? (
                          <Image
                            key={i}
                            source={{ uri: t.artworkUrl }}
                            style={{ width: '50%', height: '50%' }}
                            contentFit="cover"
                            transition={200}
                          />
                        ) : (
                          <View key={i} style={{ width: '50%', height: '50%', backgroundColor: colors.surfaceHigh }} />
                        )
                      ))}
                    </View>
                    <Text numberOfLines={2} style={styles.atalhoNome}>{m.nome}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {/* Sem porteiro global: cada prateleira mostra o SEU esqueleto e
                entra quando chega. O que estava aqui escondia as tres rapidas
                -- consultas diretas a base de dados -- atras da descoberta,
                que fala com o YouTube faixa a faixa. Era esperar pela mais
                lenta com as outras ja prontas em memoria, que e precisamente
                o que o carregamento por partes existe para evitar. */}
            {(
              <View>
                {/* A PRIMEIRA prateleira e so descoberta: musica que ele nao
                    tem, escolhida pelo que ele ouve -- e a MESMA durante sete
                    dias, para chegar a ser ouvida ate ao fim. Ver
                    `descobertasDaSemana`. */}
                {renderRecommendationSection('descobrir', 'Discover weekly', descobrir, jaChegou('descobrir'), { lista: true })}
                {/* Logo a seguir, e de propósito. O "Discover weekly" vai para
                    FORA -- artistas vizinhos, e só música que saiu. Esta vai
                    para dentro: o que os artistas dele nunca lançaram, que não
                    existe em catálogo nenhum. Ver api/naoLancado.ts. */}
                {/* "New to you" é uma promessa que o `api/naoLancado.ts`
                    cumpre: nada guardado, ouvido há pouco ou ocultado, em
                    versão nenhuma. */}
                {renderRecommendationSection('nuncaLancado', 'Rare finds', nuncaLancado, jaChegou('nuncaLancado'), { largura: 150, selo: 'New to you' })}
                {/* As playlists que a app monta. Entre a descoberta e o que
                    já se ouviu: é onde deixa de ser "música nova" e começa a
                    ser "música tua, arrumada". */}
                {/* Tres prateleiras da MESMA forma, e a diferenca esta toda
                    no titulo -- que e o que elas tem de diferente:
                      Your styles  -> artistas teus que partilham vizinhos
                      Radio        -> tres faixas novas por cada tua
                      Playlists    -> a tua biblioteca com descobertas pelo meio
                    Ver `lib/estilos.ts` e `radiosDeArtista`. */}
                {renderPrateleiraDeMisturas('Your styles', misturasDeEstilo)}
                {renderPrateleiraDeMisturas('Radio', radios)}
                {/* Generos e decadas arrumam a biblioteca por uma gaveta que
                    nao e o artista, e nenhuma das duas pergunta seja o que for
                    a catalogo nenhum -- saem da linha que ja la esta. Ver
                    `lib/generos.ts` e `lib/decadas.ts`. */}
                {renderPrateleiraDeMisturas('Your genres', generos)}
                {renderPrateleiraDeMisturas('Decades', decadas)}
                {(!misturasProntas || misturasDeArtista.length > 0) &&
                  (misturasProntas
                    ? renderPrateleiraDeMisturas('Playlists', misturasDeArtista)
                    : (
                      <View style={styles.recsSection}>
                        <View style={styles.sectionHeader}>
                          <Text style={[styles.sectionTitle, { flex: 1 }]}>Playlists</Text>
                        </View>
                        <SkeletonDePrateleira largura={CAIXA_DA_MISTURA} cartoes={2} />
                      </View>
                    ))}
                {/* Os amigos, e a unica prateleira desta pagina que nao sai
                    do teu proprio historico. Fica entre a descoberta e o que
                    ja e teu, que e onde ela pertence. */}
                {renderRecommendationSection('amigos', "Your friends' favourites", dosAmigos, jaChegou('amigos'), { largas: true })}
                {renderRecommendationSection('ouvirDeNovo', 'Listen again', listenAgain, jaChegou('ouvirDeNovo'), { largas: true })}
                {renderRecommendationSection('maisTocadas', 'Heavy rotation', heavyRotation, jaChegou('maisTocadas'), { largas: true })}
                {renderRecommendationSection('esquecidas', 'Forgotten favourites', forgottenFavorites, jaChegou('esquecidas'), { largas: true })}
                
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
              </View>
            )}
          </ScrollView>
        ) : results.length === 0 && naBiblioteca.length === 0 ? (
          <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss}>
            <EmptyState
              icon="logo-youtube"
              title={query.trim().length >= 2 ? 'No results' : 'Start typing to search'}
              subtitle={
                query.trim().length >= 2
                  ? 'Try a different search term.'
                  : 'Search YouTube and play tracks as native audio.'
              }
            />
          </Pressable>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(t) => `${t.source}:${t.sourceId}`}
            contentContainerStyle={{ paddingBottom: bottomPad }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            /* O que já é teu vem PRIMEIRO, e sem esperar pela rede. A procura
               ao YouTube continua por baixo, e é a mesma de sempre. */
            ListHeaderComponent={naBiblioteca.length > 0 ? (
              <View>
                <View style={[styles.sectionHeader, { marginBottom: spacing.sm }]}>
                  <Ionicons name="heart" size={18} color={colors.text} />
                  <Text style={styles.sectionTitle}>In your library</Text>
                </View>
                {naBiblioteca.map((t) => (
                  <TrackRow
                    key={`local:${t.source}:${t.sourceId}`}
                    track={t}
                    active={current?.source === t.source && current?.sourceId === t.sourceId}
                    onPress={() => {
                      Keyboard.dismiss();
                      playTrack(t, naBiblioteca, true);
                    }}
                    onAction={() => setActionTrack(t)}
                  />
                ))}
                {results.length > 0 && (
                  <View style={[styles.sectionHeader, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>
                    <Ionicons name="logo-youtube" size={18} color={colors.text} />
                    <Text style={styles.sectionTitle}>On YouTube</Text>
                  </View>
                )}
              </View>
            ) : null}
            renderItem={({ item }) => (
              <TrackRow
                track={item}
                showSavedBadge
                active={
                  current?.source === item.source &&
                  current?.sourceId === item.sourceId
                }
                onPress={() => {
                  Keyboard.dismiss();
                  playTrack(item, results, true);
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
        actions={[
          {
            icon: 'play-outline',
            label: 'Play next',
            onPress: () => {
              const t = actionTrack;
              setActionTrack(null);
              if (t) playNext(t);
            },
          },
          {
            icon: 'add-circle-outline',
            label: 'Add to queue',
            onPress: () => {
              const t = actionTrack;
              setActionTrack(null);
              if (t) addToQueue(t);
            },
          },
          {
            icon: 'heart-outline',
            label: 'Save to Library',
            onPress: async () => {
              const t = actionTrack;
              setActionTrack(null);
              if (!t) return;
              try {
                // Otimista: o coração aparece no toque, não daqui a 300ms.
                markSaved(t, true);
                await saveToLibrary(t);
                if(actionContext)registar('recomendacao_guardada',contextoParaAnalytics(actionContext));
                hapticNotification();
              } catch (e: any) {
                markSaved(t, false);
                Alert.alert('Error', e?.message ?? 'Could not save the track.');
              }
            },
          },
          {
            icon: 'list-outline',
            label: 'Add to playlist…',
            onPress: () => {
              const t = actionTrack;
              setActionTrack(null);
              setPlaylistTrack(t);
            },
          },
        ]}
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

      <AddToPlaylistSheet
        visible={!!playlistTrack}
        track={playlistTrack}
        onClose={() => setPlaylistTrack(null)}
      />

    </Screen>
  );
}

const styles = StyleSheet.create({
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
  atalhoCoracao: {
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
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
  discoveryReason: { fontSize: 10, color: colors.textTertiary, marginTop: 2 },
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
    backgroundColor: colors.surface,
  },
  mosaico: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: radii.md,
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
