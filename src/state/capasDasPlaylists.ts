import { escolherCapa, tirarCapa } from '../api/capasDasPlaylists';
import { capasDisponiveis } from '../api/playlists';
import { avisarErro, avisarFeito } from '../lib/avisoDeRemocao';
import { comCapa, semCapa } from '../lib/capasDasPlaylists';
import { mensagemDeErro } from '../lib/mensagemDeErro';
import { usePlaylists } from './playlists';

/**
 * Mudar e tirar a capa de uma playlist, dos menus do iPhone e do PC (26/11;
 * lib/capasDasPlaylists.ts). A lista no ecrã muda logo; o outro aparelho vê-a
 * na próxima leitura das playlists (o UPDATE sobe a revisão delas).
 */

/** O que o menu oferece: nada sem a migração, escolher, ou mudar e tirar. */
export function situacaoDaCapa(p: { capa?: string | null } | null | undefined): false | 'sem' | 'tem' {
  if (!capasDisponiveis()) return false;
  return p?.capa ? 'tem' : 'sem';
}

export async function mudarCapaDaPlaylist(id: string): Promise<void> {
  const antes = usePlaylists.getState().items.find((p) => p.id === id);
  try {
    const nova = await escolherCapa(id, antes?.capa);
    if (!nova) return;
    usePlaylists.getState().aplicar((l) => l.map((p) => (p.id === id ? comCapa({ ...p, capa: nova.capa }, nova.url || null) : p)));
    avisarFeito('Cover updated');
  } catch (e) {
    avisarErro(mensagemDeErro(e, "Couldn't change the cover"));
  }
}

export async function tirarCapaDaPlaylist(id: string): Promise<void> {
  const antes = usePlaylists.getState().items.find((p) => p.id === id);
  try {
    await tirarCapa(id, antes?.capa);
    usePlaylists.getState().aplicar((l) => l.map((p) => (p.id === id ? semCapa(p) : p)));
    avisarFeito('Cover removed');
  } catch (e) {
    avisarErro(mensagemDeErro(e, "Couldn't remove the cover"));
  }
}
