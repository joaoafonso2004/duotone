import React, { createContext, useContext, useMemo } from 'react';
import { Platform } from 'react-native';
import { mostrarPorta, podeIrPara, type Destino, type Plataforma, type TipoDeDestino } from '../lib/destinos';

/**
 * O `irPara` de cada plataforma, por contexto (5/10, auditoria T2/T3). A casca
 * dá-o uma vez (`RootNavigator.tsx` no iPhone, `RootNavigator.web.tsx` no PC)
 * e os componentes partilhados -- o perfil, o Social, as listas -- usam-no em
 * vez de receberem uma função por destino. O que a plataforma não tem fica
 * escondido pelo `podeIrPara` (`lib/destinos.ts`).
 */
export type IrPara = (destino: Destino) => void;

const Contexto = createContext<IrPara | null>(null);
export const DestinosProvider = Contexto.Provider;

export const PLATAFORMA: Plataforma = Platform.OS === 'web' ? 'pc' : 'ios';

const nenhum: IrPara = () => {};

export function useDestinos() {
  const irPara = useContext(Contexto);
  return useMemo(() => ({
    irPara: irPara ?? nenhum,
    /** Sem casca por cima (um ensaio, a janela do mini), não há para onde ir. */
    podeIrPara: (tipo: TipoDeDestino) => !!irPara && podeIrPara(PLATAFORMA, tipo),
    mostrarPorta: (tipo: TipoDeDestino) => !!irPara && mostrarPorta(PLATAFORMA, tipo),
  }), [irPara]);
}
