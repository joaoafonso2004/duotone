import { useConnectivity } from '../state/connectivity';
import { feedbackReady,filterSuggestions } from '../state/recommendationFeedback';
import { chaveDeArtista, displayArtist } from '../lib/artistName';
import { pareceMusica } from '../lib/musica';
import {
  filterRadioCandidates,
  limitarMesmoArtista,
  loteSemRepetir,
  onlyPlausibleMusic,
  RADIO_BATCH,
  seedArtists,
  shuffleCandidates,
} from '../lib/radio';
import { chavesDaMusica } from '../lib/identidadeDaMusica';
import { foiSugeridaRecentemente } from '../lib/smartShuffle';
import { trackKey } from '../lib/shuffle';
import { getLibrary } from './library';
import { lerFaixas } from '../lib/cacheDaBiblioteca';
import { getFlowMix } from './plays';
import { paginaDoArtista } from './albunsDoArtista';
import { lerRadioPeloYtMusic } from './ytMusic';
import type { Track } from '../types';
import { misturarPorFamiliaridade } from '../lib/contextoDaDescoberta';
import { candidatasParaDescoberta } from './descoberta';
import { lerPerfilDeRecomendacoes } from './perfilDeRecomendacoes';

/**
 * De onde sai a música do rádio, por ordem de preferência.
 *
 * 1. A biblioteca, pelos mesmos artistas. 2. Os SEMELHANTES do catálogo (a
 * descoberta do Smart Shuffle, estrita: parte só do que está a tocar). 3. Uma
 * página musical do artista, confirmado pelas músicas dele. 4. O rádio da
 * própria música no YouTube Music. 5. Só no fim, o Flow geral do perfil.
 *
 * **O Flow era a segunda fonte, e era ele que fazia a fila "nunca ser
 * parecida"** (João, 25/9: "se clico em Morad deve ser desse género"). O Flow
 * são as favoritas de sempre mais 30% ao acaso do catálogo -- o gosto geral, e
 * não o da música em que se clicou. Quem tinha poucas do Morad recebia isso
 * logo a seguir à primeira.
 *
 * `jaDescobertas`: as identidades das músicas descobertas nos últimos 30 dias
 * (a memória do Smart Shuffle, que o rádio também passou a alimentar -- 28/9).
 * Sem elas o rádio repunha sempre as mesmas novas; ver `loteSemRepetir`.
 */
export async function fetchRadioTracks(
  seeds: Track[],
  exclude: Track[],
  limit: number = RADIO_BATCH,
  jaDescobertas: ReadonlySet<string> = new Set(),
  context: 'automatic' | 'session' = 'automatic',
): Promise<Track[]> {
  if(useConnectivity.getState().offline)return [];
  await feedbackReady();
  const artists = seedArtists(seeds, displayArtist);
  const pool: Track[] = [];
  let library:Track[]=[];
  // Da cache partilhada: cada lote do rádio relia a biblioteca inteira (30/9).
  try{library=await lerFaixas(getLibrary);}catch{/* O rádio ainda pode sair do histórico. */}
  const knownKeys=new Set(library.map(trackKey));
  const excludedIdentities=new Set(exclude.flatMap(chavesDaMusica));
  const jaDescoberta=(t:Track)=>foiSugeridaRecentemente(chavesDaMusica(t),jaDescobertas);
  // `comRepetidas` só no fim: antes disso, faltarem novas é razão para ir à
  // fonte seguinte, e não para repetir.
  const harvest = (comRepetidas = false) => {
    // Filtra-se antes da proporção, mas sem truncar demasiado cedo: se o
    // primeiro lote for todo conhecido, as três novas por cada tua nunca
    // chegariam às candidatas novas que estão logo a seguir.
    // E antes disso, fora o que não é música (ver `onlyPlausibleMusic`).
    const musica=onlyPlausibleMusic(filterSuggestions(pool),(t)=>knownKeys.has(trackKey(t)),pareceMusica);
    // O mesmo artista é tempero: no máximo um quarto do lote. O resto vem de
    // artistas com um tom parecido (ver `limitarMesmoArtista`).
    const variadas=limitarMesmoArtista(musica,artists,displayArtist,chaveDeArtista,limit);
    const seen=new Set(excludedIdentities);
    const candidatas=filterRadioCandidates(variadas,exclude,trackKey,Math.max(limit*4,limit)).filter(t=>{
      const keys=chavesDaMusica(t);
      if(keys.some(k=>seen.has(k)))return false;
      keys.forEach(k=>seen.add(k));
      return true;
    });
    const conhecidas=candidatas.filter((t)=>knownKeys.has(trackKey(t)));
    const novas=candidatas.filter((t)=>!knownKeys.has(trackKey(t)));
    return loteSemRepetir(conhecidas,novas,jaDescoberta,limit,comRepetidas,
      (c,n,l)=>misturarPorFamiliaridade(c,n,l,'radio'));
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
    // Com a memória, como no Smart Shuffle: a descoberta salta-as ANTES de
    // pesquisar e vai mais fundo no catálogo em vez de devolver as de sempre.
    pool.push(...await candidatasParaDescoberta(
      seeds.slice(0, 3), jaLa, jaDescobertas, limit * 2, 3,
      perfil?.escutas, undefined, perfil?.externos, 'estrito',
    ));
  } catch {
    // sem catálogo: segue para a pesquisa
  }
  if (harvest().length >= limit) return harvest();

  // 3. As músicas do canal confirmado no YouTube Music, com a cache da página
  //    do artista. Pesquisar só "Isak" no YouTube trazia o futebolista Alexander
  //    Isak: quatro minutos e o nome no título não provam que seja música.
  if (artists[0]) {
    try {
      const alvo = chaveDeArtista(artists[0]);
      const dele = (t: Track) => chaveDeArtista(displayArtist(t)) === alvo;
      const guardadas = library.filter(dele);
      const pagina = await paginaDoArtista(artists[0], guardadas.length ? guardadas : seeds.filter(dele));
      pool.push(...pagina.musicas);
    } catch {
      // Sem canal confirmado ou sem rede: segue para o Flow, sem adivinhar.
    }
  }
  if (harvest().length >= limit) return harvest();

  // 4. O rádio da PRÓPRIA música no YouTube Music (`RDAMVM<id>`, 10/10): o
  //    "Start radio" de lá, pelo mesmo `next` do Mix do artista. Quando o
  //    catálogo não conhece o artista (um nome mal lido, reggaeton de 2008, um
  //    canal de uploads) era aqui que o Radio acabava vazio: "No related music
  //    found". É música parecida com ESTA, por isso serve também à sessão.
  //    Um pedido ao YouTube Music, e só quando o resto não chegou.
  const daMusica = seeds.find((t) => t.source === 'youtube' && /^[\w-]{11}$/.test(t.sourceId));
  if (daMusica) {
    try {
      pool.push(...await lerRadioPeloYtMusic({ playlistId: `RDAMVM${daMusica.sourceId}`, videoId: daMusica.sourceId, params: null }));
    } catch {
      // Sem rede ou o YouTube Music mudou a resposta: segue sem ele.
    }
  }
  if (harvest().length >= limit) return harvest();

  // O modo escolhido na fila mantém as âncoras da sessão. Não preencher
  // com o perfil geral quando o catálogo não confirma música relacionada.
  // Um lote curto é preferível a voltar às mesmas sugestões. Inclui a
  // continuação do Smart Shuffle: mantém o contexto e a memória de 30 dias.
  if (context === 'session') return harvest();

  // 5. Último recurso: o Flow do perfil. É o gosto GERAL, e não o desta
  //    música -- mas uma fila que continua é melhor do que o silêncio.
  try {
    pool.push(...shuffleCandidates(await getFlowMix(limit * 3)));
  } catch {
    // a RPC pode não existir na base de dados — degradar em silêncio
  }

  return harvest(true);
}
