import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { SkeletonDeFaixas } from '../components/Skeleton';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { getTrackRowLayout, TrackRow } from '../components/TrackRow';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useRecomendacoes } from '../state/recomendacoes';
import { usePlayer } from '../state/player';
import { AddToPlaylistSheet } from '../components/AddToPlaylistSheet';
import { saveToLibrary } from '../api/library';
import { useSaved } from '../state/saved';
import { hapticNotification } from '../lib/haptics';
import { Alert } from 'react-native';
import { MINI_PLAYER_HEIGHT } from '../theme';
import type { Track } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Prateleira'>;

/**
 * Uma prateleira de recomendações inteira, atrás do "See all".
 *
 * Recebe o NOME da prateleira e não as faixas. Passá-las pelos parâmetros da
 * navegação faria uma cópia congelada no instante do toque: refrescar as
 * recomendações mudava a Pesquisa e deixava este ecrã a mostrar o que já não
 * existe, e sair e voltar a entrar dava listas diferentes sem razão visível.
 * Assim há uma fonte só, e este ecrã é uma vista sobre ela.
 *
 * As prateleiras carregam-se ao arrancar a app e ficam -- por isso chegar aqui
 * não pede nada à rede. O esqueleto só aparece a quem entrou antes de a
 * prateleira ter aterrado, o que na prática é raro.
 */
export function PrateleiraScreen({ route }: Props) {
  const { fonte, titulo } = route.params;
  const insets = useSafeAreaInsets();
  // Duas origens, a mesma vista. O selector não constrói nada -- devolve o que
  // está na store, porque um array novo a cada leitura punha o
  // `useSyncExternalStore` num ciclo, e já foi assim que uma versão não
  // arrancou.
  const prateleiras = useRecomendacoes((s) => s);
  const faixas = fonte.tipo === 'prateleira'
    ? prateleiras[fonte.nome]
    : prateleiras.misturas.find((m) => m.id === fonte.id)?.faixas ?? [];
  const chegou = fonte.tipo === 'prateleira'
    ? prateleiras.prontas.includes(fonte.nome)
    : prateleiras.misturasProntas;
  const playTrack = usePlayer((s) => s.playTrack);
  const playNext = usePlayer((s) => s.playNext);
  const addToQueue = usePlayer((s) => s.addToQueue);
  const markSaved = useSaved((s) => s.markSaved);
  const [aberta, setAberta] = useState<Track | null>(null);
  const [paraPlaylist, setParaPlaylist] = useState<Track | null>(null);

  return (
    <Screen title={titulo} subtitle={chegou ? `${faixas.length} ${faixas.length === 1 ? 'song' : 'songs'}` : undefined}>
      {!chegou ? (
        <SkeletonDeFaixas />
      ) : faixas.length === 0 ? (
        <EmptyState
          icon="sparkles-outline"
          title="Nothing here right now"
          subtitle="Play and save more music, then refresh your recommendations."
        />
      ) : (
        <FlatList
          data={faixas}
          keyExtractor={(t) => `${t.source}:${t.sourceId}`}
          getItemLayout={getTrackRowLayout}
          contentContainerStyle={{ paddingBottom: insets.bottom + MINI_PLAYER_HEIGHT + 32 }}
          renderItem={({ item }) => (
            <TrackRow
              track={item}
              showSavedBadge
              onPress={() => playTrack(item, faixas, true)}
              onAction={() => setAberta(item)}
            />
          )}
        />
      )}
      <TrackActionsSheet
        visible={!!aberta}
        track={aberta}
        onClose={() => setAberta(null)}
        actions={[
          { icon: 'play-outline', label: 'Play next',
            onPress: () => { const t = aberta; setAberta(null); if (t) playNext(t); } },
          { icon: 'add-circle-outline', label: 'Add to queue',
            onPress: () => { const t = aberta; setAberta(null); if (t) addToQueue(t); } },
          { icon: 'heart-outline', label: 'Save to Library',
            onPress: async () => {
              const t = aberta; setAberta(null);
              if (!t) return;
              try {
                markSaved(t, true);
                await saveToLibrary(t);
                hapticNotification();
              } catch (e: any) {
                markSaved(t, false);
                Alert.alert('Error', e?.message ?? 'Could not save the track.');
              }
            } },
          { icon: 'list-outline', label: 'Add to playlist…',
            onPress: () => { const t = aberta; setAberta(null); setParaPlaylist(t); } },
        ]}
      />
      <AddToPlaylistSheet
        visible={!!paraPlaylist}
        track={paraPlaylist}
        onClose={() => setParaPlaylist(null)}
      />
    </Screen>
  );
}
