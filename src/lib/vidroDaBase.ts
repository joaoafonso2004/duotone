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
 * A linha da música dentro da cápsula dela (refeita a 28/11, screenshot 4 do
 * João: "os cantos da capa devem ser arredondados, e a capa está maior que a
 * barra de baixo"). A cápsula da música era da altura da dos separadores (64 e
 * 62 pt) e a capa (48 pt) enchia-a quase toda, com cantos de ~1 pt. Agora, como o
 * "bottom accessory" do iOS 26, mais baixa do que a barra: 56 pt, a capa com 40 e
 * cantos de 10, a 8 pt da borda (concêntrica com a ponta da cápsula: longe da
 * curva). A barra de progresso começa onde começa o texto, sem passar por baixo da
 * capa, e acaba longe da ponta da direita.
 */
export const MUSICA_NO_VIDRO = {
  margem: VIDRO_DA_BASE.margem,
  /** A altura da cápsula da música (a dos separadores tem 62). */
  altura: 56,
  /** O lado da capa, e o raio dos cantos dela. */
  capa: 40,
  raioDaCapa: 10,
  /** Da borda da cápsula à capa: (56 - 40) / 2, a mesma em cima, em baixo e à esquerda. */
  dentro: 8,
  /** A barra de progresso: onde começa o texto (8 + 40 + 10), e longe da ponta da direita. */
  progressoEsquerda: 58,
  progressoDireita: 24,
  progressoFundo: 6,
} as const;

/**
 * O fundo por baixo do vidro, pela opacidade da Customise (0 a 100, 28/11): o
 * preto da app com essa opacidade, ou nada a 0. O vidro mostra-o com o rebordo e a
 * refração por cima, e a 100 fica uma cápsula escura.
 */
export function fundoDoVidro(opacidade: number): string | null {
  const o = Math.min(100, Math.max(0, Number.isFinite(opacidade) ? Math.round(opacidade) : 0));
  return o > 0 ? `rgba(6,6,8,${o / 100})` : null;
}

/**
 * A barra de separadores nativa (28/11): a `UITabBar` do iOS 26, com a lente de
 * vidro que se arrasta de separador para separador (as screenshots 1 a 3 do João:
 * parada, a segurar, a arrastar). Os ícones são símbolos do sistema: o contorno e,
 * no escolhido, o cheio.
 */
export const SIMBOLOS_DOS_SEPARADORES: Record<string, readonly [string, string]> = {
  Search: ['house', 'house.fill'],
  Songs: ['heart', 'heart.fill'],
  Artists: ['music.mic', 'music.mic'],
  Playlists: ['square.stack', 'square.stack.fill'],
  Profile: ['person', 'person.fill'],
};

/** As rotas com botão: o Social não tem (chega-se lá a deslizar para lá do Perfil). */
export function rotasComBotao<R extends { name: string }>(rotas: readonly R[]): R[] {
  return rotas.filter((r) => r.name !== 'Social');
}

/** Que botão da barra está escolhido, para a rota `indice` (-1 no Social: nenhum). */
export function botaoEscolhido(rotas: readonly { key: string; name: string }[], indice: number): number {
  const rota = rotas[indice];
  if (!rota) return -1;
  return rotasComBotao(rotas).findIndex((r) => r.key === rota.key);
}

/**
 * O que o resto da app conta por cima do `insets.bottom` com a barra nativa: a
 * altura dela, que já inclui o fundo do ecrã (o indicador de casa e o espaço por
 * baixo da cápsula).
 */
export function separadoresDaBarraNativa(alturaDaBarra: number, fundoSeguro: number): number {
  return Math.max(0, Math.round(alturaDaBarra - fundoSeguro));
}
