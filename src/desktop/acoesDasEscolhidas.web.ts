import { addTracksToPlaylist, removeTrackFromPlaylist } from '../api/playlists';
import { reporGuardadas, tirarDasGuardadas } from '../api/library';
import { avisarErro, avisarRemocao } from '../lib/avisoDeRemocao';
import { mensagemDeErro } from '../lib/mensagemDeErro';
import { useSaved } from '../state/saved';
import type { Track } from '../types';
import type { RemoverVarias } from './selecao.web';

/** "1 song", "3 songs". */
export const musicas = (n: number) => (n === 1 ? '1 song' : `${n} songs`);

const relerBiblioteca = () => window.dispatchEvent(new Event('duotone:refresh-library'));

/**
 * Tirar várias das Liked Songs de uma vez (9/11), com Undo: repõe as mesmas
 * linhas com a data de antes, e cada uma volta ao lugar dela na lista.
 */
export const removerDasGostadas: RemoverVarias = {
  rotulo: 'Remove from Liked Songs',
  fazer: async (faixas: Track[]) => {
    const ids = faixas.map((t) => t.id).filter((id): id is string => !!id);
    if (!ids.length) return;
    faixas.forEach((t) => useSaved.getState().markSaved(t, false));
    try {
      const tiradas = await tirarDasGuardadas(ids);
      relerBiblioteca();
      avisarRemocao({
        texto: `Removed ${musicas(tiradas.length || ids.length)} from Liked Songs.`,
        desfazer: async () => {
          await reporGuardadas(tiradas, faixas);
          faixas.forEach((t) => useSaved.getState().markSaved(t, true));
          relerBiblioteca();
        },
      });
    } catch (e) {
      faixas.forEach((t) => useSaved.getState().markSaved(t, true));
      avisarErro(mensagemDeErro(e, "Couldn't remove them from Liked Songs."));
    }
  },
};

/**
 * Tirar várias de uma playlist tua (9/11). O Undo põe-nas de volta no fim da
 * playlist (o lugar de cada uma não se guarda), e o aviso diz isso.
 */
export function removerDaPlaylist(id: string, nome: string, aoMudar: () => void): RemoverVarias {
  return {
    rotulo: 'Remove from this playlist',
    fazer: async (faixas: Track[]) => {
      const comId = faixas.filter((t) => !!t.id);
      const tiradas: Track[] = [];
      try {
        for (const t of comId) {
          await removeTrackFromPlaylist(id, t.id!);
          tiradas.push(t);
        }
      } catch (e) {
        avisarErro(mensagemDeErro(e, "Couldn't remove them from the playlist."));
      }
      aoMudar();
      if (!tiradas.length) return;
      avisarRemocao({
        texto: `Removed ${musicas(tiradas.length)} from ${nome}.`,
        detalhe: 'Undo puts them back at the end of the playlist.',
        desfazer: async () => { await addTracksToPlaylist(id, tiradas); aoMudar(); },
      });
    },
  };
}
