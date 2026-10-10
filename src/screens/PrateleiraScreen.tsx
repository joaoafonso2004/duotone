import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '../components/EmptyState';
import { Screen, useCabecalhoQueEncolhe } from '../components/Screen';
import { SkeletonDeFaixas } from '../components/Skeleton';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { TrackRow } from '../components/TrackRow';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useRecomendacoes } from '../state/recomendacoes';
import { useMisturaDoDia } from '../state/misturaDoDia';
import { usePlayer } from '../state/player';
import { useSaved } from '../state/saved';
import { MINI_PLAYER_HEIGHT } from '../theme';
import type { Track } from '../types';
import type { OrigemDaFila } from '../lib/origemDaFila';
import {
  contextoDaMistura, contextoDaPrateleira, contextoParaAnalytics,
} from '../lib/contextoDaDescoberta';
import { registar } from '../lib/eventos';
import { useAparencia } from '../state/aparencia';
import { alturaDaLinha } from '../lib/aparencia';

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
/**
 * De onde vem a lista, para o "Jump back in" da Home voltar aqui (3/10,
 * lib/recentes.ts). Uma prateleira guarda o NOME dela no id; a Daily mix é "doDia".
 */
function origemDaPrateleira(fonte: Props['route']['params']['fonte'], titulo: string): OrigemDaFila {
  if (fonte.tipo === 'mistura') return { tipo: 'mistura', nome: titulo, id: fonte.id };
  if (fonte.tipo === 'doDia') return { tipo: 'prateleira', nome: 'Daily mix', id: 'doDia' };
  return { tipo: 'prateleira', nome: titulo, id: fonte.nome };
}

export function PrateleiraScreen({ route }: Props) {
  // O título encolhe ao rolar (3/10, lib/tituloQueEncolhe.ts).
  const cab = useCabecalhoQueEncolhe();
  // As posições contam com o espaço do cabeçalho por cima da lista.
  // A altura das linhas segue as listas compactas (10/10, personalização).
  const alturaDaFila = alturaDaLinha(useAparencia((s) => s.listas));
  const posicaoDaLinha = React.useCallback((_: ArrayLike<Track> | null | undefined, index: number) => ({
    length: alturaDaFila, offset: cab.espaco + alturaDaFila * index, index,
  }), [cab.espaco, alturaDaFila]);
  const { fonte, titulo } = route.params;
  const insets = useSafeAreaInsets();
  // Duas origens, a mesma vista. O selector não constrói nada -- devolve o que
  // está na store, porque um array novo a cada leitura punha o
  // `useSyncExternalStore` num ciclo, e já foi assim que uma versão não
  // arrancou.
  const prateleiras = useRecomendacoes((s) => s);
  // A Daily mix vive numa store própria (state/misturaDoDia.ts).
  const misturaDoDia = useMisturaDoDia((s) => s.faixas);
  const misturaDoDiaPronta = useMisturaDoDia((s) => s.estado === 'pronto');
  const faixas = useMemo(()=>fonte.tipo === 'doDia'
    ? misturaDoDia
    : fonte.tipo === 'prateleira'
    ? prateleiras[fonte.nome]
    : prateleiras.misturas.find((m) => m.id === fonte.id)?.faixas ?? [],[fonte,prateleiras,misturaDoDia]);
  const chegou = fonte.tipo === 'doDia'
    ? misturaDoDiaPronta
    : fonte.tipo === 'prateleira'
    ? prateleiras.prontas.includes(fonte.nome)
    : prateleiras.misturasProntas;
  // Tocar numa música: com "Start Radio from a song" é o Radio (ver `tocarMusica`).
  const tocarMusica = usePlayer((s) => s.tocarMusica);
  const savedKeys=useSaved((s)=>s.keys);
  const [aberta, setAberta] = useState<Track | null>(null);
  // A Daily mix conta como o flow: é o mesmo `flowDoDia`, guardado por dia.
  const contextoDe=useCallback((track:Track)=>fonte.tipo==='mistura'
    ?contextoDaMistura(fonte.id,titulo,savedKeys.has(`${track.source}:${track.sourceId}`))
    :contextoDaPrateleira(fonte.tipo==='prateleira'?fonte.nome:'flow',savedKeys.has(`${track.source}:${track.sourceId}`)),[fonte,savedKeys,titulo]);
  const impressao=useRef('');
  useEffect(()=>{
    if(!chegou||!faixas.length)return;
    const contexto=contextoDe(faixas[0]);
    const chave=`${contexto.surface}:${faixas.length}`;
    if(impressao.current===chave)return;
    impressao.current=chave;
    registar('recomendacao_mostrada',{...contextoParaAnalytics(contexto),quantidade:faixas.length});
  },[chegou,faixas,contextoDe]);

  return (
    <Screen encolhe={cab} title={titulo} subtitle={chegou ? `${faixas.length} ${faixas.length === 1 ? 'song' : 'songs'}` : undefined}>
      {!chegou ? (
        <View style={{ paddingTop: cab.espaco }}><SkeletonDeFaixas /></View>
      ) : faixas.length === 0 ? (
        <View style={{ flex: 1, paddingTop: cab.espaco }}>
        <EmptyState
          icon="sparkles-outline"
          title="Nothing here right now"
          subtitle="Play and save more music, then refresh your recommendations."
        />
        </View>
      ) : (
        <Animated.FlatList
          onScroll={cab.onScroll} scrollEventThrottle={cab.scrollEventThrottle} scrollIndicatorInsets={{ top: cab.espaco }}
          data={faixas}
          keyExtractor={(t) => `${t.source}:${t.sourceId}`}
          getItemLayout={posicaoDaLinha}
          contentContainerStyle={{ paddingTop: cab.espaco, paddingBottom: insets.bottom + MINI_PLAYER_HEIGHT + 32 }}
          renderItem={({ item }) => (
            <TrackRow
              track={item}
              showSavedBadge
              contextLabel={contextoDe(item).reason}
              onPress={() => tocarMusica(item, faixas, true, contextoDe(item), origemDaPrateleira(fonte, titulo))}
              onAction={() => setAberta(item)}
            />
          )}
        />
      )}
      <TrackActionsSheet
        visible={!!aberta}
        track={aberta}
        discoveryContext={aberta?contextoDe(aberta):null}
        onClose={() => setAberta(null)}
      />
    </Screen>
  );
}
