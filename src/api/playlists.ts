import { supabase } from '../lib/supabase';
import { idDaConta } from '../lib/idDaConta';
import { trackKey, upsertTrack, upsertTracks } from './library';
import type { Playlist, PlaylistTrack, Track } from '../types';
import { missingProfilePlaylistColumns } from '../lib/profileSchema';
import { planearMerge } from '../lib/playlistMerge';
// Quem mexe nas playlists muda a co-ocorrência: a descoberta tem de a reler.
import { esquecerAfinidade } from './afinidade';
import { esquecerAlargada } from '../lib/cacheDaBiblioteca';

/**
 * Uma playlist ganhou ou perdeu músicas: a co-ocorrência e a biblioteca
 * alargada (gostadas + playlists) deixam de ser verdade. As páginas leem a
 * alargada da cache partilhada (30/9); sem isto uma música posta numa
 * playlist só aparecia nelas ao fim da validade.
 */
function mudouUmaPlaylist(): void {
  esquecerAfinidade();
  esquecerAlargada();
}

async function currentUserId(): Promise<string> {
  const id = await idDaConta();
  if (!id) throw new Error('Session expired');
  return id;
}

/** Capas pedidas por playlist: mostram-se quatro, e algumas faixas não têm. */
const CAPAS_POR_PLAYLIST = 8;
const EMBUTIDO_LEVE = 'capas:playlist_tracks(position, tracks(artwork_url)), total:playlist_tracks(count)';
const EMBUTIDO_PESADO = 'playlist_tracks (position, tracks (artwork_url))';

function primeirasCapas(pts: any[] | undefined): string[] {
  return [...(pts ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((pt) => pt.tracks?.artwork_url)
    .filter(Boolean)
    .slice(0, 4);
}

/** Quantas faixas e as capas, venha a linha da leitura leve ou da de sempre. */
function resumoDaPlaylist(row: any): Pick<Playlist, 'trackCount' | 'artworks'> {
  if (Array.isArray(row.total)) {
    return { trackCount: Number(row.total[0]?.count) || 0, artworks: primeirasCapas(row.capas) };
  }
  return { trackCount: (row.playlist_tracks ?? []).length, artworks: primeirasCapas(row.playlist_tracks) };
}

/**
 * Playlists com a contagem e as primeiras capas (30/9).
 *
 * Vinham TODAS as faixas de TODAS as playlists -- posição e capa de cada uma --
 * para as contar e mostrar quatro capas. A lista relê-se a cada música posta
 * numa playlist, e com playlists importadas eram centenas de KB por leitura
 * (egress). Agora vem a contagem e oito capas por playlist.
 *
 * Se o PostgREST recusar a forma leve (um erro `PGRST1..`/`PGRST2..`, do
 * pedido e não dos dados), vai a de sempre: uma lista que pesa mais é melhor
 * do que as playlists desaparecerem. Sem rede ou sem permissão não se repete
 * nada. Uma coluna em falta volta como erro, para quem chama tentar sem ela.
 */
async function lerComResumo(
  campos: string,
  filtrar: (q: any) => any,
): Promise<{ data: any[] | null; error: any }> {
  const leve = await filtrar(supabase.from('playlists').select(`${campos}, ${EMBUTIDO_LEVE}`))
    .order('position', { referencedTable: 'capas' })
    .limit(CAPAS_POR_PLAYLIST, { referencedTable: 'capas' });
  if (!formaRecusada(leve.error) || missingProfilePlaylistColumns(leve.error)) return leve;
  return filtrar(supabase.from('playlists').select(`${campos}, ${EMBUTIDO_PESADO}`));
}

function formaRecusada(error: any): boolean {
  return typeof error?.code === 'string' && /^PGRST[12]\d\d$/.test(error.code);
}

/** Só a forma de sempre corta nas 1000: é dessas que a contagem se confirma. */
function cortadas(playlists: Playlist[], linhas: any[]): Playlist[] {
  return playlists.filter((_, i) => !Array.isArray(linhas[i]?.total));
}

export async function listPlaylists(): Promise<Playlist[]> {
  const userId = await currentUserId();
  const filtrar = (q: any) => q.eq('owner_id', userId).order('created_at', { ascending: false });
  let lida = await lerComResumo('id, name, created_at, visible_on_profile, copied_from', filtrar);
  // A biblioteca já existia antes da partilha de perfis. Uma migração em falta
  // não pode fazê-la desaparecer; a leitura continua limitada ao próprio dono.
  const legacy = missingProfilePlaylistColumns(lida.error);
  if (legacy) lida = await lerComResumo('id, name, created_at', filtrar);
  if (lida.error) throw lida.error;

  const playlists = (lida.data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    ...resumoDaPlaylist(row),
    visibleOnProfile: legacy ? undefined : !!row.visible_on_profile,
    copiedFrom: row.copied_from ?? null,
  }));
  await corrigirContagensLimitadas(cortadas(playlists, lida.data ?? []));
  return playlists;
}

/** O PostgREST corta relações embutidas em 1000 linhas. Só fazemos o pedido
 * de contagem exata quando o resultado tem precisamente o tamanho suspeito. */
async function corrigirContagensLimitadas(playlists: Playlist[]): Promise<void> {
  const suspeitas = playlists.filter((p) => p.trackCount >= 1000);
  for (let i = 0; i < suspeitas.length; i += 8) {
    await Promise.all(suspeitas.slice(i, i + 8).map(async (playlist) => {
      const { count, error } = await supabase
        .from('playlist_tracks')
        .select('*', { count: 'exact', head: true })
        .eq('playlist_id', playlist.id);
      if (!error && typeof count === 'number') playlist.trackCount = count;
    }));
  }
}

/**
 * Mostrar (ou esconder) uma playlist no perfil.
 *
 * Começam todas escondidas. A política que deixa um amigo ler só se aplica às
 * que estiverem marcadas -- ver supabase/profile-playlists.sql.
 */
export async function setPlaylistVisibility(id: string, visible: boolean): Promise<void> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('playlists')
    .update({ visible_on_profile: visible })
    .eq('id', id).eq('owner_id', userId).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This playlist is no longer available to edit.');
}

/**
 * As playlists que alguém mostra no perfil.
 *
 * Não é preciso filtrar por "são amigos" aqui: a política de leitura já o faz,
 * e uma consulta que devolva zero linhas é exatamente a resposta certa para
 * quem não pode ver.
 */
export async function listProfilePlaylists(userId: string): Promise<Playlist[]> {
  const lida = await lerComResumo('id, name, created_at', (q) => q
    .eq('owner_id', userId)
    .eq('visible_on_profile', true)
    .order('created_at', { ascending: false }));
  if (lida.error) throw lida.error;

  const playlists = (lida.data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    ...resumoDaPlaylist(row),
    visibleOnProfile: true,
    copiedFrom: null,
  }));
  await corrigirContagensLimitadas(cortadas(playlists, lida.data ?? []));
  return playlists;
}

/**
 * De que playlists dos outros é que eu já tenho cópia.
 *
 * É isto que deixa o botão saber em que estado está sem perguntar uma vez por
 * cada playlist da lista.
 */
export async function copiasGuardadas(): Promise<Set<string>> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('playlists')
    .select('copied_from')
    .eq('owner_id', userId)
    .not('copied_from', 'is', null);
  if (error) throw error;
  return new Set((data ?? []).map((r: any) => r.copied_from as string));
}

/**
 * Guardar a playlist de outra pessoa: fica uma cópia MINHA.
 *
 * É uma cópia e não uma ligação viva: passa a ser tua, podes editá-la, e não
 * muda quando o dono mexe na dele. O `copied_from` fica gravado só para o
 * botão saber que já a tens -- e para o clique seguinte saber o que apagar.
 */
export async function savePlaylistCopy(sourceId: string): Promise<string> {
  const {data,error}=await supabase.rpc('set_profile_playlist_copy',{p_source_id:sourceId,p_save:true});
  if(error)throw error;
  mudouUmaPlaylist();
  if(!data)throw new Error('Could not save this playlist.');
  return data as string;
}

/** Tirar a marca: apaga a cópia que se tinha feito desta playlist. */
export async function unsavePlaylistCopy(sourceId: string): Promise<void> {
  const { error } = await supabase.rpc('set_profile_playlist_copy',{p_source_id:sourceId,p_save:false});
  if (error) throw error;
  mudouUmaPlaylist();
}

/** Identidade e dono da playlist autorizada pela RLS, para abrir em modo de leitura. */
export async function getPlaylistDetails(id:string):Promise<{id:string;name:string;ownerId:string}> {
  const {data,error}=await supabase.from('playlists').select('id,name,owner_id').eq('id',id).maybeSingle();
  if(error)throw error;
  if(!data)throw new Error('This playlist is no longer available.');
  return {id:data.id,name:data.name,ownerId:data.owner_id};
}

export async function createPlaylist(name: string): Promise<Playlist> {
  const ownerId = await currentUserId();
  const { data, error } = await supabase
    .from('playlists')
    .insert({ owner_id: ownerId, name })
    .select('id, name, created_at')
    .single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    createdAt: data.created_at,
    trackCount: 0,
    artworks: [],
  };
}

export async function renamePlaylist(id: string, name: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase
    .from('playlists')
    .update({ name })
    .eq('id', id)
    .eq('owner_id', userId);
  if (error) throw error;
}

export async function deletePlaylist(id: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase
    .from('playlists')
    .delete()
    .eq('id', id)
    .eq('owner_id', userId);
  if (error) throw error;
  mudouUmaPlaylist();
}

export async function getPlaylistTracks(
  playlistId: string
): Promise<PlaylistTrack[]> {
  const data:any[]=[];
  for(let offset=0;;offset+=1000){
    const {data:page,error}=await supabase.from('playlist_tracks')
      .select('position, tracks (id, source, source_id, title, artist, album, artwork_url, duration_seconds)')
      .eq('playlist_id',playlistId).order('position',{ascending:true}).order('track_id',{ascending:true}).range(offset,offset+999);
    if(error)throw error;
    data.push(...(page??[]));
    if(!page||page.length<1000)break;
  }

  return (data ?? [])
    .filter((row: any) => row.tracks)
    .map((row: any) => ({
      id: row.tracks.id,
      source: row.tracks.source,
      sourceId: row.tracks.source_id,
      title: row.tracks.title,
      artist: row.tracks.artist,
      album: row.tracks.album,
      artworkUrl: row.tracks.artwork_url,
      durationSeconds: row.tracks.duration_seconds,
      position: row.position,
    }));
}

async function nextPosition(playlistId: string): Promise<number> {
  const { data } = await supabase
    .from('playlist_tracks')
    .select('position')
    .eq('playlist_id', playlistId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.position ?? -1) + 1;
}

/** Devolve o id da faixa no catálogo, para quem a quiser tirar depois sem o perguntar. */
export async function addTrackToPlaylist(
  playlistId: string,
  track: Track
): Promise<string> {
  // Os dois pedidos não dependem um do outro: em paralelo, uma ida à rede a menos.
  const [trackId, position] = await Promise.all([upsertTrack(track), nextPosition(playlistId)]);
  const { error } = await supabase
    .from('playlist_tracks')
    .upsert(
      { playlist_id: playlistId, track_id: trackId, position },
      { onConflict: 'playlist_id,track_id', ignoreDuplicates: true }
    );
  if (error) throw error;
  mudouUmaPlaylist();
  return trackId;
}

export async function removeTrackFromPlaylist(
  playlistId: string,
  trackId: string
): Promise<void> {
  const { error } = await supabase
    .from('playlist_tracks')
    .delete()
    .match({ playlist_id: playlistId, track_id: trackId });
  if (error) throw error;
  mudouUmaPlaylist();
}

/** O que saiu de uma playlist, para o "Undo" (3/10) a repor no mesmo lugar. */
export type LinhaTiradaDaPlaylist = { playlistId: string; trackId: string; position: number; addedAt: string };

/** Tira e devolve a linha que saiu, com a posição e a data de antes. */
export async function tirarDaPlaylist(playlistId: string, trackId: string): Promise<LinhaTiradaDaPlaylist | null> {
  const { data, error } = await supabase
    .from('playlist_tracks')
    .delete()
    .match({ playlist_id: playlistId, track_id: trackId })
    .select('position, added_at');
  if (error) throw error;
  mudouUmaPlaylist();
  const r: any = data?.[0];
  return r ? { playlistId, trackId, position: r.position, addedAt: r.added_at } : null;
}

/** O "Undo" do `tirarDaPlaylist`: a mesma linha, na mesma posição. */
export async function reporNaPlaylist(linha: LinhaTiradaDaPlaylist): Promise<void> {
  const { error } = await supabase
    .from('playlist_tracks')
    .upsert(
      { playlist_id: linha.playlistId, track_id: linha.trackId, position: linha.position, added_at: linha.addedAt },
      { onConflict: 'playlist_id,track_id', ignoreDuplicates: true }
    );
  if (error) throw error;
  mudouUmaPlaylist();
}

/** Persiste uma nova ordem (lista completa de track ids, já ordenada). */
export async function setPlaylistOrder(
  playlistId: string,
  orderedTrackIds: string[]
): Promise<void> {
  const rows = orderedTrackIds.map((trackId, index) => ({
    playlist_id: playlistId,
    track_id: trackId,
    position: index,
  }));
  const { error } = await supabase
    .from('playlist_tracks')
    .upsert(rows, { onConflict: 'playlist_id,track_id' });
  if (error) throw error;
}

/** Importação em lote (ex.: playlist do YouTube). */
/**
 * Junta faixas a uma playlist.
 *
 * Reescrito depois de uma importacao de 2000 musicas do Spotify falhar e
 * deixar uma playlist VAZIA: a versao anterior chamava upsertTrack faixa a
 * faixa (2000 idas ao Supabase em serie, minutos de espera) e depois mandava
 * as 2000 linhas de playlist_tracks num unico pedido. Bastava uma falhar
 * para nao entrar faixa nenhuma — e como o chamador ja tinha criado a
 * playlist antes, ficava o esqueleto vazio.
 *
 * Agora vai em lotes e reporta progresso. Uma playlist grande passa de ~2000
 * pedidos para umas dezenas.
 */
export async function addTracksToPlaylist(
  playlistId: string,
  tracks: Track[],
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  if (tracks.length === 0) return;

  // 1) Garantir que as faixas existem no catalogo (em lote).
  //    Esta fase e a mais demorada, por isso conta para a barra: se so
  //    contassemos a insercao, a barra ficava em 0 quase ate ao fim.
  //    Reparticao: catalogo = primeira metade, insercao = segunda.
  const total = tracks.length;
  const idsPorChave = await upsertTracks(tracks, 200, (done, subTotal) => {
    onProgress?.(Math.round((done / Math.max(subTotal, 1)) * total * 0.5), total);
  });

  // 2) Construir as linhas, sem repetidos: a mesma faixa duas vezes na mesma
  //    playlist nao faz sentido e partia o upsert.
  let position = await nextPosition(playlistId);
  const vistos = new Set<string>();
  const rows: { playlist_id: string; track_id: string; position: number }[] = [];
  for (const t of tracks) {
    const trackId = idsPorChave.get(trackKey(t));
    if (!trackId || vistos.has(trackId)) continue;
    vistos.add(trackId);
    rows.push({ playlist_id: playlistId, track_id: trackId, position });
    position++;
  }
  if (rows.length === 0) return;

  // 3) Inserir em lotes, avisando o chamador a cada um. Um lote a meio pode
  //    falhar depois de outros entrarem, por isso a afinidade esquece-se sempre.
  const CHUNK = 500;
  try {
    for (let i = 0; i < rows.length; i += CHUNK) {
      const lote = rows.slice(i, i + CHUNK);
      const { error } = await supabase
        .from('playlist_tracks')
        .upsert(lote, { onConflict: 'playlist_id,track_id', ignoreDuplicates: true });
      if (error) throw error;
      const feito = Math.min(i + lote.length, rows.length);
      onProgress?.(
        Math.round(total * 0.5 + (feito / Math.max(rows.length, 1)) * total * 0.5),
        total
      );
    }
  } finally {
    mudouUmaPlaylist();
  }
}

export interface ResultadoDoMerge {
  adicionadas: number;
  repetidas: number;
  totalDaOrigem: number;
}

/** Copia apenas as faixas em falta; a playlist de origem nunca é alterada. */
export async function mergePlaylists(targetId: string, sourceId: string): Promise<ResultadoDoMerge> {
  if (!targetId || !sourceId || targetId === sourceId) throw new Error('Choose two different playlists.');
  const [target, source] = await Promise.all([getPlaylistTracks(targetId), getPlaylistTracks(sourceId)]);
  const plano = planearMerge(target, source);
  if (plano.novas.length) await addTracksToPlaylist(targetId, plano.novas);
  return { adicionadas: plano.novas.length, repetidas: plano.repetidas, totalDaOrigem: source.length };
}

/** Nome de uma playlist partilhada (leitura permitida a quem participa na
 * partilha — ver supabase/shared-playlists-read.sql). */
/**
 * Nome, número de faixas e capas das playlists que aparecem numa conversa.
 *
 * Uma mensagem só guarda o `playlist_id`, por isso sem isto o chat só sabia
 * dizer "Open playlist" -- não dizia QUAL. Vai buscar todas de uma vez, que
 * uma conversa pode ter várias.
 *
 * A RLS é que decide o que volta: depois do security-hardening.sql, uma
 * playlist só se lê se existir mesmo uma partilha do dono para quem está a
 * ler. Um id que já não esteja partilhado simplesmente não vem, e o chat
 * mantém o botão simples.
 */
export async function getPlaylistPreviews(ids: string[]): Promise<Map<string, Playlist>> {
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  if (!unicos.length) return new Map();
  const lida = await lerComResumo('id, name, created_at', (q) => q.in('id', unicos));
  if (lida.error) return new Map();
  const playlists = (lida.data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    ...resumoDaPlaylist(row),
  } as Playlist));
  await corrigirContagensLimitadas(cortadas(playlists, lida.data ?? []));
  return new Map(playlists.map((playlist) => [playlist.id, playlist]));
}

export async function getPlaylistName(playlistId: string): Promise<string | null> {
  const { data } = await supabase
    .from('playlists')
    .select('name')
    .eq('id', playlistId)
    .maybeSingle();
  return data?.name ?? null;
}

export async function importSharedPlaylist(sharedPlaylistId: string): Promise<string> {
  const { data: plData, error: plError } = await supabase
    .from('playlists')
    .select('name')
    .eq('id', sharedPlaylistId)
    .single();
  if (plError || !plData) throw new Error('Shared playlist not found');

  const { data: tracksData, error: tracksError } = await supabase
    .from('playlist_tracks')
    .select('position, tracks (id, source, source_id, title, artist, album, artwork_url, duration_seconds)')
    .eq('playlist_id', sharedPlaylistId)
    .order('position', { ascending: true });
  if (tracksError) throw tracksError;

  const newPl = await createPlaylist(plData.name + ' (Shared)');

  const tracksToInsert = (tracksData ?? [])
    .map((row: any) => row.tracks)
    .filter(Boolean)
    .map((t: any) => ({
      source: t.source,
      sourceId: t.source_id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      artworkUrl: t.artwork_url,
      durationSeconds: t.duration_seconds,
    }));

  if (tracksToInsert.length > 0) {
    await addTracksToPlaylist(newPl.id, tracksToInsert);
  }
  return newPl.id;
}
