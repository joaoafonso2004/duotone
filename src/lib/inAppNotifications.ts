import type { Friendship, SharedItem } from '../api/social';

export type NotificationTarget = { friendId?: string; groupId?: string };
export type InAppNotification = {
  id: string; conversationKey: string; title: string; body: string;
  target: NotificationTarget; kind: 'message' | 'request'; createdAt: string;
};
export type InboxSnapshot = {
  accountId: string; received?: SharedItem[]; friends?: Friendship[];
};
export const conversationKey = (target: NotificationTarget) =>
  target.groupId ? `group:${target.groupId}` : target.friendId ?? '';

/** One journal per signed-in account, shared by Realtime and recovery reads.
 * The first successful read establishes a baseline, including an EMPTY inbox.
 * Reading, archiving, reordering or refreshing never makes an ID new again. */
export function createNotificationJournal(userId: string) {
  let messagesReady = false, friendsReady = false;
  const messages = new Map<string, number>();
  let oldest = -Infinity;
  let requests = new Set<string>();
  return (snapshot: InboxSnapshot): InAppNotification[] => {
    if (snapshot.accountId !== userId) return [];
    const result: InAppNotification[] = [];
    if (snapshot.received) {
      const rows = [...snapshot.received].sort((a,b) => Date.parse(a.createdAt)-Date.parse(b.createdAt) || a.id.localeCompare(b.id));
      for (const item of rows) {
        const time = Date.parse(item.createdAt);
        if (messages.has(item.id) || time < oldest) continue;
        messages.set(item.id, time);
        if (!messagesReady || item.sender.id === userId) continue;
        const target = item.groupId ? {groupId:item.groupId} : {friendId:item.sender.id};
        result.push({id:item.id, conversationKey:conversationKey(target), target, kind:'message',
          createdAt:item.createdAt, title:item.sender.name || item.sender.username || 'Duotone',
          body:item.message || (item.itemType === 'sessao' ? 'Invited you to listen together'
            : item.itemType === 'playlist' ? 'Shared a playlist with you'
            : item.trackData?.title ? `Shared ${item.trackData.title}` : 'Shared a song with you')});
      }
      // A capped inbox can reveal older history when newer rows are archived.
      // Do not present that newly visible history as a new message.
      if (!messagesReady && rows.length) {
        const firstTime = Date.parse(rows[0].createdAt);
        if (Number.isFinite(firstTime)) oldest = firstTime;
      }
      messagesReady = true;
      // Bound long-running sessions without making older, archived rows new.
      if (messages.size > 10000) {
        const ordered = [...messages].sort((a,b) => a[1]-b[1]);
        oldest = ordered[ordered.length-5000][1];
        for (const [id,time] of ordered) if (time < oldest) messages.delete(id);
      }
    }
    if (snapshot.friends) {
      const pending = snapshot.friends.filter(f => f.status === 'pending' && !f.isSender);
      for (const friend of pending) {
        if (!friendsReady || requests.has(friend.friendId)) continue;
        result.push({id:`request:${friend.friendId}`, conversationKey:`request:${friend.friendId}`,
          target:{}, kind:'request', createdAt:'', title:friend.name || friend.username,
          body:'Sent you a friend request'});
      }
      requests = new Set(pending.map(f => f.friendId));
      friendsReady = true;
    }
    return result;
  };
}

export function shouldPresentNotification(item: InAppNotification, context: {
  enabled: boolean; active: boolean; openConversation: string | null; seen: Record<string,string>;
}) {
  if (!context.enabled || !context.active) return false;
  if (item.kind === 'request') return true;
  if (context.openConversation === item.conversationKey) return false;
  const seen = Date.parse(context.seen[item.conversationKey] ?? '');
  return !(Date.parse(item.createdAt) <= seen);
}

/** Bursts update the same card; other conversations wait in a bounded queue. */
export function enqueueNotification(queue: InAppNotification[], item: InAppNotification): InAppNotification[] {
  const index = queue.findIndex(n => n.conversationKey === item.conversationKey);
  if (index >= 0) return queue.map((n,i) => i === index ? item : n);
  return [...queue, item].slice(-4);
}

/** An event during a fetch must cause another read, not be discarded.
 * All callers await the drained run; errors leave the next retry possible. */
export function serialRefresh(read: () => Promise<void>) {
  let running: Promise<void> | null = null;
  let queued = false;
  return () => {
    queued = true;
    if (!running) running = (async () => {
      do { queued = false; await read(); } while (queued);
    })().finally(() => { running = null; });
    return running;
  };
}
