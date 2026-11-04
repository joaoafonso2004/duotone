/**
 * A barra de volume do PC numa curva de OUVIDO (16/10, João: "perto do mínimo
 * fica quase tão alto como no máximo"; 4/11: "nos mínimos chega a um ponto que
 * não baixa mais o volume, fica igual, e depois fica muito alto a meio, não é
 * constante").
 *
 * O leitor do PC é o IFrame do YouTube, e o `setVolume` dele é linear na
 * amplitude e só aceita INTEIROS de 0 a 100 -- medido no Electron: o `<video>`
 * fica em `barra × normalização` (0,68 numa música alta). São essas duas
 * coisas que decidem tudo o que está aqui.
 *
 * O ouvido conta em dB e não em amplitude, por isso é em dB que a barra tem de
 * andar: cada ponto dela vale a mesma mudança de som que qualquer outro. A
 * curva quadrática de 16/10 não fazia isso -- a 15% da barra, 1% dela valia
 * 3,5 dB; a 70%, valia 0,18 dB. Vinte vezes mais sensível em baixo do que em
 * cima: era o "não é constante", e era também o que punha o meio da barra
 * alto, porque quase todo o silêncio estava espremido no primeiro quinto.
 *
 * A ZONA PARADA, e porque não desaparece de vez: com inteiros na amplitude o
 * motor só tem 1, 2, 3…, e de 1 para 2 vão 6 dB. Há sempre um bocado da barra,
 * lá em baixo, que cai todo no mesmo inteiro. O que se corrige é quanto é que
 * esse bocado PROMETIA mudar -- é a promessa falhada que se nota, não a zona.
 * A quadrática parava 12,2% da barra depois de prometer ali 83 dB (o "não
 * baixa mais"); esta pára 7,3% a prometer 2,2 dB, que ninguém ouve. Tirá-la a
 * sério obrigava a passar o volume por um GainNode do grafo do equalizador
 * (`electron/main.cjs`), que hoje só é instalado quando o EQ é usado.
 *
 * O MÁXIMO é o mesmo (100% continua a ser 100): nada de ganho artificial. O
 * teto de cada música é a normalização do YouTube, que baixa as mais altas.
 *
 * Puro, sem imports: `scripts/test-curva-do-volume.ts`.
 */

/**
 * O fundo da barra, logo acima do zero. Mais fundo dava mais alcance e mais
 * zona parada (a -40 dB são 11% da barra a prometer 4,4 dB); mais raso dava o
 * contrário, e um mínimo que já não é um mínimo. -30 dB é onde as duas coisas
 * se cruzam.
 */
export const PISO_DB = -30;

/** A percentagem da barra (0-100) para o `setVolume` do player (0-100, inteiro). */
export function volumeParaOMotor(percentagem: number): number {
  const p = Math.max(0, Math.min(100, Number(percentagem) || 0)) / 100;
  if (p === 0) return 0;
  // Linear em dB: logo acima do zero é PISO_DB, 100% é 0 dB.
  return Math.max(1, Math.round(100 * 10 ** ((PISO_DB * (1 - p)) / 20)));
}

/** Os dB abaixo do máximo a que a barra manda tocar, já com o arredondamento
 * do motor. É o que a maquete desenha e o que o teste mede. */
export function dbDaBarra(percentagem: number): number {
  const motor = volumeParaOMotor(percentagem);
  return motor === 0 ? -Infinity : 20 * Math.log10(motor / 100);
}

/** Onde pôr a barra para soar a estes dB. O inverso da curva, sem o motor. */
function barraParaOsDb(db: number): number {
  const p = 1 + db / Math.abs(PISO_DB);
  return Math.round(Math.max(1, Math.min(100, p * 100)));
}

/**
 * Quem tinha um volume guardado na barra LINEAR (antes de 16/10): a mesma
 * altura na curva de agora.
 */
export function barraParaACurva(volumeLinear: number): number {
  const v = Math.max(0, Math.min(100, Number(volumeLinear) || 0));
  if (v === 0) return 0;
  return barraParaOsDb(20 * Math.log10(v / 100));
}

/**
 * Quem tinha um volume guardado na barra QUADRÁTICA (de 16/10 a 4/11): a mesma
 * altura na curva nova, para nada mudar de som ao abrir esta versão. Quem
 * estava abaixo do piso novo não tem sítio onde ficar -- vai para o fundo da
 * barra, que é o mais perto que há.
 */
export function curvaQuadraticaParaDb(barraQuadratica: number): number {
  const b = Math.max(0, Math.min(100, Number(barraQuadratica) || 0));
  if (b === 0) return 0;
  // A antiga mandava `b²/100` ao motor, ou seja 40·log10(b) - 80 dB.
  return barraParaOsDb(40 * Math.log10(b) - 80);
}
