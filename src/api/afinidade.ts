import { supabase } from '../lib/supabase';
import { currentUserId } from './library';
import { displayArtist } from '../lib/artistName';
import type { FaixaComArtista } from '../lib/afinidade';

/**
 * Os pares artista-playlist do utilizador, que é o que dá a co-ocorrência.
 *
 * **Porque não serve o `getLibrary`.** Ele junta tudo num `Map` por faixa e
 * deita fora a playlist de onde veio — e é precisamente ESSA a informação que
 * diz que dois artistas se parecem. Sem ela só sobrava "estão os dois na
 * biblioteca", que não distingue nada numa biblioteca de 500 faixas.
 *
 * Uma consulta só, e o resultado fica em memória durante a sessão: a
 * co-ocorrência muda quando se mexe numa playlist, não de minuto a minuto.
 */

/** Quanto tempo o mapa fica válido. Meia hora é mais do que uma sessão de
 * escuta e menos do que o tempo que leva a reorganizar playlists. */
const VALIDADE_MS = 30 * 60 * 1000;

let cache: { em: number; pares: FaixaComArtista[] } | null = null;

export async function paresDeArtistaEPlaylist(): Promise<FaixaComArtista[]> {
  if (cache && Date.now() - cache.em < VALIDADE_MS) return cache.pares;

  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('playlist_tracks')
    .select('playlist_id, tracks (title, artist, source), playlists!inner (owner_id)')
    .eq('playlists.owner_id', userId);
  if (error) throw error;

  const pares: FaixaComArtista[] = [];
  for (const linha of (data ?? []) as any[]) {
    const t = linha.tracks;
    if (!t) continue;
    const artista = displayArtist({
      source: t.source, title: t.title ?? '', artist: t.artist ?? null,
    });
    if (!artista || artista === 'Unknown artist') continue;
    pares.push({ artista, playlistId: linha.playlist_id ?? null });
  }

  cache = { em: Date.now(), pares };
  return pares;
}

/** Esquece o mapa. Chamar quando se mexe numa playlist, para a próxima
 * sugestão já contar com a mudança. */
export function esquecerAfinidade(): void {
  cache = null;
}
