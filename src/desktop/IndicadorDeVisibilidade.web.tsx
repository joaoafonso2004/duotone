import React from 'react';
import { Pressable } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useVisibilidade } from '../hooks/useVisibilidade';
import { avisoDaTroca } from '../lib/visibilidade';
import { definirPrivacidade, usePrivacidade } from '../state/privacidade';
import { desktop, ui } from './ui.web';

const P = Pressable as any;

/** O tamanho dos ícones do `IconButton` ao lado, para o olho não destoar. */
const TAMANHO = 19;
/**
 * As duas pálpebras são a mesma curva, uma virada ao contrário da outra. É
 * isso que faz o piscar: fechar é virar a de cima sobre o centro do olho, e ela
 * vai assentar exatamente em cima da de baixo.
 */
const PALPEBRA_DE_CIMA = 'M2.5 12Q12 1.5 21.5 12';
const PALPEBRA_DE_BAIXO = 'M2.5 12Q12 22.5 21.5 12';
/** Perpendiculares à pálpebra de baixo. Só aparecem de olho fechado. */
const PESTANAS = 'M7.2 15.9 6.2 17.8M12 17.2v2.2M16.8 15.9l1 1.9';
/**
 * Fechado, o que sobra do olho é a metade de baixo, e ficava descaído no
 * botão. Sobe isto para voltar a ficar ao centro.
 */
const SUBIDA_FECHADO = 3.5;
const CURVA = 'cubic-bezier(.4,0,.2,1)';

type Transicao = [propriedade: string, ms: number, atraso?: number];

/**
 * "Quem vê isto?" -- um olho na barra do leitor, ao lado do Jam.
 *
 * Aberto: os amigos veem o que está a tocar (e o Discord, se estiver ligado).
 * Fechado: escuta privada. Um clique fecha-o ou abre-o. Dentro de um Jam fica
 * aberto e o clique abre o Jam, porque quem lá está ouve na mesma, com privada
 * ou sem ela. A regra e os textos são os do iPhone (lib/visibilidade.ts).
 *
 * Era uma pílula com o nome do estado ("Friends", "Discord", "Private") e saiu
 * a 11/9/2026, por decisão do João. O que ela dizia continua no tooltip e no
 * aviso que aparece ao carregar -- é aí que se fica a saber se o Discord vê.
 *
 * Um SVG e não o `eye-off` do Ionicons: esse é um olho riscado, não um olho
 * fechado, e trocar de ícone não mostra a pálpebra a descer. As transições
 * são CSS, em `style`: é um SVG do DOM, e o Animated do React Native não lhe
 * chega.
 */
export function IndicadorDeVisibilidade({ discordLigado, onJam, onAviso }: {
  discordLigado: boolean;
  onJam: () => void;
  onAviso?: (mensagem: string) => void;
}) {
  const v = useVisibilidade(discordLigado);
  const reduzido = useReducedMotion();
  const fechado = v.estado === 'privada';
  const texto = `${v.descricao} ${v.dica}.`;

  const carregar = () => {
    if (v.acao === 'abrirJam') { onJam(); return; }
    const privada = !usePrivacidade.getState().privada;
    void definirPrivacidade(privada);
    onAviso?.(avisoDaTroca(privada, discordLigado));
  };

  // Valem as do estado para onde se vai. A fechar, a pupila some-se primeiro e
  // as pestanas só aparecem com a pálpebra em baixo; a abrir, o contrário.
  const transicao = (...partes: Transicao[]) => reduzido
    ? 'none'
    : partes.map(([p, ms, atraso = 0]) => `${p} ${ms}ms ${CURVA} ${atraso}ms`).join(', ');

  return <P
    className="control-btn-animate"
    onPress={carregar}
    accessibilityRole="button"
    accessibilityLabel={texto}
    // A mesma ordem do IconButton: o ligado por último, para o hover não o
    // apagar -- a cor de hover é mais escura do que a de ligado.
    style={({ hovered, focused, pressed }: any) => [
      ui.iconButton, (hovered || focused) && ui.iconButtonHover, pressed && ui.pressed, fechado && ui.active,
    ]}
  >
    <svg
      width={TAMANHO} height={TAMANHO} viewBox="0 0 24 24" aria-hidden
      fill="none" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      style={{ overflow: 'visible', stroke: fechado ? desktop.accent : desktop.muted, transition: transicao(['stroke', 200]) }}
    >
      <title>{texto}</title>
      <g style={{
        transform: `translateY(${fechado ? -SUBIDA_FECHADO : 0}px)`,
        transition: transicao(['transform', 240]),
      }}>
        <path d={PALPEBRA_DE_BAIXO} />
        <path d={PALPEBRA_DE_CIMA} style={{
          transformOrigin: '12px 12px',
          transform: `scaleY(${fechado ? -1 : 1})`,
          transition: transicao(['transform', 240]),
        }} />
        <circle cx={12} cy={12} r={3.2} style={{
          transformOrigin: '12px 12px',
          transform: `scale(${fechado ? 0 : 1})`,
          opacity: fechado ? 0 : 1,
          transition: fechado
            ? transicao(['transform', 120], ['opacity', 120])
            : transicao(['transform', 180, 110], ['opacity', 180, 110]),
        }} />
        <path d={PESTANAS} style={{
          opacity: fechado ? 1 : 0,
          transition: fechado ? transicao(['opacity', 160, 150]) : transicao(['opacity', 90]),
        }} />
      </g>
    </svg>
  </P>;
}
