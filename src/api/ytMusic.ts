import { corpoDaPesquisa, lerCancoes, VERSAO_DO_CLIENTE, type CancaoDoYtMusic } from '../lib/cancoesDoYtMusic';
import {
  FORMA_DA_CONTINUACAO, FORMA_DA_LISTA, FORMA_DO_CANAL, lerPaginaDaPlaylist, lerRadioDoYtMusic, type MixDoArtista,
} from '../lib/albunsDoArtista';
import type { Track, YtPlaylistItem } from '../types';
import { FILTROS_DA_PESQUISA, type TipoDePesquisa } from '../lib/pesquisaPorTipo';

/**
 * Uma pesquisa de CANÇÕES no YouTube Music, com a marca de explícita (27/9).
 * Ver `lib/cancoesDoYtMusic.ts` para o porquê. Usada pela importação de
 * playlists para não trazer versões censuradas.
 *
 * No PC vai pelo processo principal (`ytmusic:pesquisa`): a janela não pode
 * pedir a outro site. Falhar devolve lista vazia -- a importação continua com
 * a pesquisa de sempre, só sem saber qual é a explícita.
 */
const PRAZO_MS = 10_000;

export async function procurarCancoes(pergunta: string, sinal?: AbortSignal): Promise<CancaoDoYtMusic[]> {
  const resposta = await pesquisarCancoesCru(pergunta, sinal);
  return resposta ? lerCancoes(resposta) : [];
}

/** A resposta inteira da pesquisa de canções, ou `null` se falhou. */
export function pesquisarCancoesCru(pergunta: string, sinal?: AbortSignal): Promise<unknown | null> {
  return pesquisarNoYtMusicCru(pergunta, 'cancoes', sinal);
}

/**
 * A resposta inteira de uma pesquisa do YouTube Music, de um tipo (29/9, a
 * pesquisa por tipo: `lib/pesquisaPorTipo.ts`). No PC vai o NOME do tipo; o
 * filtro escolhe-o o processo principal. `null` se falhou.
 */
export async function pesquisarNoYtMusicCru(pergunta: string, tipo: TipoDePesquisa, sinal?: AbortSignal): Promise<unknown | null> {
  const q = String(pergunta ?? '').trim();
  if (!q) return null;
  try {
    const ponte = typeof window !== 'undefined' ? window.duotoneDesktop?.pesquisarCancoes : undefined;
    if (ponte) return await ponte({ query: q, clientVersion: VERSAO_DO_CLIENTE, tipo });
    return await pedirAoYtMusic('search', { ...corpoDaPesquisa(q), params: FILTROS_DA_PESQUISA[tipo] }, sinal);
  } catch {
    return null;
  }
}

/**
 * Uma página do YouTube Music para a página de artista (`lib/albunsDoArtista.ts`):
 * o canal de um artista (`UC...`, 28/9) ou a lista com todas as músicas dele
 * (`VLOLAK5uy_...`, 29/9). No PC pelo processo principal (`ytmusic:artista`),
 * que só aceita estas duas formas. `null` se falhou.
 */
export async function lerNoYtMusic(browseId: string, sinal?: AbortSignal): Promise<unknown | null> {
  if (!FORMA_DO_CANAL.test(browseId) && !FORMA_DA_LISTA.test(browseId)) return null;
  try {
    const ponte = typeof window !== 'undefined' ? window.duotoneDesktop?.lerArtistaDoYtMusic : undefined;
    if (ponte) return await ponte({ browseId, clientVersion: VERSAO_DO_CLIENTE });
    return await pedirAoYtMusic('browse', {
      context: { client: { clientName: 'WEB_REMIX', clientVersion: VERSAO_DO_CLIENTE, hl: 'en', gl: 'US' } },
      browseId,
    }, sinal);
  } catch {
    return null;
  }
}

/** A página seguinte de uma lista do YouTube Music, pelo token de continuação. */
export async function continuarNoYtMusic(token: string, sinal?: AbortSignal): Promise<unknown | null> {
  if (!FORMA_DA_CONTINUACAO.test(token)) return null;
  try {
    const ponte = typeof window !== 'undefined' ? window.duotoneDesktop?.lerArtistaDoYtMusic : undefined;
    if (ponte) return await ponte({ continuation: token, clientVersion: VERSAO_DO_CLIENTE });
    return await pedirAoYtMusic('browse', {
      context: { client: { clientName: 'WEB_REMIX', clientVersion: VERSAO_DO_CLIENTE, hl: 'en', gl: 'US' } },
      continuation: token,
    }, sinal);
  } catch {
    return null;
  }
}

/** Até quantas páginas de 100 se lê uma playlist pelo YouTube Music: 5000, o teto da Data API. */
const PAGINAS_DA_PLAYLIST = 50;

/**
 * Uma playlist pelo YouTube Music (29/9): sem chave nem quota, e é o caminho
 * de TODAS as playlists desde 30/9 (`fetchYouTubePlaylistById`). Páginas de 100
 * pela continuação, até 5000. Medido: as de pessoas leem-se inteiras (uma de
 * 644 em 7 páginas); nas editoriais (`RDCLAK5uy_...`, "Presenting Drake") a
 * continuação devolve outra vez a primeira página -- por isso uma página sem
 * músicas novas acaba a leitura. `completa` diz se chegou ao fim a sério (a
 * lista acabou, e não desistiu). `null` se a primeira página falhar.
 */
export async function lerPlaylistPeloYtMusic(id: string): Promise<{
  titulo: string | null; itens: YtPlaylistItem[]; completa: boolean;
} | null> {
  const primeira = await lerNoYtMusic(`VL${id}`);
  if (!primeira) return null;
  let pagina = lerPaginaDaPlaylist(primeira);
  const titulo = pagina.titulo;
  const vistos = new Set<string>();
  const itens: YtPlaylistItem[] = [];
  let completa = false;
  for (let n = 0; n < PAGINAS_DA_PLAYLIST; n++) {
    let novas = 0;
    for (const c of pagina.cancoes) {
      if (vistos.has(c.videoId)) continue;
      vistos.add(c.videoId);
      novas++;
      itens.push({
        videoId: c.videoId,
        title: c.titulo,
        channel: c.artistas.map((a) => a.nome).join(' & '),
        thumbnail: `https://i.ytimg.com/vi/${c.videoId}/hqdefault.jpg`,
      });
    }
    if (!pagina.continuacao) { completa = true; break; }
    if (!novas) break;
    const seguinte = await continuarNoYtMusic(pagina.continuacao);
    if (!seguinte) break;
    pagina = lerPaginaDaPlaylist(seguinte);
  }
  return { titulo, itens, completa };
}

/**
 * O Mix de um artista (29/9, `lib/albunsDoArtista.ts`): 50 músicas pelo `next`
 * do YouTube Music, como faixas da app. No PC pelo processo principal
 * (`ytmusic:radio`). Lista vazia se falhou.
 */
export async function lerRadioPeloYtMusic(mix: MixDoArtista): Promise<Track[]> {
  let resposta: unknown = null;
  try {
    const ponte = typeof window !== 'undefined' ? window.duotoneDesktop?.lerRadioDoYtMusic : undefined;
    resposta = ponte
      ? await ponte({ ...mix, clientVersion: VERSAO_DO_CLIENTE })
      : await pedirAoYtMusic('next', {
        context: { client: { clientName: 'WEB_REMIX', clientVersion: VERSAO_DO_CLIENTE, hl: 'en', gl: 'US' } },
        playlistId: mix.playlistId, videoId: mix.videoId, ...(mix.params ? { params: mix.params } : {}),
      });
  } catch {
    return [];
  }
  return lerRadioDoYtMusic(resposta).map((c) => ({
    source: 'youtube' as const,
    sourceId: c.videoId,
    title: c.titulo,
    artist: c.artistas.map((a) => a.nome).join(' & '),
    album: null,
    artworkUrl: `https://i.ytimg.com/vi/${c.videoId}/hqdefault.jpg`,
    durationSeconds: c.duracaoSec,
  }));
}

async function pedirAoYtMusic(caminho: 'search' | 'browse' | 'next', corpo: unknown, sinal?: AbortSignal): Promise<unknown | null> {
  const controlo = new AbortController();
  const prazo = setTimeout(() => controlo.abort(), PRAZO_MS);
  const desistir = () => controlo.abort();
  sinal?.addEventListener('abort', desistir);
  try {
    const r = await fetch(`https://music.youtube.com/youtubei/v1/${caminho}?prettyPrint=false`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: controlo.signal,
    });
    return r.ok ? await r.json() : null;
  } finally {
    clearTimeout(prazo);
    sinal?.removeEventListener('abort', desistir);
  }
}
