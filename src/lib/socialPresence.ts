import type { Track } from '../types';

export interface SocialPresence {
  user_id: string;
  last_seen_at: string;
  online_until: string | null;
  playing_until: string | null;
  currently_playing: (Track & { isPlaying: boolean; updatedAt: string }) | null;
  updated_at: string;
}

/** A validade é calculada com o relógio do servidor obtido na leitura inicial. */
export function estadoDaPresenca(p: SocialPresence | undefined, now: number) {
  const online = !!p?.online_until && Date.parse(p.online_until) > now;
  const track = online && p?.playing_until && Date.parse(p.playing_until) > now ? p.currently_playing : null;
  return { online, track, lastSeenAt: p?.last_seen_at ?? null };
}

export function ultimaAtividade(iso: string | null | undefined, now = Date.now()): string {
  const at = Date.parse(iso ?? '');
  // Não sabermos quando foi não é uma informação sobre a pessoa. "Last seen
  // unknown" dizia mais sobre a nossa base de dados do que sobre o amigo.
  if (!Number.isFinite(at)) return 'Offline';
  const minutos = Math.floor(Math.max(0, now - at) / 60000);
  if (minutos < 1) return 'Last seen just now';
  if (minutos < 60) return `Last seen ${minutos} min ago`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Last seen ${horas} h ago`;
  const dias = Math.floor(horas / 24);
  // Uma semana de distância ainda se lê melhor em dias; mais do que isso, a
  // data diz mais. O que não pode é a lista misturar "6 h ago" com
  // "05/09, 16:30" -- eram duas grelhas mentais na mesma coluna.
  if (dias < 7) return `Last seen ${dias} d ago`;
  return `Last seen ${new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}
