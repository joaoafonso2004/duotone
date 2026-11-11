import type { SocialPresence } from './socialPresence';
import type { FaixaDoAmigo, FaixaSimples } from './seguirAmigo';

/**
 * A presença dos amigos pelo Realtime Presence (11/11): o que se declara no
 * canal, como se lê, e como se converte para a forma da tabela
 * `social_presence`, para o resto da app (o Social, o "Online now", o Listen
 * along) não precisar de saber de onde veio. Sem imports de runtime: testado em
 * Node puro (`test-presenca-ao-vivo.ts`). Os canais estão em `presencaAoVivo.ts`.
 */

/** Um canal privado por pessoa: só ela declara, só ela e os amigos aceites veem. */
export const topicoDaPresenca = (id: string) => `presenca:${id}`;

/** O que cada aparelho declara. `em` é o relógio de quem declara. */
export type EstadoAoVivo = { v: 1; ativo: boolean; faixa: FaixaDoAmigo | null; em: number };

/** Ninguém sai do canal sozinho: enquanto lá está, a validade é longe. */
const ENQUANTO_ESTA_NO_CANAL_MS = 24 * 60 * 60_000;

const texto = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.length > 0 && v.length <= max ? v : null;

function faixaSimples(f: any): FaixaSimples | null {
  if (!f || (f.source !== 'youtube' && f.source !== 'spotify')) return null;
  const sourceId = texto(f.sourceId, 300);
  const title = texto(f.title, 1000);
  if (!sourceId || !title) return null;
  const duracao = typeof f.durationSeconds === 'number' && Number.isFinite(f.durationSeconds)
    ? Math.max(0, Math.min(86_400, f.durationSeconds)) : null;
  return {
    source: f.source, sourceId, title,
    artist: texto(f.artist, 1000), artworkUrl: texto(f.artworkUrl, 3000), durationSeconds: duracao,
  };
}

/**
 * Só os campos conhecidos, com limites: o que chega pelo canal vem do aparelho
 * de outra pessoa. `null` quando não serve.
 */
export function lerEstadoAoVivo(p: any): EstadoAoVivo | null {
  if (!p || p.v !== 1 || typeof p.ativo !== 'boolean' || typeof p.em !== 'number' || !Number.isFinite(p.em)) return null;
  if (p.faixa === null || p.faixa === undefined) return { v: 1, ativo: p.ativo, faixa: null, em: p.em };
  const base = faixaSimples(p.faixa);
  if (!base) return null;
  const f = p.faixa;
  const positionMs = typeof f.positionMs === 'number' && Number.isFinite(f.positionMs) && f.positionMs >= 0 && f.positionMs <= 86_400_000
    ? f.positionMs : 0;
  const rate = typeof f.rate === 'number' && Number.isFinite(f.rate) && f.rate >= 0.25 && f.rate <= 4 ? f.rate : 1;
  const aSeguir = Array.isArray(f.aSeguir)
    ? f.aSeguir.slice(0, 5).map(faixaSimples).filter((x: FaixaSimples | null): x is FaixaSimples => !!x)
    : [];
  return { v: 1, ativo: p.ativo, faixa: { ...base, positionMs, rate, aSeguir }, em: p.em };
}

/** O estado de quem publica, só com o que os amigos precisam. */
export function estadoParaDeclarar(opcoes: {
  ativo: boolean;
  faixa: { source: string; sourceId: string; title: string; artist?: string | null; artworkUrl?: string | null; durationSeconds?: number | null } | null;
  duracaoMs: number;
  positionMs: number;
  rate: number;
  aSeguir: readonly FaixaSimples[];
  em: number;
}): EstadoAoVivo {
  const f = opcoes.faixa;
  const base = f ? faixaSimples({
    ...f,
    durationSeconds: f.durationSeconds ?? (opcoes.duracaoMs > 0 ? Math.round(opcoes.duracaoMs / 1000) : null),
  }) : null;
  return {
    v: 1,
    ativo: opcoes.ativo,
    faixa: base ? { ...base, positionMs: Math.max(0, Math.round(opcoes.positionMs)), rate: opcoes.rate, aSeguir: [...opcoes.aSeguir].slice(0, 5) } : null,
    em: opcoes.em,
  };
}

/**
 * Os vários aparelhos da mesma pessoa num só estado: está online se algum
 * estiver ativo; a música é a do aparelho que a declarou por último. `null`
 * quando não há nenhum (saiu de todos).
 */
export function juntarAparelhos(metas: readonly unknown[]): EstadoAoVivo | null {
  const estados = metas.map(lerEstadoAoVivo).filter((e): e is EstadoAoVivo => !!e);
  if (!estados.length) return null;
  const ativo = estados.some((e) => e.ativo);
  const comFaixa = estados.filter((e) => e.faixa).sort((a, b) => b.em - a.em)[0] ?? null;
  const em = Math.max(...estados.map((e) => e.em));
  return { v: 1, ativo, faixa: comFaixa?.faixa ?? null, em: comFaixa?.em ?? em };
}

/**
 * Na forma da tabela. Enquanto a pessoa está no canal, as validades ficam
 * longe (o Realtime tira-a quando a ligação cai). `null` é ter saído: fica
 * offline já, com a última música guardada mas sem estar a tocar.
 */
export function presencaDoEstado(
  userId: string, estado: EstadoAoVivo | null, agoraNoServidor: number, anterior?: SocialPresence,
): SocialPresence {
  const agora = new Date(agoraNoServidor).toISOString();
  if (!estado) {
    return {
      user_id: userId, last_seen_at: agora, online_until: new Date(agoraNoServidor - 1000).toISOString(),
      playing_until: null, currently_playing: anterior?.currently_playing ?? null, updated_at: agora,
    };
  }
  const longe = new Date(agoraNoServidor + ENQUANTO_ESTA_NO_CANAL_MS).toISOString();
  return {
    user_id: userId,
    last_seen_at: agora,
    online_until: estado.ativo ? longe : new Date(agoraNoServidor - 1000).toISOString(),
    playing_until: estado.faixa ? longe : null,
    currently_playing: estado.faixa
      ? ({ ...estado.faixa, isPlaying: true, updatedAt: new Date(estado.em).toISOString() } as unknown as SocialPresence['currently_playing'])
      : null,
    updated_at: agora,
  };
}
