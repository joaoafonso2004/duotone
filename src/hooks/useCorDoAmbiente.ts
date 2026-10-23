import { useEffect, useState } from 'react';
import { lerCelulasDaCapa } from '../lib/celulasDaCapa';
import { corDoAmbiente } from '../lib/corDaCapa';

/**
 * A cor de uma imagem para pintar a página por trás dela (`corDoAmbiente`: a
 * característica da imagem, puxada para o fundo até o branco se ler por cima).
 * A da página de um artista nas duas plataformas (23/10), como a do perfil.
 * Lê-se uma vez por imagem (em cache, `lerCelulasDaCapa`); sem ela, `null`.
 */
export function useCorDoAmbiente(uri: string | null | undefined): string | null {
  const [cor, setCor] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    if (!uri) { setCor(null); return; }
    void lerCelulasDaCapa(uri).then((c) => { if (vivo) setCor(corDoAmbiente(c)); }).catch(() => {});
    return () => { vivo = false; };
  }, [uri]);
  return cor;
}
