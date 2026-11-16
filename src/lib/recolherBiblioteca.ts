import { getLikedSongs } from '../api/library';
import { getPlaylistTracks, listPlaylists } from '../api/playlists';
import { carregarAlbunsGuardados, useAlbunsGuardados } from '../state/albunsGuardados';
import type { Track } from '../types';
import { displayArtist, tituloDaFaixa } from './artistName';
import { APP_VERSION } from './buildInfo';
import { montarExportacao, type ExportacaoDaBiblioteca, type FaixaExportada } from './exportarBiblioteca';

/**
 * Recolhe a biblioteca para exportar (16/11, lib/exportarBiblioteca.ts): as
 * Liked Songs, cada playlist com as suas músicas, e os álbuns guardados.
 *
 * Só corre quando se carrega em "Export library". As playlists próprias vêm
 * da cópia que a app já tem (`getPlaylistTracks` reaproveita-a); só as de
 * colaboração pedem as músicas, uma de cada vez. O título e o artista são os
 * que a app mostra (`tituloDaFaixa`, `displayArtist`), não os do vídeo.
 */
function paraExportar(t: Track): FaixaExportada {
  return {
    title: tituloDaFaixa(t),
    artist: displayArtist(t) || null,
    album: t.album ?? null,
    durationSeconds: t.durationSeconds ?? null,
    source: t.source,
    sourceId: t.sourceId,
  };
}

export async function recolherBiblioteca(): Promise<ExportacaoDaBiblioteca> {
  const [gostadas, listas] = await Promise.all([getLikedSongs(), listPlaylists()]);
  const playlists: { name: string; createdAt: string | null; tracks: FaixaExportada[] }[] = [];
  for (const p of listas) {
    const faixas = await getPlaylistTracks(p.id);
    playlists.push({ name: p.name, createdAt: p.createdAt ?? null, tracks: faixas.map(paraExportar) });
  }
  await carregarAlbunsGuardados();
  return montarExportacao({
    app: `Duotone ${APP_VERSION}`,
    agora: new Date(),
    gostadas: gostadas.map(paraExportar),
    playlists,
    albuns: useAlbunsGuardados.getState().albuns,
  });
}
