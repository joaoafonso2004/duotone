// A atividade musical e os resumos usam dados já recebidos; não têm timers nem rede.
import type { Track } from '../types';
import type { SharedItem } from '../api/social';
import type { SocialPresence } from './socialPresence';

export interface MusicActivity {
  track: Track;
  at: string;
  listening: boolean;
}

const RECENT_LISTENING_MS = 24 * 60 * 60 * 1000;
export function musicActivity(p: SocialPresence | undefined, now: number): MusicActivity | null {
  const track = p?.currently_playing;
  if (!track?.sourceId || !track.title) return null;
  const at = track.updatedAt || p!.updated_at;
  const time = Date.parse(at);
  if (!Number.isFinite(time) || time > now + 120000 || now - time > RECENT_LISTENING_MS) return null;
  // O telefone pode continuar a tocar em segundo plano, sem estar «online».
  const listening = track.isPlaying === true && Date.parse(p!.playing_until ?? '') > now;
  return { track, at, listening };
}

export function musicActivityLabel(activity: MusicActivity, now: number): string {
  if (activity.listening) return 'Listening now';
  const minutes = Math.floor(Math.max(0, now - Date.parse(activity.at)) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}

export interface ConversationPreview {
  createdAt: string;
  senderId: string;
  itemType: SharedItem['itemType'];
  message: string | null;
  trackTitle: string | null;
  trackArtist: string | null;
  /** Só nas que se leram da conversa (o resumo do servidor não a traz). */
  trackArtwork?: string | null;
}

export function previewOf(item: SharedItem): ConversationPreview {
  return { createdAt: item.createdAt, senderId: item.sender.id, itemType: item.itemType,
    message: item.message?.trim().slice(0, 360) || null,
    trackTitle: item.trackData?.title ?? null, trackArtist: item.trackData?.artist ?? null,
    trackArtwork: item.trackData?.artworkUrl ?? null };
}

export function mergePreviews(base: Readonly<Record<string, ConversationPreview>>,
  incoming: Readonly<Record<string, ConversationPreview>>): Record<string, ConversationPreview> {
  const result = { ...base };
  for (const [key, preview] of Object.entries(incoming)) {
    const at = Date.parse(preview.createdAt);
    if (Number.isFinite(at) && (!result[key] || at >= Date.parse(result[key].createdAt))) result[key] = preview;
  }
  return result;
}

export function receivedPreviews(items: readonly SharedItem[]): Record<string, ConversationPreview> {
  const result: Record<string, ConversationPreview> = {};
  for (const item of items) {
    const key = item.groupId ? `group:${item.groupId}` : item.sender.id;
    const at = Date.parse(item.createdAt);
    if (key && Number.isFinite(at) && (!result[key] || at > Date.parse(result[key].createdAt))) result[key] = previewOf(item);
  }
  return result;
}

export function previewText(preview: ConversationPreview, myId: string | undefined): string {
  const own = preview.senderId === myId;
  const text = preview.message || (preview.itemType === 'sessao' ? 'Invited you to a Jam'
    : preview.itemType === 'playlist' ? 'Shared a playlist'
    : preview.trackTitle ? `${preview.trackTitle}${preview.trackArtist ? ` · ${preview.trackArtist}` : ''}` : 'Shared a song');
  return `${own ? 'You: ' : ''}${text}`;
}
