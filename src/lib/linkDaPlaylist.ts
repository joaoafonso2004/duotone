/**
 * O link de uma playlist (24/11): o que o QR do "Send to friends" leva.
 *
 * `duotone://playlist/<id>` abre a página da playlist no iPhone de quem lê o QR
 * com a câmara (`useAtalhosDoIcone`, e a navegação deixa-o passar ao lado). Só
 * abre para quem a pode ver: um amigo, com ela visível no teu perfil, ou alguém
 * a quem já a mandaste (RLS de `playlists`). O de antes,
 * `duotone://playlist/import?id=…`, não era tratado por ninguém.
 *
 * Puro, sem imports: `scripts/test-qr-da-playlist.ts`.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function linkDaPlaylist(id: string): string {
  return `duotone://playlist/${id}`;
}

/** O id da playlist de um link destes, ou `null` (qualquer outro link, ou um id que não é um uuid). */
export function playlistDoLink(url: string | null | undefined): string | null {
  const m = /^duotone:\/\/playlist\/([^/?#]+)\/?(?:[?#].*)?$/i.exec((url ?? '').trim());
  return m && UUID.test(m[1]) ? m[1].toLowerCase() : null;
}

/** Um link de playlist: a navegação deixa-o passar ao lado (quem o trata é o `useAtalhosDoIcone`). */
export const eLinkDaPlaylist = (url: string): boolean => /^duotone:\/\/playlist\//i.test(url.trim());
