/**
 * As músicas de um artista numa lista só, e o que o cabeçalho diz delas (20/10,
 * pedido do João).
 *
 * A página tinha três separadores, "In your library", "More songs" e
 * "Albums", e o cabeçalho contava as do separador aberto: num artista de quem
 * não se guardou nada abria em "0 songs", que se lia como uma página que não
 * carregou. Agora há "Songs" e "Albums". Em "Songs" vêm primeiro as que são
 * tuas (marcadas pelo coração da linha) e depois as outras dele, cada grupo na
 * ordem escolhida ("Most played" ou "Newest"). O cabeçalho só diz quantas são
 * tuas, e quando são zero não diz nada.
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
 * A linha por baixo do nome do artista: quantas músicas dele são tuas, só
 * quando são, e só depois de se saber (`aLer`: a biblioteca ainda a chegar).
 * `null` = não se mostra linha nenhuma.
 */
export function metaDoArtista(tuas: number, aLer: boolean): string | null {
  if (aLer || tuas <= 0) return null;
  return `${tuas} ${tuas === 1 ? 'song' : 'songs'} in your library`;
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
