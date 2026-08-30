/**
 * Velocidade de reprodução.
 *
 * Substituiu os três presets ("Slowed / Normal / Fast"), que além de serem só
 * três não concordavam entre si: o "rápido" era 1,5 no telemóvel e 1,35 no PC.
 *
 * **Duas granularidades, de propósito.** O intervalo é 0,5×–2×, e a conta que
 * decide isto é de pixels: a 0,01 são 151 posições, o que numa barra de 200 px
 * dá 1,3 px por degrau — não se acerta com o rato, e arrastar passa a ser um
 * sorteio. Por isso o ARRASTO anda de 0,05 (31 posições, ~6 px cada, que a mão
 * agarra) e o TECLADO anda de 0,01, que é onde faz sentido pedir um valor
 * exato. Shift+seta anda 0,1 para atravessar a escala depressa.
 *
 * O mínimo é 0,5: abaixo disso o áudio perde definição a ponto de não valer a
 * pena, e o IFrame do YouTube prende tudo o que é abaixo de 0,25 na mesma.
 *
 * Sem imports de runtime, testável em Node puro
 * (`scripts/test-playback-rate.ts`), como o `lib/radio.ts`.
 */

export const RATE_MINIMO = 0.5;
export const RATE_MAXIMO = 2;
export const RATE_NORMAL = 1;

/** O degrau do teclado: o valor exato que se pode pedir. */
export const PASSO_FINO = 0.01;
/** O degrau do arrasto. Ver o comentário do topo: 0,01 à mão não se acerta. */
export const PASSO_GROSSO = 0.05;
/** Shift+seta, para atravessar a escala sem cem toques. */
export const PASSO_LARGO = 0.1;

/** Tudo por dentro em centésimos, senão 0,5 + 0,01×3 dá 0,53000000000000005 e
 * a barra passa a mostrar números com cauda. */
const CEM = 100;
const MIN_C = Math.round(RATE_MINIMO * CEM);
const MAX_C = Math.round(RATE_MAXIMO * CEM);

/** Arredonda ao degrau mais próximo da granularidade pedida, e prende nas
 * pontas. */
export function arredondar(valor: number, granularidade: number = PASSO_FINO): number {
  if (!Number.isFinite(valor)) return RATE_NORMAL;
  const g = Math.max(1, Math.round(granularidade * CEM));
  const c = Math.round(valor * CEM);
  if (c <= MIN_C) return RATE_MINIMO;
  if (c >= MAX_C) return RATE_MAXIMO;
  // Arredonda a partir do mínimo, para os degraus caírem em 0,5 / 0,55 / 0,60
  // e não em múltiplos absolutos que saltassem o próprio mínimo.
  const preso = MIN_C + Math.round((c - MIN_C) / g) * g;
  return Math.min(MAX_C, Math.max(MIN_C, preso)) / CEM;
}

/** Posição na barra (0..1) a partir da velocidade. Linear: ao contrário da
 * escala antiga, todos os degraus valem o mesmo intervalo. */
export function paraFraccao(valor: number): number {
  const c = Math.round(arredondar(valor) * CEM);
  return (c - MIN_C) / (MAX_C - MIN_C);
}

/** A velocidade a partir da posição na barra. A granularidade por omissão é a
 * do arrasto, que é quem chama isto. */
export function daFraccao(fraccao: number, granularidade: number = PASSO_GROSSO): number {
  const f = Math.max(0, Math.min(1, Number.isFinite(fraccao) ? fraccao : 0));
  return arredondar((MIN_C + f * (MAX_C - MIN_C)) / CEM, granularidade);
}

/** Um degrau para cada lado. Por omissão o do arrasto — quem quer o fino
 * (as setas do teclado) pede-o. */
export function passo(
  valor: number,
  direccao: 1 | -1,
  granularidade: number = PASSO_GROSSO,
): number {
  const g = Math.max(1, Math.round(granularidade * CEM));
  const actual = Math.round(arredondar(valor, granularidade) * CEM);
  return Math.min(MAX_C, Math.max(MIN_C, actual + direccao * g)) / CEM;
}

/** "1×" para o normal, "0.85×" e "1.5×" para o resto — sem zeros à direita a
 * mais. O `×` é o sinal, não a letra x. */
export function formatar(valor: number): string {
  const v = arredondar(valor);
  if (v === RATE_NORMAL) return '1×';
  // toFixed(2) e depois cortar os zeros: 1,50 -> "1.5", 1,05 -> "1.05".
  const texto = v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${texto}×`;
}

export function eNormal(valor: number): boolean {
  return arredondar(valor) === RATE_NORMAL;
}

/**
 * Migração dos três presets antigos. Um utilizador que tinha "Slowed" não pode
 * abrir a app e encontrá-la a 1× — o que ele escolheu tem de sobreviver.
 * Os valores são os que os presets usavam mesmo.
 */
export function daPreferenciaAntiga(preset: string | null | undefined): number {
  if (preset === 'slowed') return 0.8;
  if (preset === 'fast') return 1.4;
  return RATE_NORMAL;
}
