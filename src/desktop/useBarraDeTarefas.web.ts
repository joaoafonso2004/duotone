import { useEffect, useRef } from 'react';
import { usePlayer } from '../state/player';
import { executarAtalhoDoIcone } from '../state/atalhosDoIcone';

/**
 * A barra de tarefas do Windows (10/10, electron/barraDeTarefas.cjs).
 *
 * - Diz ao processo principal se há música e se está a tocar, para os botões
 *   da miniatura (anterior, tocar/pausa, seguinte). Só quando isso muda: duas
 *   mensagens por música, no máximo.
 * - Executa a lista de saltos do ícone (Resume, Daily mix, Shuffle Liked
 *   Songs), as mesmas ações do ícone do iPhone. Montado na casca, que só
 *   existe com conta; a ação de quem abriu a app por ali fica à espera no
 *   processo principal até aqui a tirar.
 */
export function useBarraDeTarefas(avisar: (texto: string) => void): void {
  const avisarRef = useRef(avisar);
  avisarRef.current = avisar;

  useEffect(() => {
    const ponte = typeof window !== 'undefined' ? window.duotoneDesktop : undefined;
    if (!ponte?.estadoDaBarra) return;
    const publicar = (s: { isPlaying: boolean; current: unknown }) =>
      ponte.estadoDaBarra?.({ aTocar: s.isPlaying, temFaixa: !!s.current });
    publicar(usePlayer.getState());
    return usePlayer.subscribe((s, antes) => {
      if (s.isPlaying !== antes.isPlaying || !!s.current !== !!antes.current) publicar(s);
    });
  }, []);

  useEffect(() => {
    const ponte = typeof window !== 'undefined' ? window.duotoneDesktop : undefined;
    if (!ponte?.tirarAcaoDaBarra) return;
    let viva = true;
    const tirar = () => {
      void ponte.tirarAcaoDaBarra?.().then((acao) => {
        if (!viva || !acao) return;
        void executarAtalhoDoIcone(acao, (titulo, detalhe) => avisarRef.current(detalhe ? `${titulo} ${detalhe}` : titulo))
          .catch(() => {});
      }).catch(() => {});
    };
    tirar();
    const sair = ponte.onAcaoDaBarra?.(tirar);
    return () => { viva = false; sair?.(); };
  }, []);
}
