/**
 * As formas das imagens do perfil, e o recorte que as produz.
 *
 * O envio, a moldura do editor E o cabeçalho do perfil partilham o mesmo
 * rácio. Isto não é detalhe: se o cabeçalho mostrar noutra forma, corta a
 * imagem uma segunda vez por cima do recorte, e o resultado é uma ampliação
 * enorme de uma fatia — foi o que aconteceu com uma foto vertical enquanto a
 * capa foi 8:3 e o cabeçalho a mostrava mais alta.
 */

/**
 * A capa. Era 8:3 — tão panorâmica que num telemóvel dava uma tira de 146px
 * e obrigava o cabeçalho a cortá-la outra vez para ela se ver. A 3:2 cabe
 * inteira num cabeçalho com altura decente (390 de largura dão 260) e o
 * telemóvel deixa de precisar de segundo corte.
 */
export const RACIO_DA_CAPA = 3 / 2;

/** Largura com que a capa é gravada; a altura sai do rácio. */
export const LARGURA_DA_CAPA = 1600;

/** A fotografia de perfil: quadrada, porque aparece dentro de um círculo. */
export const RACIO_DO_AVATAR = 1;

/**
 * Onde pôr uma imagem AINDA POR RECORTAR para ela se ver como se ficasse.
 *
 * São dois passos encadeados, e é por os separar que o preview mentia:
 *   1. o recorte que vai ser gravado, dado o ponto focal;
 *   2. esse recorte a preencher a caixa do cabeçalho, que nem sempre tem o
 *      mesmo formato — no telemóvel tem o rácio do recorte e enche-a exacta,
 *      no PC é uma faixa mais larga e ainda corta em cima e em baixo.
 *
 * Devolve a medida e o deslocamento da imagem inteira dentro da caixa, para
 * o preview poder mostrar o resultado sem gravar nada.
 */
export function enquadrarPreVisualizacao(
  largura:number,altura:number,racio:number,x:number,y:number,caixaW:number,caixaH:number,
) {
  const recorte=imageCrop(largura,altura,racio,x,y);
  // `cover`: a escala é a maior das duas, para não sobrar caixa por preencher.
  const escala=Math.max(caixaW/recorte.width,caixaH/recorte.height);
  return {
    width:largura*escala,
    height:altura*escala,
    left:(caixaW-recorte.width*escala)/2-recorte.originX*escala,
    top:(caixaH-recorte.height*escala)/2-recorte.originY*escala,
  };
}

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
