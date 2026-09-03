/** Reconhecer apenas a falta de campos opcionais; erros de rede/RLS propagam-se. */
export function missingProfilePlaylistColumns(error: unknown): boolean {
  const e=error as {code?:string;message?:string}|null;
  return !!e && ['42703','PGRST204'].includes(e.code??'')
    && /\b(visible_on_profile|copied_from)\b/.test(e.message??'');
}

export const PROFILE_SHARING_UNAVAILABLE='Playlist sharing is temporarily unavailable. Your playlists are still in your library.';
