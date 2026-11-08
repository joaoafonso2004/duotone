import { addTracksToPlaylist, createPlaylist } from '../api/playlists';
import { fetchYouTubePlaylistById } from '../api/youtube';
import { extractArtist } from '../lib/artistName';
import { avisarErro, avisarFeito, contarMusicas } from '../lib/avisoDeRemocao';
import { hapticNotification } from '../lib/haptics';
import { mensagemDeErro } from '../lib/mensagemDeErro';
import type { Track } from '../types';
import { usePlayer } from './player';

/**
 * Um disco (álbum, EP ou single) sem o abrir, no iPhone (8/11): o toque longo
 * num disco da página do artista não fazia nada. O PC tem o mesmo menu desde
 * 24/10 (`lib/menuDoLancamento.ts`, `useMenuDoDisco`), e estas são as mesmas
 * ações, com o jeito das playlists do iPhone (`usarPlaylist` nas Playlists):
 * a fila vibra, o baralhar é o `playShuffled`, o tocar respeita o shuffle aceso.
 */
export type Disco = { id: string; title: string };

/** As faixas de um disco, como as lê a folha do álbum e a pré-visualização do PC. */
export async function faixasDoDisco(id: string): Promise<Track[]> {
  const r = await fetchYouTubePlaylistById(id);
  return r.items.map((i) => ({
    source: 'youtube' as const,
    sourceId: i.videoId,
    title: i.title,
    artist: extractArtist(i.title, i.channel || null),
    album: r.title,
    artworkUrl: i.thumbnail,
    durationSeconds: null,
  }));
}

export async function discoSemAbrir(d: Disco, modo: 'tocar' | 'baralhar' | 'fila'): Promise<void> {
  try {
    const faixas = await faixasDoDisco(d.id);
    if (faixas.length === 0) { avisarErro("Couldn't find the songs of this album."); return; }
    const leitor = usePlayer.getState();
    if (modo === 'fila') { leitor.addManyToQueue(faixas); hapticNotification(); return; }
    // Com a origem: entra no "Jump back in" e no "From ...".
    const origem = { tipo: 'album' as const, nome: d.title };
    if (modo === 'baralhar') await leitor.playShuffled(faixas, leitor.shuffleInteligente, origem);
    else await leitor.tocarLista(faixas, leitor.shuffle, leitor.shuffleInteligente, origem);
  } catch (e) {
    avisarErro(mensagemDeErro(e, "Couldn't load this album."));
  }
}

export async function guardarDiscoComoPlaylist(d: Disco): Promise<void> {
  try {
    const faixas = await faixasDoDisco(d.id);
    if (faixas.length === 0) { avisarErro("Couldn't find the songs of this album."); return; }
    const playlist = await createPlaylist(d.title);
    await addTracksToPlaylist(playlist.id, faixas);
    hapticNotification();
    avisarFeito(`Saved "${d.title}"`, contarMusicas(faixas.length));
  } catch (e) {
    avisarErro(mensagemDeErro(e, "Couldn't save this album."));
  }
}
