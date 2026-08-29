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
  textoFraco: '#5A5C66',
  /** O "metal": o gradiente que substitui o roxo como destaque. */
  metalClaro: '#E9EAEE',
  metalEscuro: '#34363E',
  /** Cor reservada a SIGNIFICADO, nunca a decoração. */
  aviso: '#C6A44E',
  erro: '#BE5F62',
  ok: '#7FB069',
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
