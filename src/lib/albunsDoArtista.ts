/**
 * Os álbuns de um artista, pelo canal dele no YouTube Music (28/9).
 *
 * Porque existe: o separador "Albums" procurava playlists por "<nome> album" e
 * só verificava se o nome aparecia no título. Na página do Isak (rap português)
 * apareciam os álbuns do Isak Danielson -- "Isak Danielson - Yours" começa por
 * "Isak". Com um nome curto nenhuma regra sobre o TEXTO separa os dois: a
 * pesquisa de playlists nem sequer devolvia o Isak certo.
 *
 * O YouTube Music tem um canal por artista, e dois homónimos são dois canais.
 * Quem diz qual é o canal certo são as músicas dele que estão na biblioteca
 * (as "provas"): procura-se cada uma no YouTube Music, e o canal do artista com
 * esse nome que assina a MESMA música (o mesmo vídeo, ou o mesmo título) leva
 * o voto. Os álbuns vêm depois da página desse canal ("Albums" e "Singles &
 * EPs"), cada um com a playlist `OLAK5uy_...` que a app já sabe abrir.
 *
 * Só o que se lê das respostas e as decisões; quem pede é
 * `api/albunsDoArtista.ts`. Sem imports de runtime (a chave do artista entra
 * por parâmetro): testado em Node puro com respostas reais recortadas
 * (`scripts/test-albuns-do-artista.ts`).
 */

export type ArtistaDaCancao = { nome: string; id: string };
export type CancaoComArtistas = { videoId: string; titulo: string; artistas: ArtistaDaCancao[] };
export type Prova = { videoId: string | null; titulo: string };

export type AlbumDoArtista = {
  /** A playlist do álbum (`OLAK5uy_...`), que se abre como qualquer outra. */
  id: string;
  titulo: string;
  /** "Album", "EP" ou "Single" (o YouTube Music pede-se em inglês). */
  tipo: string;
  ano: string | null;
  capa: string | null;
};

/** A forma de um canal de artista. Validada também no processo principal do PC. */
export const FORMA_DO_CANAL = /^UC[\w-]{22}$/;

const texto = (t: any): string =>
  Array.isArray(t?.runs) ? t.runs.map((r: any) => (typeof r?.text === 'string' ? r.text : '')).join('') : '';

function acharTodos(o: unknown, chave: string, fora: any[] = [], fundo = 0): any[] {
  if (!o || typeof o !== 'object' || fundo > 40) return fora;
  if (Array.isArray(o)) {
    for (const x of o) acharTodos(x, chave, fora, fundo + 1);
    return fora;
  }
  const obj = o as Record<string, unknown>;
  if (obj[chave]) { fora.push(obj[chave]); return fora; }
  for (const k of Object.keys(obj)) acharTodos(obj[k], chave, fora, fundo + 1);
  return fora;
}

/** As canções de uma pesquisa do YouTube Music, com o CANAL de cada artista. */
export function lerCancoesComArtistas(resposta: unknown): CancaoComArtistas[] {
  const fora: CancaoComArtistas[] = [];
  for (const it of acharTodos(resposta, 'musicResponsiveListItemRenderer')) {
    const videoId = it?.playlistItemData?.videoId;
    if (typeof videoId !== 'string' || !/^[\w-]{11}$/.test(videoId)) continue;
    const colunas = Array.isArray(it.flexColumns) ? it.flexColumns : [];
    const titulo = texto(colunas[0]?.musicResponsiveListItemFlexColumnRenderer?.text).trim();
    if (!titulo) continue;
    const runs = colunas[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
    const artistas: ArtistaDaCancao[] = [];
    for (const r of Array.isArray(runs) ? runs : []) {
      const id = r?.navigationEndpoint?.browseEndpoint?.browseId;
      // O álbum também é um link (`MPREb_...`); só os canais são artistas.
      if (typeof id === 'string' && FORMA_DO_CANAL.test(id) && typeof r.text === 'string') {
        artistas.push({ nome: r.text, id });
      }
    }
    fora.push({ videoId, titulo, artistas });
  }
  return fora;
}

/** O título para comparar: sem acentos, sem maiúsculas, sem parênteses nem pontuação. */
export function chaveDoTitulo(titulo: string): string {
  return String(titulo ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[([][^()[\]]*[)\]]/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * O canal do artista, pelas músicas dele na biblioteca.
 *
 * Cada prova vota no canal com a chave do artista que assina a mesma música: o
 * mesmo vídeo vale 2, o mesmo título 1, e cada prova vota uma vez por canal.
 * Ganha o mais votado; sem voto nenhum, `null` -- mais vale não mostrar álbuns
 * do que mostrar os de outra pessoa.
 */
export function canalPelasProvas(
  provas: readonly { prova: Prova; cancoes: readonly CancaoComArtistas[] }[],
  alvo: string,
  chaveDeArtista: (nome: string) => string,
): string | null {
  if (!alvo) return null;
  const votos = new Map<string, number>();
  for (const { prova, cancoes } of provas) {
    const titulo = chaveDoTitulo(prova.titulo);
    const destaProva = new Map<string, number>();
    for (const c of cancoes) {
      const peso = prova.videoId && c.videoId === prova.videoId ? 2
        : titulo && chaveDoTitulo(c.titulo) === titulo ? 1 : 0;
      if (!peso) continue;
      for (const a of c.artistas) {
        if (chaveDeArtista(a.nome) !== alvo) continue;
        destaProva.set(a.id, Math.max(destaProva.get(a.id) ?? 0, peso));
      }
    }
    for (const [id, peso] of destaProva) votos.set(id, (votos.get(id) ?? 0) + peso);
  }
  let melhor: string | null = null;
  let maisVotos = 0;
  for (const [id, n] of votos) if (n > maisVotos) { melhor = id; maisVotos = n; }
  return melhor;
}

/**
 * Sem músicas na biblioteca não há provas: só serve um canal se for o ÚNICO
 * com este nome na pesquisa. Com dois homónimos (`Isak` e `ISÁK` dão a mesma
 * chave), nenhum.
 */
export function canalSemProvas(
  cancoes: readonly CancaoComArtistas[],
  alvo: string,
  chaveDeArtista: (nome: string) => string,
): string | null {
  if (!alvo) return null;
  const ids = new Set<string>();
  for (const c of cancoes) for (const a of c.artistas) if (chaveDeArtista(a.nome) === alvo) ids.add(a.id);
  return ids.size === 1 ? [...ids][0]! : null;
}

const SECCOES_DE_ALBUNS = new Set(['albums', 'singles & eps', 'singles', 'eps']);

/** Os álbuns, EPs e singles da página do canal, pela ordem do YouTube Music. */
export function lerAlbunsDoCanal(resposta: unknown): AlbumDoArtista[] {
  const fora: AlbumDoArtista[] = [];
  const vistos = new Set<string>();
  for (const prateleira of acharTodos(resposta, 'musicCarouselShelfRenderer')) {
    const cabecalho = prateleira?.header?.musicCarouselShelfBasicHeaderRenderer;
    const nome = texto(cabecalho?.title).trim().toLowerCase();
    if (!SECCOES_DE_ALBUNS.has(nome)) continue;
    for (const entrada of Array.isArray(prateleira.contents) ? prateleira.contents : []) {
      const it = entrada?.musicTwoRowItemRenderer;
      const id = it?.thumbnailOverlay?.musicItemThumbnailOverlayRenderer?.content
        ?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchPlaylistEndpoint?.playlistId;
      if (typeof id !== 'string' || !/^OLAK5uy_[\w-]{10,60}$/.test(id) || vistos.has(id)) continue;
      const titulo = texto(it.title).trim();
      if (!titulo) continue;
      // "2026" na prateleira dos álbuns; "EP • 2025" / "Single • 2026" na outra.
      const partes = texto(it.subtitle).split('•').map((p) => p.trim()).filter(Boolean);
      const ano = partes.find((p) => /^\d{4}$/.test(p)) ?? null;
      const tipo = partes.find((p) => !/^\d{4}$/.test(p)) ?? 'Album';
      const miniaturas = it.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails;
      const capa = Array.isArray(miniaturas) && typeof miniaturas[miniaturas.length - 1]?.url === 'string'
        ? miniaturas[miniaturas.length - 1].url : null;
      vistos.add(id);
      fora.push({ id, titulo, tipo, ano, capa });
    }
  }
  return fora;
}

/** A linha por baixo do título do álbum: "EP · 2025". */
export function legendaDoAlbum(a: Pick<AlbumDoArtista, 'tipo' | 'ano'>): string {
  return a.ano ? `${a.tipo} · ${a.ano}` : a.tipo;
}
