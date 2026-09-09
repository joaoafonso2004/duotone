type Overlay = { close: () => void; done: Promise<void> };
const overlays = new Set<Overlay>();
/** Wait for native dismissal before opening a conversation modal. */
export function registerNotificationOverlay(close: () => void) {
  let resolve!: () => void;
  const entry = {close,done:new Promise<void>(r => {resolve=r;})};
  overlays.add(entry);
  return () => { overlays.delete(entry); resolve(); };
}
export async function closeNotificationOverlays() {
  const current = [...overlays];
  for (const item of current) item.close();
  await Promise.all(current.map(item => item.done));
}
