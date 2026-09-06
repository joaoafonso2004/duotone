/**
 * Um download de cada vez, e uma ordem para quem espera.
 *
 * Não é cortesia com a rede: cada job reserva o ficheiro INTEIRO em memória
 * (até 256 MiB, o tecto do downloader), por isso dois em paralelo podiam pedir
 * meio giga num telemóvel. Serializar é o que baixa esse tecto para um.
 *
 * Não há preempção: um download explícito já a meio não é interrompido para dar
 * lugar à reprodução. Interrompê-lo seria fazer falhar uma coisa que o
 * utilizador pediu de propósito — e ele espera pelo fim de UM ficheiro, não de
 * uma fila. Quem chega primeiro acaba; a ordem só decide quem entra a seguir.
 */

/**
 * - `reproducao`: a faixa que está a tocar agora. Ninguém a ultrapassa.
 * - `seguinte`: a faixa a seguir. O crossfade depende de ela estar pronta a
 *   tempo, por isso vem antes de qualquer gravação de fundo.
 * - `explicito`: o utilizador mandou guardar. Importante, mas ninguém está do
 *   outro lado à espera que o som comece.
 */
export type Prioridade = 'reproducao' | 'seguinte' | 'explicito';

const ORDEM: Record<Prioridade, number> = { reproducao: 0, seguinte: 1, explicito: 2 };

const MAX_SIMULTANEOS = 1;
let aDescarregar = 0;
const emEspera: { ordem: number; entrar: () => void }[] = [];

export function pedirVez(prioridade: Prioridade): Promise<void> {
  if (aDescarregar < MAX_SIMULTANEOS) {
    aDescarregar++;
    return Promise.resolve();
  }
  return new Promise((resolver) => {
    emEspera.push({ ordem: ORDEM[prioridade], entrar: () => { aDescarregar++; resolver(); } });
    // O sort do JS é estável: entre iguais, quem pediu primeiro entra primeiro.
    emEspera.sort((a, b) => a.ordem - b.ordem);
  });
}

export function largarVez(): void {
  if (aDescarregar > 0) aDescarregar--;
  emEspera.shift()?.entrar();
}

/** Só para testes e diagnóstico. */
export function estadoDaFila(): { aDescarregar: number; emEspera: number } {
  return { aDescarregar, emEspera: emEspera.length };
}

/** Só para testes: repõe a fila entre casos. */
export function limparFila(): void {
  aDescarregar = 0;
  emEspera.length = 0;
}
