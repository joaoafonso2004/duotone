import type { AccentTheme } from './modoDoTema';

/**
 * A cor que a capa manda.
 *
 * Lógica pura, sem rede e sem imagens: recebe uma grelha de células já lida
 * da capa e devolve um tema. Quem lê os pixéis é outro módulo, diferente em
 * cada plataforma -- no telemóvel o blurhash que o `expo-image` gera
 * nativamente, no PC um `canvas`. As duas entregam a MESMA forma, uma grelha
 * de células, e daí para a frente o caminho é este e é só um.
 *
 * As quatro exigências que isto tem de cumprir, e que são o trabalho todo:
 *
 *  1. a mesma capa dá sempre a mesma cor -- daí ser tudo determinístico,
 *     sem amostragem aleatória nem dependência da ordem de chegada;
 *  2. o contraste é forçado, não esperado: uma capa escura dava uma cor que
 *     desaparecia no fundo preto da app, e o texto ficava ilegível;
 *  3. há sempre valor de recurso -- capa que falta, que não carrega ou que é
 *     cinzenta de ponta a ponta cai no steel, que é a identidade da app;
 *  4. a transição entre faixas é feita por quem consome (ver `theme.ts`);
 *     aqui só se garante que o destino é estável, senão não há o que animar.
 */

/** Uma cor, em 0-255. */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** O fundo sobre o qual a cor tem de se ler. É o da app, nas duas caras. */
export const FUNDO: RGB = { r: 0x0a, g: 0x0a, b: 0x0f };

/** Contraste mínimo contra o fundo. O 4.5 do WCAG para texto normal. */
const CONTRASTE_MINIMO = 4.5;

/**
 * Abaixo disto uma cor não é cor, é cinzento.
 *
 * Capas a preto e branco existem às centenas, e forçar-lhes uma cor dava um
 * tom inventado que não estava lá. Nesse caso o steel é a resposta honesta.
 */
const SATURACAO_MINIMA = 0.15;

// ---------------------------------------------------------------------------
// Base83 e blurhash
// ---------------------------------------------------------------------------

const B83 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';

function decodificar83(texto: string): number {
  let valor = 0;
  for (const caracter of texto) {
    const digito = B83.indexOf(caracter);
    if (digito < 0) return -1;
    valor = valor * 83 + digito;
  }
  return valor;
}

const paraLinear = (v: number): number => {
  const x = v / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};

const paraSRGB = (v: number): number => {
  const x = Math.max(0, Math.min(1, v));
  const c = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  return Math.round(c * 255);
};

const sinalQuadrado = (v: number): number => Math.sign(v) * v * v;

/**
 * Descodifica um blurhash para uma grelha de células.
 *
 * Não é uma imagem: são `largura x altura` amostras da função que o blurhash
 * descreve. Com 4x4 chega para saber de que cor é a capa sem trazer os pixéis
 * todos para dentro do JavaScript.
 *
 * Devolve `null` para um hash mal formado em vez de rebentar -- é texto que
 * vem de fora, e uma capa ilegível tem de cair no recurso, não derrubar o
 * ecrã que a mostra.
 */
export function celulasDoBlurhash(hash: string, largura = 4, altura = 4): RGB[] | null {
  if (!hash || hash.length < 6) return null;

  const tamanho = decodificar83(hash[0]!);
  if (tamanho < 0) return null;
  const nx = (tamanho % 9) + 1;
  const ny = Math.floor(tamanho / 9) + 1;
  if (hash.length !== 4 + 2 * nx * ny) return null;

  const maxAc = decodificar83(hash[1]!);
  if (maxAc < 0) return null;
  const maximo = (maxAc + 1) / 166;

  const cores: [number, number, number][] = [];
  for (let i = 0; i < nx * ny; i++) {
    if (i === 0) {
      const dc = decodificar83(hash.substring(2, 6));
      if (dc < 0) return null;
      cores.push([paraLinear(dc >> 16), paraLinear((dc >> 8) & 255), paraLinear(dc & 255)]);
    } else {
      const ac = decodificar83(hash.substring(4 + i * 2, 6 + i * 2));
      if (ac < 0) return null;
      cores.push([
        (sinalQuadrado(Math.floor(ac / (19 * 19)) - 9) / 81) * maximo,
        (sinalQuadrado((Math.floor(ac / 19) % 19) - 9) / 81) * maximo,
        (sinalQuadrado((ac % 19) - 9) / 81) * maximo,
      ]);
    }
  }

  const celulas: RGB[] = [];
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          // O centro da célula, e não o canto: com 4x4 o canto apanhava a
          // margem da capa, que é onde moram as bordas pretas.
          const base =
            Math.cos((Math.PI * (x + 0.5) * i) / largura) *
            Math.cos((Math.PI * (y + 0.5) * j) / altura);
          const cor = cores[i + j * nx]!;
          r += cor[0] * base;
          g += cor[1] * base;
          b += cor[2] * base;
        }
      }
      celulas.push({ r: paraSRGB(r), g: paraSRGB(g), b: paraSRGB(b) });
    }
  }
  return celulas;
}

// ---------------------------------------------------------------------------
// Cor, saturação, contraste
// ---------------------------------------------------------------------------

/** Luminância relativa do WCAG. */
export function luminancia({ r, g, b }: RGB): number {
  return 0.2126 * paraLinear(r) + 0.7152 * paraLinear(g) + 0.0722 * paraLinear(b);
}

/** Razão de contraste entre duas cores, de 1 (igual) a 21 (preto e branco). */
export function contraste(a: RGB, b: RGB): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Saturação HSL, de 0 (cinzento) a 1. */
export function saturacao({ r, g, b }: RGB): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  if (max === min) return 0;
  const l = (max + min) / 2;
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

function paraHSL({ r, g, b }: RGB): { h: number; s: number; l: number } {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) / 6;
  else if (max === G) h = ((B - R) / d + 2) / 6;
  else h = ((R - G) / d + 4) / 6;
  return { h, s, l };
}

function deHSL(h: number, s: number, l: number): RGB {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const canal = (t: number): number => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return {
    r: Math.round(canal(h + 1 / 3) * 255),
    g: Math.round(canal(h) * 255),
    b: Math.round(canal(h - 1 / 3) * 255),
  };
}

/**
 * Sobe a cor até se ler sobre o fundo, mantendo o tom.
 *
 * Uma capa escura dava uma cor escura, e a app é preta: o texto do acento
 * desaparecia. Clarear em HSL mexe só na luminosidade -- o tom e a saturação
 * ficam, e a cor continua a ser a da capa, só que visível.
 *
 * O passo é fixo e o limite também, por isso a mesma entrada dá sempre a
 * mesma saída. Se nem a branco houver contraste (não acontece com este fundo,
 * mas o ciclo não fica à mercê disso), sai o que se tiver.
 */
export function garantirContraste(cor: RGB, fundo: RGB = FUNDO): RGB {
  let atual = cor;
  const { h, s } = paraHSL(cor);
  let { l } = paraHSL(cor);
  // 40 passos de 0.02 cobrem de preto a branco com folga.
  for (let i = 0; i < 40 && contraste(atual, fundo) < CONTRASTE_MINIMO; i++) {
    l = Math.min(1, l + 0.02);
    atual = deHSL(h, s, l);
  }
  return atual;
}

/**
 * A cor mais característica de uma grelha.
 *
 * Não é a média: a média de uma capa colorida dá castanho, que não é a cor de
 * capa nenhuma. Escolhe-se a célula mais saturada -- é a que uma pessoa
 * apontaria se lhe perguntassem "de que cor é esta capa".
 *
 * Empates resolvem-se pela ordem da grelha, para a resposta ser sempre a
 * mesma; e uma grelha inteira sem cor devolve `null`, que é o sinal de que
 * aqui não há cor a extrair e o steel serve melhor.
 */
export function corCaracteristica(celulas: RGB[]): RGB | null {
  let melhor: RGB | null = null;
  let melhorNota = 0;
  for (const celula of celulas) {
    const s = saturacao(celula);
    if (s < SATURACAO_MINIMA) continue;
    // A saturação escolhe o tom; a luminância desempata a favor da célula que
    // se vê melhor, para não sair um bordô quase preto de uma capa que tem
    // um vermelho vivo ao lado.
    const nota = s * (0.35 + luminancia(celula));
    if (nota > melhorNota) {
      melhorNota = nota;
      melhor = celula;
    }
  }
  return melhor;
}

const hex = ({ r, g, b }: RGB): string =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();

/**
 * O tema de uma capa, ou `null` quando a capa não tem cor para dar.
 *
 * Devolver `null` em vez do steel já feito é de propósito: quem chama é que
 * sabe qual é o recurso, e assim este módulo não precisa de conhecer o tema
 * fixo da app.
 */
export function temaDaCapa(celulas: RGB[] | null | undefined): AccentTheme | null {
  if (!celulas || !celulas.length) return null;
  const crua = corCaracteristica(celulas);
  if (!crua) return null;

  const cor = garantirContraste(crua);
  const { h, s, l } = paraHSL(cor);

  // O segundo tom do gradiente é a mesma cor mais funda: um gradiente entre
  // duas cores sem parentesco lê-se como dois temas colados.
  const fundo = deHSL(h, Math.min(1, s * 0.9), Math.max(0.12, l - 0.42));

  return {
    name: 'cover',
    color: hex(cor),
    soft: `rgba(${cor.r},${cor.g},${cor.b},0.16)`,
    gradient: [hex(cor), hex(fundo)] as const,
    // Sobre o acento é que este texto assenta, não sobre o fundo da app. Não
    // se decide por um limiar de luminância: um limiar acerta nos extremos e
    // falha no meio -- um vermelho médio levava branco e ficava a 4.15, abaixo
    // do legível. Mede-se o contraste dos dois e fica o melhor.
    textColorOnGradient:
      contraste(cor, { r: 0x0b, g: 0x0b, b: 0x0e }) >= contraste(cor, { r: 255, g: 255, b: 255 })
        ? '#0B0B0E'
        : '#FFFFFF',
  };
}

/**
 * Um véu da cor da capa, para tingir uma superfície sem a pintar.
 *
 * É o que o perfil usa: a capa dá o tom, mas o cartão continua a ser escuro.
 * Uma opacidade baixa e fixa é o que separa "tingido" de "colorido".
 */
export function veuDaCapa(celulas: RGB[] | null | undefined, opacidade = 0.14): string | null {
  if (!celulas || !celulas.length) return null;
  const crua = corCaracteristica(celulas);
  if (!crua) return null;
  const cor = garantirContraste(crua);
  return `rgba(${cor.r},${cor.g},${cor.b},${opacidade})`;
}

// ---------------------------------------------------------------------------
// Transição
// ---------------------------------------------------------------------------

/** Lê "#RRGGBB" para uma cor. Devolve preto para o que não perceber. */
export function deHex(texto: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(texto.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const v = parseInt(m[1]!, 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

/**
 * Um ponto entre duas cores.
 *
 * A mistura é em espaço linear e não nos bytes: interpolar sRGB directamente
 * escurece o meio do caminho, e uma passagem de azul para amarelo atravessava
 * um cinzento sujo que não está em nenhuma das duas pontas.
 */
export function misturar(a: RGB, b: RGB, t: number): RGB {
  const k = Math.max(0, Math.min(1, t));
  const canal = (x: number, y: number) => paraSRGB(paraLinear(x) * (1 - k) + paraLinear(y) * k);
  return { r: canal(a.r, b.r), g: canal(a.g, b.g), b: canal(a.b, b.b) };
}

/**
 * O tema a meio caminho entre dois, para a mudança de faixa ser uma passagem.
 *
 * O `textColorOnGradient` não se mistura: é preto ou branco, e um cinzento a
 * meio seria ilegível nas duas pontas. Troca de uma vez a meio da transição,
 * que é onde a diferença menos se nota.
 */
export function misturarTemas(a: AccentTheme, b: AccentTheme, t: number): AccentTheme {
  const cor = misturar(deHex(a.color), deHex(b.color), t);
  const fim = misturar(deHex(a.gradient[1]), deHex(b.gradient[1]), t);
  return {
    name: b.name,
    color: hex(cor),
    soft: `rgba(${cor.r},${cor.g},${cor.b},0.16)`,
    gradient: [hex(cor), hex(fim)] as const,
    textColorOnGradient: t < 0.5 ? a.textColorOnGradient : b.textColorOnGradient,
  };
}
