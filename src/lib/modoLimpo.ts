/**
 * O modo limpo do PC: a janela em ecrã inteiro, a capa e a barra ao centro, e
 * mais nada. Pensado para o segundo monitor -- fica lá a tocar enquanto se
 * trabalha no outro, e não há nada a piscar a pedir atenção.
 *
 * Sem imports de runtime, de propósito (como o `lib/radio.ts`): as contas de
 * tamanho e de tempo ficam testáveis em Node puro
 * (`scripts/test-modo-limpo.ts`), e a parte que desenha vive em
 * `desktop/ModoLimpo.web.tsx`.
 */

/**
 * Quanto tempo sem mexer o rato até a interface se apagar e o cursor sumir.
 *
 * Dois segundos e meio: menos do que isto apaga-se a meio de se ir buscar o
 * botão, mais do que isto e o ecrã passa a maior parte do tempo com controlos
 * por cima da capa -- que é exatamente o que este modo veio evitar.
 */
export const INACTIVIDADE_MS = 2600;

/** Limites da capa. O mínimo é para uma janela pequena não ficar ridícula; o
 *  máximo é para um monitor grande não encher o ecrã com uma miniatura de
 *  YouTube esticada, que fica pastosa muito antes disso. */
export const CAPA_MINIMA = 180;
export const CAPA_MAXIMA = 720;

/**
 * Quanto se tira à altura da janela antes de medir a capa.
 *
 * Debaixo dela vivem o nome (58), a barra (16) e os controlos (60) -- 134 --,
 * e ainda o logo, que é absoluto no fundo e não entra na conta da coluna. Com
 * 210 o logo encostava aos controlos numa janela de 600 px de altura; 230 mais
 * o `paddingBottom` do ecrã dão-lhe o lugar dele.
 */
export const ALTURA_RESERVADA = 230;

/**
 * O lado da capa para uma janela destas.
 *
 * Sobra de propósito: o ecrã só é "limpo" se houver ar à volta. Num monitor
 * 16:9 é a altura que manda, num ultrawide é a largura.
 */
export function tamanhoDaCapa(largura: number, altura: number): number {
  const cabe = Math.min(largura * 0.62, altura - ALTURA_RESERVADA);
  return Math.round(Math.max(CAPA_MINIMA, Math.min(CAPA_MAXIMA, cabe)));
}

/** Já passou tempo sem mexer o rato? */
export function estaQuieto(ultimoMovimentoMs: number, agoraMs: number, atrasoMs = INACTIVIDADE_MS): boolean {
  return agoraMs - ultimoMovimentoMs >= atrasoMs;
}

/** A fração tocada, entre 0 e 1. Sem duração não há barra que valha: 0. */
export function progressoDaFaixa(posicaoMs: number, duracaoMs: number): number {
  if (!Number.isFinite(posicaoMs) || !Number.isFinite(duracaoMs) || duracaoMs <= 0) return 0;
  return Math.min(1, Math.max(0, posicaoMs / duracaoMs));
}

/** Onde se carregou na barra, entre 0 e 1. */
export function posicaoDoClique(clientX: number, esquerda: number, largura: number): number {
  if (!Number.isFinite(clientX) || !(largura > 0)) return 0;
  return Math.min(1, Math.max(0, (clientX - esquerda) / largura));
}

/**
 * A miniatura tem barras pretas?
 *
 * As do YouTube em 4:3 -- `default`, `hqdefault`, `sddefault` -- sao uma
 * moldura 4:3 com o video 16:9 la dentro, e sobram duas faixas pretas. Numa
 * capa quadrada isso ve-se logo. As de 16:9 (`mqdefault`, `maxresdefault`) nao
 * as tem, e as capas quadradas do catalogo tambem nao.
 */
export function capaComBarras(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\/(?:default|hqdefault|sddefault)\.(?:jpg|webp)(?:[?#]|$)/i.test(url);
}

/**
 * Onde por a imagem para as barras ficarem DE FORA de um quadrado de `lado`.
 *
 * A conta: o conteudo ocupa 270 das 360 linhas da miniatura, por isso a imagem
 * tem de ser desenhada a 4/3 da altura do quadrado para o conteudo ficar com o
 * lado todo -- e a largura acompanha (16/9 do lado). O resto sai pelos
 * cantos, e e por isso que quem a usa precisa de `overflow: hidden`.
 */
export function molduraSemBarras(lado: number): {
  largura: number; altura: number; esquerda: number; topo: number;
} {
  const altura = (lado * 4) / 3;
  const largura = (lado * 16) / 9;
  return { largura, altura, esquerda: (lado - largura) / 2, topo: (lado - altura) / 2 };
}
