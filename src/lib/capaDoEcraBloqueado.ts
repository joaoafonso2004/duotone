/**
 * Que imagem mandar para o Lock Screen / CarPlay.
 *
 * O `hqdefault.jpg` que a app guarda é 480x360 e vem com barras: o YouTube põe
 * a capa quadrada dentro de um quadro 16:9 (barras aos lados) e depois encaixa
 * esse 16:9 num thumbnail 4:3 (barras em cima e em baixo). Daí a capa aparecer
 * pequena no meio de um retângulo preto no carro.
 *
 * O `maxresdefault.jpg` é 1280x720 -- sem a moldura 4:3 e com resolução a sério
 * para um ecrã de carro. Nem todos os vídeos o têm, por isso vai uma lista por
 * ordem de preferência e o lado nativo fica com a primeira que responder.
 *
 * As barras que sobrarem são recortadas no módulo nativo, que tem acesso aos
 * píxeis. Aqui só se escolhe a fonte.
 *
 * Função pura -- ver scripts/test-capa.ts.
 */

const YTIMG_RE = /^https?:\/\/i\.ytimg\.com\/vi\/([A-Za-z0-9_-]{6,})\/[A-Za-z0-9_]+\.jpg(\?.*)?$/;

/**
 * A capa para um quadrado pequeno -- uma linha de lista, uma grelha.
 *
 * O `hqdefault` é 4:3 (480x360) e traz a moldura preta em cima e em baixo: num
 * recorte quadrado ela vai junto, e é por isso que as listas ficavam com barras
 * pretas à volta de metade das capas.
 *
 * O `mqdefault` é 16:9 (320x180) e não tem essa moldura. Recortado ao centro
 * num quadrado dá as duas coisas certas: numa capa de álbum quadrada, o
 * recorte cai exactamente sobre ela e as barras laterais ficam de fora; num
 * vídeo mesmo 16:9, dá o centro da imagem. Em nenhum dos casos sobra preto.
 *
 * 320x180 chega e sobra para 48 px, e é uma imagem muito mais leve numa lista
 * de milhares de linhas.
 *
 * Função pura -- ver scripts/test-capa.ts.
 */
export function capaParaLista(artworkUrl: string | null | undefined): string | null {
  if (!artworkUrl) return null;
  const m = YTIMG_RE.exec(artworkUrl);
  if (!m) return artworkUrl;
  return `https://i.ytimg.com/vi/${m[1]}/mqdefault.jpg`;
}

/**
 * Fontes para uma capa QUADRADA grande, sem a moldura preta do `hqdefault`.
 *
 * O modo carro precisa de mais resolução do que uma linha de lista, portanto
 * tenta primeiro as miniaturas 16:9 grandes. Se o vídeo não tiver nenhuma,
 * cai no `mqdefault`: é menor, mas não volta a introduzir as barras pretas que
 * esta função existe para retirar.
 */
export function urlsDaCapaQuadrada(artworkUrl: string | null | undefined): string[] {
  if (!artworkUrl) return [];
  const m = YTIMG_RE.exec(artworkUrl);
  if (!m) return [artworkUrl];
  const id = m[1];
  return [
    `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/hq720.jpg`,
    `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
  ];
}

export function urlsDaCapa(artworkUrl: string | null | undefined): string[] {
  if (!artworkUrl) return [];
  const m = YTIMG_RE.exec(artworkUrl);
  if (!m) return [artworkUrl];
  const id = m[1];
  // maxres primeiro; hq720 existe em muitos casos onde o maxres falta; o
  // original fica como última rede, para nunca ficarmos sem capa nenhuma.
  const candidatos = [
    `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/hq720.jpg`,
    artworkUrl,
  ];
  return candidatos.filter((u, i) => candidatos.indexOf(u) === i);
}
