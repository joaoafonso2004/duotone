import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrilhoDoEcra } from '../components/BrilhoDoEcra';
import { EmptyState } from '../components/EmptyState';
import { PlayDeMetal } from '../components/PlayDeMetal';
import { Screen, useCabecalhoQueEncolhe } from '../components/Screen';
import { SkeletonDeFaixas } from '../components/Skeleton';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { TrackRow } from '../components/TrackRow';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useRecomendacoes } from '../state/recomendacoes';
import { useMisturaDoDia } from '../state/misturaDoDia';
import { usePlayer } from '../state/player';
import { useSaved } from '../state/saved';
import { colors, MINI_PLAYER_HEIGHT, spacing } from '../theme';
import { useTheme } from '../state/theme';
import { hapticSelection } from '../lib/haptics';
import type { Track } from '../types';
import type { OrigemDaFila } from '../lib/origemDaFila';
import {
  contextoDaMistura, contextoDaPrateleira, contextoParaAnalytics,
} from '../lib/contextoDaDescoberta';
import { registar } from '../lib/eventos';
import { useAparencia } from '../state/aparencia';
import { alturaDaLinha } from '../lib/aparencia';

type Props = NativeStackScreenProps<RootStackParamList, 'Prateleira'>;

/** O Play e o Shuffle por cima da lista (24/11): a altura conta nas posições das linhas. */
const LADO_DO_PLAY = 60;
const ALTURA_DAS_ACOES = LADO_DO_PLAY + spacing.lg;

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
    length: alturaDaFila, offset: cab.espaco + ALTURA_DAS_ACOES + alturaDaFila * index, index,
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
  // O Play e o Shuffle (24/11, o João: uma lista da Home "só mostra as músicas, não
  // tem opção de tocar"). Os mesmos da página de uma playlist: o modo do shuffle é
  // o do leitor, e o Play toca com ele.
  const tocarLista = usePlayer((s) => s.tocarLista);
  const ligado = usePlayer((s) => s.shuffle);
  const inteligente = usePlayer((s) => s.shuffleInteligente);
  const alternarShuffle = usePlayer((s) => s.toggleShuffle);
  const theme = useTheme((s) => s.theme);
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
          ListHeaderComponent={
            <View style={styles.accoes}>
              <PlayDeMetal lado={LADO_DO_PLAY} label={`Play ${titulo}`}
                onPress={() => void tocarLista(faixas, ligado, inteligente, origemDaPrateleira(fonte, titulo))} />
              <Pressable
                style={[styles.shuffle, ligado && !inteligente && { borderColor: theme.color, backgroundColor: theme.soft }]}
                accessibilityRole="button" accessibilityState={{ selected: ligado }}
                accessibilityLabel={inteligente ? 'Smart shuffle on' : ligado ? 'Shuffle on' : 'Shuffle off'}
                onPress={() => { hapticSelection(); alternarShuffle(); }}>
                {inteligente && <BrilhoDoEcra />}
                <Ionicons name="shuffle" size={20} color={ligado && !inteligente ? theme.color : colors.text} />
              </Pressable>
            </View>
          }
          contentContainerStyle={{ paddingTop: cab.espaco, paddingBottom: insets.bottom + MINI_PLAYER_HEIGHT + 32 }}
          renderItem={({ item }) => (
            <TrackRow
              track={item}
              showSavedBadge
              // As duas prateleiras de descoberta: música que ainda não se conhece.
              refrao={fonte.tipo === 'prateleira' && (fonte.nome === 'descobrir' || fonte.nome === 'nuncaLancado')}
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
        origem={origemDaPrateleira(fonte, titulo)}
        onClose={() => setAberta(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // A mesma linha da página de uma playlist: o Play ao centro e o Shuffle ao lado.
  accoes: {
    height: ALTURA_DAS_ACOES, paddingBottom: spacing.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xl,
  },
  shuffle: {
    width: 48, height: 48, borderRadius: 24, overflow: 'hidden',
    backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
});
