import { useMemo, useSyncExternalStore } from 'react';
import type { Compasso } from '../lib/compasso';
import { compassoMedido, ouvirCompassos, versaoDosCompassos } from '../state/compasso.web';
import { usePlayer } from '../state/player';

/** O andamento da música que toca, no PC (S3, `lib/compasso.ts`): o que a captura mediu. */
export function useCompasso(): Compasso | null {
  const id = usePlayer((s) => s.current?.sourceId ?? null);
  const velocidade = usePlayer((s) => s.playbackRate);
  const versao = useSyncExternalStore(ouvirCompassos, versaoDosCompassos);
  return useMemo(() => (id ? compassoMedido(id, velocidade) : null), [id, velocidade, versao]);
}
