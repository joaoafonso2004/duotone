/**
 * O coração de guardar uma música, nas duas plataformas (16/10, pedido do
 * João; `docs/favorito-animacao.html`).
 *
 * - **Reage ao CARREGAR, não ao largar.** O desenho muda e anima no instante
 *   do toque (`onPressIn`); a ação corre ao largar (`onPress`), como antes. Se
 *   o toque não chega a ser um toque -- virou scroll numa conversa, ou o rato
 *   saiu antes de largar --, o coração volta ao que estava. Ver
 *   `hooks/useCoracaoAoCarregar.ts`.
 * - **Pôr: as Faíscas** (a 3 da maquete): o cheio aparece, o coração dá uma
 *   mola e seis pontos saem e somem.
 * - **Tirar: Encolher** (a D): o cheio encolhe até ao centro e desaparece, e o
 *   contorno respira.
 * - **Só anima quando se toca.** Mudar de música, a resposta do servidor ou o
 *   outro aparelho mudam o estado sem animação: o `pulso` é que a dispara.
 *
 * Sem imports: os números das duas versões vêm daqui
 * (`scripts/test-coracao-ao-carregar.ts`).
 */

export type AnimacaoDoCoracao = 'por' | 'tirar';

/** O que o toque anima, pelo estado que passa a mostrar. */
export const animacaoPara = (guardada: boolean): AnimacaoDoCoracao => (guardada ? 'por' : 'tirar');

/** Durações (ms). Curtas: um toque seguido de outro não espera por nada. */
export const DURACAO = {
  /** Pôr: o cheio aparece. */
  aparece: 120,
  /** Pôr: a mola do coração (encolhe ao tocar, passa e assenta). */
  mola: 380,
  /** Pôr: as faíscas a sair. */
  faiscas: 460,
  /** Tirar: o cheio encolhe até ao centro. */
  encolhe: 260,
  /** Tirar: o contorno respira. */
  respira: 420,
} as const;

/** A mola de pôr: [escala, fração do tempo]. Começa no aperto do dedo. */
export const MOLA: readonly (readonly [number, number])[] = [[0.86, 0], [1.14, 0.55], [1, 1]];
/** O respirar de tirar. */
export const RESPIRA: readonly (readonly [number, number])[] = [[0.9, 0], [0.84, 0.4], [1.05, 0.75], [1, 1]];

export const FAISCAS = 6;

/** Para onde vai cada faísca (vetor unitário), a primeira para cima. */
export function direcoesDasFaiscas(n = FAISCAS): { x: number; y: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const angulo = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.round(Math.cos(angulo) * 1000) / 1000, y: Math.round(Math.sin(angulo) * 1000) / 1000 };
  });
}

/** Até onde vão as faíscas, para um coração deste tamanho. */
export const alcanceDasFaiscas = (tamanho: number): number => Math.round(tamanho * 0.85);

/** O tamanho de cada faísca. */
export const tamanhoDaFaisca = (tamanho: number): number => Math.max(3, Math.round(tamanho * 0.16));
