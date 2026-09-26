# iOS 3.8.5 / Windows 3.8.7

## Changes

- Artist favourites now sync per account through the existing `user_prefs` table. Each edit is saved locally before transmission; offline edits retry and survive restart. Per-artist removals are retained, old local favourites migrate once, and compare-and-swap retries protect concurrent writes. General preference saves preserve the favourites field. Install these releases on both devices.
- Windows uses one inbox for the in-app message card, system notification and unread taskbar badge. The card includes the sender's avatar, message excerpt, Reply and dismiss actions, and expires after six seconds (fifteen with a screen reader). Hidden/unfocused chats do not read new messages. Focusing the window stops flashing; reading messages clears the count.
- Windows queue rows retain their React identity and land in the open slot before committing the new order. The final DOM reorder removes transforms without another transition. Escape, pointer cancellation and external queue changes cancel an unfinished move.
- Windows CI restores annotated tags before reading release notes, matching iOS.

## Verification

- TypeScript passed.
- Existing 147 regression scripts plus new favourites, desktop message and queue-drop regressions passed (150 total).
- Favourites tests exercise bidirectional add/remove, concurrent artists, migration after removal, offline restart, hydration/in-flight clicks, logout and conflicting account preference writes.
- Desktop tests exercise avatar cards, direct/group targets, visible versus hidden chats, muted alerts, unread counts, native flashing/badges and cleanup.
- Actual queue component mounted in a local React/browser fixture: drag from first to fourth position measured **0.00 px** discontinuity at the DOM reorder, with all row nodes reused and no playback click. Actual notification card visually checked; Reply opened its target callback.
- The browser fixture uses synthetic tracks/messages and mocked artwork/backend. Real account sync on an iPhone and Windows, and the native taskbar appearance, still require device verification.

No new SQL migration is needed for these changes. The existing `user_prefs` table must already be installed. The previous release's `supabase/presenca-com-posicao.sql` is still needed for friends' playback progress.
