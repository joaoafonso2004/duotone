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
import { temRecomendacoes, useRecomendacoes, type NomeDaPrateleira } from '../state/recomendacoes';
import { useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { displayArtist } from '../lib/artistName';
import { useSaved } from '../state/saved';
import { AddToPlaylistSheet } from '../components/AddToPlaylistSheet';
import { EmptyState } from '../components/EmptyState';
import { SkeletonDeFaixas, SkeletonDePrateleira } from '../components/Skeleton';
import { AmigosAOuvir } from '../components/AmigosAOuvir';
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
  const espreitadela = 44;
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
  const insets = useSafeAreaInsets();
  const playTrack = usePlayer((s) => s.playTrack);
  const playNext = usePlayer((s) => s.playNext);
  const addToQueue = usePlayer((s) => s.addToQueue);
  const current = usePlayer((s) => s.current);
  const refreshSaved = useSaved((s) => s.refresh);
  const markSaved = useSaved((s) => s.markSaved);

  const [query, setQuery] = useState('');
  const [actionTrack, setActionTrack] = useState<Track | null>(null);
  const [playlistTrack, setPlaylistTrack] = useState<Track | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  
  // Search focus state
  const [isFocused, setIsFocused] = useState(false);

  const hasFeedback=useRecommendationFeedback(s=>s.items.length>0);
  const recs = useRecomendacoes();
  const { descobrir, nuncaLancado, ouvirDeNovo: listenAgain, misturas, misturasProntas,
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
  const misturasDeEstilo = React.useMemo(
    () => misturas.filter((m) => m.id.startsWith('estilo:')),
    [misturas],
  );
  const misturasDeArtista = React.useMemo(
    () => misturas.filter((m) => !m.id.startsWith('estilo:')),
    [misturas],
  );

  const jaChegou = (nome: NomeDaPrateleira) => prontas.includes(nome);
  const loadingRecs = recs.estado === 'a-carregar';
  const { results, naBiblioteca, loading, errorMsg, pesquisarAgora } = useMusicSearch(query, (q) => {
    void addSearchHistoryEntry(q).then(setHistory).catch(() => {});
  });
  useEffect(() => { void recs.carregar(); }, [recs.carregar]);

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

  // Render horizontal recommendation lists
  const renderRecommendationSection = (
    nome: NomeDaPrateleira, title: string, data: Track[], chegou: boolean,
    { largura = 120, lista = false, largas = false }:
      { largura?: number; lista?: boolean; largas?: boolean } = {},
  ) => {
    // Chegou e veio vazia: a seccao desaparece, sem deixar um titulo orfao.
    if (chegou && data.length === 0) return null;
    // A primeira seccao e uma LISTA e as outras carrosseis, de proposito: seis
    // prateleiras da mesma forma leem-se como um rolo so, e a mudanca de forma
    // e o que diz "isto aqui e outra coisa" sem precisar de o escrever.
    const emLista = lista && chegou;
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
                    onPress={() => playTrack(track, data, true)}
                    onAction={() => setActionTrack(track)}
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
                onPress={() => playTrack(track, data, true)}
                onLongPress={() => { hapticSelection(); setActionTrack(track); }}
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
              onPress={() => playTrack(track, data, true)}
              onLongPress={() => {
                hapticSelection();
                setActionTrack(track);
              }}
              delayLongPress={350}
              style={({ pressed }) => [styles.recCard, { width: largura }, pressed && { opacity: 0.8 }]}
            >
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
              <Text numberOfLines={1} style={styles.cardTitle}>
                {track.title}
              </Text>
              <Text numberOfLines={1} style={styles.cardArtist}>
                {displayArtist(track)}
              </Text>
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
      right={temRecomendacoes(recs) ? (
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
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => { pesquisarAgora(); Keyboard.dismiss(); }}
          />
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
            <AmigosAOuvir />
            {/* Sem porteiro global: cada prateleira mostra o SEU esqueleto e
                entra quando chega. O que estava aqui escondia as tres rapidas
                -- consultas diretas a base de dados -- atras da descoberta,
                que fala com o YouTube faixa a faixa. Era esperar pela mais
                lenta com as outras ja prontas em memoria, que e precisamente
                o que o carregamento por partes existe para evitar. */}
            {(
              <View>
                {/* A PRIMEIRA prateleira e so descoberta: musica que ele nao tem,
                    escolhida pelo que ele ouve. */}
                {renderRecommendationSection('descobrir', 'Discover new', descobrir, jaChegou('descobrir'), { lista: true })}
                {/* Logo a seguir, e de propósito. O "Discover new" vai para
                    FORA -- artistas vizinhos, e só música que saiu. Esta vai
                    para dentro: o que os artistas dele nunca lançaram, que não
                    existe em catálogo nenhum. Ver api/naoLancado.ts. */}
                {renderRecommendationSection('nuncaLancado', 'Never released', nuncaLancado, jaChegou('nuncaLancado'), { largura: 150 })}
                {/* As playlists que a app monta. Entre a descoberta e o que
                    já se ouviu: é onde deixa de ser "música nova" e começa a
                    ser "música tua, arrumada". */}
                {/* Duas prateleiras da mesma forma, e a diferenca esta no
                    titulo: os ESTILOS juntam artistas teus que partilham
                    vizinhos ("mais disto"), as playlists sao por artista
                    ("mais deste"). Ver `lib/estilos.ts`. */}
                {misturasDeEstilo.length > 0 && (
                  <View style={styles.recsSection}>
                    <View style={styles.sectionHeader}>
                      <Text style={[styles.sectionTitle, { flex: 1 }]}>Your styles</Text>
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.horizontalScroll}
                    >
                      {misturasDeEstilo.map((m) => (
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
                          <Text numberOfLines={1} style={styles.cardArtist}>
                            {m.faixas.length} songs
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}
                {(!misturasProntas || misturasDeArtista.length > 0) && (
                  <View style={styles.recsSection}>
                    <View style={styles.sectionHeader}>
                      <Text style={[styles.sectionTitle, { flex: 1 }]}>Playlists</Text>
                    </View>
                    {!misturasProntas ? (
                      <SkeletonDePrateleira largura={CAIXA_DA_MISTURA} cartoes={2} />
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.horizontalScroll}
                      >
                        {misturasDeArtista.map((m) => (
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
                            {/* Mosaico de quatro. Uma capa só seria a de uma
                                música a fingir que representa vinte e cinco. */}
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
                            <Text numberOfLines={1} style={styles.cardArtist}>
                              {m.faixas.length} songs
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                )}
                {renderRecommendationSection('ouvirDeNovo', 'Listen again', listenAgain, jaChegou('ouvirDeNovo'), { largas: true })}
                {renderRecommendationSection('maisTocadas', 'Heavy rotation', heavyRotation, jaChegou('maisTocadas'), { largas: true })}
                {renderRecommendationSection('esquecidas', 'Forgotten favourites', forgottenFavorites, jaChegou('esquecidas'), { largas: true })}
                
                {!loadingRecs && !temRecomendacoes(recs) && (
                  <Text style={styles.emptyRecsText}>
                    {hasFeedback?'No suggestions match your current preferences. You can review them in Settings → Recommendations, or search for music above.':'No recommendations yet. Start playing songs and saving them to your library to generate your Flow!'}
                  </Text>
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

      <TrackActionsSheet
        visible={!!actionTrack}
        track={actionTrack}
        onClose={() => setActionTrack(null)}
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
