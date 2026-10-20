import { useEffect, useState } from 'react';

/**
 * Quanto dura a saída do Now Playing do PC: a cor da capa a apagar-se na
 * janela, quase o tempo que leva a acender ao entrar (`janela-cor`, 450 ms). O
 * conteúdo sai antes (`np-a-sair`, 240 ms, na casca).
 */
export const SAIDA_DO_LEITOR_MS = 420;

/**
 * Uma camada que SAI em vez de desaparecer (20/10, pedido do João: o Now
 * Playing do PC entrava devagar, com a cor da capa a acender, e saía de um
 * fotograma para o outro).
 *
 * Quando `aberto` passa a falso, a camada continua montada mais `ms` com
 * `aSair` ligado, para o CSS a apagar; depois desmonta. Decide-se no PRÓPRIO
 * render em que `aberto` muda (o padrão do React para "o que mudou desde o
 * render anterior"): num efeito, havia um fotograma sem a camada antes de ela
 * começar a sair -- o mesmo salto que se queria tirar. Reabrir a meio cancela
 * a saída.
 */
export function useSaida(aberto: boolean, ms: number): { montado: boolean; aSair: boolean } {
  const [antes, setAntes] = useState(aberto);
  const [aSair, setASair] = useState(false);
  if (aberto !== antes) {
    setAntes(aberto);
    setASair(!aberto);
  }
  useEffect(() => {
    if (!aSair) return;
    const t = setTimeout(() => setASair(false), ms);
    return () => clearTimeout(t);
  }, [aSair, ms]);
  return { montado: aberto || aSair, aSair: !aberto && aSair };
}
