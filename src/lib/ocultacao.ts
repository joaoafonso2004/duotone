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
export function corDoDisco(celulas: RGB[] | null | undefined): string {
  if (!celulas?.length) return COR_DO_DISCO_SEM_CAPA;
  const media: RGB = {
    r: celulas.reduce((s, c) => s + c.r, 0) / celulas.length,
    g: celulas.reduce((s, c) => s + c.g, 0) / celulas.length,
    b: celulas.reduce((s, c) => s + c.b, 0) / celulas.length,
  };
  // À mão e não pelo `misturar`, que mistura em luz linear: os 80 % davam uma cor
  // bem mais clara (124 em vez de 59 num vermelho) do que a da maquete escolhida.
  const base = corCaracteristica(celulas) ?? media;
  const t = OCULTACAO.escurecer;
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
