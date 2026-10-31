import { create } from 'zustand';

/**
 * O painel à direita do PC (Queue e Lyrics): aberto ou fechado, e qual aba.
 * Uma store porque quem o abre (a seta na barra de título, 11/10) e quem o
 * desenha (`PainelDoLeitor.web.tsx`) são componentes diferentes. Guardado no
 * aparelho: reabrir a app conserva o painel e a aba.
 */
export type AbaDoPainel = 'fila' | 'letras' | 'sobre';
const PREFERENCIA = 'duotone:painel-do-leitor';

function lerPreferencia(): { aberto: boolean; aba: AbaDoPainel } {
  try {
    const guardada = JSON.parse(window.localStorage.getItem(PREFERENCIA) ?? 'null');
    return { aberto: guardada?.aberto === true, aba: guardada?.aba === 'letras' || guardada?.aba === 'sobre' ? guardada.aba : 'fila' };
  } catch { return { aberto: false, aba: 'fila' }; }
}

export const usePainelDoLeitor = create<{
  aberto: boolean;
  aba: AbaDoPainel;
  /**
   * O Now Playing está aberto (31/10): ele já tem a fila, a letra e o About no cartão dele, e o
   * painel repetia-os. Fica guardado como estava (`aberto`) e volta quando o Now Playing fecha.
   * Não se guarda no aparelho.
   */
  escondido: boolean;
  abrir: () => void;
  fechar: () => void;
  mudarAba: (aba: AbaDoPainel) => void;
}>((set) => ({
  ...lerPreferencia(),
  escondido: false,
  abrir: () => set({ aberto: true }),
  fechar: () => set({ aberto: false }),
  mudarAba: (aba) => set({ aba }),
}));

usePainelDoLeitor.subscribe((s) => {
  try { window.localStorage.setItem(PREFERENCIA, JSON.stringify({ aberto: s.aberto, aba: s.aba })); } catch { /* sem armazenamento, continua a funcionar */ }
});
