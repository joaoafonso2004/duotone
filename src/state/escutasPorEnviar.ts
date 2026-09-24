import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { enviarEscutasAtrasadas } from '../api/plays';
import {
  acrescentarPendente, depoisDoEnvio, lerPendentes, novaEscutaPendente, proximoLote, type EscutaPendente,
} from '../lib/escutasPendentes';
import type { Track } from '../types';
import { useAuth } from './auth';
import { useConnectivity } from './connectivity';

/**
 * A fila das escutas que não chegaram ao Supabase, no disco e por conta. As
 * decisões vivem em lib/escutasPendentes.ts; aqui é só guardar e enviar.
 *
 * A store do leitor não importa isto: recebe a função pelo
 * `definirGuardarEscutaPorEnviar` (App.tsx), como o `definirPodeTocarSemRede`.
 * Assim os testes da store não arrastam o AsyncStorage nem o Supabase.
 */

const chave = (uid: string) => `plays:pendentes:v1:${uid}`;

/** Leituras e escritas por ordem: entre ler e gravar pode entrar outra escuta. */
let porOrdem: Promise<unknown> = Promise.resolve();
function emFila<T>(f: () => Promise<T>): Promise<T> {
  const p = porOrdem.then(f, f);
  porOrdem = p.catch(() => {});
  return p;
}

async function ler(uid: string): Promise<EscutaPendente[]> {
  try { return lerPendentes(await AsyncStorage.getItem(chave(uid))); } catch { return []; }
}
async function gravar(uid: string, lista: EscutaPendente[]): Promise<void> {
  if (lista.length) await AsyncStorage.setItem(chave(uid), JSON.stringify(lista));
  else await AsyncStorage.removeItem(chave(uid));
}

const contaAtual = () => useAuth.getState().session?.user.id ?? useAuth.getState().offlineUserId ?? null;

export function guardarEscutaPorEnviar(faixa: Track, em: Date, comecouEm: Date): void {
  const uid = contaAtual();
  if (!uid) return;
  void emFila(async () => gravar(uid, acrescentarPendente(await ler(uid), novaEscutaPendente(faixa, em, comecouEm))))
    .catch(() => {});
}

let aEnviar = false;

/** Manda o que ficou, em lotes, se houver rede e sessão. Um lote que falha para o envio. */
export async function enviarEscutasPorEnviar(): Promise<void> {
  const uid = useAuth.getState().session?.user.id;
  if (!uid || aEnviar || useConnectivity.getState().offline) return;
  aEnviar = true;
  try {
    for (;;) {
      const lote = proximoLote(await emFila(() => ler(uid)));
      if (!lote.length) return;
      const correu = await enviarEscutasAtrasadas(lote);
      // A conta pode ter mudado durante o envio: grava-se na da escuta.
      await emFila(async () => gravar(uid, depoisDoEnvio(await ler(uid), lote, correu)));
      if (!correu) return;
    }
  } finally {
    aEnviar = false;
  }
}

/** Envia no arranque, quando a rede volta, quando a sessão chega e quando a app volta à frente. */
export function instalarEnvioDeEscutas(): () => void {
  const enviar = () => { void enviarEscutasPorEnviar(); };
  const rede = useConnectivity.subscribe((s, antes) => { if (antes.offline && !s.offline) enviar(); });
  const sessao = useAuth.subscribe((s, antes) => { if (s.session && s.session !== antes.session) enviar(); });
  const frente = AppState.addEventListener('change', (estado) => { if (estado === 'active') enviar(); });
  enviar();
  return () => { rede(); sessao(); frente.remove(); };
}
