import React, { useEffect, useRef, useState } from 'react';
import { menosMovimentoAgora } from '../hooks/useReducedMotion';

/**
 * A saída de uma barra do fundo (22/11): a do leitor e a do outro aparelho entram
 * a abrir o lugar (`dt-barra-entra`) e, sem isto, saíam num fotograma, com a
 * página a crescer de golpe. Quando o que a barra mostra (`conteudo`) passa a
 * nada, fica no lugar dela um espaço com a altura que tinha, a fechar-se com a
 * mesma curva (`dt-barra-sai`, no CSS da casca).
 *
 * A altura lê-se da barra que ainda está no ecrã, no próprio render da mudança (o
 * padrão do React para guardar o render anterior): o 1.º fotograma sem ela já tem
 * o espaço. `ref` vai na caixa da barra (o `entrada-da-barra`); `espaco` põe-se
 * onde ela estava.
 */
export function useSaidaDaBarra(conteudo: unknown): { ref: React.RefObject<HTMLDivElement | null>; espaco: React.ReactNode } {
  const ref = useRef<HTMLDivElement | null>(null);
  const [anterior, setAnterior] = useState(conteudo);
  const [altura, setAltura] = useState<number | null>(null);
  if (anterior !== conteudo) {
    setAnterior(conteudo);
    const h = ref.current?.offsetHeight ?? 0;
    setAltura(anterior && !conteudo && h > 0 && !menosMovimentoAgora() ? h : null);
  }
  useEffect(() => {
    if (altura === null) return;
    // Sem o `animationend` (janela escondida, por exemplo), tira-se na mesma.
    const t = setTimeout(() => setAltura(null), 500);
    return () => clearTimeout(t);
  }, [altura]);
  const espaco = altura === null ? null : <div data-dt="saida-da-barra" aria-hidden
    style={{ ['--dt-altura-da-barra' as any]: `${altura}px` }} onAnimationEnd={() => setAltura(null)} />;
  return { ref, espaco };
}
