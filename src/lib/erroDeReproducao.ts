import { falhou, type EstadoDeReproducao } from './playbackMachine';

/**
 * O que fazer com um erro de reprodução.
 *
 * Vive à parte porque a decisão não é óbvia: nem todos os erros são falhas.
 * "using embed" é a app a RECUPERAR -- avisa e segue. "failed to load the
 * player item" é a música parada à espera de alguém. Os dois apareciam no
 * mesmo toast vermelho, que desaparecia sozinho ao fim de 4,5 s e levava com
 * ele qualquer hipótese de reagir.
 *
 * A regra: um aviso some-se sozinho; uma falha fica e traz o que fazer.
 * E nunca se salta de faixa sem alguém pedir -- perder o sítio na fila por
 * causa de uma faixa má é pior do que a faixa má.
 */
export type AccaoDeErro = 'repetir' | 'seguinte';

export interface ApresentacaoDoErro {
  mensagem: string;
  /** Some sozinho ao fim de uns segundos. Só quando não há nada a decidir. */
  temporario: boolean;
  accoes: AccaoDeErro[];
}

export function apresentarErro(opts: {
  mensagem: string | null | undefined;
  estado: EstadoDeReproducao;
  /** Há faixa a seguir na fila? Sem ela, oferecer "seguinte" seria mentira. */
  temSeguinte: boolean;
}): ApresentacaoDoErro | null {
  const mensagem = opts.mensagem?.trim();
  if (!mensagem) return null;

  // A reprodução continuou: isto é informação, não um beco sem saída.
  if (!falhou(opts.estado)) {
    return { mensagem, temporario: true, accoes: [] };
  }

  const accoes: AccaoDeErro[] = ['repetir'];
  if (opts.temSeguinte) accoes.push('seguinte');
  return { mensagem, temporario: false, accoes };
}
