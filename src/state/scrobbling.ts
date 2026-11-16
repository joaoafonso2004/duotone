import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { APP_VERSION } from '../lib/buildInfo';
import {
  API_DO_LISTENBRAINZ, juntarAFila, lerFila, POR_LOTE, pedidoDeAgora, pedidoDeEscutas, podeScrobblar, valeTentarDeNovo,
  type EscutaPorEnviar, type MusicaParaScrobble,
} from '../lib/scrobbling';
import { guardarSegredo, lerSegredo } from '../lib/segredos';
import { usePrivacidade } from './privacidade';
import type { Track } from '../types';

/**
 * O scrobbling no ListenBrainz (16/11, lib/scrobbling.ts): o token e o nome de
 * quem está ligado, e os pedidos. Nada passa pelo Supabase. O leitor chama o
 * `scrobbler` (ligado no App.tsx, como o `guardarEscutaPorEnviar`).
 */
const CHAVE_DO_TOKEN = 'duotone.listenbrainz.token';
const CHAVE_DO_UTILIZADOR = 'duotone:listenbrainz-utilizador:v1';
const CHAVE_DA_FILA = 'duotone:scrobbles-por-enviar:v1';

type Estado = { carregado: boolean; utilizador: string | null };
export const useScrobbling = create<Estado>(() => ({ carregado: false, utilizador: null }));

let token: string | null = null;

export async function carregarScrobbling(): Promise<void> {
  if (useScrobbling.getState().carregado) return;
  const [t, u] = await Promise.all([lerSegredo(CHAVE_DO_TOKEN), AsyncStorage.getItem(CHAVE_DO_UTILIZADOR).catch(() => null)]);
  token = t;
  useScrobbling.setState({ carregado: true, utilizador: t ? u : null });
  if (t) void enviarPorEnviar();
}

/** Confirma o token no ListenBrainz e guarda-o. Devolve o nome, ou um erro que se pode mostrar. */
export async function ligarListenBrainz(novo: string): Promise<{ utilizador: string } | { erro: 'recusado' | 'rede' }> {
  const t = novo.trim();
  try {
    const r = await fetch(`${API_DO_LISTENBRAINZ}/1/validate-token`, { headers: { Authorization: `Token ${t}` } });
    const corpo = await r.json().catch(() => null) as { valid?: boolean; user_name?: string } | null;
    if (!r.ok || !corpo?.valid || !corpo.user_name) return { erro: r.status >= 500 ? 'rede' : 'recusado' };
    token = t;
    await guardarSegredo(CHAVE_DO_TOKEN, t);
    await AsyncStorage.setItem(CHAVE_DO_UTILIZADOR, corpo.user_name).catch(() => {});
    useScrobbling.setState({ carregado: true, utilizador: corpo.user_name });
    return { utilizador: corpo.user_name };
  } catch {
    return { erro: 'rede' };
  }
}

export async function desligarListenBrainz(): Promise<void> {
  token = null;
  useScrobbling.setState({ utilizador: null });
  await guardarSegredo(CHAVE_DO_TOKEN, null);
  await AsyncStorage.multiRemove([CHAVE_DO_UTILIZADOR, CHAVE_DA_FILA]).catch(() => {});
}

function paraScrobble(t: Track): MusicaParaScrobble {
  return {
    titulo: tituloDaFaixa(t),
    artista: displayArtist(t),
    album: t.album ?? null,
    duracaoMs: t.durationSeconds ? t.durationSeconds * 1000 : null,
    videoId: t.source === 'youtube' ? t.sourceId : null,
  };
}

/** Manda ao ListenBrainz. Devolve o estado HTTP, ou null sem rede. */
async function mandar(corpo: unknown): Promise<number | null> {
  if (!token) return 401;
  try {
    const r = await fetch(`${API_DO_LISTENBRAINZ}/1/submit-listens`, {
      method: 'POST',
      headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    return r.status;
  } catch {
    return null;
  }
}

async function lerAFila(): Promise<EscutaPorEnviar[]> {
  try { const raw = await AsyncStorage.getItem(CHAVE_DA_FILA); return lerFila(raw ? JSON.parse(raw) : []); } catch { return []; }
}
async function gravarAFila(f: readonly EscutaPorEnviar[]): Promise<void> {
  if (f.length) await AsyncStorage.setItem(CHAVE_DA_FILA, JSON.stringify(f)).catch(() => {});
  else await AsyncStorage.removeItem(CHAVE_DA_FILA).catch(() => {});
}

let aEnviar = false;
/** As que ficaram por enviar, em lotes. Pára no primeiro que falhe. */
async function enviarPorEnviar(): Promise<void> {
  if (aEnviar || !token) return;
  aEnviar = true;
  try {
    let fila = await lerAFila();
    while (fila.length) {
      const lote = fila.slice(0, POR_LOTE);
      const estado = await mandar(pedidoDeEscutas(lote, APP_VERSION));
      if (estado == null || valeTentarDeNovo(estado)) break;
      // Recusadas (um erro do pedido) não se tentam outra vez: ficavam ali para sempre.
      fila = fila.slice(lote.length);
      await gravarAFila(fila);
    }
  } finally {
    aEnviar = false;
  }
}

/** O que o leitor chama (`definirScrobbler`, ligado no App.tsx). */
export const scrobblerDoListenBrainz = {
  /** Uma música começou: "a tocar agora". Sem fila: passado, já não interessa. */
  agora(t: Track): void {
    if (!token) return;
    if (usePrivacidade.getState().privada) return;
    const m = paraScrobble(t);
    if (!podeScrobblar(m)) return;
    void mandar(pedidoDeAgora(m, APP_VERSION));
  },
  /** A escuta contou (a metade, ou quatro minutos): vai com a hora a que começou. */
  contou(t: Track, comecouEm: Date): void {
    if (!token) return;
    if (usePrivacidade.getState().privada) return;
    const m = paraScrobble(t);
    if (!podeScrobblar(m)) return;
    const escuta: EscutaPorEnviar = { ...m, em: comecouEm.getTime() / 1000 };
    void (async () => {
      const estado = await mandar(pedidoDeEscutas([escuta], APP_VERSION));
      if (estado != null && estado < 300) { void enviarPorEnviar(); return; }
      if (valeTentarDeNovo(estado)) await gravarAFila(juntarAFila(await lerAFila(), escuta));
    })();
  },
};
