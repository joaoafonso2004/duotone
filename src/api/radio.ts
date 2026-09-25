import { useConnectivity } from '../state/connectivity';
import { feedbackReady,filterSuggestions } from '../state/recommendationFeedback';
import { chaveDeArtista, displayArtist } from '../lib/artistName';
import { pareceMusica } from '../lib/musica';
import {
  filterRadioCandidates,
  limitarMesmoArtista,
  onlyPlausibleMusic,
  RADIO_BATCH,
  seedArtists,
  shuffleCandidates,
} from '../lib/radio';
import { trackKey } from '../lib/shuffle';
import { getLibrary } from './library';
import { getFlowMix } from './plays';
import { pesquisarFaixas } from './search';
import type { Track } from '../types';
import { misturarPorFamiliaridade } from '../lib/contextoDaDescoberta';
import { candidatasParaDescoberta } from './descoberta';
import { lerPerfilDeRecomendacoes } from './perfilDeRecomendacoes';

/**
 * De onde sai a música do rádio, por ordem de preferência.
 *
 * 1. A biblioteca, pelos mesmos artistas. 2. Os SEMELHANTES do catálogo (a
 * descoberta do Smart Shuffle, estrita: parte só do que está a tocar). 3. Uma
 * pesquisa pelo artista. 4. Só no fim, o Flow geral do perfil.
 *
 * **O Flow era a segunda fonte, e era ele que fazia a fila "nunca ser
 * parecida"** (João, 25/9: "se clico em Morad deve ser desse género"). O Flow
 * são as favoritas de sempre mais 30% ao acaso do catálogo -- o gosto geral, e
 * não o da música em que se clicou. Quem tinha poucas do Morad recebia isso
 * logo a seguir à primeira.
 */
export async function fetchRadioTracks(
  seeds: Track[],
  exclude: Track[],
  limit: number = RADIO_BATCH,
): Promise<Track[]> {
  if(useConnectivity.getState().offline)return [];
  await feedbackReady();
  const artists = seedArtists(seeds, displayArtist);
  const pool: Track[] = [];
  let library:Track[]=[];
  try{library=await getLibrary();}catch{/* O rádio ainda pode sair do histórico. */}
  const knownKeys=new Set(library.map(trackKey));
  const harvest = () => {
    // Filtra-se antes da proporção, mas sem truncar demasiado cedo: se o
    // primeiro lote for todo conhecido, as três novas por cada tua nunca
    // chegariam às candidatas novas que estão logo a seguir.
    // E antes disso, fora o que não é música (ver `onlyPlausibleMusic`).
    const musica=onlyPlausibleMusic(filterSuggestions(pool),(t)=>knownKeys.has(trackKey(t)),pareceMusica);
    // O mesmo artista é tempero: no máximo um quarto do lote. O resto vem de
    // artistas com um tom parecido (ver `limitarMesmoArtista`).
    const variadas=limitarMesmoArtista(musica,artists,displayArtist,chaveDeArtista,limit);
    const candidatas=filterRadioCandidates(variadas,exclude,trackKey,Math.max(limit*4,limit));
    const conhecidas=candidatas.filter((t)=>knownKeys.has(trackKey(t)));
    const novas=candidatas.filter((t)=>!knownKeys.has(trackKey(t)));
    return misturarPorFamiliaridade(conhecidas,novas,limit,'radio');
  };

  // 1. A própria biblioteca, pelos artistas que se estava a ouvir. Custo zero
  //    e é garantidamente música que ele gosta.
  if (artists.length > 0) {
    try {
      // Pela chave canonica e nao por toLowerCase(): a semente pode vir
      // escrita "Juice WRLD" e a faixa na biblioteca "Juice Wrld", e o radio
      // saltava-a so por causa da grafia.
      const wanted = new Set(artists.map((a) => chaveDeArtista(a)));
      pool.push(
        ...shuffleCandidates(
          library.filter((t) => wanted.has(chaveDeArtista(displayArtist(t))))
        )
      );
    } catch {
      // biblioteca indisponível — seguir para a fonte seguinte
    }
  }
  // Não se pára aqui mesmo com a biblioteca cheia dele: sem os semelhantes o
  // lote era só o mesmo artista.

  // 2. Os semelhantes do catálogo: artistas parecidos com o que está a tocar,
  //    e músicas do próprio que ele ainda não tem. Estrito: parte SÓ das
  //    sementes (o perfil ordena, não escolhe), e cada artista é confirmado
  //    pelas músicas dele (ver `vizinhancaConfirmada`).
  try {
    const perfil = await lerPerfilDeRecomendacoes().catch(() => null);
    const jaLa = new Set([...exclude, ...pool].map(trackKey));
    pool.push(...await candidatasParaDescoberta(
      seeds.slice(0, 3), jaLa, new Set(), limit * 2, 3,
      perfil?.escutas, undefined, perfil?.externos, 'estrito',
    ));
  } catch {
    // sem catálogo: segue para a pesquisa
  }
  if (harvest().length >= limit) return harvest();

  // 3. Uma pesquisa pelo artista que está a tocar. Uma só, pela livre
  //    primeiro (a Data API só se ela falhar).
  if (artists[0]) {
    try {
      pool.push(...(await pesquisarFaixas(artists[0])));
    } catch {
      // sem rede ou sem quota — segue
    }
  }
  if (harvest().length >= limit) return harvest();

  // 4. Último recurso: o Flow do perfil. É o gosto GERAL, e não o desta
  //    música -- mas uma fila que continua é melhor do que o silêncio.
  try {
    pool.push(...shuffleCandidates(await getFlowMix(limit * 3)));
  } catch {
    // a RPC pode não existir na base de dados — degradar em silêncio
  }

  return harvest();
}
