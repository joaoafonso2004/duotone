import React, { createContext, useContext, useRef } from 'react';
import { useSaida } from './useSaida.web';

/**
 * As saídas do PC (22/11, o João antes da 7.0.0: "tudo o que entra também tem de
 * sair"). Quanto dura uma: a curva `sair` do PC (`lib/molasEmCss.ts`), 160 ms a
 * acelerar, a mesma de `--dt-sair-ms` no CSS da casca.
 */
export const SAIDA_MS = 160;

const ASair = createContext(false);

/** Dentro de uma `Saida` que está a sair? Quem se desenha marca-se com `a-sair`. */
export function useASair(): boolean {
  return useContext(ASair);
}

/**
 * Mantém montado o que acabou de fechar, o tempo da saída (o `useSaida`), com o
 * que estava no ecrã da última vez que esteve aberto. O conteúdo é uma FUNÇÃO,
 * chamada só com `aberto`: quem a escreve pode usar o que só existe aberto (o
 * amigo a remover, a biblioteca lida) sem guardas.
 */
export function Saida({ aberto, children }: { aberto: boolean; children: () => React.ReactNode }) {
  const { montado, aSair } = useSaida(aberto, SAIDA_MS);
  const ultimo = useRef<React.ReactNode>(null);
  if (aberto) ultimo.current = children();
  if (!montado) return null;
  return <ASair.Provider value={aSair}>{ultimo.current}</ASair.Provider>;
}
