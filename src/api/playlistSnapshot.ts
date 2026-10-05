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

/** Só reutiliza uma playlist própria já conhecida; as dos amigos passam pela RLS. */
export async function playlistPropriaEmCache(id: string): Promise<LinhaDePlaylist[] | null> {
  const conta = await idDaConta();
  if (!conta || guardado?.conta !== conta || !guardado.linhas.some(l => l.playlist_id === id)) return null;
  return (await lerFaixasDasPlaylists()).filter(l => l.playlist_id === id)
    .sort((a, b) => a.position - b.position || (a.tracks?.id ?? '').localeCompare(b.tracks?.id ?? ''));
}
