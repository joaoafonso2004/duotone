/**
 * Quem está mesmo lá, e quando se pode arrancar.
 *
 * As duas perguntas que separam uma demonstração de uma coisa que se usa. A
 * onda 3 fez a sessão funcionar quando corre tudo bem; isto é sobre o resto.
 *
 * Puro e sem imports: testável sem rede, sem áudio e sem duas pessoas. Ver
 * `scripts/test-sessao-viva.ts`.
 */

/**
 * Uma pessoa só conta como presente se bateu à porta há pouco.
 *
 * Sair pela app envia um `p_end` e a linha desaparece. Mas ninguém sai sempre
 * pela app: fecha-se à bruta, a bateria acaba, o metro entra num túnel. Sem
 * isto, essas pessoas ficavam na lista para sempre -- e uma sessão com dois
 * fantasmas é pior do que uma sessão sozinha, porque diz uma coisa falsa em vez
 * de não dizer nada.
 *
 * Dois batimentos e meio de folga: o cliente bate de 30 em 30 segundos, e um
 * atraso de rede não pode fazer alguém piscar para fora da lista.
 */
export const PRESENCA_VALIDA_MS = 75_000;

export type MembroVisto = { userId: string; vistoEm: number; pronta: boolean };

export function estaPresente(m: MembroVisto, agora: number): boolean {
  // `vistoEm` no futuro quer dizer relógio local atrasado face ao servidor.
  // Contar como presente é melhor do que esconder alguém sem motivo.
  return agora - m.vistoEm <= PRESENCA_VALIDA_MS;
}

export function presentes<T extends MembroVisto>(membros: readonly T[], agora: number): T[] {
  return membros.filter((m) => estaPresente(m, agora));
}

/**
 * Quanto tempo o anfitrião espera por quem ainda não tem a faixa.
 *
 * No Duotone tocar uma faixa é descarregá-la primeiro: cinco a trinta segundos,
 * e a fila de downloads só deixa passar um de cada vez. Arrancar sem esperar
 * põe o convidado a entrar a meio de todas as músicas.
 *
 * Mas o tecto não é opcional. Sem ele, um amigo em 3G mau congela a sessão
 * inteira e ninguém percebe porquê -- e "às vezes não toca" é pior do que
 * "entrou a meio". Oito segundos é o tempo em que um ficheiro normal chega numa
 * rede normal, e curto o suficiente para a espera não parecer avaria.
 */
export const ESPERA_MAXIMA_MS = 8000;

export type DecisaoDeArranque =
  /** Estão todos prontos, ou já se esperou o que havia a esperar. */
  | { tipo: 'arrancar' }
  /** Falta gente e ainda há tempo. `faltam` é para a linha de estado. */
  | { tipo: 'esperar'; faltam: number };

/**
 * Arranca-se já, ou espera-se mais um bocado?
 *
 * `desdeQuandoMs` conta desde que a faixa foi escolhida, e não desde que este
 * cliente reparou nisso -- quem chega tarde à decisão não pode reiniciar a
 * contagem para toda a gente.
 */
export function decisaoDeArranque(entrada: {
  membros: readonly MembroVisto[];
  agora: number;
  desdeQuandoMs: number;
}): DecisaoDeArranque {
  const { membros, agora, desdeQuandoMs } = entrada;
  if (desdeQuandoMs >= ESPERA_MAXIMA_MS) return { tipo: 'arrancar' };
  // Só conta quem está presente: esperar por um fantasma é esperar para sempre.
  const emFalta = presentes(membros, agora).filter((m) => !m.pronta).length;
  return emFalta === 0 ? { tipo: 'arrancar' } : { tipo: 'esperar', faltam: emFalta };
}

/**
 * O que a barra da sessão diz, numa frase.
 *
 * Vive aqui e não no componente porque é uma DECISÃO -- qual das verdades
 * mostrar quando há várias -- e as decisões testam-se. A regra: enquanto
 * alguém não consegue ouvir, é isso que interessa; a lista de presentes pode
 * esperar.
 */
export function estadoDaSessao(entrada: {
  /** Todos menos nós. */
  outros: readonly (MembroVisto & { nome: string; percentagem: number })[];
  agora: number;
}): string {
  const cá = presentes(entrada.outros, entrada.agora);
  if (cá.length === 0) return 'Waiting for your friends';

  const aEsperar = cá.filter((m) => !m.pronta);
  if (aEsperar.length === 1) {
    return `${aEsperar[0]!.nome} · ${aEsperar[0]!.percentagem}%`;
  }
  if (aEsperar.length > 1) return `${aEsperar.length} still loading`;

  if (cá.length === 1) return `Listening with ${cá[0]!.nome}`;
  return `Listening with ${cá.length} friends`;
}
