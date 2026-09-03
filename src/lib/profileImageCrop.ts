/**
 * As formas das imagens do perfil, e o recorte que as produz.
 *
 * O envio e a moldura do editor partilham o mesmo rácio. O perfil apresenta
 * a capa como fundo atrás da identidade, com enquadramento adaptado ao ecrã
 * e vinheta; essa apresentação nunca volta a recortar o ficheiro gravado.
 */

/** A capa: larga e baixa. Gravada em 1600×600. */
export const RACIO_DA_CAPA = 8 / 3;

/** A fotografia de perfil: quadrada, porque aparece dentro de um círculo. */
export const RACIO_DO_AVATAR = 1;

/** Recorte proporcional, com ponto focal limitado ao espaço disponível. */
export function imageCrop(width:number,height:number,ratio:number,x=0.5,y=0.5) {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0) throw new Error('Invalid image.');
  const w=Math.floor(Math.min(width,height*ratio));
  const h=Math.floor(Math.min(height,width/ratio));
  return {originX:Math.round((width-w)*Math.max(0,Math.min(1,x))),originY:Math.round((height-h)*Math.max(0,Math.min(1,y))),width:w,height:h};
}

/**
 * Para onde é que o ponto focal vai quando se arrasta o dedo (ou o rato).
 *
 * Arrastar move a IMAGEM, não a moldura: puxar para a direita traz para a
 * vista o que estava à esquerda. Daí o sinal negativo — o recorte anda ao
 * contrário do dedo.
 *
 * `livre` é quanto espaço existe para andar nesse eixo, em píxeis da imagem
 * original. Quando é zero a imagem já encaixa certa nessa direção e não há
 * nada para ajustar: devolve-se o valor que lá estava, em vez de dividir por
 * zero e ficar com NaN.
 */
export function arrastarFoco(
  focoActual:number,
  deslocamentoNoEcra:number,
  escala:number,
  livre:number,
): number {
  if(livre<=0||!Number.isFinite(escala)||escala<=0||!Number.isFinite(deslocamentoNoEcra)) return focoActual;
  const emPixeisDaImagem=deslocamentoNoEcra/escala;
  const novo=focoActual-emPixeisDaImagem/livre;
  return Math.max(0,Math.min(1,novo));
}
