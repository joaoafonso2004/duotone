import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import { BANDAS, GANHO_MAXIMO, type Ganhos } from './equalizer';
import { proximasParaAPresenca, type FaixaDoAmigo } from './seguirAmigo';

/** Som temporário de quem se segue; nunca é um ajuste guardado na conta. */
export type EscutaAoVivo = { faixa: FaixaDoAmigo; ganhos: Ganhos };
const EVENTO = 'escuta';
const ENTRE_ENVIOS_MS = 200;
const topico = (id: string) => `escuta:${id}`;

function faixaValida(f: any): boolean {
  return !!f && (f.source === 'youtube' || f.source === 'spotify')
    && typeof f.sourceId === 'string' && f.sourceId.length > 0 && f.sourceId.length <= 300
    && typeof f.title === 'string' && f.title.length > 0 && f.title.length <= 1000;
}

/** Só os campos conhecidos, limites iguais aos do áudio e da presença. */
export function lerEscutaAoVivo(p: any): EscutaAoVivo | null | undefined {
  if (p === null) return null;
  const f = p?.faixa;
  if (!faixaValida(f) || !Array.isArray(p.ganhos) || p.ganhos.length !== BANDAS.length
    || !p.ganhos.every((g: unknown) => typeof g === 'number' && Number.isFinite(g) && Math.abs(g) <= GANHO_MAXIMO)
    || typeof f.rate !== 'number' || !Number.isFinite(f.rate) || f.rate < 0.25 || f.rate > 4
    || typeof f.positionMs !== 'number' || !Number.isFinite(f.positionMs) || f.positionMs < 0 || f.positionMs > 86_400_000) return undefined;
  const texto = (v: unknown) => typeof v === 'string' ? v.slice(0, 3000) : null;
  return {
    faixa: {
      source: f.source, sourceId: f.sourceId, title: f.title,
      artist: texto(f.artist), artworkUrl: texto(f.artworkUrl),
      durationSeconds: typeof f.durationSeconds === 'number' && Number.isFinite(f.durationSeconds)
        ? Math.max(0, Math.min(86400, f.durationSeconds)) : null,
      positionMs: f.positionMs, rate: f.rate,
      aSeguir: proximasParaAPresenca(Array.isArray(f.aSeguir) ? f.aSeguir.filter(faixaValida).slice(0, 5).map((t: any) => ({
        ...t, artist: texto(t.artist), artworkUrl: texto(t.artworkUrl),
        durationSeconds: typeof t.durationSeconds === 'number' && Number.isFinite(t.durationSeconds)
          ? Math.max(0, Math.min(86400, t.durationSeconds)) : null,
      })) : []),
    },
    ganhos: p.ganhos.slice(),
  };
}

/**
 * Um canal privado por emissor. Só o próprio pode transmitir; amigos podem
 * anunciar que estão a ouvir. Sem ouvintes não se enviam ajustes. O send só
 * corre com o WebSocket ligado: nunca cai no POST de fallback do SDK.
 */
export function emitirEscutaAoVivo(userId: string, emissao: string, ler: () => EscutaAoVivo | null) {
  let vivo = true, ligado = false, ouvintes = false, sequencia = 0, enviadoEm = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const canal = supabase.channel(topico(userId), { config: { private: true } });
  const podeEnviar = () => vivo && ligado && ouvintes && canal.state === 'joined' && supabase.realtime.isConnected();
  const enviar = (estado = ler()) => {
    timer = undefined;
    if (!podeEnviar()) return;
    enviadoEm = Date.now();
    void canal.send({ type: 'broadcast', event: EVENTO, payload: { v: 1, emissao, seq: ++sequencia, estado } }).catch(() => {});
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
  }).subscribe((estado) => {
    ligado = estado === 'SUBSCRIBED';
    if (!ligado) { ouvintes = false; clearTimeout(timer); timer = undefined; }
    else if (ouvintes) mudou();
  });
  return {
    mudou,
    parar: async () => {
      if (!vivo) return;
      clearTimeout(timer);
      enviar(null);
      vivo = false;
      await supabase.removeChannel(canal).catch(() => {});
    },
  };
}

/** Só existe enquanto se segue alguém; cada dispositivo tem a sua presença. */
export function ouvirEscutaAoVivo(userId: string, receber: (s: EscutaAoVivo | null) => void, desligou: () => void): () => void {
  let vivo = true;
  const emissores = new Map<string, { seq: number; estado: EscutaAoVivo | null }>();
  const canal = supabase.channel(topico(userId), {
    config: { private: true, presence: { key: Crypto.randomUUID(), enabled: true } },
  });
  canal.on('broadcast', { event: EVENTO }, ({ payload: p }) => {
    if (!vivo || p?.v !== 1 || typeof p.emissao !== 'string' || !p.emissao.length || p.emissao.length > 120
      || !Number.isSafeInteger(p.seq) || p.seq < 1 || (emissores.get(p.emissao)?.seq ?? 0) >= p.seq) return;
    const estado = lerEscutaAoVivo(p.estado);
    if (estado === undefined) return;
    // Um telemóvel parado não cala o PC da mesma conta que está a transmitir.
    emissores.delete(p.emissao);
    emissores.set(p.emissao, { seq: p.seq, estado });
    if (emissores.size > 8) emissores.delete(emissores.keys().next().value!);
    const activos = [...emissores.values()].filter((e) => e.estado !== null);
    receber(activos.at(-1)?.estado ?? null);
  }).subscribe((estado) => {
    if (!vivo) return;
    if (estado === 'SUBSCRIBED') void canal.track({ ouvindo: true }).catch(() => {});
    else { emissores.clear(); desligou(); }
  });
  return () => {
    vivo = false;
    void supabase.removeChannel(canal).catch(() => {});
  };
}
