import React, { useEffect, useRef, useState } from 'react';
import { alturaDosAmigos, fracaoDosAmigos, teclarAmigos } from '../lib/largurasDasBarras';
import { useBarras } from './estadoDasBarras.web';

/**
 * A pega entre os amigos e os atalhos na lateral (20/11, o João: "quando tenho muitos amigos online
 * o pinned quase que desaparece ... ajustável como existe para a largura das colunas"). É a mesma
 * pega das barras (`SeparadorDeLargura.web.tsx`) deitada: uma tira de 6 px no fundo da caixa dos
 * amigos, com o fio que acende, arrasta-se com o rato, mexe-se com as setas (Shift: mais depressa;
 * Home e End: os extremos) e o duplo clique repõe a divisão de origem.
 *
 * A altura é uma fração da zona (`lib/largurasDasBarras.ts`, `AMIGOS`) e chega à caixa pela
 * variável `--dt-amigos` da raiz, como as larguras: arrastar não passa pelo React a cada fotograma.
 * Mede-se a caixa (o pai) e a zona (o avô) quando se pega, e não se confia no que está guardado:
 * com poucos amigos a caixa fica mais baixa do que o limite.
 */
export function SeparadorDosAmigos() {
  const ref = useRef<HTMLDivElement>(null);
  const fracao = useBarras((s) => s.amigos);
  const definir = useBarras((s) => s.definirAmigos);
  const repor = useBarras((s) => s.reporAmigos);
  const arrasto = useRef<{ y: number; borda: number; limite: number; zona: number } | null>(null);
  const pedida = useRef(0);
  const quadro = useRef(0);
  const [aArrastar, setAArrastar] = useState(false);
  const raiz = typeof document === 'undefined' ? null : document.documentElement;

  const medir = () => {
    const caixa = ref.current?.parentElement;
    const zona = caixa?.parentElement?.getBoundingClientRect().height ?? 0;
    return { borda: caixa?.getBoundingClientRect().height ?? 0, zona, limite: useBarras.getState().amigos * zona };
  };
  const acabar = () => {
    if (!arrasto.current) return;
    if (quadro.current) { cancelAnimationFrame(quadro.current); quadro.current = 0; definir(pedida.current); }
    arrasto.current = null;
    raiz?.removeAttribute('data-a-redimensionar');
    setAArrastar(false);
  };
  // Sair de cena a meio do arrasto (o último amigo sai, a lateral recolhe) não deixa o cursor preso.
  useEffect(() => () => {
    if (quadro.current) cancelAnimationFrame(quadro.current);
    raiz?.removeAttribute('data-a-redimensionar');
  }, [raiz]);

  return <div ref={ref} data-dt="separador" data-lado="baixo" data-a-arrastar={aArrastar ? '' : undefined}
    data-dica="Drag to resize. Double-click to reset"
    role="separator" aria-orientation="horizontal" aria-label="Resize friends and pinned" tabIndex={0}
    aria-valuenow={Math.round(fracao * 100)} aria-valuemin={0} aria-valuemax={100}
    onPointerDown={(e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      arrasto.current = { y: e.clientY, ...medir() };
      pedida.current = useBarras.getState().amigos;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sem captura, o arrasto acaba ao sair da pega */ }
      raiz?.setAttribute('data-a-redimensionar', 'altura');
      setAArrastar(true);
    }}
    onPointerMove={(e) => {
      const a = arrasto.current;
      if (!a) return;
      pedida.current = fracaoDosAmigos(alturaDosAmigos(a.borda, a.limite, e.clientY - a.y), a.zona);
      if (quadro.current) return;
      quadro.current = requestAnimationFrame(() => { quadro.current = 0; definir(pedida.current); });
    }}
    onPointerUp={acabar}
    onPointerCancel={acabar}
    onLostPointerCapture={acabar}
    onDoubleClick={repor}
    onKeyDown={(e) => {
      const { borda, limite, zona } = medir();
      const nova = teclarAmigos(borda, limite, e.key, e.shiftKey, zona);
      if (nova == null) return;
      e.preventDefault();
      definir(nova);
    }}
  />;
}
