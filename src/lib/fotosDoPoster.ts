/**
 * As fotos do artista para o Poster do leitor do iPhone (16/11, pedido do João:
 * "uma imagem top do cantor", nunca a da página do artista e nunca a mesma para
 * músicas diferentes).
 *
 * Vêm do TheAudioDB (sem chave, CORS aberto): até cinco fotos por artista -- as
 * quatro "fanart" (sem texto nem logótipos, pelas regras do site) e a miniatura,
 * que fica em último por ser a que mais se parece com a da página do artista
 * (essa é do Deezer). A "wide" traz o nome escrito; o cutout e o clearart são
 * PNG sem fundo: ficam de fora. Os artistas portugueses quase nunca lá estão, e
 * aí fica a capa.
 *
 * Cada música fica com UMA foto, sempre a mesma: a menos usada desse artista
 * quando chega pela primeira vez. Assim, músicas diferentes têm fotos diferentes
 * enquanto as houver; com mais músicas do que fotos, repetem-se o menos possível.
 *
 * Puro, sem imports: `scripts/test-fotos-do-poster.ts`. Quem pede e guarda é o
 * `api/fotosDoPoster.ts`.
 */

/** Os campos do TheAudioDB que servem, pela ordem em que se dão às músicas. */
export const CAMPOS_DAS_FOTOS = [
  'strArtistFanart', 'strArtistFanart2', 'strArtistFanart3', 'strArtistFanart4', 'strArtistThumb',
] as const;

/** Quantas músicas se lembram por artista (as mais antigas saem primeiro). */
export const MAXIMO_DE_MUSICAS = 400;

const DIA_MS = 24 * 60 * 60 * 1000;
/** Com fotos, 30 dias; sem nenhuma (o artista não está lá), pergunta-se outra vez ao fim de 7. */
export const VALIDADE_COM_FOTOS = 30 * DIA_MS;
export const VALIDADE_SEM_FOTOS = 7 * DIA_MS;

export type FotosDoArtista = {
  fotos: string[];
  /** Quando se perguntou ao TheAudioDB. */
  em: number;
  /** A foto de cada música (`source:sourceId` -> índice em `fotos`). */
  musicas: Record<string, number>;
};

/**
 * As fotos do artista procurado numa resposta do `search.php`. Só se o nome
 * casar (pela chave do catálogo, a mesma que o resto da app usa): uma pesquisa
 * por "Plutonio" que devolvesse outro artista punha a cara errada no leitor.
 */
export function fotosDoAudioDb(resposta: unknown, chaveProcurada: string, chaveDe: (nome: string) => string): string[] {
  const artistas = (resposta as { artists?: unknown } | null)?.artists;
  if (!chaveProcurada || !Array.isArray(artistas)) return [];
  const casa = (x: Record<string, unknown>) => {
    const nomes = [String(x.strArtist ?? ''), ...String(x.strArtistAlternate ?? '').split(/[,/]/)];
    return nomes.some((n) => n.trim() && chaveDe(n) === chaveProcurada);
  };
  const a = artistas.find((x): x is Record<string, unknown> => !!x && typeof x === 'object' && casa(x as Record<string, unknown>));
  if (!a) return [];
  const fotos: string[] = [];
  for (const k of CAMPOS_DAS_FOTOS) {
    const u = typeof a[k] === 'string' ? (a[k] as string).trim() : '';
    if (/^https:\/\/\S+$/.test(u) && !fotos.includes(u)) fotos.push(u);
  }
  return fotos;
}

export function aindaValem(f: FotosDoArtista | undefined, agora: number): f is FotosDoArtista {
  return !!f && agora - f.em < (f.fotos.length ? VALIDADE_COM_FOTOS : VALIDADE_SEM_FOTOS);
}

/**
 * A foto de uma música: a que já tinha, ou a menos usada deste artista (num
 * empate, a primeira). `fotos` volta igual quando nada mudou, e com a música
 * nova quando lhe calhou uma.
 */
export function fotoDaMusica(f: FotosDoArtista, musica: string): { foto: string | null; fotos: FotosDoArtista } {
  if (!f.fotos.length || !musica) return { foto: null, fotos: f };
  const ja = f.musicas[musica];
  if (Number.isInteger(ja) && ja >= 0 && ja < f.fotos.length) return { foto: f.fotos[ja]!, fotos: f };
  const usos = f.fotos.map(() => 0);
  for (const i of Object.values(f.musicas)) if (Number.isInteger(i) && i >= 0 && i < usos.length) usos[i]!++;
  let escolhida = 0;
  for (let i = 1; i < usos.length; i++) if (usos[i]! < usos[escolhida]!) escolhida = i;
  const entradas = Object.entries(f.musicas).filter(([k]) => k !== musica);
  const musicas = Object.fromEntries(entradas.slice(Math.max(0, entradas.length - (MAXIMO_DE_MUSICAS - 1))));
  musicas[musica] = escolhida;
  return { foto: f.fotos[escolhida]!, fotos: { ...f, musicas } };
}

/** As fotos chegaram outra vez (passou a validade): as músicas mantêm a delas se ela ainda lá estiver. */
export function renovarFotos(antes: FotosDoArtista | undefined, fotos: string[], agora: number): FotosDoArtista {
  const musicas: Record<string, number> = {};
  if (antes) {
    for (const [m, i] of Object.entries(antes.musicas)) {
      const j = fotos.indexOf(antes.fotos[i] ?? '');
      if (j >= 0) musicas[m] = j;
    }
  }
  return { fotos, em: agora, musicas };
}

/** A versão pequena de uma foto do TheAudioDB, para ler a cor dela sem trazer os 3840 px. */
export function fotoPequena(url: string): string {
  return /theaudiodb\.com\/images\//.test(url) && !/\/(small|medium|preview)$/.test(url) ? `${url}/small` : url;
}
