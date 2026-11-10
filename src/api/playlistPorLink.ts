import { fetchYouTubePlaylistById } from './youtube';
import { semCleanNosResultados } from '../state/versoesClean';
import { searchYouTubeFreeWithChannel } from './ytSearchFree';
import { cancoesParaImportar } from './ytMusic';
import { addTracksToPlaylist, createPlaylist } from './playlists';
import { guardarMuitasNasGostadas } from './library';
import { importSpotifyCsv } from '../lib/spotifyImport';
import {
  lerEmbedDoSpotify, lerFaixasDoDeezer, lerLink, lerPaginaDaApple, lerPlaylistDoDeezer, urlDoEmbed,
  type LinhaDaPlaylist, type PlaylistLida,
} from '../lib/linkDePlaylist';
import { MAXIMO_POR_IMPORTACAO, type Dependencias } from '../lib/importacaoPorLink';

/**
 * As dependências reais da importação (lib/importacaoPorLink.ts).
 * As páginas pedem-se como um browser: sem User-Agent o Spotify e a Apple
 * respondem com outra página. No iPhone o `fetch` é nativo e não tem CORS; no
 * PC nenhum destes serviços manda `Access-Control-Allow-Origin`, e vai tudo
 * pelo processo principal, que só aceita o id ou o link, nunca um endereço
 * qualquer (electron/main.cjs).
 */
const COMO_UM_BROWSER = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' };

const ponte = () => (typeof window !== 'undefined' ? window.duotoneDesktop : undefined);

async function comPrazo<T>(ms: number, f: (sinal: AbortSignal) => Promise<T>): Promise<T> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await f(c.signal); } finally { clearTimeout(t); }
}

/** Um GET à API do Deezer (o mesmo caminho do catálogo no PC). */
async function pedirAoDeezer(caminho: string): Promise<any> {
  const p = ponte()?.pedirAoCatalogo;
  if (p) return p(caminho);
  return comPrazo(10000, async (signal) => {
    const r = await fetch(`https://api.deezer.com${caminho}`, { signal });
    return r.ok ? r.json() : null;
  });
}

/**
 * A playlist do Deezer inteira, às páginas de 100, até ao máximo por
 * importação. O `/playlist/ID` já traz as primeiras (medido: 100 de 100).
 */
async function lerDeezer(id: string): Promise<PlaylistLida | null> {
  const p = lerPlaylistDoDeezer(await pedirAoDeezer(`/playlist/${id}`));
  if (!p) return null;
  const faixas: LinhaDaPlaylist[] = [...p.faixas];
  const total = Math.min(p.total ?? faixas.length, MAXIMO_POR_IMPORTACAO);
  while (faixas.length < total) {
    const pagina = lerFaixasDoDeezer(await pedirAoDeezer(`/playlist/${id}/tracks?index=${faixas.length}&limit=100`));
    if (!pagina || !pagina.faixas.length) break;
    faixas.push(...pagina.faixas);
  }
  return { ...p, faixas };
}

/** O `link.deezer.com/s/…` da partilha, até ao id da playlist. */
async function resolverDeezerCurto(url: string): Promise<string | null> {
  const p = ponte()?.resolverLinkDoDeezer;
  const final = p
    ? await p(url)
    : await comPrazo(10000, async (signal) => {
      const r = await fetch(url, { signal, headers: COMO_UM_BROWSER });
      // O redirecionamento pode ser HTTP (o `r.url` final) ou estar na página.
      const corpo = r.ok ? await r.text() : '';
      return `${r.url} ${corpo.slice(0, 200000)}`;
    });
  const link = final ? lerLink(final) : null;
  return link?.tipo === 'deezer' ? link.id : null;
}

async function lerApple(url: string): Promise<PlaylistLida | null> {
  const p = ponte()?.lerPlaylistDaApple;
  const html = p
    ? await p(url)
    : await comPrazo(15000, async (signal) => {
      const r = await fetch(url, { signal, headers: COMO_UM_BROWSER });
      return r.ok ? r.text() : null;
    });
  return html ? lerPaginaDaApple(html) : null;
}

export const dependenciasReais: Dependencias = {
  lerSpotify: async (id) => {
    // No PC a janela tem o `webSecurity` ligado e o Spotify não manda CORS:
    // vai pelo processo principal, como o catálogo (api/catalogo.ts).
    const p = ponte()?.lerEmbedDoSpotify;
    if (p) {
      const html = await p(id);
      return html ? lerEmbedDoSpotify(html) : null;
    }
    const r = await fetch(urlDoEmbed(id), { headers: COMO_UM_BROWSER });
    if (!r.ok) return null;
    return lerEmbedDoSpotify(await r.text());
  },
  lerYouTube: (id) => fetchYouTubePlaylistById(id),
  lerDeezer,
  resolverDeezerCurto,
  lerApple,
  resolver: async (linhas, aoAvancar, sinal) => {
    const r = await importSpotifyCsv({
      rows: linhas,
      // As clean conhecidas trocam-se pela explicita antes de o comparador escolher (sem pedidos).
      search: async (q) => semCleanNosResultados(await searchYouTubeFreeWithChannel(q, sinal)),
      // Primeiro as canções do YouTube Music (10/11): o catálogo, com o artista e a duração certos.
      searchSongs: (q) => cancoesParaImportar(q, sinal),
      signal: sinal,
      onProgress: (p) => aoAvancar(p.done),
    });
    return r.map((x) => ({ track: x.track as any, confident: x.confident }));
  },
  criarPlaylist: (nome) => createPlaylist(nome),
  adicionar: (id, faixas) => addTracksToPlaylist(id, faixas),
  guardarNasGostadas: (faixas) => guardarMuitasNasGostadas(faixas as any),
};
