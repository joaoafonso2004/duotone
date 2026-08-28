import { displayArtist } from '../lib/artistName';
import {
  filterRadioCandidates,
  RADIO_BATCH,
  seedArtists,
  shuffleCandidates,
} from '../lib/radio';
import { trackKey } from '../lib/shuffle';
import { getLibrary } from './library';
import { getFlowMix } from './plays';
import { searchYouTube } from './youtube';
import type { Track } from '../types';

/**
 * De onde sai a música do rádio, por ordem de preferência.
 *
 * A ordem é por CUSTO, não por qualidade: a pesquisa da YouTube Data API
 * gasta 100 unidades das 10.000 diárias, por isso só se lá vai quando as
 * fontes gratuitas não chegam. As duas primeiras também são melhores
 * recomendações — são música que o utilizador já escolheu.
 */
export async function fetchRadioTracks(
  seeds: Track[],
  exclude: Track[],
  limit: number = RADIO_BATCH
): Promise<Track[]> {
  const artists = seedArtists(seeds, displayArtist);
  const pool: Track[] = [];
  const harvest = () => filterRadioCandidates(pool, exclude, trackKey, limit);

  // 1. A própria biblioteca, pelos artistas que se estava a ouvir. Custo zero
  //    e é garantidamente música que ele gosta.
  if (artists.length > 0) {
    try {
      const wanted = artists.map((a) => a.toLowerCase());
      const library = await getLibrary();
      pool.push(
        ...shuffleCandidates(
          library.filter((t) => wanted.includes(displayArtist(t).toLowerCase()))
        )
      );
    } catch {
      // biblioteca indisponível — seguir para a fonte seguinte
    }
  }
  if (harvest().length >= limit) return harvest();

  // 2. Flow do Dia (histórico de reproduções no Supabase). Não gasta quota do
  //    YouTube — é a mesma heurística que alimenta a Pesquisa.
  try {
    pool.push(...shuffleCandidates(await getFlowMix(limit * 3)));
  } catch {
    // a RPC pode não existir na base de dados — degradar em silêncio
  }
  if (harvest().length >= limit) return harvest();

  // 3. Último recurso: pesquisa no YouTube pelo artista mais recente. Uma só
  //    pesquisa, e o `searchYouTube` já guarda em cache 7 dias.
  if (artists[0]) {
    try {
      pool.push(...(await searchYouTube(artists[0])));
    } catch {
      // sem rede ou sem quota — o rádio simplesmente não arranca
    }
  }

  return harvest();
}
