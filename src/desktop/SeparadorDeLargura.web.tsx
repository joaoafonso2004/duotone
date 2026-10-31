import React, { useEffect, useRef, useState } from 'react';
import { teclar, type Limites } from '../lib/largurasDasBarras';
import { limitesAgora, useBarras } from './estadoDasBarras.web';

/**
 * A pega de uma barra ajustável (31/10, `lib/largurasDasBarras.ts`): uma tira de 6 px no bordo da
 * lateral (à direita dela) e do painel (à esquerda dele). Arrasta-se com o rato, mexe-se com as
 * setas (Shift: mais depressa; Home e End: os extremos) e um duplo clique repõe a largura de
 * origem. Um `<div>` do DOM e não um componente RN: precisa de captura do ponteiro e de
 * `data-dt` direto (ver `FilaArrastavel.web.tsx`).
 *
 * **Fica por dentro da barra** (`right: 0` / `left: 0`), nunca a invadir a página do lado: ela é
 * irmã mais abaixo no DOM, e cada `View` do RNW tem o seu `z-index`, por isso uma pega que
 * saísse da barra ficava por baixo da página e não apanhava o rato.
 *
 * **Não passa pelo React a cada fotograma**: `aoMudar` escreve a largura na store, que a põe nas
 * variáveis de CSS da raiz (`estadoDasBarras.web.ts`); aqui só há um pedido por fotograma
 * (`requestAnimationFrame`). Durante o arrasto a raiz leva `data-a-redimensionar` (o cursor
 * fica de arrasto em todo o lado, nada se seleciona e a fila deixa de animar).
 */
export function SeparadorDeLargura({ rotulo, valor, limites, sinal, lado, aoMudar, aoRepor }: {
  /** O nome para o leitor de ecrã ("Resize the sidebar"). */
  rotulo: string;
  /** A largura guardada, para o leitor de ecrã. */
  valor: number;
  /** Os limites de agora (dependem da janela), pedidos quando se arrasta ou se carrega numa tecla. */
  limites: () => Limites;
  /** Para onde a barra cresce: +1 para a direita (a lateral), -1 para a esquerda (o painel). */
  sinal: 1 | -1;
  /** O bordo da barra onde fica a pega. */
  lado: 'direita' | 'esquerda';
  aoMudar: (largura: number) => void;
  aoRepor: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const arrasto = useRef<{ x: number; largura: number } | null>(null);
  const pedida = useRef(0);
  const quadro = useRef(0);
  const [aArrastar, setAArrastar] = useState(false);
  const raiz = typeof document === 'undefined' ? null : document.documentElement;

  const acabar = () => {
    if (!arrasto.current) return;
    if (quadro.current) { cancelAnimationFrame(quadro.current); quadro.current = 0; aoMudar(pedida.current); }
    arrasto.current = null;
    raiz?.removeAttribute('data-a-redimensionar');
    setAArrastar(false);
  };
  // Sair de cena a meio do arrasto (a rota muda, a janela fecha) não deixa o cursor preso.
  useEffect(() => () => {
    if (quadro.current) cancelAnimationFrame(quadro.current);
    raiz?.removeAttribute('data-a-redimensionar');
  }, [raiz]);

  const lim = limites();
  return <div ref={ref} data-dt="separador" data-lado={lado} data-a-arrastar={aArrastar ? '' : undefined}
    data-dica="Drag to resize. Double-click to reset"
    role="separator" aria-orientation="vertical" aria-label={rotulo} tabIndex={0}
    aria-valuenow={Math.round(valor)} aria-valuemin={lim.recolhida ?? lim.minima} aria-valuemax={lim.maxima}
    style={{ [lado === 'direita' ? 'right' : 'left']: 0 } as React.CSSProperties}
    onPointerDown={(e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      // A largura de verdade da barra (a de agora, já com os limites da janela), e não a guardada.
      const largura = ref.current?.parentElement?.getBoundingClientRect().width ?? valor;
      arrasto.current = { x: e.clientX, largura };
      pedida.current = largura;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sem captura, o arrasto acaba ao sair da pega */ }
      raiz?.setAttribute('data-a-redimensionar', '');
      setAArrastar(true);
    }}
    onPointerMove={(e) => {
      const a = arrasto.current;
      if (!a) return;
      pedida.current = a.largura + (e.clientX - a.x) * sinal;
      if (quadro.current) return;
      quadro.current = requestAnimationFrame(() => { quadro.current = 0; aoMudar(pedida.current); });
    }}
    onPointerUp={acabar}
    onPointerCancel={acabar}
    onLostPointerCapture={acabar}
    onDoubleClick={aoRepor}
    onKeyDown={(e) => {
      const nova = teclar(valor, e.key, e.shiftKey, sinal, lim);
      if (nova == null) return;
      e.preventDefault();
      aoMudar(nova);
    }}
  />;
}

/** A pega da lateral: no bordo direito dela, a crescer para a direita. */
export function SeparadorDaLateral() {
  const valor = useBarras((s) => s.lateral);
  const definir = useBarras((s) => s.definirLateral);
  const repor = useBarras((s) => s.reporLateral);
  return <SeparadorDeLargura rotulo="Resize the sidebar" valor={valor} limites={limitesAgora.lateral} sinal={1} lado="direita"
    aoMudar={definir} aoRepor={repor} />;
}

/** A pega do painel da fila: no bordo esquerdo dele, a crescer para a esquerda. */
export function SeparadorDoPainel() {
  const valor = useBarras((s) => s.painel);
  const definir = useBarras((s) => s.definirPainel);
  const repor = useBarras((s) => s.reporPainel);
  return <SeparadorDeLargura rotulo="Resize the queue panel" valor={valor} limites={limitesAgora.painel} sinal={-1} lado="esquerda"
    aoMudar={definir} aoRepor={repor} />;
}
