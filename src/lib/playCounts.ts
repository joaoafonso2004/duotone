import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { Track } from '../types';
import { medirTrabalho, medirEspera, cederParaInterface } from './trabalhoLocal';

/**
 * Contagens partilhadas entre dispositivos.
 *
 * O Supabase é a fonte de verdade. AsyncStorage continua a ser usado como
 * cache imediato e como fila de deltas quando o dispositivo está offline.
 * Na primeira execução desta versão, os dados locais antigos são enviados uma
 * única vez para que o histórico existente no telemóvel não seja perdido.
 */

const KEY = 'playCounts:v1';
const PENDING_PREFIX = 'playCounts:pending:v3:';
const LEGACY_PENDING_PREFIX = 'playCounts:pending:v2:';
const MIGRATED_PREFIX = 'playCounts:migrated:v2:';
const LAST_USER_KEY = 'playCounts:lastUser:v2';
const DEVICE_KEY = 'playCounts:device:v3';
const SEQUENCE_PREFIX = 'playCounts:sequence:v3:';
const SNAPSHOT_PREFIX = 'playCounts:snapshot:v1:';
let memoryMap: PlayCounts | null = null;
let remoteSnapshot: { uid: string; revision: number; map: PlayCounts } | null = null;
let changesAvailable = true;

export interface PlayCountEntry {
  source: Track['source'];
  sourceId: string;
  title: string;
  artist: string | null;
  artworkUrl: string | null;
  durationSeconds: number | null;
  count: number;
  lastPlayed: number;
}

type PlayCounts = Record<string, PlayCountEntry>;
type PendingDelta = PlayCountEntry & { operationDevice: string; operationSequence: number };

function keyOf(track: Pick<Track, 'source' | 'sourceId'>): string {
  return `${track.source}:${track.sourceId}`;
}

async function readMap(storageKey = KEY): Promise<PlayCounts> {
  if (storageKey === KEY && memoryMap) return memoryMap;
  const raw = await AsyncStorage.getItem(storageKey);
  if (!raw) return {};
  try {
    const parsed = medirTrabalho('history.parse', () => JSON.parse(raw));
    const value = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    if (storageKey === KEY) memoryMap = value;
    return value;
  } catch {
    return {};
  }
}

async function writeMap(value: PlayCounts, storageKey = KEY): Promise<void> {
  const raw = medirTrabalho('history.serialize', () => JSON.stringify(value));
  await medirEspera('history.persist', () => AsyncStorage.setItem(storageKey, raw));
  if (storageKey === KEY) memoryMap = value;
}

function rowToEntry(row: any): PlayCountEntry {
  return {
    source: row.source,
    sourceId: row.source_id,
    title: row.title,
    artist: row.artist,
    artworkUrl: row.artwork_url,
    durationSeconds: row.duration_seconds,
    count: Number(row.play_count) || 0,
    lastPlayed: new Date(row.last_played).getTime(),
  };
}

function entriesToMap(entries: PlayCountEntry[]): PlayCounts {
  return Object.fromEntries(entries.map((entry) => [keyOf(entry), entry]));
}

async function userId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

async function applyDeltas(entries: PendingDelta[]): Promise<boolean> {
  if (!entries.length) return true;
  const { error } = await supabase.rpc('apply_play_count_deltas', {
    entries: entries.map((entry) => ({
      source: entry.source,
      sourceId: entry.sourceId,
      title: entry.title,
      artist: entry.artist,
      artworkUrl: entry.artworkUrl,
      durationSeconds: entry.durationSeconds,
      count: entry.count,
      lastPlayed: entry.lastPlayed,
      operationDevice: entry.operationDevice,
      operationSequence: entry.operationSequence,
    })),
  });
  if (error) {
    console.error('applyDeltas error:', error.message, error.details);
  }
  return !error;
}

async function pullRemote(uid: string): Promise<PlayCounts | null> {
  if (changesAvailable) {
    try {
      if (remoteSnapshot?.uid !== uid) {
        remoteSnapshot = { uid, revision: 0, map: {} };
        const raw = await AsyncStorage.getItem(SNAPSHOT_PREFIX + uid);
        if (raw && raw.length < 10_000_000) {
          const saved = medirTrabalho('history.snapshot.parse', () => JSON.parse(raw));
          if (Number.isSafeInteger(saved.revision) && saved.revision >= 0 && saved.map && typeof saved.map === 'object')
            remoteSnapshot = { uid, revision: saved.revision, map: saved.map };
        }
      }
      let revision = remoteSnapshot.revision;
      const map: PlayCounts = { ...remoteSnapshot.map };
      let changed = false;
      for (;;) {
        const { data, error } = await medirEspera('history.changes.request', () => supabase.rpc('get_play_count_changes', { p_after: revision, p_limit: 500 }));
        if (error) {
          if (['PGRST202', '42883'].includes(error.code)) { changesAvailable = false; break; }
          return null;
        }
        if (!data || !Array.isArray(data.changes) || !Number.isSafeInteger(data.revision) || data.revision < 0) return null;
        if (data.revision < revision) {
          // Restauração da base: recomeçar sem conservar linhas do futuro.
          revision = 0; for (const key of Object.keys(map)) delete map[key]; changed = true; continue;
        }
        if (data.more && data.revision <= revision) return null;
        medirTrabalho('history.changes.merge', () => {
          for (const row of data.changes) {
            const key = `${row.source}:${row.source_id}`;
            if (row.deleted) delete map[key];
            else map[key] = rowToEntry(row);
          }
        });
        changed ||= data.changes.length > 0;
        revision = data.revision;
        if (!data.more) break;
        await cederParaInterface();
      }
      if (changesAvailable) {
        if (await userId() !== uid) return null;
        if (changed || remoteSnapshot.revision !== revision) {
          const snapshot = { revision, map };
          // Cursor e dados persistem juntos: uma escrita interrompida nunca
          // guarda um cursor adiantado em relação às contagens guardadas.
          await AsyncStorage.setItem(SNAPSHOT_PREFIX + uid, medirTrabalho('history.snapshot.serialize', () => JSON.stringify(snapshot)));
        }
        remoteSnapshot = { uid, revision, map };
        return map;
      }
    } catch { return null; }
  }
  const rows:any[]=[];
  for(let offset=0;;offset+=1000){
    const { data, error } = await supabase.from('user_play_counts')
      .select('source, source_id, title, artist, artwork_url, duration_seconds, play_count, last_played')
      .eq('user_id', uid).order('source').order('source_id').range(offset,offset+999);
    if (error) {
      console.error('pullRemote error:', error.message, error.details, error.hint);
      return null;
    }
    rows.push(...(data??[]));
    if(!data||data.length<1000)break;
  }
  return entriesToMap(rows.map(rowToEntry));
}

async function operation(uid:string,entry:PlayCountEntry):Promise<PendingDelta>{
  let device=await AsyncStorage.getItem(DEVICE_KEY);
  if(!device){device=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;await AsyncStorage.setItem(DEVICE_KEY,device);}
  const key=`${SEQUENCE_PREFIX}${uid}:${device}`;
  const sequence=Math.max(0,Number(await AsyncStorage.getItem(key))||0)+1;
  await AsyncStorage.setItem(key,String(sequence));
  return {...entry,operationDevice:device,operationSequence:sequence};
}

async function readPending(uid:string):Promise<PendingDelta[]>{
  const key=`${PENDING_PREFIX}${uid}`,raw=await AsyncStorage.getItem(key);
  if(raw){try{const value=JSON.parse(raw);if(Array.isArray(value))return value.filter(x=>x&&typeof x.operationDevice==='string'&&Number.isSafeInteger(x.operationSequence));}catch{}}
  const legacy=Object.values(await readMap(`${LEGACY_PENDING_PREFIX}${uid}`));
  const converted:PendingDelta[]=[];
  for(const entry of legacy)converted.push(await operation(uid,entry));
  if(converted.length)await AsyncStorage.setItem(key,JSON.stringify(converted));
  await writeMap({},`${LEGACY_PENDING_PREFIX}${uid}`);
  return converted;
}

async function flushPending(uid:string):Promise<boolean>{
  const key=`${PENDING_PREFIX}${uid}`;
  let pending=await readPending(uid);
  while(pending.length){
    const chunk=pending.slice(0,500);
    if(!await applyDeltas(chunk))return false;
    pending=pending.slice(chunk.length);
    await AsyncStorage.setItem(key,JSON.stringify(pending));
  }
  return true;
}

/** Serializa migração, flush e pull para nunca perder deltas concorrentes. */
let syncTail: Promise<void> = Promise.resolve();
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = syncTail.then(operation, operation);
  syncTail = result.then(() => undefined, () => undefined);
  return result;
}

const INTERVALO_DE_LEITURA_MS = 60_000;
const INTERVALO_LEGACY_MS = 30 * 60_000;
let ultimaLeitura: { uid: string; em: number } | null = null;

async function syncUnsafe(forcarLeitura = false): Promise<PlayCounts> {
  let local = await readMap();
  const uid = await userId();
  if (!uid) return local;

  const migratedKey = `${MIGRATED_PREFIX}${uid}`;
  const pendingKey = `${PENDING_PREFIX}${uid}`;
  const [migrated, lastUser] = await Promise.all([
    AsyncStorage.getItem(migratedKey),
    AsyncStorage.getItem(LAST_USER_KEY),
  ]);
  const mudouConta = !!lastUser && lastUser !== uid;
  if (mudouConta) { local = {}; await writeMap(local); ultimaLeitura = null; }

  if (migrated !== '1') {
    // Importa o histórico pré-sincronização deste dispositivo uma única vez.
    // Inclui deltas pendentes já refletidos no cache local, por isso a fila é
    // limpa quando a importação tem sucesso para evitar dupla contagem.
    const canImportLegacyCache = !lastUser || lastUser === uid;
    if (!canImportLegacyCache) {
      local = {};
      await writeMap(local);
    }
    const pending:PendingDelta[]=[];
    if(canImportLegacyCache)for(const entry of Object.values(local))pending.push(await operation(uid,entry));
    await AsyncStorage.multiSet([[pendingKey,JSON.stringify(pending)],[`${LEGACY_PENDING_PREFIX}${uid}`,'{}'],[migratedKey,'1'],[LAST_USER_KEY,uid]]);
    if (!await flushPending(uid)) return local;
  } else {
    if (!await flushPending(uid)) return local;
  }

  // O incremento é enviado imediatamente; não precisa de descarregar as
  // centenas/milhares de contagens antigas a cada música. A cache local já
  // inclui o delta. Uma sincronização explícita continua a ler o servidor.
  if (!forcarLeitura && ultimaLeitura?.uid === uid && Date.now() - ultimaLeitura.em < (changesAvailable ? INTERVALO_DE_LEITURA_MS : INTERVALO_LEGACY_MS)) return local;
  const remote = await pullRemote(uid);
  if (!remote) return local;
  await Promise.all([writeMap(remote), AsyncStorage.setItem(LAST_USER_KEY, uid)]);
  ultimaLeitura = { uid, em: Date.now() };
  return remote;
}

export async function synchronizePlayCounts(): Promise<void> {
  await serialized(() => syncUnsafe(true));
}

export async function incrementPlayCount(track: Track): Promise<void> {
  await serialized(async () => {
    const uid = await userId();
    const lastUser = await AsyncStorage.getItem(LAST_USER_KEY);
    if (uid && lastUser && lastUser !== uid) await syncUnsafe();

    const now = Date.now();
    const local = await readMap();
    const key = keyOf(track);
    const previous = local[key];
    local[key] = {
      source: track.source,
      sourceId: track.sourceId,
      title: track.title,
      artist: track.artist ?? null,
      artworkUrl: track.artworkUrl ?? null,
      durationSeconds: track.durationSeconds ?? previous?.durationSeconds ?? null,
      count: (previous?.count ?? 0) + 1,
      lastPlayed: now,
    };
    await writeMap(local);

    if (uid) {
      const pendingKey = `${PENDING_PREFIX}${uid}`;
      const pending = await readPending(uid);
      pending.push(await operation(uid,{...local[key],count:1,lastPlayed:now}));
      await AsyncStorage.setItem(pendingKey,JSON.stringify(pending));
    }

    await syncUnsafe();
  });
}

async function syncedEntries(): Promise<PlayCountEntry[]> {
  return Object.values(await serialized(syncUnsafe));
}

export async function getMostPlayed(limit = 50): Promise<PlayCountEntry[]> {
  return (await syncedEntries())
    .sort((a, b) => b.count - a.count || b.lastPlayed - a.lastPlayed)
    .slice(0, limit);
}

export async function getRecentlyPlayed(limit = 20): Promise<PlayCountEntry[]> {
  return (await syncedEntries())
    .sort((a, b) => b.lastPlayed - a.lastPlayed)
    .slice(0, limit);
}

export interface PlayStats {
  totalPlays: number;
  uniqueTracks: number;
  topArtist: { name: string; plays: number } | null;
}

export async function getPlayStats(): Promise<PlayStats> {
  const entries = await syncedEntries();
  const byArtist = new Map<string, number>();
  let totalPlays = 0;
  for (const entry of entries) {
    totalPlays += entry.count;
    const artist = (entry.artist ?? '').trim();
    if (artist) byArtist.set(artist, (byArtist.get(artist) ?? 0) + entry.count);
  }
  let topArtist: PlayStats['topArtist'] = null;
  for (const [name, plays] of byArtist) {
    if (!topArtist || plays > topArtist.plays) topArtist = { name, plays };
  }
  return { totalPlays, uniqueTracks: entries.length, topArtist };
}

export async function getTotalPlays(): Promise<number> {
  return (await syncedEntries()).reduce((sum, entry) => sum + entry.count, 0);
}

export async function clearPlayCounts(): Promise<void> {
  await serialized(async () => {
    const uid = await userId();
    if (uid) {
      const { error } = await supabase.from('user_play_counts').delete().eq('user_id', uid);
      if (error) throw error;
      await AsyncStorage.multiSet([
        [`${MIGRATED_PREFIX}${uid}`, '1'],
        [`${PENDING_PREFIX}${uid}`, '[]'],
        [`${LEGACY_PENDING_PREFIX}${uid}`, '{}'],
        [LAST_USER_KEY, uid],
      ]);
      await AsyncStorage.removeItem(SNAPSHOT_PREFIX + uid);
      remoteSnapshot = null;
      ultimaLeitura = null;
    }
    await writeMap({});
  });
}
