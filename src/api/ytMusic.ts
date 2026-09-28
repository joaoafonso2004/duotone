import { corpoDaPesquisa, lerCancoes, VERSAO_DO_CLIENTE, type CancaoDoYtMusic } from '../lib/cancoesDoYtMusic';

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
export async function pesquisarCancoesCru(pergunta: string, sinal?: AbortSignal): Promise<unknown | null> {
  const q = String(pergunta ?? '').trim();
  if (!q) return null;
  try {
    const ponte = typeof window !== 'undefined' ? window.duotoneDesktop?.pesquisarCancoes : undefined;
    if (ponte) return await ponte({ query: q, clientVersion: VERSAO_DO_CLIENTE });
    return await pedirAoYtMusic('search', corpoDaPesquisa(q), sinal);
  } catch {
    return null;
  }
}

/**
 * A página de um artista no YouTube Music (28/9, os álbuns da página de artista:
 * `lib/albunsDoArtista.ts`). No PC pelo processo principal (`ytmusic:artista`),
 * que só aceita a forma de um canal. `null` se falhou.
 */
export async function lerCanalDoYtMusic(canal: string, sinal?: AbortSignal): Promise<unknown | null> {
  if (!/^UC[\w-]{22}$/.test(canal)) return null;
  try {
    const ponte = typeof window !== 'undefined' ? window.duotoneDesktop?.lerArtistaDoYtMusic : undefined;
    if (ponte) return await ponte({ browseId: canal, clientVersion: VERSAO_DO_CLIENTE });
    return await pedirAoYtMusic('browse', {
      context: { client: { clientName: 'WEB_REMIX', clientVersion: VERSAO_DO_CLIENTE, hl: 'en', gl: 'US' } },
      browseId: canal,
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
