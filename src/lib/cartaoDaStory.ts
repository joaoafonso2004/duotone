/**
 * O cartão das Stories (29/9): a música que está a tocar, pronta para uma Story
 * do Instagram. Escolhido pelo João na maquete `docs/cartao-stories.html`, a
 * opção A ("Como na app"): o fundo do iPhone (`assets/login_bg.png`, o símbolo
 * 3D em metal) desfocado, um véu que escurece para baixo, a capa ao centro a
 * tapar metade do símbolo, o nome e o artista, e a marca no fundo.
 *
 * Aqui vivem as MEDIDAS, todas em proporção da largura do cartão: o iPhone
 * desenha-o com vistas (e o `react-native-view-shot` fotografa-o) e o PC com
 * um canvas de 1080x1920, e os dois têm de dar o mesmo cartão. Sem imports de
 * runtime: `scripts/test-cartao-da-story.ts` corre em Node puro.
 */

/** A imagem final: o tamanho de uma Story. */
export const TAMANHO_DA_STORY = { largura: 1080, altura: 1920 } as const;

/** O véu por cima do fundo, de cima para baixo. */
export const VEU_DO_CARTAO: readonly { em: number; opacidade: number }[] = [
  { em: 0, opacidade: 0.1 },
  { em: 0.45, opacidade: 0.28 },
  { em: 0.78, opacidade: 0.72 },
  { em: 1, opacidade: 0.9 },
];

/** A cor do véu e do fundo por baixo de tudo (a da abertura da app). */
export const COR_DO_VEU = { r: 6, g: 6, b: 8 } as const;
export const COR_DO_FUNDO = '#070709';

export interface GeometriaDoCartao {
  largura: number;
  altura: number;
  /** O fundo sangra para fora do cartão: o desfoque não deixa moldura clara. */
  fundo: { x: number; y: number; largura: number; altura: number; desfoque: number; brilho: number };
  capa: { x: number; y: number; lado: number; raio: number; sombraY: number; sombraDesfoque: number; sombraOpacidade: number };
  titulo: { topo: number; tamanho: number; alturaDaLinha: number; margem: number; linhas: number };
  artista: { tamanho: number; espaco: number; opacidade: number };
  marca: { base: number; logo: number; tamanho: number; espacamento: number; espaco: number; opacidade: number };
}

/** O cartão para uma largura (a altura é sempre 16/9 dela). */
export function geometriaDoCartao(largura: number): GeometriaDoCartao {
  const L = Math.max(1, largura);
  const A = (L * 16) / 9;
  const sangra = 0.06;
  const lado = L * 0.58;
  return {
    largura: L,
    altura: A,
    fundo: {
      x: -L * sangra, y: -A * sangra, largura: L * (1 + 2 * sangra), altura: A * (1 + 2 * sangra),
      // 10 px num cartão de 300 na maquete.
      desfoque: L * (10 / 300), brilho: 0.9,
    },
    capa: {
      x: (L - lado) / 2, y: A * 0.43 - lado / 2, lado,
      raio: L * (6 / 300), sombraY: L * (30 / 300), sombraDesfoque: L * (56 / 300), sombraOpacidade: 0.6,
    },
    titulo: { topo: A * 0.645, tamanho: L * 0.064, alturaDaLinha: L * 0.064 * 1.15, margem: L * 0.1, linhas: 2 },
    artista: { tamanho: L * 0.046, espaco: L * (5 / 300), opacidade: 0.64 },
    marca: {
      base: A * (1 - 0.055), logo: L * (16 / 300), tamanho: L * (10 / 300),
      espacamento: L * (10 / 300) * 0.32, espaco: L * (7 / 300), opacidade: 0.55,
    },
  };
}

/**
 * Onde desenhar uma imagem para ela ENCHER uma caixa (o `cover` do CSS), com a
 * posição horizontal ao centro e a vertical escolhida (0 = em cima). O fundo
 * vai encostado em cima: é lá que está o símbolo.
 */
export function encherCaixa(
  imagem: { largura: number; altura: number },
  caixa: { x: number; y: number; largura: number; altura: number },
  vertical = 0,
): { x: number; y: number; largura: number; altura: number } {
  const escala = Math.max(caixa.largura / imagem.largura, caixa.altura / imagem.altura);
  const largura = imagem.largura * escala;
  const altura = imagem.altura * escala;
  return {
    x: caixa.x + (caixa.largura - largura) / 2,
    y: caixa.y + (caixa.altura - altura) * Math.min(1, Math.max(0, vertical)),
    largura, altura,
  };
}

/**
 * O título partido em linhas que cabem, no máximo `max`, e a última com
 * reticências se sobrar texto. Quem mede é quem chama (o canvas do PC).
 * Uma palavra maior do que a linha é cortada à letra, não empurra o resto.
 */
export function partirTitulo(
  texto: string, cabe: (s: string) => boolean, max: number,
): string[] {
  const palavras = texto.trim().split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = '';
  let i = 0;
  while (i < palavras.length && linhas.length < max) {
    const tentativa = atual ? `${atual} ${palavras[i]}` : palavras[i]!;
    if (cabe(tentativa)) { atual = tentativa; i++; continue; }
    if (!atual) {
      // Uma palavra sozinha que não cabe: fica o que cabe dela.
      let corte = palavras[i]!;
      while (corte.length > 1 && !cabe(corte)) corte = corte.slice(0, -1);
      atual = corte;
      palavras[i] = palavras[i]!.slice(corte.length);
      if (!palavras[i]) i++;
    }
    linhas.push(atual);
    atual = '';
  }
  if (atual && linhas.length < max) linhas.push(atual);
  if (i < palavras.length && linhas.length) {
    let ultima = linhas[linhas.length - 1]!;
    while (ultima.length > 1 && !cabe(`${ultima}…`)) ultima = ultima.slice(0, -1).trimEnd();
    linhas[linhas.length - 1] = `${ultima}…`;
  }
  return linhas;
}

/** O nome do ficheiro guardado: `duotone-story-<título>.png`, sem caracteres que o Windows recuse. */
export function nomeDoFicheiroDaStory(titulo: string): string {
  const limpo = titulo
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 48);
  return `duotone-story${limpo ? `-${limpo}` : ''}.png`;
}
