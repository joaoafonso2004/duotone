import React, { useRef } from 'react';
import { nivelDoVolume, type EstadoDoShuffle } from '../lib/estadoDosIcones';

/**
 * Os ícones da barra do leitor que mudam de estado, cada um com a sua animação
 * (30/10, passo 8 de `docs/PLANO-ELEVAR-PC.md`; maquete `docs/pc-elevar-maquete.html`,
 * separador "Barra do leitor"). Desenho só: o estado e o toque são de quem os
 * usa. São elementos do DOM (um `<span>` com um `<svg>`), e por isso levam o
 * `data-dt` direto, como o `CoracaoAnimado`; as regras `ie*` estão na
 * `casca.web.tsx`. Só movimento e opacidade, e traços que se desenham
 * (`pathLength`); com "menos movimento" ficam os estados, sem o caminho.
 *
 * A primeira vez que se desenham não animam: só as mudanças depois disso.
 */

const TRACO = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** Verdadeiro a partir da primeira vez que o valor muda (o primeiro desenho não anima). */
function useMudou(valor: unknown): boolean {
  const inicial = useRef(valor);
  const mudou = useRef(false);
  if (!Object.is(inicial.current, valor)) mudou.current = true;
  return mudou.current;
}

type Base = { cor: string; tamanho?: number };
const caixa = (cor: string, tamanho: number) => ({ width: tamanho, height: tamanho, color: cor });

/** Shuffle: as setas desenham-se uma a seguir à outra; ligado, um ponto por baixo. */
export function IconeShuffle({ estado, cor, tamanho = 20 }: Base & { estado: EstadoDoShuffle }) {
  const anima = useMudou(estado);
  return <span data-dt="ie ie-shuffle" data-s={estado} {...(anima ? { 'data-anima': '' } : {})} style={caixa(cor, tamanho)}>
    {/* A chave recomeça o desenho a cada mudança de estado. */}
    <svg key={estado} viewBox="0 0 24 24" aria-hidden="true" {...TRACO}>
      <path data-dt="ie-linha" pathLength={1} d="M3 17h3.5c3 0 4.5-2 6-5 1.5-3 3-5 6-5H21" />
      <path d="M18 4l3 3-3 3" />
      <path data-dt="ie-linha ie-linha2" pathLength={1} d="M3 7h3.5c1.8 0 3 .8 4 2M13.5 15c1 1.4 2.3 2 4 2H21" />
      <path d="M18 14l3 3-3 3" />
    </svg>
    <i data-dt="ie-ponto" />
  </span>;
}

/** Repeat: gira sempre mais uma volta a cada estado; o "1" salta para dentro do laço. */
export function IconeRepeat({ modo, cor, tamanho = 20 }: Base & { modo: 'off' | 'all' | 'one' }) {
  const voltas = useRef(0);
  const antes = useRef(modo);
  if (antes.current !== modo) { voltas.current += 1; antes.current = modo; }
  return <span data-dt="ie ie-repeat" data-s={modo} style={caixa(cor, tamanho)}>
    <svg viewBox="0 0 24 24" aria-hidden="true" {...TRACO} style={{ transform: `rotate(${voltas.current * 360}deg)` }}>
      <path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 013-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 01-3 3H3" />
    </svg>
    <b data-dt="ie-um" aria-hidden="true">1</b>
    <i data-dt="ie-ponto" />
  </span>;
}

/**
 * Play / Pause: o ícone que sai roda um quarto de volta e encolhe, o que entra
 * vem do outro lado, com mola. O círculo à volta fica quieto. Cor por omissão a
 * do botão primário (escuro sobre o metal claro).
 */
export function IconePlayPause({ tocando, tamanho = 22, cor = '#111117' }: { tocando: boolean; tamanho?: number; cor?: string }) {
  return <span data-dt="ie ie-play" data-s={tocando ? 'playing' : 'paused'} style={caixa(cor, tamanho)}>
    <span data-dt="ie-i1"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg></span>
    <span data-dt="ie-i2"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4h4.2v16H6zM13.8 4H18v16h-4.2z" /></svg></span>
  </span>;
}

/** Volume: os arcos desenham-se um a um; sem som, um traço corta o altifalante. */
export function IconeVolume({ volume, cor, tamanho = 20 }: Base & { volume: number }) {
  return <span data-dt="ie ie-volume" data-s={nivelDoVolume(volume)} style={caixa(cor, tamanho)}>
    <svg viewBox="0 0 24 24" aria-hidden="true" {...TRACO}>
      <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" stroke="none" />
      <path data-dt="ie-arco ie-arco1" pathLength={1} d="M15.5 9a4 4 0 010 6" />
      <path data-dt="ie-arco ie-arco2" pathLength={1} d="M18.5 6.5a8 8 0 010 11" />
      <path data-dt="ie-corte" pathLength={1} d="M16 9.5l5 5M21 9.5l-5 5" />
    </svg>
  </span>;
}

/** Jam: ligada, abrem-se ondas à volta dos auscultadores, uma depois da outra. */
export function IconeJam({ ligada, cor, tamanho = 20 }: Base & { ligada: boolean }) {
  return <span data-dt="ie ie-jam" data-s={ligada ? 'on' : 'off'} style={caixa(cor, tamanho)}>
    <svg viewBox="0 0 24 24" aria-hidden="true" {...TRACO}>
      <path d="M4 15v-3a8 8 0 0116 0v3" />
      <path d="M4 15a2 2 0 012-2h1v6H6a2 2 0 01-2-2zM20 15a2 2 0 00-2-2h-1v6h1a2 2 0 002-2z" />
    </svg>
  </span>;
}
