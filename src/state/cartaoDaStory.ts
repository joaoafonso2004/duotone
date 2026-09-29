import { create } from 'zustand';
import type { Track } from '../types';

/**
 * Qual música está no cartão das Stories (29/9, `lib/cartaoDaStory.ts`), ou
 * nenhuma. Uma store e não um estado de ecrã: no PC abre-se do menu das
 * listas, da fila e do chat, e quem desenha o diálogo é um só
 * (`desktop/CartaoDaStory.web.tsx`); no iPhone, do "…" do leitor.
 */
export const useCartaoDaStory = create<{
  faixa: Track | null;
  abrir: (faixa: Track) => void;
  fechar: () => void;
}>((set) => ({
  faixa: null,
  abrir: (faixa) => set({ faixa }),
  fechar: () => set({ faixa: null }),
}));
