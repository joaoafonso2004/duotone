import type { LinhaDaPlaylist } from './linkDePlaylist';
import { listasParaEscolher, MAXIMO_DA_CONTA, MAXIMO_DE_PLAYLISTS, quantasLer, type ListaDoSpotify } from './bibliotecaDoSpotify';

/**
 * A conta do Spotify no PC, lida pelo leitor web (10/11). O login e o token
 * vivem no processo principal (`electron/contaDoSpotify.cjs`); daqui só se
 * pedem consultas e se leem as respostas -- as mesmas formas que o ytspot e o
 * SongMirror leem (o `playlistV2`, o `libraryV3`, o `me.library.tracks`).
 *
 * As linhas que saem daqui são as do `bibliotecaDoSpotify.ts` (as do iPhone):
 * vão para o mesmo comparador pela fila de importações, e a escolha das listas
 * segue o `listasParaEscolher` de lá.
 *
 * O `consultar` entra por parâmetro: testado com respostas gravadas em
 * `scripts/test-leitor-web-do-spotify.ts`.
 */

export type ConsultaDoLeitor = 'profileAttributes' | 'libraryV3' | 'fetchLibraryTracks' | 'fetchPlaylist';
export type FalhaDoLeitor = 'desligado' | 'rede' | 'ocupado' | 'mudou' | 'recusado';
export type RespostaDoLeitor = { ok: true; dados: any } | { ok: false; falha: FalhaDoLeitor };
export type Consultar = (nome: ConsultaDoLeitor, variaveis: Record<string, unknown>) => Promise<RespostaDoLeitor>;

export class ErroDoLeitor extends Error {
  readonly tipo: FalhaDoLeitor | 'vazio';
  constructor(tipo: FalhaDoLeitor | 'vazio') {
    super(tipo);
    this.tipo = tipo;
  }
}

export function mensagemDoLeitor(tipo: FalhaDoLeitor | 'vazio'): string {
  switch (tipo) {
    case 'desligado': return 'Your Spotify login has expired. Connect again.';
    case 'rede': return "Couldn't reach Spotify. Check your internet connection and try again.";
    case 'ocupado': return 'Spotify is busy right now. Try again in a minute.';
    case 'mudou': return 'Spotify changed its web player. This import needs a Duotone update.';
    case 'vazio': return 'No playlists or Liked Songs on this Spotify account.';
    default: return "Spotify didn't let Duotone read that. Try again later.";
  }
}

const PAGINA_DA_BIBLIOTECA = 50;
const PAGINA_DAS_GOSTADAS = 50;
const PAGINA_DA_PLAYLIST = 100;
/** Quantas contagens de playlists correm ao mesmo tempo. */
const EM_PARALELO = 4;

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** O nome de utilizador da conta (o `username` do `profileAttributes`), para separar as playlists dela das que segue. */
export function euDoPerfil(dados: any): string | null {
  return texto(dados?.me?.profile?.username) || null;
}

/** Uma faixa do leitor (o `data` de um item) numa linha do comparador. `null` para episódios, locais e as que o Spotify já não tem. */
export function linhaDoLeitor(d: any, uriDeReserva?: unknown): LinhaDaPlaylist | null {
  if (!d || d.__typename !== 'Track') return null;
  const uri = texto(d.uri) || texto(uriDeReserva);
  if (!uri.startsWith('spotify:track:')) return null;
  const titulo = texto(d.name);
  const artistas = (Array.isArray(d.artists?.items) ? d.artists.items : []).map((a: any) => texto(a?.profile?.name)).filter(Boolean);
  if (!titulo || !artistas.length) return null;
  const ms = Number(d.trackDuration?.totalMilliseconds ?? d.duration?.totalMilliseconds);
  return { title: titulo, artist: artistas.join(', '), album: texto(d.albumOfTrack?.name) || null, durationMs: ms > 0 ? ms : null, uri };
}

/** Uma página do `fetchPlaylist`: as linhas, pela ordem, quantos itens trouxe, e o total da playlist. */
export function paginaDaPlaylist(dados: any): { linhas: LinhaDaPlaylist[]; itens: number; total: number } {
  const conteudo = dados?.playlistV2?.content;
  const itens: any[] = Array.isArray(conteudo?.items) ? conteudo.items : [];
  const linhas: LinhaDaPlaylist[] = [];
  for (const i of itens) {
    const l = linhaDoLeitor(i?.itemV2?.data, i?.itemV2?._uri);
    if (l) linhas.push(l);
  }
  return { linhas, itens: itens.length, total: Number(conteudo?.totalCount) || 0 };
}

/** Uma página do `fetchLibraryTracks` (as Liked Songs). Aqui o `uri` vem às vezes só no `_uri` de fora. */
export function paginaDasGostadas(dados: any): { linhas: LinhaDaPlaylist[]; itens: number; total: number } {
  const faixas = dados?.me?.library?.tracks;
  const itens: any[] = Array.isArray(faixas?.items) ? faixas.items : [];
  const linhas: LinhaDaPlaylist[] = [];
  for (const i of itens) {
    const l = linhaDoLeitor(i?.track?.data, i?.track?._uri);
    if (l) linhas.push(l);
  }
  return { linhas, itens: itens.length, total: Number(faixas?.totalCount) || 0 };
}

/** A capa mais perto dos 300 px: chega para a lista e não pesa. */
function capaDe(imagens: any): string | null {
  const fontes: any[] = (Array.isArray(imagens?.items) ? imagens.items : []).flatMap((i: any) => (Array.isArray(i?.sources) ? i.sources : []));
  const comUrl = fontes.filter((f) => texto(f?.url));
  if (!comUrl.length) return null;
  const melhor = comUrl.reduce((a, b) => (Math.abs((Number(b?.width) || 300) - 300) < Math.abs((Number(a?.width) || 300) - 300) ? b : a));
  return texto(melhor.url);
}

/**
 * Uma página do `libraryV3` (só as playlists, com as pastas abertas): as
 * playlists, sem total (o `libraryV3` não o traz), quantos itens trouxe e o
 * total da biblioteca. Pastas e playlists apagadas ficam de fora.
 */
export function paginaDaBiblioteca(dados: any, eu: string | null): { listas: ListaDoSpotify[]; itens: number; total: number } {
  const biblioteca = dados?.me?.libraryV3;
  const itens: any[] = Array.isArray(biblioteca?.items) ? biblioteca.items : [];
  const listas: ListaDoSpotify[] = [];
  for (const i of itens) {
    const item = i?.item;
    const d = item?.data;
    if (d?.__typename !== 'Playlist') continue;
    const uri = texto(d.uri) || texto(item?._uri);
    const nome = texto(d.name);
    if (!uri.startsWith('spotify:playlist:') || !nome) continue;
    const dono = texto(d.ownerV2?.data?.username);
    const podeEditar = d.currentUserCapabilities?.canEditItems;
    const doutraPessoa = eu && dono ? dono !== eu : podeEditar === false;
    listas.push({ id: uri, nome, capa: capaDe(d.images), total: 0, doutraPessoa });
  }
  return { listas, itens: itens.length, total: Number(biblioteca?.totalCount) || 0 };
}

export const variaveisDaBiblioteca = (offset: number) => ({
  filters: ['Playlists'], order: 'Alphabetical', textFilter: null, features: [], limit: PAGINA_DA_BIBLIOTECA, offset,
  flatten: true, expandedFolders: null, folderUri: null, includeFoldersWhenFlattening: true,
});
export const variaveisDaPlaylist = (uri: string, offset: number, limit = PAGINA_DA_PLAYLIST) =>
  ({ uri, offset, limit, enableWatchFeedEntrypoint: false });
export const variaveisDasGostadas = (offset: number, limit = PAGINA_DAS_GOSTADAS) => ({ offset, limit });

async function pedir(consultar: Consultar, nome: ConsultaDoLeitor, variaveis: Record<string, unknown>): Promise<any> {
  const r = await consultar(nome, variaveis);
  if (!r.ok) throw new ErroDoLeitor(r.falha);
  return r.dados;
}

/** Corre `fn` sobre a lista, `n` de cada vez, e devolve pela mesma ordem. */
async function emGrupos<T, R>(lista: readonly T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const fora: R[] = new Array(lista.length);
  let proximo = 0;
  await Promise.all(Array.from({ length: Math.min(n, lista.length) }, async () => {
    while (proximo < lista.length) {
      const i = proximo++;
      fora[i] = await fn(lista[i]);
    }
  }));
  return fora;
}

/** O mesmo contrato do `abrirBibliotecaDoSpotify` do iPhone: as listas para escolher, e o `ler` de cada uma. */
export type BibliotecaLida = {
  listas: ListaDoSpotify[];
  ler: (lista: ListaDoSpotify) => Promise<{ linhas: LinhaDaPlaylist[]; cortada: boolean }>;
};

export async function abrirPeloLeitor(consultar: Consultar): Promise<BibliotecaLida> {
  const perfil = await pedir(consultar, 'profileAttributes', {});
  // Sem `me`, o leitor abriu sem sessão: o login caducou.
  if (!perfil?.me) throw new ErroDoLeitor('desligado');
  const eu = euDoPerfil(perfil);

  const gostadas = paginaDasGostadas(await pedir(consultar, 'fetchLibraryTracks', variaveisDasGostadas(0, 1))).total;

  const playlists: ListaDoSpotify[] = [];
  for (let offset = 0; offset < MAXIMO_DE_PLAYLISTS;) {
    const pagina = paginaDaBiblioteca(await pedir(consultar, 'libraryV3', variaveisDaBiblioteca(offset)), eu);
    playlists.push(...pagina.listas);
    offset += pagina.itens;
    if (!pagina.itens || offset >= pagina.total) break;
  }

  // O `libraryV3` não diz quantas músicas tem cada uma: uma página de 1 di-lo.
  // Uma que não se lê fica de fora. Se NENHUMA se ler, diz-se porquê, em vez
  // de mostrar só as Liked Songs como se a pessoa não tivesse playlists.
  const falhas: ErroDoLeitor[] = [];
  const totais = await emGrupos(playlists, EM_PARALELO, async (p) => {
    try {
      return paginaDaPlaylist(await pedir(consultar, 'fetchPlaylist', variaveisDaPlaylist(p.id, 0, 1))).total;
    } catch (e) {
      falhas.push(e instanceof ErroDoLeitor ? e : new ErroDoLeitor('rede'));
      return 0;
    }
  });
  if (playlists.length && falhas.length === playlists.length) throw falhas[0];
  const contadas = playlists.map((p, i) => ({ ...p, total: totais[i] }));

  const listas = listasParaEscolher(gostadas, contadas);
  if (!listas.length) throw new ErroDoLeitor('vazio');

  const ler = async (lista: ListaDoSpotify) => {
    const { ler: quantas, cortada } = quantasLer(lista.total);
    const dasGostadas = lista.id === 'gostadas';
    const linhas: LinhaDaPlaylist[] = [];
    for (let offset = 0; offset < quantas;) {
      const pagina = dasGostadas
        ? paginaDasGostadas(await pedir(consultar, 'fetchLibraryTracks', variaveisDasGostadas(offset)))
        : paginaDaPlaylist(await pedir(consultar, 'fetchPlaylist', variaveisDaPlaylist(lista.id, offset)));
      linhas.push(...pagina.linhas);
      offset += pagina.itens;
      if (!pagina.itens) break;
    }
    return { linhas: linhas.slice(0, MAXIMO_DA_CONTA), cortada };
  };
  return { listas, ler };
}

/**
 * Os artistas que mais aparecem nas listas lidas, do mais frequente para o
 * menos (11/11): o gosto para as recomendações sai da biblioteca da pessoa, e
 * não do login oficial, que só aceita as cinco contas do painel. Conta o
 * primeiro artista de cada música; num empate fica o que apareceu primeiro.
 */
export function artistasPorFrequencia(linhas: readonly LinhaDaPlaylist[], quantos = 50): string[] {
  const contagem = new Map<string, { nome: string; vezes: number; ordem: number }>();
  for (const l of linhas) {
    const nome = (l.artist ?? '').split(', ')[0]?.trim();
    if (!nome) continue;
    const k = nome.toLowerCase();
    const antes = contagem.get(k);
    if (antes) antes.vezes++;
    else contagem.set(k, { nome, vezes: 1, ordem: contagem.size });
  }
  return [...contagem.values()]
    .sort((a, b) => b.vezes - a.vezes || a.ordem - b.ordem)
    .slice(0, quantos)
    .map((a) => a.nome);
}
