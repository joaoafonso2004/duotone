import { useEffect } from 'react';
import { usePlayer } from '../state/player';

/**
 * Mantém a fila abastecida enquanto se ouve.
 *
 * Sem isto o rádio só arrancava no `next()`, já com a fila vazia — e como ir
 * buscar as faixas é uma ida à rede, ficava um silêncio entre a última faixa
 * e a primeira do rádio. Assim, mal a fila fica sem nada por tocar, as faixas
 * seguintes já estão lá (e o Smart Cache até as pré-descarrega).
 */
export function useAutoplayRadio(): void {
  const currentId = usePlayer((s) => s.current?.sourceId);
  const queueIndex = usePlayer((s) => s.queueIndex);
  const queueLength = usePlayer((s) => s.queue.length);
  const autoplayRadio = usePlayer((s) => s.autoplayRadio);

  useEffect(() => {
    void usePlayer.getState().extendQueueWithRadio();
  }, [currentId, queueIndex, queueLength, autoplayRadio]);
}
