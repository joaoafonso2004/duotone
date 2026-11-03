import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import { BANDAS, GANHO_MAXIMO, type Ganhos } from './equalizer';

export type EqDoJamAoVivo = { faixa: string; ganhos: Ganhos };
export type CanalDoEq = { id: string; hostId: string; eqEmissao: string };
const topico = (s: CanalDoEq) => `jameq:${s.id}:${s.hostId}:${s.eqEmissao}`;
const EVENTO = 'eq';
const ENTRE_ENVIOS_MS = 200;

export function lerEqDoJam(p: any): EqDoJamAoVivo | null | undefined {
  if (p === null) return null;
  if (typeof p?.faixa !== 'string' || !p.faixa.length || p.faixa.length > 400
    || !Array.isArray(p.ganhos) || p.ganhos.length !== BANDAS.length
    || !p.ganhos.every((g: unknown) => typeof g === 'number' && Number.isFinite(g) && Math.abs(g) <= GANHO_MAXIMO)) return undefined;
  return { faixa: p.faixa, ganhos: p.ganhos.slice() };
}

/** Só o aparelho escolhido do dono transmite, apenas com ouvintes e por WS. */
export function emitirEqDoJam(s: CanalDoEq, ler: () => EqDoJamAoVivo | null) {
  const emissor = Crypto.randomUUID();
  let vivo = true, ligado = false, ouvintes = false, seq = 0, enviadoEm = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const canal = supabase.channel(topico(s), { config: { private: true } });
  const podeEnviar = () => vivo && ligado && ouvintes && canal.state === 'joined' && supabase.realtime.isConnected();
  const enviar = (estado = ler()) => {
    timer = undefined;
    if (!podeEnviar()) return;
    enviadoEm = Date.now();
    void canal.send({ type: 'broadcast', event: EVENTO, payload: { v: 1, emissor, seq: ++seq, estado } }).catch(() => {});
  };
  const mudou = () => {
    if (!podeEnviar()) return;
    const falta = ENTRE_ENVIOS_MS - (Date.now() - enviadoEm);
    if (falta <= 0) { clearTimeout(timer); enviar(); }
    else if (!timer) timer = setTimeout(() => enviar(), falta);
  };
  canal.on('presence', { event: 'sync' }, () => {
    if (!vivo) return;
    ouvintes = Object.keys(canal.presenceState()).length > 0;
    if (ouvintes) mudou();
    else { clearTimeout(timer); timer = undefined; }
  }).subscribe(estado => {
    ligado = estado === 'SUBSCRIBED';
    if (!ligado) { ouvintes = false; clearTimeout(timer); timer = undefined; }
    else if (ouvintes) mudou();
  });
  return { mudou, parar: () => {
    if (!vivo) return;
    clearTimeout(timer); enviar(null); vivo = false;
    void supabase.removeChannel(canal).catch(() => {});
  } };
}

/** Presence pede o retrato ao entrar/religar. Não há polling nem RPC de ganhos. */
export function ouvirEqDoJam(s: CanalDoEq, receber: (estado: EqDoJamAoVivo | null) => void, desligou: () => void): () => void {
  let vivo = true;
  const sequencias = new Map<string, number>();
  const canal = supabase.channel(topico(s), { config: { private: true, presence: { key: Crypto.randomUUID(), enabled: true } } });
  canal.on('broadcast', { event: EVENTO }, ({ payload: p }) => {
    if (!vivo || p?.v !== 1 || typeof p.emissor !== 'string' || !p.emissor.length || p.emissor.length > 120
      || !Number.isSafeInteger(p.seq) || p.seq < 1 || (sequencias.get(p.emissor) ?? 0) >= p.seq) return;
    const estado = lerEqDoJam(p.estado);
    if (estado === undefined) return;
    sequencias.delete(p.emissor); sequencias.set(p.emissor, p.seq);
    if (sequencias.size > 8) sequencias.delete(sequencias.keys().next().value!);
    receber(estado);
  }).subscribe(estado => {
    if (!vivo) return;
    if (estado === 'SUBSCRIBED') void canal.track({ ouvindo: true }).catch(() => {});
    else { sequencias.clear(); desligou(); }
  });
  return () => { vivo = false; void supabase.removeChannel(canal).catch(() => {}); };
}
