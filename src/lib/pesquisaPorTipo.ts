/**
 * A pesquisa por tipo: artistas e álbuns, além das músicas (29/9).
 *
 * A pesquisa da app devolvia só músicas -- procurar "Isak" dava faixas soltas,
 * e para chegar ao artista ou a um álbum era preciso tocar numa e ir por ela.
 * O YouTube Music já separa os tipos, e cada resultado traz o que a app
 * precisa: o CANAL do artista (a página dele abre-se sem adivinhar pelo nome --
 * nada de homónimos) e a playlist `OLAK5uy_...` do álbum, que se abre pelo
 * caminho de sempre.
 *
 * Só o que se lê das respostas e os filtros; quem pede é `api/ytMusic.ts` (no
 * PC pelo processo principal). Sem imports de runtime: testado em Node puro
 * com respostas reais (`scripts/test-pesquisa-por-tipo.ts`).
 */

export type TipoDePesquisa = 'cancoes' | 'artistas' | 'albuns' | 'playlists' | 'playlistsEditoriais';

/** Os filtros da pesquisa do YouTube Music. Os mesmos no processo principal do PC. */
export const FILTROS_DA_PESQUISA: Readonly<Record<TipoDePesquisa, string>> = {
  cancoes: 'EgWKAQIIAWoKEAkQBRAKEAMQBA==',
  artistas: 'EgWKAQIgAWoMEA4QChADEAQQCRAF',
  albuns: 'EgWKAQIYAWoMEA4QChADEAQQCRAF',
  // As de pessoas ("chill Drake playlist") e as editoriais ("Presenting Drake").
  playlists: 'EgeKAQQoAEABagwQDhAKEAMQBBAJEAU=',
  playlistsEditoriais: 'EgeKAQQoADgBagwQDhAKEAMQBBAJEAU=',
};

export type ArtistaEncontrado = {
  nome: string;
  /** O canal no YouTube Music (`UC...`): é por ele que a página do artista abre. */
  canal: string;
  /** "1.6K subscribers" / "1.49M monthly audience". */
  legenda: string;
  foto: string | null;
};

export type AlbumEncontrado = {
  /** A playlist do álbum (`OLAK5uy_...`). */
  id: string;
  titulo: string;
  /** "Album", "EP" ou "Single". */
  tipo: string;
  artista: string;
  ano: string | null;
  capa: string | null;
};

export type PlaylistEncontrada = {
  /** A playlist (`PL...` ou `RDCLAK5uy_...`), sem o `VL` da página. */
  id: string;
  titulo: string;
  /** "Nabhan Noufal · 1.2M views", ou "95 songs" numa editorial. */
  legenda: string;
  capa: string | null;
  /** Das listas editoriais do serviço, e não de uma pessoa. */
  editorial: boolean;
};

const texto = (t: any): string =>
  Array.isArray(t?.runs) ? t.runs.map((r: any) => (typeof r?.text === 'string' ? r.text : '')).join('') : '';

function itens(o: unknown, fora: any[] = [], fundo = 0): any[] {
  if (!o || typeof o !== 'object' || fundo > 40) return fora;
  if (Array.isArray(o)) { for (const x of o) itens(x, fora, fundo + 1); return fora; }
  const obj = o as Record<string, any>;
  if (obj.musicResponsiveListItemRenderer) { fora.push(obj.musicResponsiveListItemRenderer); return fora; }
  for (const k of Object.keys(obj)) itens(obj[k], fora, fundo + 1);
  return fora;
}

const coluna = (it: any, i: number) => texto(it?.flexColumns?.[i]?.musicResponsiveListItemFlexColumnRenderer?.text).trim();
const partes = (t: string) => t.split('•').map((p) => p.trim()).filter(Boolean);
function miniatura(it: any): string | null {
  const lista = it?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
  const ultima = Array.isArray(lista) ? lista[lista.length - 1]?.url : null;
  return typeof ultima === 'string' ? ultima : null;
}

/** Os artistas de uma pesquisa com o filtro `artistas`, pela ordem do YouTube Music. */
export function lerArtistasDaPesquisa(resposta: unknown): ArtistaEncontrado[] {
  const fora: ArtistaEncontrado[] = [];
  const vistos = new Set<string>();
  for (const it of itens(resposta)) {
    const canal = it?.navigationEndpoint?.browseEndpoint?.browseId;
    if (typeof canal !== 'string' || !/^UC[\w-]{22}$/.test(canal) || vistos.has(canal)) continue;
    const nome = coluna(it, 0);
    if (!nome) continue;
    // "Artist • 1.6K subscribers": o tipo sai, fica a audiência.
    const resto = partes(coluna(it, 1)).filter((p) => p.toLowerCase() !== 'artist');
    vistos.add(canal);
    fora.push({ nome, canal, legenda: resto.join(' · '), foto: miniatura(it) });
  }
  return fora;
}

/** Os álbuns, EPs e singles de uma pesquisa com o filtro `albuns`. */
export function lerAlbunsDaPesquisa(resposta: unknown): AlbumEncontrado[] {
  const fora: AlbumEncontrado[] = [];
  const vistos = new Set<string>();
  for (const it of itens(resposta)) {
    const id = it?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
      ?.playNavigationEndpoint?.watchPlaylistEndpoint?.playlistId;
    if (typeof id !== 'string' || !/^OLAK5uy_[\w-]{10,60}$/.test(id) || vistos.has(id)) continue;
    const titulo = coluna(it, 0);
    if (!titulo) continue;
    // "Album • Isak, Zigarro & Armando Teles • 2026"
    const p = partes(coluna(it, 1));
    const ano = p.find((x) => /^\d{4}$/.test(x)) ?? null;
    const semAno = p.filter((x) => x !== ano);
    const tipo = semAno.length > 1 ? semAno[0]! : 'Album';
    const artista = semAno.length > 1 ? semAno.slice(1).join(' • ') : semAno[0] ?? '';
    vistos.add(id);
    fora.push({ id, titulo, tipo, artista, ano, capa: miniatura(it) });
  }
  return fora;
}

/** A linha por baixo de um álbum encontrado: "EP · Isak · 2026". */
export function legendaDoAlbumEncontrado(a: Pick<AlbumEncontrado, 'tipo' | 'artista' | 'ano'>): string {
  return [a.tipo, a.artista, a.ano].filter(Boolean).join(' · ');
}

/** As playlists de uma pesquisa com o filtro `playlists` ou `playlistsEditoriais`. */
export function lerPlaylistsDaPesquisa(resposta: unknown, editorial: boolean): PlaylistEncontrada[] {
  const fora: PlaylistEncontrada[] = [];
  const vistos = new Set<string>();
  for (const it of itens(resposta)) {
    const pagina = it?.navigationEndpoint?.browseEndpoint?.browseId;
    const id = typeof pagina === 'string' ? pagina.replace(/^VL/, '') : '';
    if (!/^(PL|RDCLAK5uy_|OLAK5uy_)[\w-]{8,80}$/.test(id) || vistos.has(id)) continue;
    const titulo = coluna(it, 0);
    if (!titulo) continue;
    // "Nabhan Noufal • 1.2M views" / "YouTube Music • 95 songs": o nome do
    // serviço sai (a interface não diz de onde vem), e o "Playlist" também.
    const resto = partes(coluna(it, 1)).filter((p) => !/^(playlist|youtube music|youtube)$/i.test(p));
    vistos.add(id);
    fora.push({ id, titulo, legenda: resto.join(' · '), capa: capaMedia(it), editorial });
  }
  return fora;
}

/** A capa com uns 600 px: as de 1200 são peso a mais para uma grelha. */
function capaMedia(it: any): string | null {
  const lista: any[] = it?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ?? [];
  const boa = lista.find((t) => typeof t?.url === 'string' && t.width >= 400) ?? lista[lista.length - 1];
  return typeof boa?.url === 'string' ? boa.url : null;
}

/** As palavras que dizem o TIPO do que se procura, e não o que se procura. */
const INTENCAO = /^(playlists?|mix(es)?|albu(m|ns|ms)|álbu(m|ns)|eps?|songs?|musicas?|músicas?|tracks?)$/i;

/** Os termos a sério de uma pesquisa: "drake playlist" → ["drake"]. */
export function termosDaPergunta(pergunta: string): string[] {
  return pergunta.toLowerCase().split(/\s+/).map((p) => p.trim()).filter((p) => p && !INTENCAO.test(p));
}

/**
 * Sem as palavras de intenção, para as pesquisas de artistas e álbuns:
 * "drake playlist" nos álbuns dava os de toda a gente, porque "playlist" também
 * contava. Se não sobrar nada, fica a pergunta como veio.
 */
export function perguntaSemIntencao(pergunta: string): string {
  const sobra = pergunta.trim().split(/\s+/).filter((p) => p && !INTENCAO.test(p)).join(' ');
  return sobra || pergunta.trim();
}

/**
 * O separador que a própria pergunta pede: "drake playlist" abre as
 * Playlists, "drake album" os Albums. `null` quando não diz.
 */
export function separadorPedidoPelaPergunta(pergunta: string): 'playlists' | 'albuns' | null {
  const palavras = pergunta.toLowerCase().split(/\s+/);
  if (palavras.some((p) => /^playlists?$/.test(p))) return 'playlists';
  if (palavras.some((p) => /^(albu(m|ns|ms)|álbu(m|ns))$/.test(p))) return 'albuns';
  return null;
}

/**
 * As duas listas numa só. Primeiro as que têm os termos no título (de pessoas
 * ou editoriais, pela ordem de cada uma, a editorial à frente: "Presenting
 * Drake" é a do artista); depois as outras de pessoas, e só no fim as
 * editoriais que não dizem nada da pergunta ("Feel-Good Hip Hop and R&B").
 */
export function juntarPlaylists(
  pergunta: string, editoriais: readonly PlaylistEncontrada[], dePessoas: readonly PlaylistEncontrada[],
): PlaylistEncontrada[] {
  const termos = termosDaPergunta(pergunta);
  const tem = (p: PlaylistEncontrada) => termos.length > 0 && termos.every((t) => p.titulo.toLowerCase().includes(t));
  const vistos = new Set<string>();
  const fora: PlaylistEncontrada[] = [];
  const por = (lista: readonly PlaylistEncontrada[], passa: (p: PlaylistEncontrada) => boolean) => {
    for (const p of lista) if (passa(p) && !vistos.has(p.id)) { vistos.add(p.id); fora.push(p); }
  };
  por(editoriais, tem);
  por(dePessoas, tem);
  por(dePessoas, () => true);
  por(editoriais, () => true);
  return fora;
}
