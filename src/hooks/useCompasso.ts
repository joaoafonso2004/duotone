import { useMemo, useSyncExternalStore } from 'react';
import { compassoDoRitmo, type Compasso } from '../lib/compasso';
import { ouvirRitmos, ritmoGuardado, versaoDosRitmos } from '../lib/ritmoGuardado';
import { usePlayer } from '../state/player';

/**
 * O andamento da música que toca, no iPhone (S3, `lib/compasso.ts`): o da análise do
 * AutoMix. Só lê o que já foi analisado, e chega a meio se a análise acabar depois.
 */
export function useCompasso(): Compasso | null {
  const id = usePlayer((s) => s.current?.sourceId ?? null);
  const velocidade = usePlayer((s) => s.playbackRate);
  const versao = useSyncExternalStore(ouvirRitmos, versaoDosRitmos);
  return useMemo(() => (id ? compassoDoRitmo(ritmoGuardado(id), velocidade) : null), [id, velocidade, versao]);
}
