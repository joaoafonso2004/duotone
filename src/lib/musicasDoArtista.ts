/**
 * As músicas de um artista numa lista só, e o que o cabeçalho diz delas (20/10,
 * pedido do João).
 *
 * A página tinha três separadores, "In your library", "More songs" e
 * "Albums", e o cabeçalho contava as do separador aberto: num artista de quem
 * não se guardou nada abria em "0 songs", que se lia como uma página que não
 * carregou. Agora é uma página por secções (a variante A de
 * `docs/artista-maquete.html`). Em "Songs" vêm primeiro as que são tuas
 * (marcadas pelo coração da linha) e depois as outras dele, cada grupo na
 * ordem escolhida ("Most played" ou "Newest"). O cabeçalho diz os fãs e quantas
 * são tuas, e quando são zero não diz nada.
 *
 * Puro e sem imports: `scripts/test-musicas-do-artista.ts`. Serve o iPhone
 * (`LibraryGroupScreen`) e o PC (`ArtistPage`).
 */

type Chaveavel = { source: string; sourceId: string };
const chave = (t: Chaveavel) => `${t.source}:${t.sourceId}`;

/**
 * As tuas primeiro, depois as dele que não são tuas, sem repetir nenhuma.
 * Ambas as listas já vêm ordenadas.
 */
export function musicasDoArtista<T extends Chaveavel>(tuas: readonly T[], dele: readonly T[]): T[] {
  const vistas = new Set<string>();
  const fora: T[] = [];
  for (const t of [...tuas, ...dele]) {
    const k = chave(t);
    if (vistas.has(k)) continue;
    vistas.add(k);
    fora.push(t);
  }
  return fora;
}

/**
 * Os fãs do artista no catálogo, como se lê ("5.1M fans", "820K fans",
 * "940 fans"). `null` sem número.
 */
export function fasDoArtista(fas: number | null | undefined): string | null {
  if (!fas || !Number.isFinite(fas) || fas <= 0) return null;
  const curto = (n: number, sufixo: string) => `${(Math.round(n * 10) / 10).toString()}${sufixo}`;
  if (fas >= 1_000_000) return `${curto(fas / 1_000_000, 'M')} fans`;
  if (fas >= 10_000) return `${Math.round(fas / 1000)}K fans`;
  if (fas >= 1000) return `${curto(fas / 1000, 'K')} fans`;
  return `${Math.round(fas)} fans`;
}

/**
 * A linha por baixo do nome do artista: os fãs (quando o catálogo os sabe) e
 * quantas músicas dele são tuas, só quando são, e só depois de se saber (`aLer`:
 * a biblioteca ainda a chegar). `null` = não se mostra linha nenhuma.
 */
export function metaDoArtista(tuas: number, aLer: boolean, fas?: number | null): string | null {
  const partes = [fasDoArtista(fas)];
  if (!aLer && tuas > 0) partes.push(`${tuas} ${tuas === 1 ? 'song' : 'songs'} in your library`);
  const linha = partes.filter(Boolean).join(' · ');
  return linha || null;
}

/** Quantas músicas a página mostra antes de "See all songs" (20/10, variante A). */
export const MUSICAS_A_VISTA = 5;

/**
 * Quantas cabem nas Top Songs do iPhone (23/10): três colunas de quatro, que se
 * folheiam de lado. As outras estão no "›" do título.
 */
export const MUSICAS_NA_GRELHA = 12;

/** As que se veem: as primeiras, ou todas depois de "See all songs". */
export function musicasAVista<T>(musicas: readonly T[], todas: boolean, quantas = MUSICAS_A_VISTA): T[] {
  return todas ? [...musicas] : musicas.slice(0, quantas);
}

type Disco = { tipo: string; ano: string | null };

/**
 * Os álbuns de um lado e os singles e EPs do outro, cada um pela ordem em que
 * vieram (do mais recente). O que não diz "Single" nem "EP" conta como álbum.
 */
export function discografia<T extends Disco>(discos: readonly T[]): { albuns: T[]; singles: T[] } {
  const singles = (d: Disco) => /^(single|ep)$/i.test(d.tipo.trim());
  return { albuns: discos.filter((d) => !singles(d)), singles: discos.filter(singles) };
}

/** "2024 · Album", ou só o tipo quando não se sabe o ano. */
export function legendaDoDisco(d: Disco): string {
  const tipo = d.tipo.trim() || 'Album';
  return d.ano ? `${d.ano} · ${tipo}` : tipo;
}

/** Quantos "Fans also like" se mostram (cada um é uma foto pedida ao catálogo). */
export const PARECIDOS_A_VISTA = 6;

/**
 * Os parecidos que se mostram: pela ordem do catálogo, sem o próprio artista,
 * sem repetidos e sem nomes vazios. `chave` normaliza (a `chaveDeArtista`).
 */
export function parecidosAVista(
  semelhantes: readonly { nome: string }[], nome: string, chave: (n: string) => string, quantos = PARECIDOS_A_VISTA,
): string[] {
  const vistos = new Set([chave(nome)]);
  const fora: string[] = [];
  for (const s of semelhantes) {
    const n = s.nome?.trim();
    const k = n ? chave(n) : '';
    if (!k || vistos.has(k)) continue;
    vistos.add(k);
    fora.push(n);
    if (fora.length >= quantos) break;
  }
  return fora;
}

/**
 * A linha de um álbum da biblioteca: "Album" enquanto se lê e quando nenhuma
 * música dele é tua (o vazio da lista explica porquê), "Album · 12 songs" com
 * elas. Era "Album · 0 songs" logo ao abrir.
 */
export function metaDoAlbum(musicas: number, aLer: boolean): string {
  if (aLer || musicas <= 0) return 'Album';
  return `Album · ${musicas} ${musicas === 1 ? 'song' : 'songs'}`;
}
