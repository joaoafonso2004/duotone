import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lerCelulasDaCapa } from '../lib/celulasDaCapa';
import { misturarTemas, temaDaCapa } from '../lib/corDaCapa';

/**
 * O acento da app: ou é o metal do símbolo, ou é a capa que manda.
 *
 * Havia oito cores fixas à escolha. Saíram todas: uma paleta de arco-íris não
 * é identidade nenhuma, e nenhuma delas dizia o que a app é. Ficam dois modos
 * -- o steel, que é a cor do próprio símbolo, e o `cover`, que segue a capa
 * do que está a tocar.
 *
 * A forma do `AccentTheme` não mudou de propósito: são vinte e sete sítios a
 * ler `theme.color`, `theme.soft` e `theme.gradient`, e nenhum deles precisa
 * de saber de onde a cor veio.
 */

export type { ThemeMode, AccentColorName, AccentTheme } from '../lib/modoDoTema';
export { STEEL, modoGuardado } from '../lib/modoDoTema';

import { modoGuardado, STEEL, type AccentTheme, type ThemeMode } from '../lib/modoDoTema';

const CHAVE = 'pref:accentTheme';

/** Duração da passagem de uma cor para a outra. */
const TRANSICAO_MS = 380;
/** Passos da transição. Mais do que isto não se vê; menos, salta. */
const PASSOS = 14;

interface ThemeState {
  mode: ThemeMode;
  theme: AccentTheme;
  /** O que a capa actual deu, ou o steel. É o destino da transição. */
  destino: AccentTheme;
  setMode: (mode: ThemeMode) => Promise<void>;
  loadTheme: () => Promise<void>;
  /** Diz qual é a capa a tocar. Sem efeito nenhum fora do modo `cover`. */
  aplicarCapa: (uri: string | null | undefined) => Promise<void>;
}

/**
 * A cor lida de cada capa, guardada por endereço.
 *
 * Ler uma capa custa uma descodificação; voltar atrás na fila ou repetir a
 * mesma música não tem de a pagar outra vez. E como a leitura é
 * determinística, o que está em cache é exactamente o que se voltaria a obter.
 */
const lidas = new Map<string, AccentTheme | null>();

/** Cancela a animação a meio quando chega outra capa antes de esta acabar. */
let animacao: ReturnType<typeof setTimeout> | undefined;
/** Distingue pedidos: uma capa lenta não pode pintar por cima de uma recente. */
let pedido = 0;

export const useTheme = create<ThemeState>((set, get) => ({
  mode: 'steel',
  theme: STEEL,
  destino: STEEL,

  setMode: async (mode) => {
    const alvo = mode === 'cover' ? get().destino : STEEL;
    set({ mode, theme: alvo, destino: alvo });
    await AsyncStorage.setItem(CHAVE, mode);
  },

  loadTheme: async () => {
    const guardado = await AsyncStorage.getItem(CHAVE);
    set({ mode: modoGuardado(guardado), theme: STEEL, destino: STEEL });
  },

  aplicarCapa: async (uri) => {
    if (get().mode !== 'cover') return;

    const meu = ++pedido;
    let alvo: AccentTheme;

    if (!uri) {
      alvo = STEEL;
    } else if (lidas.has(uri)) {
      alvo = lidas.get(uri) ?? STEEL;
    } else {
      const celulas = await lerCelulasDaCapa(uri);
      const lido = temaDaCapa(celulas);
      lidas.set(uri, lido);
      alvo = lido ?? STEEL;
    }

    // Enquanto se lia esta capa já mudou a música: quem chegou depois manda.
    if (meu !== pedido || get().mode !== 'cover') return;

    const partida = get().theme;
    set({ destino: alvo });
    if (partida.color === alvo.color) {
      set({ theme: alvo });
      return;
    }

    // A transição vive aqui e não em cada ecrã: mexer no tema da loja anima os
    // vinte e sete sítios de uma vez, e nenhum deles tem de saber disso. Um
    // salto de cor a cada faixa era o que fazia isto parecer um erro em vez de
    // uma escolha.
    clearTimeout(animacao);
    let passo = 0;
    const andar = () => {
      if (meu !== pedido) return;
      passo++;
      set({ theme: passo >= PASSOS ? alvo : misturarTemas(partida, alvo, passo / PASSOS) });
      if (passo < PASSOS) animacao = setTimeout(andar, TRANSICAO_MS / PASSOS);
    };
    animacao = setTimeout(andar, TRANSICAO_MS / PASSOS);
  },
}));
