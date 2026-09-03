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
  if (!Number.isFinite(at)) return 'Last seen unknown';
  const minutos = Math.floor(Math.max(0, now - at) / 60000);
  if (minutos < 1) return 'Last seen just now';
  if (minutos < 60) return `Last seen ${minutos} min ago`;
  if (minutos < 1440) return `Last seen ${Math.floor(minutos / 60)} h ago`;
  return `Last seen ${new Date(at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
}
