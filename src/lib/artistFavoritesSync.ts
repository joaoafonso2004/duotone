export type Favorites = Record<string, boolean>;
export type FavoriteEdit = { value: boolean; revision: number; seed?: boolean };
export type FavoritesSnapshot = { values: Favorites; pending: Record<string, FavoriteEdit> };

export function readFavorites(value: unknown): Favorites {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, enabled]) => key.trim() && typeof enabled === 'boolean'));
}

/** False tombstones prevent an old device's migration from reviving removals. */
export function applyFavoriteEdits(remote: Favorites, edits: FavoritesSnapshot['pending']): Favorites {
  const next = { ...remote };
  for (const [key, edit] of Object.entries(edits)) {
    if (!edit.seed || !Object.hasOwn(next, key)) next[key] = edit.value;
  }
  return next;
}

type Dependencies = {
  readLocal: () => Promise<FavoritesSnapshot>;
  writeLocal: (snapshot: FavoritesSnapshot) => Promise<void>;
  exchange: (edits: FavoritesSnapshot['pending']) => Promise<Favorites>;
  apply: (values: Favorites) => void;
  status: (value: 'loading' | 'saved' | 'pending' | 'error') => void;
};

/** Durable per-account outbox. Late responses cannot undo or acknowledge
 * a newer click that happened while a request was in flight. */
export class ArtistFavoritesSync {
  private values: Favorites = {};
  private pending: FavoritesSnapshot['pending'] = {};
  private revision = Date.now();
  private stopped = false;
  private writing = Promise.resolve();
  private running: Promise<void> | null = null;
  private ready: Promise<void>;
  constructor(private deps: Dependencies) { this.ready = this.hydrate(); }
  private async hydrate() {
    try {
      const local = await this.deps.readLocal();
      if (this.stopped) return;
      this.pending = { ...local.pending, ...this.pending };
      this.values = applyFavoriteEdits(local.values, this.pending);
      this.deps.apply(this.values);
      await this.persist();
    } catch { if (!this.stopped) this.deps.status('error'); }
  }
  private persist() {
    const snapshot = { values: { ...this.values }, pending: { ...this.pending } };
    this.writing = this.writing.catch(() => {}).then(() => this.deps.writeLocal(snapshot));
    return this.writing;
  }
  edit(key: string, value: boolean) {
    if (this.stopped || !key) return;
    this.pending[key] = { value, revision: ++this.revision };
    this.values = { ...this.values, [key]: value };
    this.deps.apply(this.values);
    this.deps.status('pending');
    void this.ready.then(() => this.persist()).then(() => this.sync()).catch(() => {
      if (!this.stopped) this.deps.status('error');
    });
  }
  async sync() {
    await this.ready;
    if (this.stopped) return;
    if (this.running) return this.running;
    this.running = this.flush().finally(() => { this.running = null; });
    return this.running;
  }
  private async flush() {
    try {
      do {
        await this.persist();
        if (this.stopped) return;
        const batch = { ...this.pending };
        const remote = await this.deps.exchange(batch);
        if (this.stopped) return;
        for (const [key, edit] of Object.entries(batch)) {
          if (this.pending[key] === edit) delete this.pending[key];
        }
        this.values = applyFavoriteEdits(remote, this.pending);
        this.deps.apply(this.values);
        await this.persist();
      } while (!this.stopped && Object.keys(this.pending).length);
      if (!this.stopped) this.deps.status('saved');
    } catch { if (!this.stopped) this.deps.status('error'); }
  }
  stop() { this.stopped = true; }
}
