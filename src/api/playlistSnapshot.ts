import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { idDaConta } from '../lib/idDaConta';
import { medirTrabalho, cederParaInterface } from '../lib/trabalhoLocal';
import { esquecerAlargada } from '../lib/cacheDaBiblioteca';

export type LinhaDePlaylist = {
  playlist_id: string; position: number;
  tracks: { id: string; source: 'youtube' | 'spotify'; source_id: string; title: string;
    artist: string | null; album: string | null; artwork_url: string | null; duration_seconds: number | null } | null;
};
type Snapshot = { conta: string; revision: number; em: number; verificado: number; linhas: LinhaDePlaylist[]; invalidada?: boolean };
const PREFIX = 'duotone:playlist-snapshot:v1:';
const VERIFICAR_MS = 15_000;
const RECONCILIAR_MS = 24 * 60 * 60_000;
const FALLBACK_MS = 2 * 60_000;
const MAX_DISCO = 10_000_000;
let guardado: Snapshot | null = null;
let emCurso: { conta: string; promessa: Promise<LinhaDePlaylist[]> } | null = null;
let geracao = 0;
const versoes = new Map<string, number>();
const escritas = new Map<string, Promise<unknown>>();

function disco(conta: string, fn: () => Promise<unknown>): Promise<unknown> {
  const pedido = (escritas.get(conta) ?? Promise.resolve()).then(fn, fn);
  escritas.set(conta, pedido);
  void pedido.finally(() => { if (escritas.get(conta) === pedido) escritas.delete(conta); }).catch(() => {});
  return pedido;
}
/** Exige nova verificação; uma leitura antiga nunca certifica a base invalidada. */
export function esquecerFaixasDasPlaylists(): void {
  const conta = guardado?.conta ?? emCurso?.conta;
  geracao++;
  // Mantém a base para aplicar apenas as playlists alteradas; a revisão
  // no servidor decide o que mudou, incluindo alterações de outro aparelho.
  if (guardado) guardado = { ...guardado, verificado: 0, invalidada: true };
  emCurso = null;
  if (conta) {
    versoes.set(conta, (versoes.get(conta) ?? 0) + 1);
  }
}

async function carregar(conta: string): Promise<Snapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + conta);
    if (!raw || raw.length > MAX_DISCO) return null;
    const value = medirTrabalho('playlists.parse', () => JSON.parse(raw));
    if (value.conta !== conta || !Number.isFinite(value.em) || !Number.isSafeInteger(value.revision)
      || !Array.isArray(value.linhas) || Date.now() - value.em >= RECONCILIAR_MS) return null;
    return { ...value, verificado: 0 };
  } catch { return null; }
}

export async function lerFaixasDasPlaylists(forcar = false): Promise<LinhaDePlaylist[]> {
  const conta = await idDaConta();
  if (!conta) throw new Error('Session expired');
  if (guardado && guardado.conta !== conta) { guardado = null; geracao++; }
  if (emCurso?.conta === conta) return emCurso.promessa;
  const gen = geracao, versao = versoes.get(conta) ?? 0;
  const aindaMinha = async () => gen === geracao && versao === (versoes.get(conta) ?? 0) && await idDaConta() === conta;
  const promessa = (async () => {
    const anterior = guardado ?? await carregar(conta);
    if (!await aindaMinha()) throw new Error('Library changed while loading. Try again.');
    if (!forcar && anterior && Date.now() - anterior.verificado < VERIFICAR_MS) return anterior.linhas;
    const { data: state, error } = await supabase.rpc('get_playlist_changes', { p_after: anterior?.revision ?? 0 });
    if (!await aindaMinha()) throw new Error('Session changed');
    const revision = state?.revision;
    const disponivel = !error && Number.isSafeInteger(revision) && revision >= 0 && Array.isArray(state.changes);
    if (error && error.code !== 'PGRST202' && error.code !== '42883') {
      // A biblioteca própria já guardada continua utilizável sem rede.
      if (anterior) return anterior.linhas;
      throw error;
    }
    if (!forcar && anterior && Date.now() - anterior.em < (disponivel ? RECONCILIAR_MS : FALLBACK_MS)
      && (disponivel ? anterior.revision === Number(revision) : !anterior.invalidada)) {
      if (await aindaMinha()) guardado = { ...anterior, verificado: Date.now() };
      else throw new Error('Session changed');
      return anterior.linhas;
    }
    const incremental = !forcar && anterior && disponivel && revision >= anterior.revision
      && Date.now() - anterior.em < RECONCILIAR_MS && state.changes.length <= 20;
    const mudaram = new Set<string>(incremental ? state.changes.map((c: any) => c.playlist_id) : []);
    const linhas: LinhaDePlaylist[] = incremental ? anterior.linhas.filter(l => !mudaram.has(l.playlist_id)) : [];
    const alvos: (string | null)[] = incremental
      ? state.changes.filter((c: any) => !c.deleted).map((c: any) => c.playlist_id) : [null];
    if (anterior && (!disponivel || revision !== anterior.revision)) esquecerAlargada();
    for (const alvo of alvos) for (let offset = 0; ; offset += 1000) {
      let query = supabase.from('playlist_tracks')
        .select('playlist_id, position, tracks (id, source, source_id, title, artist, album, artwork_url, duration_seconds), playlists!inner (owner_id)')
        .eq('playlists.owner_id', conta).order('playlist_id').order('track_id').range(offset, offset + 999);
      if (alvo) query = query.eq('playlist_id', alvo);
      const { data, error: erro } = await query;
      if (erro) throw erro;
      linhas.push(...((data ?? []) as unknown as LinhaDePlaylist[]));
      if (!data || data.length < 1000) break;
      await cederParaInterface();
    }
    // Revisão lida ANTES das páginas: uma alteração durante a leitura obriga
    // a reler na verificação seguinte, em vez de certificar dados antigos.
    const snapshot: Snapshot = { conta, revision: disponivel ? Number(revision) : -1,
      em: incremental ? anterior.em : Date.now(), verificado: Date.now(), linhas };
    if (await idDaConta() !== conta) throw new Error('Session changed');
    if (!await aindaMinha()) return linhas;
    guardado = snapshot;
    const raw = medirTrabalho('playlists.serialize', () => JSON.stringify(snapshot));
    if (raw.length <= MAX_DISCO) void disco(conta, async () => {
      if (gen === geracao && versao === (versoes.get(conta) ?? 0)) await AsyncStorage.setItem(PREFIX + conta, raw);
    }).catch(() => {});
    return linhas;
  })();
  emCurso = { conta, promessa };
  try { return await promessa; }
  finally { if (emCurso?.promessa === promessa) emCurso = null; }
}

/**
 * A cópia em disco, com a idade que tiver (16/10, auditoria 29): sem rede, a
 * de há três dias vale mais do que "You're offline". Só para MOSTRAR e tocar o
 * que está no aparelho -- com rede, quem manda é o `lerFaixasDasPlaylists`.
 * A conta vem de quem chama (a do aparelho): sem rede, a sessão pode não se
 * conseguir renovar.
 */
async function copiaSemRede(conta: string): Promise<LinhaDePlaylist[] | null> {
  if (guardado?.conta === conta) return guardado.linhas;
  try {
    const raw = await AsyncStorage.getItem(PREFIX + conta);
    if (!raw || raw.length > MAX_DISCO) return null;
    const value = medirTrabalho('playlists.parse', () => JSON.parse(raw));
    return value?.conta === conta && Array.isArray(value.linhas) ? value.linhas : null;
  } catch { return null; }
}

export type FaixaDaCopia = {
  id: string; source: 'youtube' | 'spotify'; sourceId: string; title: string; artist: string | null;
  album: string | null; artworkUrl: string | null; durationSeconds: number | null; position: number;
};

const daLinha = (l: LinhaDePlaylist): FaixaDaCopia | null => l.tracks ? {
  id: l.tracks.id, source: l.tracks.source, sourceId: l.tracks.source_id, title: l.tracks.title,
  artist: l.tracks.artist, album: l.tracks.album, artworkUrl: l.tracks.artwork_url,
  durationSeconds: l.tracks.duration_seconds, position: l.position,
} : null;

/** As faixas de uma playlist PRÓPRIA na cópia, pela ordem. `null` se não estiver lá. */
export async function faixasDaPlaylistSemRede(conta: string, id: string): Promise<FaixaDaCopia[] | null> {
  const linhas = await copiaSemRede(conta);
  if (!linhas) return null;
  const dela = linhas.filter((l) => l.playlist_id === id);
  if (!dela.length) return null;
  return dela
    .sort((a, b) => a.position - b.position || (a.tracks?.id ?? '').localeCompare(b.tracks?.id ?? ''))
    .map(daLinha).filter((f): f is FaixaDaCopia => !!f);
}

/** Todas as playlists próprias da cópia, cada uma com as suas faixas. */
export async function playlistsDaCopiaSemRede(conta: string): Promise<Map<string, FaixaDaCopia[]>> {
  const porPlaylist = new Map<string, FaixaDaCopia[]>();
  for (const l of (await copiaSemRede(conta)) ?? []) {
    const f = daLinha(l);
    if (!f) continue;
    const lista = porPlaylist.get(l.playlist_id) ?? [];
    lista.push(f);
    porPlaylist.set(l.playlist_id, lista);
  }
  return porPlaylist;
}

/** Só reutiliza uma playlist própria já conhecida; as dos amigos passam pela RLS. */
export async function playlistPropriaEmCache(id: string): Promise<LinhaDePlaylist[] | null> {
  const conta = await idDaConta();
  if (!conta || guardado?.conta !== conta || !guardado.linhas.some(l => l.playlist_id === id)) return null;
  return (await lerFaixasDasPlaylists()).filter(l => l.playlist_id === id)
    .sort((a, b) => a.position - b.position || (a.tracks?.id ?? '').localeCompare(b.tracks?.id ?? ''));
}
