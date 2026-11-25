/**
 * A Ocultação: a troca de música (C2, 1/11, `docs/ocultacao-maquete.html`,
 * a variante B, "difusa", escolhida pelo João). Uma sombra com a cor da música
 * que vem passa por cima da capa; quando a tapa, a capa troca por baixo, e a
 * sombra sai pelo outro lado. A seguinte passa da direita para a esquerda, a
 * anterior ao contrário.
 *
 * Aqui só os números e as decisões; o movimento é o `desktop/Ocultacao.web.ts`.
 * Sem imports de runtime além das contas puras: `scripts/test-ocultacao.ts`.
 */
import { corCaracteristica, FUNDO, type RGB } from './corDaCapa';
import { sentidoDaTransicao, type SaltoDaFaixa } from './transicaoDaCapa';

export const OCULTACAO = {
  /** A sombra a chegar, a acelerar para a totalidade. */
  entradaMs: 220,
  /** O disco é 1,5× o lado da capa, para lhe tapar os cantos. */
  ladoDoDisco: 1.5,
  /** Quanto a cor da música que vem desce para o fundo da app: é a sombra dela. */
  escurecer: 0.8,
  opacidade: 0.9,
  /** Com menos movimento não há disco: a capa cruza em opacidade. */
  cruzarMs: 160,
} as const;

/** Enquanto a cor da música nova não chega, ou numa capa sem cor. */
export const COR_DO_DISCO_SEM_CAPA = 'rgb(6,6,8)';

/** +1 a seguinte, -1 a anterior. Uma música que acabou sozinha também avança. */
export function sentidoDaOcultacao(salto: SaltoDaFaixa | null | undefined, agora: number): 1 | -1 {
  return sentidoDaTransicao(salto, agora) === -1 ? -1 : 1;
}

/** A sombra da música que vem: a cor característica da capa dela, puxada para o fundo. */
export function corDoDisco(celulas: RGB[] | null | undefined, escurecer: number = OCULTACAO.escurecer): string {
  if (!celulas?.length) return COR_DO_DISCO_SEM_CAPA;
  const media: RGB = {
    r: celulas.reduce((s, c) => s + c.r, 0) / celulas.length,
    g: celulas.reduce((s, c) => s + c.g, 0) / celulas.length,
    b: celulas.reduce((s, c) => s + c.b, 0) / celulas.length,
  };
  // À mão e não pelo `misturar`, que mistura em luz linear: os 80 % davam uma cor
  // bem mais clara (124 em vez de 59 num vermelho) do que a da maquete escolhida.
  const base = corCaracteristica(celulas) ?? media;
  const t = escurecer;
  const canal = (c: number, f: number) => Math.round(c * (1 - t) + f * t);
  return `rgb(${canal(base.r, FUNDO.r)},${canal(base.g, FUNDO.g)},${canal(base.b, FUNDO.b)})`;
}

/** O disco difuso: a borda esbate-se e deixa ver um pouco das capas. Sem coroa. */
export function fundoDoDisco(cor: string): string {
  return `radial-gradient(circle, ${cor} 52%, transparent 70%)`;
}

/** De onde vem e para onde vai: o disco anda o lado dele, e sai todo pelo outro lado. */
export function trajetoDoDisco(sentido: 1 | -1): { de: string; meio: string; para: string } {
  return { de: `translateX(${sentido * 100}%)`, meio: 'translateX(0)', para: `translateX(${-sentido * 100}%)` };
}

/**
 * O Eclipse (25/11, `ecra-inteiro-maquete.html`, escolhido pelo João para o modo
 * limpo): a Ocultação maior, com a cor da capa nova mais viva e uma orla de luz.
 * O disco tem de raio 1,15 vezes o lado da capa, e o miolo opaco (62 % do raio)
 * tapa-lhe os cantos quando chega ao meio, que é quando a capa troca.
 */
export const ECLIPSE = {
  /** O raio do disco, em lados da capa. */
  raio: 1.15,
  /** Até ao meio, a acelerar: 42 % dos 760 ms da maquete. A saída é a mola ENTRADA. */
  entradaMs: 320,
  /** Menos escuro do que a Ocultação: a sombra tem a cor da capa que vem. */
  escurecer: 0.45,
  /** A orla: um anel a 80 % do raio, com a espessura e o brilho em lados da capa. */
  orla: { raio: 0.8, espessura: 0.012, brilho: 0.06 },
} as const;

/** O disco do Eclipse: quase opaco até 62 % do raio, e esbate-se até à borda. */
export function fundoDoEclipse(cor: string): string {
  const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(cor);
  const com = (a: number) => (m ? `rgba(${m[1]},${m[2]},${m[3]},${a})` : cor);
  return `radial-gradient(circle closest-side, ${com(0.96)} 0%, ${com(0.9)} 62%, ${com(0)} 100%)`;
}

/**
 * O caminho do Eclipse, em frações da largura do disco: começa com o centro a um
 * raio do lado de fora da capa e acaba a um raio do outro lado. A seguinte vem da
 * direita, como a Ocultação.
 */
export function trajetoDoEclipse(sentido: 1 | -1): { de: string; meio: string; para: string } {
  const f = Math.round(((0.5 + ECLIPSE.raio) / (2 * ECLIPSE.raio)) * 10000) / 100;
  return { de: `translateX(${sentido * f}%)`, meio: 'translateX(0)', para: `translateX(${-sentido * f}%)` };
}

/** As quatro laterais da capa 3D do PC (`CapaMetal3D`). */
export type LadoDaCaixa = 'esq' | 'dir' | 'cima' | 'baixo';

/** O escuro que a sombra deixa numa lateral, no máximo (a do disco é 0,9 e esbatida). */
export const SOMBRA_NA_LATERAL = 0.85;

/**
 * Na capa 3D (7/11) o disco passa DENTRO da face, e as laterais escurecem quando
 * ele lhes passa por cima: a de onde ele vem logo ao entrar, a do outro lado só
 * no fim, as de cima e de baixo com o meio dele -- e ao sair, pela mesma ordem.
 * Em frações da entrada (`OCULTACAO.entradaMs`) e da saída (a mola ENTRADA):
 * `entra` é de quando a quando escurece, `sai` de quando a quando volta.
 */
export function sombraNaLateral(lado: LadoDaCaixa, sentido: 1 | -1): { entra: [number, number]; sai: [number, number] } {
  const vem = sentido > 0 ? 'dir' : 'esq';
  const vai = sentido > 0 ? 'esq' : 'dir';
  if (lado === vem) return { entra: [0, 0.35], sai: [0.1, 0.35] };
  if (lado === vai) return { entra: [0.8, 1], sai: [0.55, 0.9] };
  return { entra: [0.45, 0.85], sai: [0.25, 0.6] };
}

// --- O iPhone (25/11): a mesma passagem no leitor aberto e no mini. ---

/**
 * O `cubic-bezier(x1, y1, x2, y2)` do CSS: dado o tempo (0 a 1), quanto andou.
 * O `x` resolve-se por bisseção (a curva é monótona no tempo).
 */
export function bezierCubica(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const eixo = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let baixo = 0, alto = 1, s = t;
    for (let i = 0; i < 40; i++) {
      s = (baixo + alto) / 2;
      if (eixo(x1, x2, s) < t) baixo = s; else alto = s;
    }
    return eixo(y1, y2, s);
  };
}

/** A curva de quem sai, a do `sair` do PC (`molasEmCss.ts`): acelera e desaparece. */
const SAIR = bezierCubica(0.5, 0, 0.75, 0);
/** A mola ENTRADA (`movimento.ts`), com que o disco sai pelo outro lado. */
const MOLA_DA_SAIDA = { stiffness: 190, damping: 22, mass: 1 } as const;

function posicaoNaMola(t: number): number {
  let x = 0, v = 0;
  const dt = 0.001;
  for (let s = 0; s < t; s += dt) {
    const a = (-MOLA_DA_SAIDA.stiffness * (x - 1) - MOLA_DA_SAIDA.damping * v) / MOLA_DA_SAIDA.mass;
    v += a * dt;
    x += v * dt;
  }
  return x;
}

/** Quanto a mola da saída leva a assentar (a 0,5 % do fim, e parada), em ms. */
export function duracaoDaSaida(): number {
  let x = 0, v = 0, t = 0, quieta = 0;
  const dt = 0.001;
  while (t < 2) {
    const a = (-MOLA_DA_SAIDA.stiffness * (x - 1) - MOLA_DA_SAIDA.damping * v) / MOLA_DA_SAIDA.mass;
    v += a * dt; x += v * dt; t += dt;
    if (Math.abs(x - 1) < 0.005 && Math.abs(v) < 0.05) { if (++quieta > 20) break; } else quieta = 0;
  }
  return Math.round(t * 1000);
}

export type CurvaDaOcultacao = {
  duracaoMs: number;
  /** Em que fração do total o disco tapa a capa: é aí que a velha sai. */
  totalidade: number;
  inputRange: number[];
  /**
   * Onde está o disco, em lados dele: 1 do lado de onde vem, 0 a tapar a capa,
   * -1 já fora pelo outro lado. Vezes o sentido e o lado do disco dá o `translateX`.
   */
  posicao: number[];
};

/**
 * A passagem toda numa curva só, para UMA animação nativa a percorrer (como o
 * recuo, `curvaDoSkip`): uma `fase` de 0 a 1, linear, e a posição amostrada. Duas
 * animações em sequência esperavam pelo JavaScript entre uma e outra, e no skip
 * ele está ocupado com a faixa nova (o recuo ficava 150 ms parado, 2/10).
 */
export function curvaDaOcultacao(): CurvaDaOcultacao {
  const entrada = OCULTACAO.entradaMs;
  const saida = duracaoDaSaida();
  const total = entrada + saida;
  const totalidade = entrada / total;
  const inputRange: number[] = [];
  const posicao: number[] = [];
  const PASSOS_A_ENTRAR = 12, PASSOS_A_SAIR = 28;
  for (let i = 0; i <= PASSOS_A_ENTRAR; i++) {
    const t = i / PASSOS_A_ENTRAR;
    inputRange.push(+(t * totalidade).toFixed(5));
    posicao.push(+(1 - SAIR(t)).toFixed(5));
  }
  for (let i = 1; i <= PASSOS_A_SAIR; i++) {
    // Mais pontos no começo, onde a mola anda depressa.
    const t = (i / PASSOS_A_SAIR) ** 1.6;
    inputRange.push(+(totalidade + t * (1 - totalidade)).toFixed(5));
    posicao.push(+(-posicaoNaMola((t * saida) / 1000)).toFixed(5));
  }
  // O último ponto é o fim, com o disco assente fora da capa.
  posicao[posicao.length - 1] = -1;
  return { duracaoMs: total, totalidade, inputRange, posicao };
}

/**
 * O disco do iPhone: o `radial-gradient` do RN (`experimental_backgroundImage`).
 * A borda esbate-se para a MESMA cor transparente, e não para o `transparent`
 * (preto a zero), que no Core Graphics escurecia a orla.
 */
export function gradienteDoDisco(cor: string): string {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(cor);
  const fim = m ? `rgba(${m[1]},${m[2]},${m[3]},0)` : 'rgba(6,6,8,0)';
  return `radial-gradient(circle, ${cor} 52%, ${fim} 70%)`;
}
