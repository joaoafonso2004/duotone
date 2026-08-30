/**
 * Velocidade de reprodução.
 *
 * Substituiu os três presets ("Slowed / Normal / Fast"), que além de serem só
 * três não concordavam entre si: o "rápido" era 1,5 no telemóvel e 1,35 no PC.
 *
 * **O mínimo é 0,25 e não 0,2.** Medido no IFrame do YouTube: pede-se 0,2 e
 * ele fixa 0,25; de 0,3 para cima respeita o valor ao certo, incluindo os que
 * não estão na lista que ele anuncia. Deixar a barra chegar a 0,2 era um
 * controlo a mentir — mostrava um número que o motor não usava.
 *
 * Sem imports de runtime, testável em Node puro
 * (`scripts/test-playback-rate.ts`), como o `lib/radio.ts`.
 */

/** O primeiro degrau é o mínimo real do motor; daí para cima vai de 0,1 em 0,1. */
export const PASSOS: readonly number[] = (() => {
  const p = [0.25];
  for (let v = 3; v <= 20; v++) p.push(v / 10);
  return p;
})();

export const RATE_MINIMO = PASSOS[0];
export const RATE_MAXIMO = PASSOS[PASSOS.length - 1];
export const RATE_NORMAL = 1;

/** Arredonda para o degrau mais próximo, e prende nas pontas. */
export function arredondar(valor: number): number {
  if (!Number.isFinite(valor)) return RATE_NORMAL;
  if (valor <= RATE_MINIMO) return RATE_MINIMO;
  if (valor >= RATE_MAXIMO) return RATE_MAXIMO;
  let melhor = PASSOS[0];
  let dist = Infinity;
  for (const p of PASSOS) {
    const d = Math.abs(p - valor);
    // `<` e não `<=`: com empate fica o degrau mais baixo, que é o que o
    // utilizador vê à esquerda do dedo.
    if (d < dist) { dist = d; melhor = p; }
  }
  return melhor;
}

/** Posição na barra (0..1) a partir da velocidade. Os degraus ficam
 * IGUALMENTE espaçados: o 0,25 e o 0,3 estão colados em valor, mas na barra
 * têm de ter o mesmo espaço que os outros, senão o primeiro é impossível de
 * agarrar. */
export function paraFraccao(valor: number): number {
  const i = PASSOS.indexOf(arredondar(valor));
  return i < 0 ? 0 : i / (PASSOS.length - 1);
}

export function daFraccao(fraccao: number): number {
  const f = Math.max(0, Math.min(1, Number.isFinite(fraccao) ? fraccao : 0));
  return PASSOS[Math.round(f * (PASSOS.length - 1))];
}

/** Um degrau para cada lado, para as setas do teclado. */
export function passo(valor: number, direccao: 1 | -1): number {
  const i = PASSOS.indexOf(arredondar(valor));
  const j = Math.max(0, Math.min(PASSOS.length - 1, (i < 0 ? 0 : i) + direccao));
  return PASSOS[j];
}

/** "1×" para o normal, "0.25×" e "1.4×" para o resto. O `×` é o sinal, não a
 * letra x. */
export function formatar(valor: number): string {
  const v = arredondar(valor);
  if (v === RATE_NORMAL) return '1×';
  return `${v % 1 === 0 ? v.toFixed(0) : String(v)}×`;
}

export function eNormal(valor: number): boolean {
  return arredondar(valor) === RATE_NORMAL;
}

/**
 * Migração dos três presets antigos. Um utilizador que tinha "Slowed" não pode
 * abrir a app e encontrá-la a 1× — o que ele escolheu tem de sobreviver.
 * Os valores são os que os presets usavam mesmo, arredondados ao degrau.
 */
export function daPreferenciaAntiga(preset: string | null | undefined): number {
  // Explicito e nao por arredondamento: o "slowed" era 0,85, que fica
  // exatamente a meio de dois degraus, e nao se decide uma migracao num
  // empate. Vai para o degrau mais LENTO — se estava em slowed, tem de
  // continuar lento.
  if (preset === 'slowed') return 0.8;
  if (preset === 'fast') return 1.4;
  return RATE_NORMAL;
}
