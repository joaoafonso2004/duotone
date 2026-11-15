/**
 * iPhone: lê a língua (AsyncStorage) ANTES do primeiro desenho (15/11), para a
 * app nunca aparecer metade numa língua e metade noutra. São milissegundos,
 * por baixo do ecrã de arranque. O PC lê-a logo (`raiz.web.tsx`).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState, type ComponentType } from 'react';
import { CHAVE_DO_IDIOMA, fixarIdioma, lerIdioma } from './idioma';

let lida = false;
const leitura = AsyncStorage.getItem(CHAVE_DO_IDIOMA)
  .then((v) => fixarIdioma(lerIdioma(v)))
  .catch(() => { /* fica o inglês */ })
  .finally(() => { lida = true; });

export function comIdioma<P extends object>(Raiz: ComponentType<P>): ComponentType<P> {
  return function RaizComIdioma(props: P) {
    const [pronta, setPronta] = useState(lida);
    useEffect(() => { if (!pronta) void leitura.then(() => setPronta(true)); }, [pronta]);
    return pronta ? <Raiz {...props} /> : null;
  };
}
