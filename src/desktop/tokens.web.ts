/**
 * Tokens do desktop — fase 1 do redesenho.
 *
 * A linguagem visual sai do PRÓPRIO SÍMBOLO da app (assets/icon.png): dois
 * discos de metal escovado frio sobre quase-preto, definidos por luz e não
 * por cor. O roxo que andava a fazer de cor de marca não existe no símbolo;
 * passa a ser preferência do utilizador, não identidade.
 *
 * O que isto substitui, medido no código antes de existir:
 *   18 raios de canto distintos · 21 tamanhos de letra · 7 pesos · 3 roxos.
 * Não eram escolhas — eram resíduo de muitas sessões a acrescentar.
 */

// ---------------------------------------------------------------- fontes --
//
// Embutidas (assets/fonts), nunca por CDN: a app tem de abrir igual sem rede.
// São variáveis, o que importa: o código já usava pesos 550/650/750 que só
// existem em fontes variáveis — com a Segoe UI estática colapsavam todos em
// regular e bold, e a hierarquia inteira não chegava ao ecrã.
export const FONTES = {
  archivo: {
    latin: require('../../assets/fonts/archivo-latin.woff2'),
    latinExt: require('../../assets/fonts/archivo-latin-ext.woff2'),
  },
  publicSans: {
    latin: require('../../assets/fonts/publicsans-latin.woff2'),
    latinExt: require('../../assets/fonts/publicsans-latin-ext.woff2'),
  },
  jetbrainsMono: {
    latin: require('../../assets/fonts/jetbrainsmono-latin.woff2'),
    latinExt: require('../../assets/fonts/jetbrainsmono-latin-ext.woff2'),
  },
};

/**
 * As `@font-face` das três famílias, para quem desenha um documento: a janela
 * principal (`injectDesktopDocumentStyles`) e a do mini leitor
 * (`janelaMini.web.tsx`), que é outro documento e não herda as fontes. Estavam
 * só na casca, e o mini leitor desenhava-se em Segoe UI ao lado da app em
 * Public Sans (20/10, revisão de qualidade Q6).
 *
 * O `require` de um asset devolve formas diferentes conforme a plataforma e a
 * versão do Metro -- string, objeto com `uri`, ou módulo com `default` -- por
 * isso normaliza-se em vez de assumir.
 */
export function cssDasFontes(): string {
  const uri = (m: any): string =>
    typeof m === 'string' ? m : m?.uri || m?.default?.uri || m?.default || '';
  const face = (familia: string, mod: any, alcance: string) =>
    `@font-face{font-family:'${familia}';font-style:normal;font-weight:100 900;` +
    `font-display:swap;src:url(${uri(mod)}) format('woff2');unicode-range:${alcance};}`;
  const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
  const LATIN_EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
  return [
    face('Archivo', FONTES.archivo.latin, LATIN),
    face('Archivo', FONTES.archivo.latinExt, LATIN_EXT),
    face('Public Sans', FONTES.publicSans.latin, LATIN),
    face('Public Sans', FONTES.publicSans.latinExt, LATIN_EXT),
    face('JetBrains Mono', FONTES.jetbrainsMono.latin, LATIN),
    face('JetBrains Mono', FONTES.jetbrainsMono.latinExt, LATIN_EXT),
  ].join('');
}

/** As famílias, já com a pilha de recurso. Usar SEMPRE estas constantes:
 * o react-native-web impõe a stack dele a cada `<Text>`, por isso a família
 * tem de ir explícita no estilo — declarar no `body` não chega. */
export const FONT = {
  display: 'Archivo, "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif',
  body: '"Public Sans", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
  /** Só para dígitos que alinham: durações, contagens, estatísticas. */
  mono: '"JetBrains Mono", ui-monospace, "Cascadia Mono", Consolas, monospace',
};

// ------------------------------------------------------------------ cor --
export const COR = {
  /** Fundo da janela — o mesmo quase-preto do ground do símbolo. */
  fundo: '#060608',
  /** Superfícies: painel, elevado, e o estado de hover. */
  painel: '#0C0C10',
  elevado: '#14141A',
  hover: '#1C1C24',
  /** Linhas. A forte só para separar zonas; a suave para tudo o resto. */
  linha: 'rgba(233,234,238,0.10)',
  linhaSuave: 'rgba(233,234,238,0.055)',
  /** Texto, em três níveis. Mais do que três é indecisão. */
  texto: '#E9EAEE',
  textoMedio: '#9DA0AA',
  /**
   * Medido a 12/9 com a regra WCAG: o `#5A5C66` dava 2,9 sobre o painel --
   * abaixo do minimo de 4,5 para texto normal, e e nele que estao os tempos
   * da barra e as legendas. O `#84868F` da 5,1 sobre o painel elevado e 5,6
   * sobre o fundo, sem deixar de ser o tom mais apagado dos tres.
   */
  textoFraco: '#84868F',
  /** O "metal": o gradiente que substitui o roxo como destaque. */
  metalClaro: '#E9EAEE',
  metalEscuro: '#34363E',
  /** Luz esbatida — estados ativos e realces sobre superfícies escuras. */
  metalSuave: 'rgba(233,234,238,0.12)',
  /** Cor reservada a SIGNIFICADO, nunca a decoração. */
  aviso: '#C6A44E',
  erro: '#BE5F62',
  ok: '#7FB069',
};

// -------------------------------------------------------------- estados --
/**
 * Os estados de um controlo (20/10, revisão de qualidade B3; escolhidos pelo
 * João na maquete `docs/estados-dos-controlos.html`). UMA regra para todos os
 * controlos: o hover do botão de ícone era o mesmo cinzento do separador
 * escolhido, e o ícone ligado (o shuffle) quase não se distinguia de um com o
 * rato por cima. As linhas das listas ficam com o `hover` delas: não têm
 * estado escolhido com que se confundir.
 */
export const ESTADO = {
  /** O rato por cima, ou o foco do teclado: luz a 5,5 %. */
  hover: COR.linhaSuave,
  /** Escolhido ou ligado: metal a 12 % com uma aresta a 28 %. A aresta vai
   * por sombra de dentro, para o controlo não mudar de tamanho. */
  escolhido: { backgroundColor: COR.metalSuave, boxShadow: 'inset 0 0 0 1px rgba(233,234,238,0.28)' } as any,
  /** A mesma aresta, para quem já tem borda (o `Button` marcado). */
  aresta: 'rgba(233,234,238,0.28)',
  /** Indisponível: "agora não". Em progresso NÃO é isto -- fica a 100 %,
   * com a roda antes do texto (o `ocupado` do `Button`). */
  apagado: 0.42,
};

// ------------------------------------------------------------- tipografia --
//
// Sete degraus. O nome diz o papel, não o tamanho — assim ninguém escolhe
// "18px" porque calhou; escolhe "título de secção".
export const TIPO = {
  display: { fontFamily: FONT.display, fontSize: 34, fontWeight: '700' as const, letterSpacing: -0.5 },
  titulo:  { fontFamily: FONT.display, fontSize: 22, fontWeight: '600' as const, letterSpacing: -0.3 },
  seccao:  { fontFamily: FONT.display, fontSize: 16, fontWeight: '600' as const, letterSpacing: -0.1 },
  corpo:   { fontFamily: FONT.body,    fontSize: 14, fontWeight: '400' as const },
  legenda: { fontFamily: FONT.body,    fontSize: 12, fontWeight: '400' as const },
  micro:   { fontFamily: FONT.mono,    fontSize: 10, fontWeight: '400' as const, letterSpacing: 1.5, textTransform: 'uppercase' as const },
  /** Dígitos que alinham em coluna. */
  numero:  { fontFamily: FONT.mono,    fontSize: 12, fontWeight: '400' as const, fontVariantNumeric: 'tabular-nums' as any },
};

// ------------------------------------------------------------------ forma --
/** Quatro raios. Não dezoito. */
export const RAIO = { ctrl: 4, cartao: 8, superficie: 14, pilula: 999 } as const;

/** Espaçamento em múltiplos de 4. O código tinha margens de 3, 5, 7, 9, 11,
 * 13 e 22 px — é assim que o ritmo de uma interface se perde. */
export const ESP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/** Altura única para linhas de lista. Havia 62, 52 e 38 px consoante o ecrã,
 * o que se lia como três aplicações diferentes. */
export const LINHA_LISTA = 56;

/**
 * Elevação por LUZ, não por sombra: um degradê subtil e uma aresta clara em
 * cima, como o bordo iluminado dos discos do símbolo.
 */
export const elevacao = (de = COR.elevado, para = COR.painel) => ({
  backgroundImage: `linear-gradient(180deg, ${de}, ${para})`,
  borderTopWidth: 1,
  borderTopColor: 'rgba(233,234,238,0.07)',
});
