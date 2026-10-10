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
export type CancaoComArtistas = {
  videoId: string; titulo: string; artistas: ArtistaDaCancao[];
  /** Nas listas de um artista vem a duração; na pesquisa às vezes não. */
  duracaoSec: number | null;
  /** Nas listas do canal (10/10): "2.4B plays" tal como vem (`lerReproducoes`, em lib/ordemDoArtista.ts). */
  reproducoes?: string | null;
  /** E o álbum (o link `MPREb_...`): é por ele que se sabe o ano da música. */
  album?: string | null;
};
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
/**
 * O Mix de um artista (29/9): o botão "Mix" do cabeçalho do canal no YouTube
 * Music. É uma rádio (`RDEM...`) que começa num vídeo dele; lê-se pelo `next`
 * do YouTube Music (o do youtube.com não a conhece) e traz 50 músicas, dele e
 * de parecidos -- o mesmo que o botão faz lá.
 */
export type MixDoArtista = { playlistId: string; videoId: string; params: string | null };
/** A forma do id do Mix e dos `params` dele. Validadas também no processo principal do PC. */
export const FORMA_DO_MIX_DO_ARTISTA = /^RD[\w-]{2,80}$/;
export const FORMA_DOS_PARAMS = /^[\w%=-]{1,40}$/;

export function mixDoCanal(resposta: unknown): MixDoArtista | null {
  for (const cabecalho of acharTodos(resposta, 'musicImmersiveHeaderRenderer').concat(acharTodos(resposta, 'musicVisualHeaderRenderer'))) {
    const w = cabecalho?.startRadioButton?.buttonRenderer?.navigationEndpoint?.watchEndpoint;
    const playlistId = w?.playlistId;
    const videoId = w?.videoId;
    if (typeof playlistId !== 'string' || !FORMA_DO_MIX_DO_ARTISTA.test(playlistId)) continue;
    if (typeof videoId !== 'string' || !/^[\w-]{11}$/.test(videoId)) continue;
    const params = typeof w.params === 'string' && FORMA_DOS_PARAMS.test(w.params) ? w.params : null;
    return { playlistId, videoId, params };
  }
  return null;
}

/**
 * A foto do artista, do cabeçalho do canal no YouTube Music (30/9).
 *
 * O canal é o que as músicas da biblioteca provaram ser o dele, por isso é a
 * cara certa mesmo quando o catálogo não tem foto (ou tem a de um homónimo).
 * Primeiro a redonda de primeiro plano (`musicVisualHeaderRenderer`), que já é
 * quadrada; senão o fundo largo do cabeçalho grande, pedido quadrado ao
 * servidor das imagens (`=w600-h600-p`, "p" corta para encher).
 */
export function fotoDoCanal(resposta: unknown): string | null {
  const visuais = acharTodos(resposta, 'musicVisualHeaderRenderer');
  const grandes = acharTodos(resposta, 'musicImmersiveHeaderRenderer');
  const listas = [
    ...visuais.map((c) => c?.foregroundThumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails),
    ...grandes.map((c) => c?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails),
    ...visuais.map((c) => c?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails),
  ];
  for (const lista of listas) {
    if (!Array.isArray(lista)) continue;
    const maior = lista
      .filter((t) => typeof t?.url === 'string' && /^https:\/\//.test(t.url))
      .sort((a, b) => (Number(b?.width) || 0) - (Number(a?.width) || 0))[0];
    if (maior) return quadrada(maior.url);
  }
  return null;
}

function quadrada(url: string): string {
  return /=w\d+-h\d+/.test(url) ? url.replace(/=w\d+-h\d+(-p)?/, '=w600-h600-p') : url;
}

/** As músicas do Mix de um artista, da resposta do `next` do YouTube Music. */
export function lerRadioDoYtMusic(resposta: unknown): CancaoComArtistas[] {
  const fora: CancaoComArtistas[] = [];
  const vistos = new Set<string>();
  for (const v of acharTodos(resposta, 'playlistPanelVideoRenderer')) {
    const videoId = v?.videoId;
    if (typeof videoId !== 'string' || !/^[\w-]{11}$/.test(videoId) || vistos.has(videoId)) continue;
    const titulo = texto(v.title).trim();
    if (!titulo) continue;
    // "Holly Hood • O Dread Que Matou Golias • 2016": os artistas são os links
    // para um canal; sem eles, a primeira parte da linha.
    const runs: any[] = Array.isArray(v.longBylineText?.runs) ? v.longBylineText.runs : [];
    const artistas: ArtistaDaCancao[] = [];
    for (const r of runs) {
      const id = r?.navigationEndpoint?.browseEndpoint?.browseId;
      if (typeof id === 'string' && FORMA_DO_CANAL.test(id) && typeof r.text === 'string') artistas.push({ nome: r.text, id });
    }
    if (!artistas.length) {
      const primeiro = texto(v.longBylineText).split('•')[0]?.trim();
      if (primeiro) artistas.push({ nome: primeiro, id: '' });
    }
    vistos.add(videoId);
    fora.push({ videoId, titulo, artistas, duracaoSec: segundos(texto(v.lengthText).trim()) });
  }
  return fora;
}

/** Um token de continuação do YouTube Music. Validado também no processo principal do PC. */
export const FORMA_DA_CONTINUACAO = /^[\w%=-]{16,4000}$/;

/**
 * Uma página de uma playlist lida no YouTube Music (29/9): as listas
 * editoriais (`RDCLAK5uy_...`, "Presenting Drake") leem-se por aqui, porque a
 * Data API as devolve em páginas sem fim e com as mesmas músicas repetidas.
 * Traz 100 músicas por página; `continuacao` é o token da seguinte, ou `null`.
 */
export function lerPaginaDaPlaylist(resposta: unknown): {
  titulo: string | null; cancoes: CancaoComArtistas[]; continuacao: string | null;
} {
  const cabecalho = acharTodos(resposta, 'musicResponsiveHeaderRenderer')[0]
    ?? acharTodos(resposta, 'musicDetailHeaderRenderer')[0];
  const titulo = texto(cabecalho?.title).trim() || null;
  let continuacao: string | null = null;
  for (const c of acharTodos(resposta, 'continuationItemRenderer')) {
    const token = c?.continuationEndpoint?.continuationCommand?.token;
    if (typeof token === 'string' && FORMA_DA_CONTINUACAO.test(token)) { continuacao = token; break; }
  }
  return { titulo, cancoes: lerCancoesComArtistas(resposta), continuacao };
}

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
    const tempo = texto(it.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text).trim();
    // Das outras colunas: as reproduções ("2.4B plays") e o álbum (o link MPREb_).
    let reproducoes: string | null = null;
    let album: string | null = null;
    for (const coluna of colunas.slice(2)) {
      const t = coluna?.musicResponsiveListItemFlexColumnRenderer?.text;
      const escrito = texto(t).trim();
      if (!reproducoes && /^[\d.,]+\s*[KMB]?\s+(?:plays|views)$/i.test(escrito)) reproducoes = escrito;
      const doAlbum = (Array.isArray(t?.runs) ? t.runs : []).find((r: any) => /^MPREb_/.test(r?.navigationEndpoint?.browseEndpoint?.browseId ?? ''));
      if (!album && typeof doAlbum?.text === 'string') album = doAlbum.text;
    }
    fora.push({ videoId, titulo, artistas, duracaoSec: segundos(tempo), reproducoes, album });
  }
  return fora;
}

function segundos(texto: string): number | null {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(texto);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
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

/** A lista "todas as músicas" de um artista (`VLOLAK5uy_...`). Validada também no PC. */
export const FORMA_DA_LISTA = /^VL(OLAK5uy_|PL|RDCLAK5uy_)[\w-]{10,80}$/;

/**
 * As músicas da página do canal (a prateleira "Top songs", 29/9) e a lista com
 * TODAS as músicas dele, que é o "Show all" dessa prateleira. É daqui que vêm
 * as "More tracks" da página de artista: do canal certo, e não de uma pesquisa
 * pelo nome, que trazia as de um homónimo.
 */
export function lerMusicasDoCanal(resposta: unknown): { topo: CancaoComArtistas[]; todas: string | null } {
  for (const prateleira of acharTodos(resposta, 'musicShelfRenderer')) {
    const topo = lerCancoesComArtistas(prateleira);
    if (!topo.length) continue;
    const alvo = prateleira?.bottomEndpoint?.browseEndpoint?.browseId
      ?? prateleira?.title?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId;
    return { topo, todas: typeof alvo === 'string' && FORMA_DA_LISTA.test(alvo) ? alvo : null };
  }
  return { topo: [], todas: null };
}

/**
 * O lançamento mais recente, para o destaque no topo da página do artista.
 * O YouTube Music só dá o ANO, por isso é o do ano mais alto; entre dois do
 * mesmo ano fica o álbum (os singles costumam sair antes do álbum que os traz),
 * e entre iguais o primeiro da lista, que o YouTube Music ordena do mais novo.
 */
export function maisRecente(albuns: readonly AlbumDoArtista[]): AlbumDoArtista | null {
  let melhor: AlbumDoArtista | null = null;
  for (const a of albuns) {
    if (!a.ano) continue;
    if (!melhor || Number(a.ano) > Number(melhor.ano)
      || (a.ano === melhor.ano && a.tipo === 'Album' && melhor.tipo !== 'Album')) melhor = a;
  }
  return melhor;
}
