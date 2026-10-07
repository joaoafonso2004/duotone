import { cacheLikedSongs,changeCachedLikes,likedCacheRevision } from '../lib/likedSongsCache';
import { supabase } from '../lib/supabase';
import { esquecerBiblioteca, lerFaixas, tipoDaLista, validarLeitor } from '../lib/cacheDaBiblioteca';
import { idDaConta } from '../lib/idDaConta';
import { confirmarArtistasEmSegundoPlano } from './artistNames';
import type { Track } from '../types';
import { lerFaixasDasPlaylists } from './playlistSnapshot';
import { medirTrabalho, cederParaInterface } from '../lib/trabalhoLocal';

validarLeitor(getLibrary, () => lerFaixasDasPlaylists());

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
  const id = await idDaConta();
  if (!id) throw new Error('Session expired');
  return id;
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

/**
 * Muitas de uma vez nas Liked Songs (7/10, a importação das Liked Songs do
 * Spotify): a ordem é a da lista -- a primeira fica a mais recente, como lá --,
 * e as que já lá estão não mudam de data. Em lotes de 500.
 */
export async function guardarMuitasNasGostadas(tracks: Track[]): Promise<number> {
  if (!tracks.length) return 0;
  const ids = await upsertTracks(tracks);
  const userId = await currentUserId();
  const agora = Date.now();
  const linhas = tracks.flatMap((t, i) => {
    const id = ids.get(trackKey(t));
    return id ? [{ user_id: userId, track_id: id, added_at: new Date(agora - i * 1000).toISOString() }] : [];
  });
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await supabase.from('library_tracks')
      .upsert(linhas.slice(i, i + 500), { onConflict: 'user_id,track_id', ignoreDuplicates: true });
    if (error) throw error;
  }
  // Muitas de uma vez: a lista guardada deita-se fora em vez de se ajustar (ver
  // `ajustarGostada`), e as páginas releem.
  esquecerBiblioteca();
  await changeCachedLikes(userId, (antigas) => {
    const novas = tracks.flatMap((t) => { const id = ids.get(trackKey(t)); return id ? [{ ...t, id }] : []; });
    const ja = new Set(novas.map((t) => t.id));
    return [...novas, ...antigas.filter((t) => !ja.has(t.id ?? ''))];
  });
  return linhas.length;
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

/** O que saiu das Liked Songs, para o "Undo" (3/10) a repor no MESMO sítio. */
export type GuardadaTirada = { trackId: string; addedAt: string };

/**
 * Tira das Liked Songs e devolve as linhas que saíram, com a data em que
 * tinham sido guardadas: o "Undo" repõe essa data e a música volta ao lugar
 * dela na lista, e não ao topo.
 */
export async function tirarDasGuardadas(trackIds: string[]): Promise<GuardadaTirada[]> {
  if (!trackIds.length) return [];
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('library_tracks')
    .delete()
    .eq('user_id', userId)
    .in('track_id', trackIds)
    .select('track_id, added_at');
  if (error) throw error;
  // Uma só passa pelo `markSaved` de quem chama, que ajusta a lista guardada
  // (ajustarGostada) sem a deitar fora -- é egress. Várias de uma vez não.
  if (trackIds.length > 1) esquecerBiblioteca();
  await changeCachedLikes(userId, old => old.filter(t => !t.id || !trackIds.includes(t.id)));
  return (data ?? []).map((r: any) => ({ trackId: r.track_id, addedAt: r.added_at }));
}

/** O "Undo" do `tirarDasGuardadas`: as mesmas linhas, com a data de antes. */
export async function reporGuardadas(tiradas: GuardadaTirada[], faixas: Track[] = []): Promise<void> {
  if (!tiradas.length) return;
  const userId = await currentUserId();
  const { error } = await supabase
    .from('library_tracks')
    .upsert(
      tiradas.map((t) => ({ user_id: userId, track_id: t.trackId, added_at: t.addedAt })),
      { onConflict: 'user_id,track_id', ignoreDuplicates: true }
    );
  if (error) throw error;
  if (tiradas.length > 1) esquecerBiblioteca();
  // A cópia das gostadas volta a tê-las; a ordem certa chega com a próxima leitura.
  const ids = new Set(tiradas.map((t) => t.trackId));
  const voltam = faixas.filter((t) => t.id && ids.has(t.id));
  if (voltam.length) await changeCachedLikes(userId, old => [...voltam, ...old.filter(t => !t.id || !ids.has(t.id))]);
}

export async function removeMultipleFromLibrary(trackIds: string[]): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase
    .from('library_tracks')
    .delete()
    .eq('user_id', userId)
    .in('track_id', trackIds);
  if (error) throw error;
  // Várias de uma vez não passam pelo `markSaved`: a lista em memória esquece-se
  // aqui, senão os corações e as páginas ficavam meia hora com as que saíram.
  esquecerBiblioteca();
  await changeCachedLikes(userId,old=>old.filter(t=>!t.id||!trackIds.includes(t.id)));
}

/**
 * Remove TODAS as faixas guardadas do utilizador atual (ação destrutiva).
 * Devolve as linhas que saíram, para o "Undo" do aviso (3/10) as repor.
 */
export async function clearLibrary(): Promise<GuardadaTirada[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('library_tracks')
    .delete()
    .match({ user_id: userId })
    .select('track_id, added_at');
  if (error) throw error;
  esquecerBiblioteca();
  await changeCachedLikes(userId,()=>[]);
  return (data ?? []).map((r: any) => ({ trackId: r.track_id, addedAt: r.added_at }));
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

async function getPlaylistTracksForUser(userId: string): Promise<any[]> {
  if (await currentUserId() !== userId) throw new Error('Session changed');
  return lerFaixasDasPlaylists();
}

export async function getLibrary(): Promise<Track[]> {
  const userId = await currentUserId();

  // A biblioteca alargada alimenta artistas e radio: gostos + conteudo de
  // playlists. A pagina Songs usa getLikedSongs para nao misturar os dois.
  // As duas consultas nao dependem uma da outra, por isso vao juntas. Em fila
  // somavam-se as duas esperas, e esta e a primeira carga da pagina.
  const [likedTracks, plTracksData] = await Promise.all([
    getLikedSongsForUser(userId),
    getPlaylistTracksForUser(userId),
  ]);

  const tracksMap = new Map<string, Track>();

  // Os likes entram primeiro para preservar a ordem de adicao.
  for (const track of likedTracks) {
    const key = `${track.source}:${track.sourceId}`;
    tracksMap.set(key, track);
  }

  // Add playlist tracks next (only if not already in map)
  if (plTracksData) {
    for (let start = 0; start < plTracksData.length; start += 200) {
      medirTrabalho('library.merge', () => { for (const row of plTracksData.slice(start, start + 200)) {
      if (row.tracks) {
        const track = rowToTrack(row.tracks);
        const key = `${track.source}:${track.sourceId}`;
        if (!tracksMap.has(key)) {
          tracksMap.set(key, track);
        }
      }
      } });
      if (start + 200 < plTracksData.length) await cederParaInterface();
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
 *
 * Saem das gostadas da cache partilhada (30/9). Liam-se do servidor, às
 * páginas de 1000, a cada abertura da Pesquisa, de uma página de artista e a
 * cada sugestão do Smart Shuffle -- a mesma lista que os Songs já tinham em
 * memória. Um gosto neste aparelho muda-a na hora (`ajustarGostada`); o que se
 * guarda noutro chega com a validade da cache.
 */
export async function getLibraryKeys(): Promise<Set<string>> {
  const gostadas = await lerFaixas(getLikedSongs);
  return new Set(gostadas.map(trackKey));
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

// Para um gosto mudar a lista guardada em vez de a deitar fora
// (`ajustarGostada`, lib/cacheDaBiblioteca.ts).
tipoDaLista(getLikedSongs, 'gostadas');
tipoDaLista(getLibrary, 'alargada');
