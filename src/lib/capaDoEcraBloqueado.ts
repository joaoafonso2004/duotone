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
