/**
 * A capa GRANDE do leitor do iPhone: que imagem pedir para cada faixa.
 *
 * O leitor aberto mostra a `maxresdefault.jpg` (1280 px), e não a miniatura que
 * as listas já descarregaram. Por isso a capa de uma faixa nova vinha SEMPRE da
 * rede no instante do skip -- e, sem maxres, ainda esperava por um erro para ir
 * à `hqdefault`. Era o "fica sem capa uns segundos" de 14/9.
 *
 * Aqui só se escolhe o endereço; quem pré-carrega e se lembra de quem não tem
 * maxres é o `state/capasGrandes.ts`. Sem imports de runtime, testado em
 * `scripts/test-capa-grande.ts`.
 */

type FaixaComCapa = { source: string; sourceId: string; artworkUrl?: string | null };

/**
 * As imagens que servem de capa grande, da melhor para a que existe sempre.
 *
 * **Só as 16:9, nunca as 4:3** (30/9). A `hqdefault` e a `sddefault` são 4:3:
 * o YouTube encaixa o vídeo 16:9 nelas com uma faixa preta em cima e outra em
 * baixo, e o recorte quadrado do leitor apanha-as -- era a capa com barras
 * pretas que aparecia ao tocar numa música, antes de a `maxresdefault` chegar
 * (e que ficava de vez nos vídeos sem ela). As 16:9 só têm barras dos lados
 * numa capa quadrada, e o recorte ao centro deixa-as de fora.
 *
 * A `hq720` (1280x720) existe em muitos vídeos sem `maxres`; a `mqdefault`
 * (320x180) existe sempre, e é a mesma das listas -- quase sempre já em cache.
 */
export function candidatasDaCapaGrande(t: FaixaComCapa): string[] {
  if (t.source === 'youtube' && t.sourceId) {
    const base = `https://i.ytimg.com/vi/${t.sourceId}`;
    return [`${base}/maxresdefault.jpg`, `${base}/hq720.jpg`, `${base}/mqdefault.jpg`];
  }
  return t.artworkUrl ? [t.artworkUrl] : [];
}

/** A melhor que ainda pode existir: a primeira que não falhou nesta sessão. */
export function capaGrandeDaFaixa(t: FaixaComCapa, falhadas: ReadonlySet<string>): string | null {
  const lista = candidatasDaCapaGrande(t);
  return lista.find((u) => !falhadas.has(u)) ?? lista[lista.length - 1] ?? null;
}

/** A que existe sempre, para quando as grandes falham ou ainda não chegaram. */
export function capaDeRecurso(t: FaixaComCapa): string | null {
  const lista = candidatasDaCapaGrande(t);
  return lista[lista.length - 1] ?? null;
}

/** Largura, em píxeis, de cada miniatura do YouTube. */
const LARGURAS: Record<string, number> = {
  maxresdefault: 1280, hq720: 1280, sddefault: 640, hqdefault: 480, mqdefault: 320,
};
const MINIATURA_RE = /^https?:\/\/i\.ytimg\.com\/vi\/([A-Za-z0-9_-]{6,})\/([A-Za-z0-9_]+)\.jpg(\?.*)?$/;

/**
 * Um desfoque não precisa da capa de 1280 px: o fundo do leitor e o verso das
 * letras desfocavam a `maxresdefault` a cada faixa, e era trabalho do aparelho
 * no instante do skip, ao lado do "Recuo subtil" (24/9). A `mqdefault` (320 px,
 * a da lista e do mini, já pré-carregada) dá o mesmo desfoque com 1/16 dos
 * píxeis. O raio é em píxeis da imagem, por isso encolhe na mesma proporção --
 * senão a de 320 ficava quatro vezes mais desfocada. Fora do YouTube fica tudo
 * como estava.
 */
export function desfoqueLeve(uri: string | null | undefined, raio: number): { uri: string; raio: number } | null {
  if (!uri) return null;
  const m = MINIATURA_RE.exec(uri);
  const largura = m ? LARGURAS[m[2]] : undefined;
  if (!m || !largura) return { uri, raio };
  return { uri: `https://i.ytimg.com/vi/${m[1]}/mqdefault.jpg`, raio: Math.max(1, Math.round((raio * 320) / largura)) };
}
