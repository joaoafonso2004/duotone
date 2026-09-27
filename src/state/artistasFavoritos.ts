import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { getArtistasFavoritos } from '../lib/prefs';
import { updateAccountPrefs } from '../lib/accountPrefs';
import { ArtistFavoritesSync, applyFavoriteEdits, readFavorites, type FavoritesSnapshot } from '../lib/artistFavoritesSync';

const REMOTE_KEY = 'artist_favorites_v1';
/**
 * No máximo uma ida à conta a cada dois minutos, quando não há nada por enviar.
 *
 * Sem edições, sincronizar é LER a linha inteira do `user_prefs` (o
 * `updateAccountPrefs` lê todas as preferências da conta para mudar uma). Era
 * de 15 em 15 s com a app à frente, e a cada foco da janela do PC: um dos
 * suspeitos do egress que o Supabase cobrou a 27/9. Uma edição continua a sair
 * logo (o `edit` chama o `sync`), e um aviso do Realtime lê sempre.
 */
const RELER_NO_MAXIMO_MS = 2 * 60 * 1000;
let sync: ArtistFavoritesSync | null = null;
interface Favoritos {
  chaves: Set<string>;
  carregados: boolean;
  estado: 'loading' | 'saved' | 'pending' | 'error';
  carregar: () => Promise<void>;
  alternar: (chave: string) => void;
  esquecer: () => void;
}
export const useArtistasFavoritos = create<Favoritos>()((set, get) => ({
  chaves: new Set(), carregados: false, estado: 'loading',
  carregar: async () => { await sync?.sync(); },
  alternar: chave => sync?.edit(chave, !get().chaves.has(chave)),
  esquecer: () => set({ chaves: new Set(), carregados: false, estado: 'loading' }),
}));

/** Runs for the account lifetime, including offline. The old unscoped cache
 * is claimed once; it cannot migrate to a second account on this device. */
export function iniciarArtistasFavoritos(userId: string): () => void {
  let alive = true;
  const localKey = `artist-favorites:${userId}`;
  useArtistasFavoritos.getState().esquecer();
  const instance = new ArtistFavoritesSync({
    readLocal: async () => {
      const saved = await AsyncStorage.getItem(localKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { values: readFavorites(parsed.values), pending: parsed.pending ?? {} };
      }
      const owner = await AsyncStorage.getItem('artist-favorites:legacy-owner');
      const legacy = !owner || owner === userId ? await getArtistasFavoritos() : [];
      if (!alive) return { values: {}, pending: {} };
      if (!owner) await AsyncStorage.setItem('artist-favorites:legacy-owner', userId);
      return { values: Object.fromEntries(legacy.map(key => [key, true])),
        pending: Object.fromEntries(legacy.map(key => [key, { value: true, revision: 0, seed: true }])) };
    },
    writeLocal: (snapshot: FavoritesSnapshot) => AsyncStorage.setItem(localKey, JSON.stringify(snapshot)),
    exchange: async edits => {
      const prefs = await updateAccountPrefs(userId, current => {
        // Recover the older account backup as well as this device's cache.
        let legacy: string[] = [];
        try { const value = JSON.parse(String(current['pref:artistasFavoritos'] ?? '[]'));
          if (Array.isArray(value)) legacy = value.filter(k => typeof k === 'string' && k.trim());
        } catch { /* Invalid legacy backup. */ }
        const old = current[REMOTE_KEY] === undefined ? Object.fromEntries(legacy.map(k => [k, true])) : readFavorites(current[REMOTE_KEY]);
        return { ...current, [REMOTE_KEY]: applyFavoriteEdits(old, edits) };
      }, () => alive);
      return readFavorites(prefs[REMOTE_KEY]);
    },
    apply: values => { if (alive) useArtistasFavoritos.setState({ chaves: new Set(Object.keys(values).filter(k => values[k])), carregados: true }); },
    status: estado => { if (alive) useArtistasFavoritos.setState({ estado }); },
  });
  sync = instance;
  let ultimaLeitura = 0;
  const reler = (sempre: boolean) => {
    if (!alive) return;
    const agora = Date.now();
    // Uma edição que ficou por enviar (sem rede, erro) não espera pelo prazo.
    const emDia = useArtistasFavoritos.getState().estado === 'saved';
    if (!sempre && emDia && agora - ultimaLeitura < RELER_NO_MAXIMO_MS) return;
    ultimaLeitura = agora;
    void instance.sync();
  };
  const refresh = () => reler(false);
  // Sem polling: ao abrir, ao voltar à frente, ao voltar a rede, no foco da
  // janela do PC -- no máximo de dois em dois minutos -- e com o Realtime, se
  // o `user_prefs` estiver publicado (os ficheiros de supabase/ não o publicam).
  const app = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
  const channel = supabase.channel(`artist-favorites:${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_prefs', filter: `user_id=eq.${userId}` }, () => reler(true))
    .subscribe(status => { if (status === 'SUBSCRIBED') refresh(); });
  if (Platform.OS === 'web') { window.addEventListener('online', refresh); window.addEventListener('focus', refresh); }
  refresh();
  return () => {
    alive = false; instance.stop(); if (sync === instance) sync = null;
    app.remove(); void supabase.removeChannel(channel);
    if (Platform.OS === 'web') { window.removeEventListener('online', refresh); window.removeEventListener('focus', refresh); }
    useArtistasFavoritos.getState().esquecer();
  };
}
