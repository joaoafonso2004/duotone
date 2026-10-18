import { useEffect, useState } from 'react';
import { chaveDeArtista } from '../lib/artistName';
import { capasDoMix } from '../lib/menuDoRadio';
import { contagensNoAparelho } from '../lib/playCounts';

/** As capas do quadrado do Mix, lidas do aparelho quando o menu abre (zero pedidos). */
export function useCapasDoMix(ativo: boolean): string[] {
  const [capas, setCapas] = useState<string[]>([]);
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    void contagensNoAparelho()
      .then((c) => { if (vivo) setCapas(capasDoMix(c, (x) => chaveDeArtista(x.artist ?? ''))); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [ativo]);
  return capas;
}
