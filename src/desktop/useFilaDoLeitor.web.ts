import { useEffect, useMemo, useState } from 'react';
import { usePlayer } from '../state/player';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { useSeguirAmigo } from '../state/seguirAmigo';
import { fimDaFila } from '../lib/leitorDoPc';
import { pertoDoFim } from '../lib/grelhaQueCresce';
import type { CommonPageProps } from './rotas';
import type { Track } from '../types';

const LINHAS_DA_FILA = 100;

/** A mesma ordem e as mesmas ações no Now Playing e no painel lateral. */
export function useFilaDoLeitor({ more, notify }: Pick<CommonPageProps, 'more' | 'notify'>) {
  const current = usePlayer((s) => s.current);
  const queue = usePlayer((s) => s.queue);
  const queueIndex = usePlayer((s) => s.queueIndex);
  const shuffle = usePlayer((s) => s.shuffle);
  const shuffleOrder = usePlayer((s) => s.shuffleOrder);
  const upcomingQueue = usePlayer((s) => s.upcomingQueue);
  const playTrack = usePlayer((s) => s.playTrack);
  const reordenarProximas = usePlayer((s) => s.reordenarProximas);
  const repeatMode = usePlayer((s) => s.repeatMode);
  const autoplayRadio = usePlayer((s) => s.autoplayRadio);
  const radioErro = usePlayer((s) => s.radioError);
  const emJam = useOuvirJuntos((s) => !!s.sessao);
  const filaDaSessao = useOuvirJuntos((s) => s.fila);
  const seguido = useSeguirAmigo((s) => s.seguindo);
  const proximasDele = useSeguirAmigo((s) => s.aSeguir);
  const upNext = useMemo(
    () => seguido ? proximasDele.map((track, index) => ({ track, index }))
      : emJam ? filaDaSessao.map((i, index) => ({ track: i.track, index })) : upcomingQueue(),
    // A função da store é estável; estes campos invalidam a ordem que ela lê.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seguido, proximasDele, emJam, filaDaSessao, queue, queueIndex, shuffle, shuffleOrder, upcomingQueue],
  );
  // Uma biblioteca inteira não monta milhares de linhas arrastáveis de uma vez.
  const [linhasDaFila, setLinhasDaFila] = useState(LINHAS_DA_FILA);
  const [aConfirmarLimpar, setAConfirmarLimpar] = useState(false);
  useEffect(() => {
    if (!aConfirmarLimpar) return;
    const t = setTimeout(() => setAConfirmarLimpar(false), 4000);
    return () => clearTimeout(t);
  }, [aConfirmarLimpar]);
  const podeEditar = !emJam && !seguido;
  const limpar = () => {
    if (!podeEditar || !upNext.length) return;
    if (!aConfirmarLimpar) { setAConfirmarLimpar(true); return; }
    setAConfirmarLimpar(false);
    const sairam = usePlayer.getState().limparProximas();
    if (sairam > 0) notify(`Cleared ${sairam} ${sairam === 1 ? 'track' : 'tracks'} from the queue.`);
  };
  const aoRolar = (e: any) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    if (upNext.length > linhasDaFila && pertoDoFim(contentOffset.y, layoutMeasurement.height, contentSize.height)) {
      setLinhasDaFila((n) => n + LINHAS_DA_FILA);
    }
  };
  return {
    current, upNext, emJam, seguido, podeEditar, radioErro,
    linhasDaFila, aConfirmarLimpar, limpar, aoRolar,
    notaDoFim: fimDaFila({ emJam: emJam || !!seguido, repeatMode, autoplayRadio, vazia: !upNext.length }),
    aoTocar: (t: Track) => { if (!seguido) void playTrack(t, queue); },
    aoMenu: (t: Track, indiceReal: number) => emJam || seguido ? more(t) : more(t, undefined, { fila: indiceReal }),
    aoMover: (de: number, para: number) => { if (podeEditar) reordenarProximas(de, para); },
  };
}
