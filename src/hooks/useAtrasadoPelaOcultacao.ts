import { useEffect, useRef, useState } from 'react';
import { depoisDeTapar } from '../state/esperaDaOcultacao';

/**
 * O valor que se vê depois da troca da capa (iPhone, 26/11): igual ao `valor`,
 * mas enquanto a Ocultação não tapou a capa fica o anterior. O par do
 * `useAtrasadoPelaOcultacao` do PC (`desktop/Ocultacao.web.ts`).
 *
 * As laterais da capa 3D usam-no: trocavam para a capa da música nova no
 * instante do skip, com a frente ainda na velha por baixo do disco (o João viu-o
 * numa captura). Num `useEffect`, que corre depois do `useLayoutEffect` onde a
 * passagem começa (`OcultacaoDaCapa`): no mesmo commit já se sabe se há uma.
 * Sem passagem (a letra à frente, Reduzir movimento), troca logo.
 */
export function useAtrasadoPelaOcultacao<T>(valor: T): T {
  const [mostrado, setMostrado] = useState<T>(valor);
  const ultimo = useRef(valor);
  ultimo.current = valor;
  useEffect(() => {
    if (Object.is(valor, mostrado)) return undefined;
    return depoisDeTapar(() => setMostrado(ultimo.current));
  }, [valor, mostrado]);
  return mostrado;
}
