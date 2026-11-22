import React, { useRef, useState } from 'react';
import { useSaida } from './useSaida.web';

/** Quanto leva a fechar: um pouco mais do que uma saída, porque o resto da lista sobe com ela. */
const FECHAR_MS = 200;

/**
 * O que aparece NO MEIO de uma lista (22/11): uma opção das Definições que só
 * existe com outra ligada ("Start in" com o arranque com o Windows, a força do
 * efeito com o efeito ligado). Antes aparecia num fotograma e o resto da lista
 * saltava para baixo; agora o lugar abre-se e fecha-se (`dt-revelar`, no CSS da
 * casca), e o resto desce e sobe com ele.
 *
 * - Só anima quando muda com a página aberta: a página que abre com a opção já
 *   ligada mostra-a no sítio, sem a fazer crescer.
 * - A fechar, mostra o que tinha da última vez (o conteúdo é uma função, chamada
 *   só aberto, como na `Saida`).
 */
export function Revelar({ aberto, children }: { aberto: boolean; children: () => React.ReactNode }) {
  const { montado, aSair } = useSaida(aberto, FECHAR_MS);
  const ultimo = useRef<React.ReactNode>(null);
  if (aberto) ultimo.current = children();
  const [antes, setAntes] = useState(aberto);
  const [aEntrar, setAEntrar] = useState(false);
  if (antes !== aberto) {
    setAntes(aberto);
    setAEntrar(aberto);
  }
  if (!montado) return null;
  // Sempre o mesmo <div> (o React aproveita o nó); as marcas por extenso, para o
  // test-animacoes-do-pc.ts as ver.
  const dentro = <div>{ultimo.current}</div>;
  if (aSair) return <div data-dt="revelar a-sair">{dentro}</div>;
  if (aEntrar) return <div data-dt="revelar a-entrar" onAnimationEnd={() => setAEntrar(false)}>{dentro}</div>;
  return <div data-dt="revelar">{dentro}</div>;
}
