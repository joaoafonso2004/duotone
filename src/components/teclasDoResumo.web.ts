import { useEffect, useRef } from 'react';
import { pausarAtalhosDaJanela } from '../desktop/useAtalhosDaJanela.web';

/**
 * O teclado da story do mês no PC (1/11, `docs/recap-maquete.html`): → e ←
 * mudam de página, o Espaço pausa, o Esc fecha.
 *
 * Os atalhos da janela ficam parados enquanto a story está aberta: ouvem na
 * captura, antes de toda a gente, e o Espaço pausava a música por baixo em vez
 * da story (e as setas saltavam de faixa).
 */
export type AcoesDoTeclado = { seguinte: () => void; anterior: () => void; pausa: () => void; fechar: () => void };

export function useTeclasDoResumo(acoes: AcoesDoTeclado): void {
  const ultimas = useRef(acoes);
  ultimas.current = acoes;
  useEffect(() => {
    pausarAtalhosDaJanela(true);
    const aoCarregar = (e: KeyboardEvent) => {
      const a = ultimas.current;
      const fazer = e.key === 'ArrowRight' ? a.seguinte : e.key === 'ArrowLeft' ? a.anterior
        : e.key === ' ' ? a.pausa : e.key === 'Escape' ? a.fechar : null;
      if (!fazer) return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) fazer();
    };
    window.addEventListener('keydown', aoCarregar, true);
    return () => {
      window.removeEventListener('keydown', aoCarregar, true);
      pausarAtalhosDaJanela(false);
    };
  }, []);
}
