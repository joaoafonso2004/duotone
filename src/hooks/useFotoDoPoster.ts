import { useEffect, useState } from 'react';
import { fotoDoPoster, fotoDoPosterJaConhecida } from '../api/fotosDoPoster';
import type { Track } from '../types';

/**
 * A foto do artista para o Poster desta música (`api/fotosDoPoster.ts`), ou
 * `null`: sem faixa (o Poster com a capa não pede nada), sem fotos, ou enquanto
 * se pergunta pela primeira vez -- e aí fica a capa até a foto chegar. Com o
 * artista já conhecido a foto sai no mesmo desenho, sem passar pela capa.
 */
export function useFotoDoPoster(faixa: Track | null | undefined): string | null {
  const chave = faixa ? `${faixa.source}:${faixa.sourceId}` : '';
  const ja = faixa ? fotoDoPosterJaConhecida(faixa) : null;
  const [lida, setLida] = useState<{ chave: string; foto: string | null } | null>(null);
  const porSaber = !!faixa && ja === undefined;
  useEffect(() => {
    if (!faixa || !porSaber) return;
    let vivo = true;
    void fotoDoPoster(faixa).then((foto) => { if (vivo) setLida({ chave, foto }); });
    return () => { vivo = false; };
    // A faixa muda com a chave; o resto da faixa não conta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, porSaber]);
  if (!faixa) return null;
  if (ja !== undefined) return ja;
  return lida?.chave === chave ? lida.foto : null;
}
