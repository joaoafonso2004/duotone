/**
 * As músicas de um artista por "Most played" ou "Newest" (10/10, pedido do
 * João: "organizar as músicas por mais ouvidas, que ia buscar as com mais views",
 * com um botão para escolher entre as mais recentes e as mais ouvidas).
 *
 * As duas coisas já vêm na página do artista no YouTube Music, sem pedido
 * nenhum a mais: a lista "todas" do canal traz as reproduções de cada música
 * ("2.4B plays") e o álbum dela, e as prateleiras dos álbuns e singles trazem o
 * ano. O ano de uma música é o do álbum (ou single) com o mesmo nome.
 *
 * Vale para as duas abas: as do canal ("More songs") e as da biblioteca, que se
 * encontram pelo vídeo ou, noutro upload, pelo título. O que não se sabe vai
 * para o fim, pela ordem em que estava.
 *
 * Puro, sem imports: `scripts/test-ordem-do-artista.ts`.
 */

export type ModoDoArtista = 'ouvidas' | 'recentes';
export const MODOS_DO_ARTISTA: readonly ModoDoArtista[] = ['ouvidas', 'recentes'];
export type InfoDaMusica = { reproducoes: number | null; ano: number | null };
export type InfoDasMusicas = { porVideo: Record<string, InfoDaMusica>; porTitulo: Record<string, InfoDaMusica> };
export const INFO_VAZIA: InfoDasMusicas = { porVideo: {}, porTitulo: {} };

/** "2.4B plays", "472M plays", "57K views", "1,234 plays" -> um número; senão `null`. */
export function lerReproducoes(texto: string | null | undefined): number | null {
  const m = /^\s*([\d.,]+)\s*([KMB])?\s+(?:plays|views)\s*$/i.exec(String(texto ?? ''));
  if (!m) return null;
  const base = m[2] ? Number(m[1].replace(/,/g, '')) : Number(m[1].replace(/[.,]/g, ''));
  if (!Number.isFinite(base)) return null;
  const vezes = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] ?? '').toUpperCase() as 'K' | 'M' | 'B'] ?? 1;
  return Math.round(base * vezes);
}

/** O número curto, como o YouTube Music o escreve: "2.4B plays". */
export function textoDasReproducoes(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n < 0) return null;
  const curto = (v: number, s: string) => `${v >= 100 ? Math.round(v) : Number(v.toFixed(1))}${s}`;
  const t = n >= 1e9 ? curto(n / 1e9, 'B') : n >= 1e6 ? curto(n / 1e6, 'M') : n >= 1e3 ? curto(n / 1e3, 'K') : String(n);
  return `${t} ${n === 1 ? 'play' : 'plays'}`;
}

/**
 * O que se sabe de cada música do canal. `lancamentos` são os álbuns e singles
 * com o ano; `chaveDoTitulo` é a de `lib/albunsDoArtista.ts` (entra por
 * parâmetro para isto não importar nada).
 */
export function infoDasMusicas(
  cancoes: readonly { videoId: string; titulo: string; reproducoes?: number | null; album?: string | null }[],
  lancamentos: readonly { titulo: string; ano: string | null }[],
  chaveDoTitulo: (t: string) => string,
): InfoDasMusicas {
  // O título exato primeiro; sem ele, sem os parênteses e o MAIS ANTIGO: a
  // "This Is Acting (Deluxe Version)" é de 2016, e não da "10th Anniversary
  // Edition" de 2026 que o canal também tem (medido na Sia, 10/10).
  const exatoDe = new Map<string, number>();
  const baseDe = new Map<string, number>();
  const guardar = (mapa: Map<string, number>, k: string, ano: number) => {
    if (k && (!mapa.has(k) || ano < mapa.get(k)!)) mapa.set(k, ano);
  };
  for (const l of lancamentos) {
    const ano = Number(l.ano);
    if (!Number.isFinite(ano) || ano <= 0) continue;
    guardar(exatoDe, chaveExata(l.titulo), ano);
    guardar(baseDe, chaveDoTitulo(l.titulo), ano);
  }
  const anoDe = (titulo: string | null | undefined) => titulo
    ? exatoDe.get(chaveExata(titulo)) ?? baseDe.get(chaveDoTitulo(titulo)) : undefined;
  const porVideo: Record<string, InfoDaMusica> = {};
  const porTitulo: Record<string, InfoDaMusica> = {};
  for (const c of cancoes) {
    const ano = anoDe(c.album) ?? anoDe(c.titulo) ?? null;
    const info = { reproducoes: c.reproducoes ?? null, ano };
    porVideo[c.videoId] = info;
    const k = chaveDoTitulo(c.titulo);
    // O mesmo título duas vezes (a original e uma versão): fica a mais ouvida.
    if (k && (!porTitulo[k] || (info.reproducoes ?? -1) > (porTitulo[k].reproducoes ?? -1))) porTitulo[k] = info;
  }
  return { porVideo, porTitulo };
}

/** O título tal como é, sem acentos, maiúsculas nem pontuação (com o que está entre parênteses). */
function chaveExata(titulo: string): string {
  return String(titulo ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** A informação de uma faixa: pelo vídeo e, noutro upload, pelo título. */
export function infoDe(info: InfoDasMusicas, videoId: string, titulo: string, chaveDoTitulo: (t: string) => string): InfoDaMusica | null {
  return info.porVideo[videoId] ?? info.porTitulo[chaveDoTitulo(titulo)] ?? null;
}

/** Ordena sem perder a ordem de quem empata ou de quem não se sabe (que vai para o fim). */
export function ordenarMusicasDoArtista<T>(faixas: readonly T[], modo: ModoDoArtista, info: (t: T) => InfoDaMusica | null): T[] {
  const valor = (t: T) => {
    const i = info(t);
    return modo === 'ouvidas' ? i?.reproducoes ?? null : i?.ano ?? null;
  };
  return faixas
    .map((t, i) => ({ t, i, v: valor(t) }))
    .sort((a, b) => (a.v == null) !== (b.v == null) ? (a.v == null ? 1 : -1) : (b.v ?? 0) - (a.v ?? 0) || a.i - b.i)
    .map((x) => x.t);
}

/** O que a linha diz ao lado do artista: as reproduções, ou o ano. */
export function detalheDaLinha(modo: ModoDoArtista, i: InfoDaMusica | null): string | null {
  if (!i) return null;
  return modo === 'ouvidas' ? textoDasReproducoes(i.reproducoes) : i.ano ? String(i.ano) : null;
}
