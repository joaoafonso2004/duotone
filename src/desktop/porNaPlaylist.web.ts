import { addTracksToPlaylist, createPlaylist, removeTrackFromPlaylistBySource } from '../api/playlists';
import { mensagemDeErro } from '../lib/mensagemDeErro';
import { usePlaylists } from '../state/playlists';
import type { Playlist, Track } from '../types';
import { invalidarCacheDaPlaylist } from './paginas/PlaylistPages.web';

import { avisarErro } from '../lib/avisoDeRemocao';
/**
 * O que o painel "Add to playlist ›" faz quando se escolhe (24/10,
 * `EscolherPlaylist.web.tsx`): o menu de uma música e o de uma mensagem com
 * uma música partilhada usam os mesmos. Quando isto corre, o menu já fechou.
 */
export function mudouAPlaylist(id: string): void {
  invalidarCacheDaPlaylist(id);
  window.dispatchEvent(new CustomEvent('duotone:refresh-playlist', { detail: { id } }));
  window.dispatchEvent(new CustomEvent('duotone:refresh-playlists'));
}

export async function porNaPlaylist(t: Track, p: Playlist, jaLaEsta: boolean, notify: (texto: string) => void): Promise<void> {
  try {
    if (jaLaEsta) await removeTrackFromPlaylistBySource(p.id, t);
    else await addTracksToPlaylist(p.id, [t]);
    mudouAPlaylist(p.id);
    notify(jaLaEsta ? `Removed from ${p.name}.` : `Added to ${p.name}.`);
  } catch (e) {
    avisarErro(mensagemDeErro(e, jaLaEsta ? "Couldn't remove from the playlist." : "Couldn't add to the playlist."));
  }
}

export async function criarEPor(t: Track, nome: string, notify: (texto: string) => void): Promise<void> {
  try {
    const p = await createPlaylist(nome);
    await addTracksToPlaylist(p.id, [t]);
    // A store tem de saber da nova já, e não daqui a 30 s.
    void usePlaylists.getState().carregar(true).catch(() => {});
    mudouAPlaylist(p.id);
    notify(`Added to ${nome}.`);
  } catch (e) {
    avisarErro(mensagemDeErro(e, "Couldn't create the playlist."));
  }
}
