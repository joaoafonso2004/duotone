import { addTracksToPlaylist, createPlaylist } from '../api/playlists';
import { mensagemDeErro } from '../lib/mensagemDeErro';
import { usePlaylists } from '../state/playlists';
import type { Playlist, Track } from '../types';
import { invalidarCacheDaPlaylist } from './paginas/PlaylistPages.web';

/**
 * O que o painel "Add to playlist ›" faz quando se escolhe (24/10,
 * `EscolherPlaylist.web.tsx`): o menu de uma música e o de uma mensagem com
 * uma música partilhada usam os mesmos. Quando isto corre, o menu já fechou.
 */
function mudouAPlaylist(id: string): void {
  invalidarCacheDaPlaylist(id);
  window.dispatchEvent(new CustomEvent('duotone:refresh-playlist', { detail: { id } }));
  window.dispatchEvent(new CustomEvent('duotone:refresh-playlists'));
}

export async function porNaPlaylist(t: Track, p: Playlist, jaLaEsta: boolean, notify: (texto: string) => void): Promise<void> {
  // O servidor não a punha duas vezes; dizer que já lá está é a resposta certa.
  if (jaLaEsta) { notify(`Already in ${p.name}.`); return; }
  try {
    await addTracksToPlaylist(p.id, [t]);
    mudouAPlaylist(p.id);
    notify(`Added to ${p.name}.`);
  } catch (e) {
    notify(mensagemDeErro(e, 'Could not add to the playlist.'));
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
    notify(mensagemDeErro(e, 'Could not create the playlist.'));
  }
}
