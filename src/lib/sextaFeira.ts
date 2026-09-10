/**
 * Quando é que o cartaz da semana aparece.
 *
 * ## Uma vez por semana, à sexta, e nunca duas
 *
 * A regra é simples de dizer e chata de acertar: é sexta-feira, e ainda não se
 * mostrou o cartaz DESTA semana. Guardar "mostrei hoje" não chega -- quem abrir
 * a app à meia-noite e um de sábado não devia ver o de ontem, e quem não a
 * abrir na sexta também não devia perder a semana toda.
 *
 * ## A semana conta-se a partir da sexta
 *
 * Por isso a chave não é o dia nem o número da semana ISO (que começa à
 * segunda, e partiria a sexta-feira ao meio). É **a data da última sexta**: na
 * sexta é o próprio dia, no sábado ainda é a de ontem, na quinta é a da semana
 * passada. Duas aberturas na mesma janela dão a mesma chave e a segunda não
 * mostra nada.
 *
 * ## E se não abrir na sexta?
 *
 * Vê-o no sábado, ou no domingo. A janela fica aberta até à sexta seguinte, e
 * é isso que o `dentroDaJanela` decide. Um cartaz que só existe durante 24
 * horas é um cartaz que quase ninguém vê.
 *
 * Tudo em hora LOCAL: a sexta-feira de quem lê é a dele, não a de Greenwich.
 *
 * Sem imports de runtime: `scripts/test-sexta-feira.ts` corre em Node puro.
 */

/** Sexta. `getDay()` conta de domingo (0) a sábado (6). */
export const SEXTA = 5;
/** Quantos dias depois da sexta o cartaz ainda se mostra. */
export const DIAS_DE_JANELA = 3;

/**
 * A data da última sexta-feira à meia-noite, em hora local, como `AAAA-MM-DD`.
 *
 * É a chave da semana: duas aberturas dentro da mesma janela dão a mesma.
 */
export function chaveDaSemana(agora: Date): string {
  const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  // Quantos dias andar para trás até à sexta. No próprio dia é zero.
  d.setDate(d.getDate() - ((d.getDay() - SEXTA + 7) % 7));
  const mes = `${d.getMonth() + 1}`.padStart(2, '0');
  const dia = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Estamos dentro da janela desta semana (sexta a domingo)? */
export function dentroDaJanela(agora: Date): boolean {
  return (agora.getDay() - SEXTA + 7) % 7 < DIAS_DE_JANELA;
}

/**
 * Mostra-se o cartaz?
 *
 * `vistaEm` é a chave da última semana em que ele foi mostrado -- vazio na
 * primeira vez de sempre.
 */
export function mostrarCartaz(agora: Date, vistaEm: string | null | undefined): boolean {
  if (!dentroDaJanela(agora)) return false;
  return chaveDaSemana(agora) !== (vistaEm ?? '');
}
