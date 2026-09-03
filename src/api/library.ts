import { cacheLikedSongs,changeCachedLikes,likedCacheRevision } from '../lib/likedSongsCache';
import { supabase } from '../lib/supabase';
import { confirmarArtistasEmSegundoPlano } from './artistNames';
import type { Track } from '../types';

function rowToTrack(row: any): Track {
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    artworkUrl: row.artwork_url,
    durationSeconds: row.duration_seconds,
  };
}

/** Garante que a faixa existe no catálogo global e devolve o id na BD. */
export async function upsertTrack(t: Track): Promise<string> {
  const { data, error } = await supabase.rpc('upsert_catalog_tracks', { entries: [catalogEntry(t)] });
  if (error) throw error;
  const row = data?.[0];
  if (!row?.id) throw new Error('Could not save this track in the catalogue.');
  return row.id as string;
}

function catalogEntry(t: Track) {
  return { source:t.source,sourceId:t.sourceId,title:t.title,artist:t.artist,album:t.album,
    artworkUrl:t.artworkUrl,durationSeconds:t.durationSeconds };
}

/** Chave estavel de uma faixa no catalogo global. */
export function trackKey(t: Pick<Track, 'source' | 'sourceId'>): string {
  return `${t.source}:${t.sourceId}`;
}

/**
 * Versao em LOTE do upsertTrack. Devolve um mapa `source:sourceId` -> id na BD.
 *
 * Existe porque importar uma playlist grande chamava upsertTrack faixa a
 * faixa: numa playlist de 2000 musicas eram 2000 idas ao Supabase em serie,
 * o que demorava minutos e bastava uma falhar para deitar tudo abaixo. Aqui
 * sao ~10 pedidos.
 */
export async function upsertTracks(
  tracks: Track[],
  chunkSize = 200,
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  // Duplicados dentro do mesmo lote fazem o Postgres queixar-se de afetar a
  // mesma linha duas vezes — e listas do Spotify trazem repetidos com
  // frequencia (e faixas diferentes podem casar com o mesmo video).
  const unicas = new Map<string, Track>();
  for (const t of tracks) if (!unicas.has(trackKey(t))) unicas.set(trackKey(t), t);
  const lista = [...unicas.values()];

  for (let i = 0; i < lista.length; i += chunkSize) {
    const lote = lista.slice(i, i + chunkSize);
    const { data, error } = await supabase.rpc('upsert_catalog_tracks', { entries: lote.map(catalogEntry) });
    if (error) throw error;
    for (const row of data ?? []) {
      out.set(`${row.source}:${row.source_id}`, row.id as string);
    }
    onProgress?.(Math.min(i + lote.length, lista.length), lista.length);
  }
  return out;
}

export async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Session expired');
  return data.user.id;
}

export async function saveToLibrary(track: Track): Promise<string> {
  const trackId = await upsertTrack(track);
  const userId = await currentUserId();
  const { error } = await supabase
    .from('library_tracks')
    .upsert(
      { user_id: userId, track_id: trackId },
      { onConflict: 'user_id,track_id', ignoreDuplicates: true }
    );
  if (error) throw error;
  await changeCachedLikes(userId,old=>[{...track,id:trackId},...old.filter(t=>t.id!==trackId)]);
  return trackId;
}

export async function removeFromLibrary(trackId: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase
    .from('library_tracks')
    .delete()
    .match({ user_id: userId, track_id: trackId });
  if (error) throw error;
  await changeCachedLikes(userId,old=>old.filter(t=>t.id!==trackId));
}

export async function removeMultipleFromLibrary(trackIds: string[]): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase
    .from('library_tracks')
    .delete()
    .eq('user_id', userId)
    .in('track_id', trackIds);
  if (error) throw error;
  await changeCachedLikes(userId,old=>old.filter(t=>!t.id||!trackIds.includes(t.id)));
}

/** Remove TODAS as faixas guardadas do utilizador atual (ação destrutiva). */
export async function clearLibrary(): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase
    .from('library_tracks')
    .delete()
    .match({ user_id: userId });
  if (error) throw error;
  await changeCachedLikes(userId,()=>[]);
}

async function getLikedSongsForUser(userId: string): Promise<Track[]> {
  const revision=likedCacheRevision(userId),tracks:Track[]=[];
  for(let offset=0;;offset+=1000){
    const {data,error}=await supabase.from('library_tracks')
      .select('added_at, tracks (id, source, source_id, title, artist, album, artwork_url, duration_seconds)')
      .eq('user_id',userId).order('added_at',{ascending:false}).order('track_id').range(offset,offset+999);
    if(error)throw error;
    tracks.push(...(data??[]).map((r:any)=>r.tracks).filter(Boolean).map(rowToTrack));
    if(!data||data.length<1000)break;
  }
  await cacheLikedSongs(userId,tracks,revision);
  return tracks;
}

/** Apenas as faixas que o utilizador guardou com o coracao. */
export async function getLikedSongs(): Promise<Track[]> {
  const faixas = await getLikedSongsForUser(await currentUserId());
  confirmarArtistasEmSegundoPlano(faixas);
  return faixas;
}

export async function getLibrary(): Promise<Track[]> {
  const userId = await currentUserId();

  // A biblioteca alargada alimenta artistas e radio: gostos + conteudo de
  // playlists. A pagina Songs usa getLikedSongs para nao misturar os dois.
  // As duas consultas nao dependem uma da outra, por isso vao juntas. Em fila
  // somavam-se as duas esperas, e esta e a primeira carga da pagina.
  const [likedTracks, { data: plTracksData, error: plTracksError }] = await Promise.all([
    getLikedSongsForUser(userId),
    supabase
      .from('playlist_tracks')
      .select('tracks (id, source, source_id, title, artist, album, artwork_url, duration_seconds), playlists!inner (owner_id)')
      .eq('playlists.owner_id', userId),
  ]);

  if (plTracksError) throw plTracksError;

  const tracksMap = new Map<string, Track>();

  // Os likes entram primeiro para preservar a ordem de adicao.
  for (const track of likedTracks) {
    const key = `${track.source}:${track.sourceId}`;
    tracksMap.set(key, track);
  }

  // Add playlist tracks next (only if not already in map)
  if (plTracksData) {
    for (const row of plTracksData) {
      if (row.tracks) {
        const track = rowToTrack(row.tracks);
        const key = `${track.source}:${track.sourceId}`;
        if (!tracksMap.has(key)) {
          tracksMap.set(key, track);
        }
      }
    }
  }

  const faixas = Array.from(tracksMap.values());
  // **E daqui que a app aprende os nomes.** O `displayArtist` sabe corrigir a
  // grafia e destrocar titulos ao contrario (`poster boy - Zhollis`), mas so
  // com um vocabulario -- e a app chamava-o sem ele em 17 dos 19 sitios, o que
  // deixava essa maquinaria toda escrita e morta. A biblioteca e o unico sitio
  // por onde passam faixas que cheguem para aprender.
  confirmarArtistasEmSegundoPlano(faixas);
  return faixas;
}

/**
 * Chaves `source:sourceId` das faixas guardadas.
 *
 * Distinta do `getLibraryTrackIds` abaixo, que devolve ids da BD: resultados
 * de pesquisa vêm do YouTube e ainda não existem na tabela `tracks`, por isso
 * não têm id nenhum por onde comparar. A chave da fonte é a única que serve
 * para dizer "esta já a tens".
 */
export async function getLibraryKeys(): Promise<Set<string>> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('library_tracks')
    .select('tracks (source, source_id)')
    .eq('user_id', userId);
  if (error) throw error;
  return new Set(
    (data ?? [])
      .map((r: any) => r.tracks)
      .filter(Boolean)
      .map((t: any) => `${t.source}:${t.source_id}`)
  );
}

/** Ids (da BD) das faixas guardadas — para mostrar o estado "guardada". */
export async function getLibraryTrackIds(): Promise<Set<string>> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('library_tracks')
    .select('track_id')
    .eq('user_id', userId);
  if (error) throw error;
  return new Set((data ?? []).map((r: any) => r.track_id as string));
}

export async function checkIsSaved(source: string, sourceId: string): Promise<{ saved: boolean; trackId: string | null }> {
  try {
    const { data: trackData, error: trackError } = await supabase
      .from('tracks')
      .select('id')
      .match({ source, source_id: sourceId })
      .maybeSingle();
    if (trackError || !trackData) return { saved: false, trackId: null };

    const userId = await currentUserId();
    const { data: libData, error: libError } = await supabase
      .from('library_tracks')
      .select('track_id')
      .match({ user_id: userId, track_id: trackData.id })
      .maybeSingle();

    if (libError || !libData) return { saved: false, trackId: trackData.id };
    return { saved: true, trackId: trackData.id };
  } catch {
    return { saved: false, trackId: null };
  }
}
