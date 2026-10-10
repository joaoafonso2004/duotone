/**
 * As letras do YouTube Music (10/10, B1 da análise de 9/10): a segunda fonte,
 * para quando o lrclib não tem a letra (ou só a tem sem tempos).
 *
 * São duas idas: o `next` do vídeo diz o separador "Lyrics" (`MPLYt_...`), e o
 * `browse` desse separador traz a letra. Pedido pelo cliente ANDROID_MUSIC, o
 * `browse` traz `timedLyricsData`: uma linha por verso e, quando a letra está
 * sincronizada com ESTE áudio, o `cueRange` de cada uma. Num videoclipe o
 * YouTube Music manda as linhas sem tempos (o relógio do vídeo não é o da
 * gravação), e muitas vezes nada. Pelo cliente da web vem só o texto
 * (`musicDescriptionShelfRenderer`): é o recurso se o outro deixar de servir.
 *
 * Puro, sem imports: `scripts/test-letras-do-yt-music.ts`, com respostas reais
 * em `scripts/fixtures/`.
 */

export type LinhaComTempo = { timeMs: number; text: string };
export type LetraDoYtMusic = { linhas: LinhaComTempo[]; texto: string; sincronizada: boolean };

/** O cliente que traz os tempos. Se o YouTube o recusar um dia, sobe-se a versão (como no ytstream). */
export const VERSAO_DO_ANDROID_MUSIC = '7.27.52';

/** A forma do separador da letra. Validada também no processo principal do PC. */
export const FORMA_DA_LETRA = /^MPLY[\w-]{3,60}$/;

function acharTodos(obj: any, chave: string, fora: any[] = [], fundo = 0): any[] {
  if (!obj || typeof obj !== 'object' || fundo > 40) return fora;
  if (chave in obj) fora.push(obj[chave]);
  for (const k of Object.keys(obj)) acharTodos(obj[k], chave, fora, fundo + 1);
  return fora;
}

/** O separador "Lyrics" do `next` de um vídeo, ou `null` (não há letra). */
export function separadorDaLetra(respostaDoNext: unknown): string | null {
  for (const t of acharTodos(respostaDoNext, 'tabRenderer')) {
    const id = t?.endpoint?.browseEndpoint?.browseId;
    if (typeof id === 'string' && FORMA_DA_LETRA.test(id)) return id;
  }
  return null;
}

/** A letra do `browse` do separador, ou `null` se não há. */
export function lerLetra(respostaDoBrowse: unknown): LetraDoYtMusic | null {
  const brutas = acharTodos(respostaDoBrowse, 'timedLyricsData').find(Array.isArray) as any[] | undefined;
  if (brutas?.length) {
    const linhas = brutas
      .filter((l) => typeof l?.lyricLine === 'string')
      .map((l) => ({ texto: l.lyricLine.trim(), inicio: Number(l?.cueRange?.startTimeMilliseconds) }));
    // Só é sincronizada se TODAS as linhas têm tempo: meia letra com tempos
    // punha o realce a saltar.
    const sincronizada = linhas.length > 0 && linhas.every((l) => Number.isFinite(l.inicio) && l.inicio >= 0);
    const texto = linhas.map((l) => l.texto).filter((t) => t !== '♪').join('\n').trim();
    if (texto) {
      return {
        sincronizada,
        texto,
        linhas: sincronizada
          ? linhas.map((l) => ({ timeMs: l.inicio, text: l.texto })).sort((a, b) => a.timeMs - b.timeMs).slice(0, 1500)
          : [],
      };
    }
  }
  for (const prateleira of acharTodos(respostaDoBrowse, 'musicDescriptionShelfRenderer')) {
    const runs = prateleira?.description?.runs;
    const texto = Array.isArray(runs) ? runs.map((r: any) => (typeof r?.text === 'string' ? r.text : '')).join('') : '';
    const limpo = texto.replace(/\r\n?/g, '\n').trim();
    if (limpo) return { sincronizada: false, texto: limpo, linhas: [] };
  }
  return null;
}
