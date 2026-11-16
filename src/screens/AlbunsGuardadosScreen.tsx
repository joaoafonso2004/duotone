import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useCallback, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '../components/EmptyState';
import { Screen, useCabecalhoQueEncolhe } from '../components/Screen';
import { ShareFriendSheet } from '../components/ShareFriendSheet';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { YtPlaylistRecommendationSheet } from '../components/YtPlaylistRecommendationSheet';
import { FRASES_DOS_ALBUNS, legendaDoAlbum, type AlbumGuardado } from '../lib/albunsGuardados';
import { avisarErro, avisarFeito } from '../lib/avisoDeRemocao';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { hapticImpact, ImpactFeedbackStyle } from '../lib/haptics';
import { mensagemDeErro } from '../lib/mensagemDeErro';
import { menuDoLancamento, type AcaoDoLancamento } from '../lib/menuDoLancamento';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { alternarAlbumGuardado, carregarAlbunsGuardados, useAlbunsGuardados } from '../state/albunsGuardados';
import { discoSemAbrir, guardarDiscoComoPlaylist } from '../state/acoesDoDisco';
import { useConnectivity } from '../state/connectivity';
import { useAlturaDosSeparadores } from '../state/doca';
import { colors, MINI_PLAYER_HEIGHT, radii, spacing, type } from '../theme';

/**
 * Os álbuns guardados (15/11): a grelha que a pasta das Playlists abre. Dois
 * por linha, como as playlists, com a capa, o título e "Artista · ano". Tocar
 * abre o álbum (a mesma folha da página do artista, com o coração); segurar
 * abre o menu de um disco, com "Remove from library".
 */
export function AlbunsGuardadosScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const cab = useCabecalhoQueEncolhe();
  const insets = useSafeAreaInsets();
  const separadores = useAlturaDosSeparadores();
  const { width } = useWindowDimensions();
  const albuns = useAlbunsGuardados((s) => s.albuns);
  const offline = useConnectivity((s) => s.offline);
  const [aberto, setAberto] = useState<AlbumGuardado | null>(null);
  const [comMenu, setComMenu] = useState<AlbumGuardado | null>(null);
  // Mandar um álbum a um amigo (16/11): o tipo 'album' da shared_items (supabase/partilhar-albuns.sql).
  const [aPartilhar, setAPartilhar] = useState<AlbumGuardado | null>(null);
  useFocusEffect(useCallback(() => { void carregarAlbunsGuardados(); }, []));

  const lado = (width - spacing.xl * 2 - spacing.lg) / 2;
  const disco = (a: AlbumGuardado) => ({ id: a.id, title: a.titulo, artworkUrl: a.capa, tipo: a.tipo, ano: a.ano });

  const fazer = (a: AlbumGuardado, acao: AcaoDoLancamento) => {
    setComMenu(null);
    if (acao === 'abrir') setAberto(a);
    else if (acao === 'guardar-album') {
      void alternarAlbumGuardado(disco(a), a.artista)
        .then(() => avisarFeito(FRASES_DOS_ALBUNS.feitoTirar, a.titulo))
        .catch((e) => avisarErro(mensagemDeErro(e, "Couldn't update your library.")));
    } else if (acao === 'guardar') void guardarDiscoComoPlaylist({ id: a.id, title: a.titulo });
    else if (acao === 'partilhar') setAPartilhar(a);
    else if (acao === 'artista') { if (a.artista) navigation.navigate('LibraryGroup', { type: 'artist', name: a.artista }); }
    else void discoSemAbrir({ id: a.id, title: a.titulo }, acao);
  };

  return (
    <>
      <Screen
        encolhe={cab}
        title={FRASES_DOS_ALBUNS.pasta}
        subtitle={FRASES_DOS_ALBUNS.guardados(albuns.length)}
        onBack={() => navigation.goBack()}
      >
        {albuns.length === 0 ? (
          <>
            <View style={{ height: cab.espaco }} />
            <EmptyState icon="disc-outline" title={FRASES_DOS_ALBUNS.vazio} subtitle={FRASES_DOS_ALBUNS.vazioDetalhe} />
          </>
        ) : (
          <Animated.FlatList
            data={albuns}
            keyExtractor={(a) => a.id}
            numColumns={2}
            onScroll={cab.onScroll}
            scrollEventThrottle={cab.scrollEventThrottle}
            scrollIndicatorInsets={{ top: cab.espaco }}
            columnWrapperStyle={{ gap: spacing.lg, paddingHorizontal: spacing.xl }}
            contentContainerStyle={{
              gap: spacing.lg,
              paddingTop: cab.espaco + spacing.sm,
              paddingBottom: separadores + insets.bottom + MINI_PLAYER_HEIGHT + 32,
            }}
            renderItem={({ item }) => {
              const uri = capaParaLista(item.capa);
              return (
                <Pressable
                  onPress={() => setAberto(item)}
                  onLongPress={() => { hapticImpact(ImpactFeedbackStyle.Medium); setComMenu(item); }}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.titulo}, ${legendaDoAlbum(item)}`}
                  style={({ pressed }) => [{ width: lado }, pressed && { opacity: 0.8 }]}
                >
                  <View style={[styles.capa, { width: lado, height: lado }]}>
                    {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : (
                      <View style={[StyleSheet.absoluteFill, styles.semCapa]}>
                        <Ionicons name="disc-outline" size={lado / 3} color={colors.textTertiary} />
                      </View>
                    )}
                  </View>
                  <Text numberOfLines={1} style={[type.headline, { marginTop: 8 }]}>{item.titulo}</Text>
                  <Text numberOfLines={1} style={type.caption}>{legendaDoAlbum(item)}</Text>
                </Pressable>
              );
            }}
          />
        )}
      </Screen>

      <TrackActionsSheet
        visible={!!comMenu}
        track={null}
        onClose={() => setComMenu(null)}
        cabecalho={comMenu ? { titulo: comMenu.titulo, subtitulo: legendaDoAlbum(comMenu), capas: comMenu.capa ? [comMenu.capa] : [] } : null}
        actions={comMenu ? menuDoLancamento({ tipo: comMenu.tipo ?? 'Album' }, { semRede: offline, temArtista: !!comMenu.artista, guardado: true, partilhar: true })
          .filter((a) => !a.motivo)
          .map((a) => ({ icon: a.icone as any, label: a.rotulo, onPress: () => fazer(comMenu, a.id) })) : []}
      />

      <YtPlaylistRecommendationSheet
        visible={!!aberto}
        playlistId={aberto?.id ?? null}
        playlistTitle={aberto?.titulo ?? null}
        playlistArtwork={aberto?.capa ?? null}
        album={aberto ? { artista: aberto.artista, ano: aberto.ano, tipo: aberto.tipo } : undefined}
        onClose={() => setAberto(null)}
      />

      <ShareFriendSheet
        visible={!!aPartilhar}
        itemType="album"
        item={aPartilhar}
        onClose={() => setAPartilhar(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  capa: { borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surfaceHigh },
  semCapa: { alignItems: 'center', justifyContent: 'center' },
});
