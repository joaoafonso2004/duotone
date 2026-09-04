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

/**
 * A capa JÁ GRAVADA a cobrir uma caixa, sem deformar e encostada ao topo.
 *
 * Existe para o telemóvel e o PC mostrarem a mesma parte da fotografia. Antes
 * o telemóvel punha a capa numa caixa com o rácio do recorte -- mais baixa do
 * que o cabeçalho, por isso a foto acabava a meio e as vinheta caíam sobre o
 * fundo liso -- e o PC preenchia o cabeçalho cortando ao CENTRO, o que mostrava
 * outra zona da imagem.
 *
 * O topo é a âncora de propósito: é onde está o que a pessoa enquadrou, e o
 * resto do cabeçalho (avatar, nome, biografia) vem por cima do fundo.
 *
 * Cobre sempre: a caixa larga transborda por baixo, a caixa alta transborda
 * pelos lados, e nunca fica margem à vista.
 */
export function enquadrarCapa(
  caixaLargura: number,
  caixaAltura: number,
  racio: number = RACIO_DA_CAPA,
): { largura: number; altura: number; left: number; top: number } {
  if (!(caixaLargura > 0) || !(caixaAltura > 0) || !(racio > 0)) {
    return { largura: 0, altura: 0, left: 0, top: 0 };
  }
  const largura = Math.max(caixaLargura, caixaAltura * racio);
  const altura = largura / racio;
  return { largura, altura, left: (caixaLargura - largura) / 2, top: 0 };
}

/**
 * As paragens do degradê que acaba a capa no fundo do cabeçalho.
 *
 * O fim via-se como uma linha. Duas razões, e as duas estão aqui:
 *
 *  1. A subida era curta e reta -- de 0,68 para opaco nos últimos 18%. Uma
 *     rampa linear contra uma fotografia deixa o olho apanhar o ponto onde ela
 *     CHEGA ao opaco, e é isso que lê como aresta. Agora a curva é suave nas
 *     duas pontas: sobe devagar, acelera a meio e volta a abrandar no fim.
 *  2. Chegava ao opaco exatamente na aresta onde o `overflow:'hidden'` corta.
 *     Qualquer diferença de meio tom entre o cabeçalho e a página aparecia ali.
 *     Agora fica opaco ANTES do fim, e os últimos por cento já são só fundo --
 *     o corte cai sobre cor lisa e não tem nada para revelar.
 *
 * O primeiro par é o escurecimento do topo, para o título e os botões se lerem
 * por cima de uma capa clara.
 */
export function degradeDaCapa(fundo: string): {
  cores: readonly [string, string, ...string[]];
  paragens: readonly [number, number, ...number[]];
} {
  const veu = (a: number) => `rgba(10,10,15,${a})`;
  return {
    cores: [veu(0.34), veu(0.06), veu(0.2), veu(0.46), veu(0.76), veu(0.94), fundo, fundo],
    paragens: [0, 0.28, 0.46, 0.62, 0.76, 0.87, 0.95, 1],
  };
}
