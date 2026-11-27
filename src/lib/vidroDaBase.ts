/**
 * A base de baixo com o Liquid Glass (27/11, depois da 7.2.8; o João: "ficou uma
 * merda", e mandou o tópico liquid-glass do GitHub). A 7.2.8 punha o mini e os
 * separadores num só cartão de vidro, cortado por uma vista de fora (o que estraga
 * o rebordo do vidro nativo), sem nada a marcar o separador escolhido.
 *
 * Agora como a barra do iOS 26: duas cápsulas soltas, a dos separadores em baixo
 * e a da música por cima (o "bottom accessory" da Apple Music). As medidas são as
 * que o `liquid-glass-footer-nav` tirou da barra verdadeira num iPhone 17 Pro Max
 * (62 pt de altura, 21 pt das bordas e do fundo). O separador escolhido leva uma
 * cápsula lisa com um rebordo claro de um píxel, por cima do vidro: vidro sobre
 * vidro funde-se e desaparece.
 *
 * Sem imports: as contas testam-se à parte (`test-vidro-da-base.ts`).
 */

export const VIDRO_DA_BASE = {
  /** A altura da cápsula dos separadores. */
  altura: 62,
  /** Das bordas do ecrã às cápsulas. */
  margem: 21,
  /** Do fundo do ecrã à cápsula dos separadores, num iPhone com indicador de casa (não é o `insets.bottom`, 34). */
  fundo: 21,
  /** Num iPhone sem indicador de casa. */
  fundoSemIndicador: 12,
  /** Entre a linha dos separadores e as bordas da cápsula, na horizontal. */
  folgaDaLinha: 4,
  /** A cápsula do escolhido: quanto vidro fica por cima e por baixo dela. */
  folgaDaSelecao: 5,
  /** E dos lados, dentro da coluna. */
  ladoDaSelecao: 2,
  corDaSelecao: 'rgba(255,255,255,0.18)',
  rebordoDaSelecao: 'rgba(255,255,255,0.22)',
} as const;

/**
 * A cápsula dos separadores. `linha` é a altura medida dos ícones (com ou sem os
 * nomes, e com a letra do sistema): a cápsula cresce se ela não couber. O
 * `separadores` é a altura que o resto da app conta por cima do `insets.bottom`
 * (o fim das listas, a linha da música, os avisos): assim tudo fica por cima da
 * cápsula sem mexer em quem já o lê.
 */
export function geometriaDoVidro(fundoSeguro: number, linha: number) {
  const fundo = fundoSeguro > 0 ? VIDRO_DA_BASE.fundo : VIDRO_DA_BASE.fundoSemIndicador;
  const altura = Math.max(VIDRO_DA_BASE.altura, Math.ceil(linha) + 8);
  return { fundo, altura, raio: altura / 2, separadores: fundo + altura - fundoSeguro };
}

/** A cápsula do escolhido: onde fica (dentro da cápsula dos separadores) e o tamanho. */
export function selecaoDoVidro(larguraDaCapsula: number, quantos: number, altura: number) {
  const linha = Math.max(0, larguraDaCapsula - VIDRO_DA_BASE.folgaDaLinha * 2);
  const coluna = quantos > 0 ? linha / quantos : 0;
  const alto = altura - VIDRO_DA_BASE.folgaDaSelecao * 2;
  return {
    coluna,
    largura: Math.max(0, coluna - VIDRO_DA_BASE.ladoDaSelecao * 2),
    altura: alto,
    raio: alto / 2,
    topo: VIDRO_DA_BASE.folgaDaSelecao,
    /** O `translateX` da cápsula no separador `i`. */
    x: (i: number) => VIDRO_DA_BASE.folgaDaLinha + coluna * i + VIDRO_DA_BASE.ladoDaSelecao,
  };
}

/**
 * A linha da música dentro da cápsula dela: as margens das cápsulas, e a capa
 * mais para dentro, longe da curva (uma cápsula de 64 pt tem os lados em
 * semicírculo de 32: a capa a 16 pt da borda tocava-lhe).
 */
export const MUSICA_NO_VIDRO = {
  margem: VIDRO_DA_BASE.margem,
  /** Da borda da cápsula à capa. */
  dentro: 12,
  /** A barra de progresso fica longe dos semicírculos das pontas. */
  progressoLados: 24,
  progressoFundo: 5,
} as const;
