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
 * **Um artista sem página musical** (15/10: "Santuarius Records Rap", um canal
 * de uploads) tem as músicas pela pesquisa do nome, e aí não havia nada: os
 * dois botões davam a mesma lista. A pesquisa traz, de cada vídeo, as
 * visualizações ("7,915 views") e há quanto tempo saiu ("12 years ago",
 * relativo). São essas (`infoDaPesquisa`): "Most played" pelas visualizações,
 * "Newest" pela data do vídeo -- e a linha diz "views" e "12 years ago", sem
 * fingir um ano de lançamento que não se sabe.
 *
 * Puro, sem imports: `scripts/test-ordem-do-artista.ts`.
 */

export type ModoDoArtista = 'ouvidas' | 'recentes';
export const MODOS_DO_ARTISTA: readonly ModoDoArtista[] = ['ouvidas', 'recentes'];
export type InfoDaMusica = {
  reproducoes: number | null;
  ano: number | null;
  /** As reproduções são visualizações de um vídeo (da pesquisa), e não "plays" do YouTube Music. */
  vistas?: boolean;
  /** Da pesquisa: há quanto tempo o vídeo saiu, como o YouTube o diz, e o ano aproximado (só para ordenar). */
  publicado?: string | null;
  anoAproximado?: number | null;
};
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

/** O número curto, como o YouTube Music o escreve: "2.4B plays" (ou "7.9K views", os de um vídeo). */
export function textoDasReproducoes(n: number | null | undefined, unidade: 'plays' | 'views' = 'plays'): string | null {
  if (n == null || !Number.isFinite(n) || n < 0) return null;
  const curto = (v: number, s: string) => `${v >= 100 ? Math.round(v) : Number(v.toFixed(1))}${s}`;
  const t = n >= 1e9 ? curto(n / 1e9, 'B') : n >= 1e6 ? curto(n / 1e6, 'M') : n >= 1e3 ? curto(n / 1e3, 'K') : String(n);
  return `${t} ${n === 1 ? unidade.slice(0, -1) : unidade}`;
}

const SEGUNDOS = { second: 1, minute: 60, hour: 3600, day: 86_400, week: 604_800, month: 2_629_800, year: 31_557_600 } as const;

/** "12 years ago", "Streamed 3 weeks ago" -> há quantos segundos; senão `null`. */
export function lerIdade(texto: string | null | undefined): number | null {
  const m = /(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago\b/i.exec(String(texto ?? ''));
  if (!m) return null;
  return Number(m[1]) * SEGUNDOS[m[2].toLowerCase() as keyof typeof SEGUNDOS];
}

/**
 * As músicas de uma pesquisa pelo nome (o artista sem página musical): as
 * visualizações e quando saiu o vídeo. `agora` só serve para pôr as idades na
 * mesma escala dos anos.
 */
export function infoDaPesquisa(
  resultados: readonly { videoId: string; titulo: string; visualizacoes?: string | null; publicado?: string | null }[],
  chaveDoTitulo: (t: string) => string,
  agora: number = Date.now(),
): InfoDasMusicas {
  const porVideo: Record<string, InfoDaMusica> = {};
  const porTitulo: Record<string, InfoDaMusica> = {};
  for (const r of resultados) {
    const idade = lerIdade(r.publicado);
    const info: InfoDaMusica = {
      reproducoes: lerReproducoes(r.visualizacoes),
      ano: null,
      vistas: true,
      publicado: idade != null ? String(r.publicado).trim() : null,
      anoAproximado: idade != null ? 1970 + (agora / 1000 - idade) / SEGUNDOS.year : null,
    };
    porVideo[r.videoId] = info;
    const k = chaveDoTitulo(r.titulo);
    if (k && (!porTitulo[k] || (info.reproducoes ?? -1) > (porTitulo[k].reproducoes ?? -1))) porTitulo[k] = info;
  }
  return { porVideo, porTitulo };
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

function valorDaOrdem(modo: ModoDoArtista, i: InfoDaMusica | null): number | null {
  return modo === 'ouvidas' ? i?.reproducoes ?? null : i?.ano ?? i?.anoAproximado ?? null;
}

/**
 * As ordens que mudam alguma coisa nesta lista: as que têm o valor de pelo
 * menos uma música. Sem nenhuma, o botão não aparece -- dois botões que dão a
 * mesma lista parecem estragados.
 */
export function modosComDados<T>(faixas: readonly T[], info: (t: T) => InfoDaMusica | null): ModoDoArtista[] {
  return MODOS_DO_ARTISTA.filter((modo) => faixas.some((t) => valorDaOrdem(modo, info(t)) != null));
}

/** Ordena sem perder a ordem de quem empata ou de quem não se sabe (que vai para o fim). */
export function ordenarMusicasDoArtista<T>(faixas: readonly T[], modo: ModoDoArtista, info: (t: T) => InfoDaMusica | null): T[] {
  const valor = (t: T) => valorDaOrdem(modo, info(t));
  return faixas
    .map((t, i) => ({ t, i, v: valor(t) }))
    .sort((a, b) => (a.v == null) !== (b.v == null) ? (a.v == null ? 1 : -1) : (b.v ?? 0) - (a.v ?? 0) || a.i - b.i)
    .map((x) => x.t);
}

/** O que a linha diz ao lado do artista: as reproduções, ou o ano. */
export function detalheDaLinha(modo: ModoDoArtista, i: InfoDaMusica | null): string | null {
  if (!i) return null;
  return modo === 'ouvidas' ? textoDasReproducoes(i.reproducoes, i.vistas ? 'views' : 'plays')
    : i.ano ? String(i.ano) : i.publicado ?? null;
}
