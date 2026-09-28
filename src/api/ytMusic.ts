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
  const q = String(pergunta ?? '').trim();
  if (!q) return [];
  try {
    const ponte = typeof window !== 'undefined' ? window.duotoneDesktop?.pesquisarCancoes : undefined;
    if (ponte) return lerCancoes(await ponte({ query: q, clientVersion: VERSAO_DO_CLIENTE }));

    const controlo = new AbortController();
    const prazo = setTimeout(() => controlo.abort(), PRAZO_MS);
    const desistir = () => controlo.abort();
    sinal?.addEventListener('abort', desistir);
    try {
      const r = await fetch('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpoDaPesquisa(q)),
        signal: controlo.signal,
      });
      if (!r.ok) return [];
      return lerCancoes(await r.json());
    } finally {
      clearTimeout(prazo);
      sinal?.removeEventListener('abort', desistir);
    }
  } catch {
    return [];
  }
}
