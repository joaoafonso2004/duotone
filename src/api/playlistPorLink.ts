import { fetchYouTubePlaylistById } from './youtube';
import { searchYouTubeFreeWithChannel } from './ytSearchFree';
import { addTracksToPlaylist, createPlaylist } from './playlists';
import { importSpotifyCsv } from '../lib/spotifyImport';
import { lerEmbedDoSpotify, urlDoEmbed } from '../lib/linkDePlaylist';
import type { Dependencias } from '../lib/importacaoPorLink';

/**
 * As dependências reais da importação por link (lib/importacaoPorLink.ts).
 * O embed pede-se como um browser: sem User-Agent o Spotify responde a outra
 * página. No iPhone o `fetch` é nativo e não tem CORS; no PC vai pela ponte.
 */
export const dependenciasReais: Dependencias = {
  lerSpotify: async (id) => {
    // No PC a janela tem o `webSecurity` ligado e o Spotify não manda CORS:
    // vai pelo processo principal, como o catálogo (api/catalogo.ts).
    const ponte = typeof window !== 'undefined' ? window.duotoneDesktop?.lerEmbedDoSpotify : undefined;
    if (ponte) {
      const html = await ponte(id);
      return html ? lerEmbedDoSpotify(html) : null;
    }
    const r = await fetch(urlDoEmbed(id), { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' } });
    if (!r.ok) return null;
    return lerEmbedDoSpotify(await r.text());
  },
  lerYouTube: (id) => fetchYouTubePlaylistById(id),
  resolver: async (linhas, aoAvancar, sinal) => {
    const r = await importSpotifyCsv({
      rows: linhas,
      search: (q) => searchYouTubeFreeWithChannel(q, sinal),
      signal: sinal,
      onProgress: (p) => aoAvancar(p.done),
    });
    return r.map((x) => ({ track: x.track as any, confident: x.confident }));
  },
  criarPlaylist: (nome) => createPlaylist(nome),
  adicionar: (id, faixas) => addTracksToPlaylist(id, faixas),
};
