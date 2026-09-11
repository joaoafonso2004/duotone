/**
 * Os tempos da abertura -- o eclipse que se abre no logo quando a app liga.
 *
 * Vivem aqui, sem imports, para o `scripts/test-abertura.ts` os poder comparar
 * com o próprio `assets/abertura.webp`: a animação está dentro do ficheiro e
 * quem a corta é um temporizador. Se alguém gerar outro ficheiro com outra
 * duração, o teste parte antes de a app cortar o reflexo a meio -- ou de ficar
 * a olhar para um logo parado.
 */
export const ABERTURA = {
  /** Do anel de luz ao logo feito, com o reflexo incluído. */
  animacaoMs: 1000,
  /** O logo fica um instante parado antes de sair. */
  seguraMs: 120,
  /** A saída: o véu some e o logo cresce um pouco, ao mesmo tempo. */
  saidaMs: 300,
  /** Quanto o logo cresce na saída (4%). */
  crescimento: 0.04,
  /**
   * Se o ficheiro não carregar até aqui, não há abertura: sai-se.
   *
   * Não é apertado de propósito: no arranque a thread de JavaScript está
   * ocupada a montar a app inteira. Medido no PC (modo de desenvolvimento), o
   * `<img>` entrou aos 185 ms mas o pedido do ficheiro só saiu aos 1003 ms --
   * demorou 3 ms, o resto foi espera pela thread. Com 800 ms aqui, a abertura
   * era cortada antes de começar. No iPhone a imagem carrega fora do JS, mas o
   * `onLoad` também só lá chega quando a thread o puder ouvir.
   */
  esperaPeloFicheiroMs: 1500,
  /**
   * A abertura espera pela app (a sessão lida), mas nunca fica mais do que
   * isto à frente, a contar de quando aparece. Depois fica o ecrã de
   * carregamento de sempre.
   */
  tetoMs: 4000,
} as const;
