import { corpoDaPesquisa, lerCancoes, VERSAO_DO_CLIENTE, type CancaoDoYtMusic } from '../lib/cancoesDoYtMusic';
import { FORMA_DA_LISTA, FORMA_DO_CANAL } from '../lib/albunsDoArtista';
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

async function pedirAoYtMusic(caminho: 'search' | 'browse', corpo: unknown, sinal?: AbortSignal): Promise<unknown | null> {
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
