/**
 * As CANÇÕES de uma pesquisa no YouTube Music, com a marca de explícita (27/9).
 *
 * Porque existe: um amigo do João tinha as playlists importadas cheias de
 * versões censuradas. O YouTube tem muitas vezes as DUAS no canal "- Topic" da
 * editora -- a explícita e a "clean" --, com o mesmo título, a mesma duração e
 * o mesmo álbum (medido a 27/9: "Laugh Now Cry Later (feat. Lil Durk)" do Drake
 * aparece duas vezes, 4:22 as duas). A pesquisa normal do YouTube não as
 * distingue; a do YouTube Music marca a explícita (`MUSIC_EXPLICIT_BADGE`). O
 * Spotify diz se a faixa pedida é explícita, e o comparador
 * (`lib/trackMatch.ts`) fica com a que bate certo.
 *
 * Só o que se lê da resposta e o corpo do pedido; quem pede é
 * `api/ytMusic.ts` (no PC, pelo processo principal). Sem imports: testado em
 * Node puro com uma resposta real recortada
 * (`scripts/fixtures/ytmusic-cancoes.json`, `scripts/test-cancoes-yt-music.ts`).
 */

/** O filtro "Songs" da pesquisa do YouTube Music (só canções, sem vídeos). */
export const FILTRO_CANCOES = 'EgWKAQIIAWoKEAkQBRAKEAMQBA==';
/**
 * A versão do cliente WEB_REMIX. Se o YouTube Music deixar de responder (HTTP
 * 400), é isto que se atualiza -- como o `clientVersion` do ytstream.ts.
 */
export const VERSAO_DO_CLIENTE = '1.20260914.01.00';

export type CancaoDoYtMusic = {
  videoId: string;
  titulo: string;
  /** Os artistas como o YouTube Music os escreve ("Drake", "Drake & Lil Durk"). */
  artista: string;
  album: string | null;
  duracaoSec: number | null;
  explicita: boolean;
};

export function corpoDaPesquisa(pergunta: string): Record<string, unknown> {
  return {
    context: { client: { clientName: 'WEB_REMIX', clientVersion: VERSAO_DO_CLIENTE, hl: 'en', gl: 'US' } },
    query: String(pergunta ?? '').trim().slice(0, 300),
    params: FILTRO_CANCOES,
  };
}

function textoDaColuna(coluna: any): string {
  const runs = coluna?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
  return Array.isArray(runs) ? runs.map((r: any) => (typeof r?.text === 'string' ? r.text : '')).join('') : '';
}

function segundos(texto: string): number | null {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  return (Number(m[1] ?? 0) * 3600) + Number(m[2]) * 60 + Number(m[3]);
}

/** As canções da resposta, pela ordem em que vêm. O que não se percebe fica de fora. */
export function lerCancoes(resposta: unknown): CancaoDoYtMusic[] {
  const itens: any[] = [];
  (function andar(o: any, fundo: number) {
    if (!o || typeof o !== 'object' || fundo > 40) return;
    if (o.musicResponsiveListItemRenderer) { itens.push(o.musicResponsiveListItemRenderer); return; }
    for (const k of Object.keys(o)) andar(o[k], fundo + 1);
  })(resposta, 0);

  const fora: CancaoDoYtMusic[] = [];
  const vistas = new Set<string>();
  for (const it of itens) {
    const videoId = it?.playlistItemData?.videoId;
    if (typeof videoId !== 'string' || !/^[\w-]{6,20}$/.test(videoId) || vistas.has(videoId)) continue;
    const colunas = Array.isArray(it.flexColumns) ? it.flexColumns : [];
    const titulo = textoDaColuna(colunas[0]).trim();
    if (!titulo) continue;
    // "Drake • Laugh Now Cry Later • 4:22" (às vezes com "Song" à frente).
    const partes = textoDaColuna(colunas[1]).split(' • ').map((p) => p.trim()).filter(Boolean);
    if (partes[0] === 'Song') partes.shift();
    const duracaoSec = partes.length ? segundos(partes[partes.length - 1]) : null;
    if (duracaoSec !== null) partes.pop();
    const artista = partes[0] ?? '';
    const album = partes.length > 1 ? partes[1] : null;
    vistas.add(videoId);
    fora.push({
      videoId,
      titulo,
      artista,
      album,
      duracaoSec,
      explicita: JSON.stringify(it.badges ?? []).includes('MUSIC_EXPLICIT_BADGE'),
    });
  }
  return fora;
}
