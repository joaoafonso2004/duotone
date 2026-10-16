import React, { useEffect, useRef, useState } from 'react';
import {
  alcanceDasFaiscas, animacaoPara, direcoesDasFaiscas, DURACAO, MOLA, RESPIRA, tamanhoDaFaisca,
  type AnimacaoDoCoracao,
} from '../lib/coracaoAoCarregar';

type Props = {
  /** O que se mostra (o `mostrada` do `useCoracaoAoCarregar`). */
  guardada: boolean;
  /** Muda a cada toque: é ele que anima. Mudar só o `guardada` não anima. */
  pulso: number;
  tamanho: number;
  /** O contorno, por guardar. */
  cor: string;
  /** O cheio (e as faíscas), guardada. */
  corCheio: string;
};

const CORACAO = 'M12 20.3s-7.3-4.5-7.3-10.2A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.3 2.7c0 5.7-7.3 10.2-7.3 10.2z';
const DIRECOES = direcoesDasFaiscas();
const ID_DO_ESTILO = 'duotone-coracao-animado';
const quadros = (nome: string, pontos: readonly (readonly [number, number])[]) =>
  `@keyframes ${nome}{${pontos.map(([e, t]) => `${Math.round(t * 100)}%{transform:scale(${e})}`).join('')}}`;

/**
 * O CSS vive no documento de quem o desenha, e não no da casca: o mini leitor
 * é outra janela, com outro documento (`janelaMini.web.tsx`).
 */
function garantirEstilo(doc: Document): void {
  if (doc.getElementById(ID_DO_ESTILO)) return;
  const estilo = doc.createElement('style');
  estilo.id = ID_DO_ESTILO;
  estilo.textContent = `
    .ca{position:relative;display:inline-grid;place-items:center;pointer-events:none;flex:none}
    .ca svg{display:block;overflow:visible}
    .ca svg *{transform-box:view-box}
    .ca .ca-contorno{fill:none;stroke:currentColor;stroke-width:1.8;stroke-linejoin:round}
    .ca .ca-cheio{fill:currentColor;transform-origin:12px 13.5px}
    .ca .ca-ponto{position:absolute;left:50%;top:50%;border-radius:50%;background:currentColor;opacity:0}
    .ca-por svg{animation:ca-mola ${DURACAO.mola}ms cubic-bezier(.3,1.5,.5,1) both}
    .ca-por .ca-cheio{animation:ca-aparece ${DURACAO.aparece}ms both}
    .ca-por .ca-ponto{animation:ca-faisca ${DURACAO.faiscas}ms cubic-bezier(.2,.8,.3,1) both}
    .ca-tirar .ca-cheio{animation:ca-encolhe ${DURACAO.encolhe}ms cubic-bezier(.5,0,.8,.5) both}
    .ca-tirar svg{animation:ca-respira ${DURACAO.respira}ms ease-out both}
    ${quadros('ca-mola', MOLA)}
    ${quadros('ca-respira', RESPIRA)}
    @keyframes ca-aparece{0%{opacity:0}100%{opacity:1}}
    @keyframes ca-encolhe{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(0)}}
    @keyframes ca-faisca{0%{opacity:0;transform:translate(0,0) scale(.6)}20%{opacity:1}100%{opacity:0;transform:translate(var(--x),var(--y)) scale(.4)}}
    @media (prefers-reduced-motion: reduce){.ca svg,.ca svg *,.ca .ca-ponto{animation:none !important}}
  `;
  doc.head.appendChild(estilo);
}

/**
 * O coração de guardar, no PC (16/10, `lib/coracaoAoCarregar.ts`): as Faíscas
 * a pôr e o Encolher a tirar, em CSS. Desenho só: o toque é de quem o envolve
 * (`useCoracaoAoCarregar`).
 */
export function CoracaoAnimado({ guardada, pulso, tamanho, cor, corCheio }: Props) {
  const raiz = useRef<HTMLSpanElement>(null);
  const pulsoVisto = useRef(pulso);
  const [animacao, setAnimacao] = useState<{ tipo: AnimacaoDoCoracao; n: number } | null>(null);

  useEffect(() => { if (raiz.current) garantirEstilo(raiz.current.ownerDocument); }, []);
  useEffect(() => {
    if (pulso === pulsoVisto.current) return;
    pulsoVisto.current = pulso;
    setAnimacao((a) => ({ tipo: animacaoPara(guardada), n: (a?.n ?? 0) + 1 }));
  }, [pulso, guardada]);

  const alcance = alcanceDasFaiscas(tamanho);
  const lado = tamanhoDaFaisca(tamanho) - 1;
  return (
    // A chave recomeça as animações a cada toque, mesmo seguidos.
    <span
      key={animacao?.n ?? 0}
      ref={raiz}
      aria-hidden="true"
      className={`ca${animacao ? ` ca-${animacao.tipo}` : ''}`}
      style={{ width: tamanho, height: tamanho, color: guardada ? corCheio : cor }}
    >
      <svg width={tamanho} height={tamanho} viewBox="0 0 24 24">
        <path className="ca-cheio" d={CORACAO} style={{ opacity: guardada ? 1 : 0 }} />
        <path className="ca-contorno" d={CORACAO} />
      </svg>
      {DIRECOES.map((d, i) => (
        <span
          key={i}
          className="ca-ponto"
          style={{
            width: lado, height: lado, margin: -lado / 2,
            ['--x' as any]: `${d.x * alcance}px`, ['--y' as any]: `${d.y * alcance}px`,
          }}
        />
      ))}
    </span>
  );
}
