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
 *
 * E a fila NÃO PODE ENCRAVAR. Uma vaga que nunca é largada cala a app inteira
 * até alguém a reiniciar: as faixas já descarregadas tocam, as outras ficam
 * paradas em 0:00 e trocar de música não resolve nada. Aconteceu -- por isso
 * cada vaga vem com prazo, e cada uma é identificada, para uma vaga recuperada
 * não ser descontada duas vezes quando o job atrasado finalmente acabar.
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

/**
 * Quanto tempo uma vaga pode estar ocupada antes de se assumir que o job
 * encravou. Generoso de propósito: um ficheiro grande em 4G lento demora, e
 * recuperar uma vaga a um download que ainda anda faz descarregar dois ao mesmo
 * tempo -- mau, mas muito menos mau do que a app parar até ser reiniciada.
 */
const PRAZO_DA_VAGA_MS = 4 * 60 * 1000;

let aDescarregar = 0;
let proximoBilhete = 1;
/** As vagas em curso, e o relógio que as recupera se ninguém as largar. */
const vagas = new Map<number, ReturnType<typeof setTimeout>>();
const emEspera: { ordem: number; entrar: () => void }[] = [];

function ocupar(): number {
  const bilhete = proximoBilhete++;
  aDescarregar++;
  vagas.set(
    bilhete,
    setTimeout(() => {
      if (vagas.delete(bilhete)) libertar();
    }, PRAZO_DA_VAGA_MS)
  );
  return bilhete;
}

function libertar(): void {
  if (aDescarregar > 0) aDescarregar--;
  emEspera.shift()?.entrar();
}

/** Devolve o bilhete da vaga. Tem de ser entregue ao `largarVez`. */
export function pedirVez(prioridade: Prioridade): Promise<number> {
  if (aDescarregar < MAX_SIMULTANEOS) return Promise.resolve(ocupar());
  return new Promise((resolver) => {
    emEspera.push({ ordem: ORDEM[prioridade], entrar: () => resolver(ocupar()) });
    // O sort do JS é estável: entre iguais, quem pediu primeiro entra primeiro.
    emEspera.sort((a, b) => a.ordem - b.ordem);
  });
}

/**
 * Larga a vaga. Um bilhete que já não existe é ignorado -- é o caso do job que
 * acabou depois de o prazo lhe ter recuperado a vaga, e descontá-lo outra vez
 * deixaria a fila a achar que tem lugar a mais.
 */
export function largarVez(bilhete: number): void {
  const relogio = vagas.get(bilhete);
  if (relogio === undefined) return;
  clearTimeout(relogio);
  vagas.delete(bilhete);
  libertar();
}

/** Só para testes e diagnóstico. */
export function estadoDaFila(): { aDescarregar: number; emEspera: number } {
  return { aDescarregar, emEspera: emEspera.length };
}

/** Só para testes: repõe a fila entre casos. */
export function limparFila(): void {
  for (const relogio of vagas.values()) clearTimeout(relogio);
  vagas.clear();
  aDescarregar = 0;
  emEspera.length = 0;
}

/** Só para testes: força o prazo de todas as vagas em curso. */
export function forcarPrazoDasVagas(): void {
  for (const [bilhete, relogio] of [...vagas]) {
    clearTimeout(relogio);
    if (vagas.delete(bilhete)) libertar();
  }
}
