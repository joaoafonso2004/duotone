import { useConnectivity } from '../state/connectivity';
import { feedbackReady,filterSuggestions } from '../state/recommendationFeedback';
import { chaveDeArtista, displayArtist } from '../lib/artistName';
import { pareceMusica } from '../lib/musica';
import {
  filterRadioCandidates,
  JANELA_DAS_OUVIDAS_MS,
  limitarMesmoArtista,
  loteSemRepetir,
  ouvidaEm,
  onlyPlausibleMusic,
  porPopularidade,
  RADIO_BATCH,
  seedArtists,
  shuffleCandidates,
} from '../lib/radio';
import { chavesDaMusica } from '../lib/identidadeDaMusica';
import { foiSugeridaRecentemente } from '../lib/smartShuffle';
import { trackKey } from '../lib/shuffle';
import { getLibrary } from './library';
import { lerFaixas } from '../lib/cacheDaBiblioteca';
import { paginaDoArtista } from './albunsDoArtista';
import { lerRadioPeloYtMusic, reproducoesConhecidas } from './ytMusic';
import type { Track } from '../types';
import { misturarPorFamiliaridade } from '../lib/contextoDaDescoberta';
import { candidatasParaDescoberta } from './descoberta';
import { lerPerfilDeRecomendacoes, type PerfilDeRecomendacoes } from './perfilDeRecomendacoes';
import { idDaConta } from '../lib/idDaConta';

/**
 * O perfil de escuta (uma RPC ao Supabase) guardado 10 min, por conta (16/10,
 * logs): era pedido em CADA tentativa de cada lote -- até sete quando as
 * parecidas secam. Uma falha não fica guardada.
 */
const PERFIL_VALE_MS = 10 * 60 * 1000;
let perfilGuardado: { conta: string | null; ate: number; pedido: Promise<PerfilDeRecomendacoes | null> } | null = null;
async function perfilDoRadio(): Promise<PerfilDeRecomendacoes | null> {
  const conta = await idDaConta().catch(() => null);
  const agora = Date.now();
  if (perfilGuardado && perfilGuardado.conta === conta && perfilGuardado.ate > agora) return perfilGuardado.pedido;
  const pedido = lerPerfilDeRecomendacoes().catch(() => null);
  const este = { conta, ate: agora + PERFIL_VALE_MS, pedido };
  perfilGuardado = este;
  void pedido.then((p) => { if (!p && perfilGuardado === este) perfilGuardado = null; });
  return pedido;
}

/**
 * De onde sai a música do rádio, por ordem de preferência.
 *
 * 1. A biblioteca, pelos mesmos artistas. 2. Os SEMELHANTES do catálogo (a
 * descoberta do Smart Shuffle, estrita: parte só do que está a tocar). 3. Uma
 * página musical do artista, confirmado pelas músicas dele. 4. O rádio da
 * própria música no YouTube Music.
 *
 * **Nunca o Flow geral do perfil** (15/10). Era a segunda fonte até 25/9, e era
 * ele que fazia a fila "nunca ser parecida" (João: "se clico em Morad deve ser
 * desse género"): são as favoritas de sempre mais 30% ao acaso -- o gosto
 * geral, e não o da música que se ouvia. Depois ficou como último recurso do
 * autoplay do fim da fila, e era por aí que a fila saltava do Isak para a Katy
 * Perry: bastava o lote parecido não chegar às dez (a memória de 30 dias vai
 * gastando as parecidas de um artista) para o resto vir do gosto geral. Um
 * lote curto e parecido é melhor; o autoplay volta a encher na faixa seguinte.
 *
 * `jaDescobertas`: as identidades das músicas descobertas nos últimos 30 dias
 * (a memória do Smart Shuffle, que o rádio também passou a alimentar -- 28/9).
 * Sem elas o rádio repunha sempre as mesmas novas; ver `loteSemRepetir`.
 *
 * `ouvidas` (15/10): identidade -> quando se ouviu pela última vez (o
 * histórico de escutas do aparelho, que viaja entre os dois). O que se ouviu
 * nas últimas 24 h não volta, as tuas incluídas; e quando repetir é a única
 * saída, vão as ouvidas há mais tempo.
 */
export async function fetchRadioTracks(
  seeds: Track[],
  exclude: Track[],
  limit: number = RADIO_BATCH,
  jaDescobertas: ReadonlySet<string> = new Set(),
  context: 'automatic' | 'session' = 'automatic',
  ouvidas: ReadonlyMap<string, number> = new Map(),
): Promise<Track[]> {
  if(useConnectivity.getState().offline)return [];
  await feedbackReady();
  const artists = seedArtists(seeds, displayArtist);
  const pool: Track[] = [];
  let library:Track[]=[];
  // Da cache partilhada: cada lote do rádio relia a biblioteca inteira (30/9).
  try{library=await lerFaixas(getLibrary);}catch{/* O rádio ainda pode sair do histórico. */}
  const knownKeys=new Set(library.map(trackKey));
  // As identidades de cada faixa, uma vez por pedido: o lote refaz-se várias
  // vezes, e no iPhone isto corre no JavaScript da interface.
  const chavesMemo=new Map<Track,string[]>();
  const chavesDe=(t:Track)=>{let c=chavesMemo.get(t);if(!c){c=chavesDaMusica(t);chavesMemo.set(t,c);}return c;};
  const excludedIdentities=new Set(exclude.flatMap(chavesDe));
  const desdeQueSeOuviu=Date.now()-JANELA_DAS_OUVIDAS_MS;
  const recente=(t:Track)=>{
    const chaves=chavesDe(t);
    return foiSugeridaRecentemente(chaves,jaDescobertas)||ouvidaEm(chaves,ouvidas)>desdeQueSeOuviu;
  };
  const quando=(t:Track)=>ouvidaEm(chavesDe(t),ouvidas);
  // Os êxitos do género primeiro (16/10, `porPopularidade`): os números que se
  // sabem (a página do artista, os vídeos do rádio) e os tops do catálogo.
  const reproducoesDaPagina=new Map<string,number>();
  const doCatalogo=new Set<string>();
  const reproducoes=(t:Track)=>reproducoesDaPagina.get(t.sourceId)??reproducoesConhecidas(t.sourceId);
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
      const keys=chavesDe(t);
      if(keys.some(k=>seen.has(k)))return false;
      keys.forEach(k=>seen.add(k));
      return true;
    });
    const conhecidas=candidatas.filter((t)=>knownKeys.has(trackKey(t)));
    const novas=porPopularidade(candidatas.filter((t)=>!knownKeys.has(trackKey(t))),reproducoes,(t)=>doCatalogo.has(trackKey(t)));
    return loteSemRepetir(conhecidas,novas,recente,limit,comRepetidas,
      (c,n,l)=>misturarPorFamiliaridade(c,n,l,'radio'),quando);
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
    const perfil = await perfilDoRadio();
    const jaLa = new Set([...exclude, ...pool].map(trackKey));
    // Com a memória, como no Smart Shuffle: a descoberta salta-as ANTES de
    // pesquisar e vai mais fundo no catálogo em vez de devolver as de sempre.
    const doCatalogoAgora = await candidatasParaDescoberta(
      seeds.slice(0, 3), jaLa, jaDescobertas, limit * 2, 3,
      perfil?.escutas, undefined, perfil?.externos, 'estrito',
    );
    for (const t of doCatalogoAgora) doCatalogo.add(trackKey(t));
    pool.push(...doCatalogoAgora);
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
      for (const [id, info] of Object.entries(pagina.info?.porVideo ?? {})) {
        if (info?.reproducoes != null) reproducoesDaPagina.set(id, info.reproducoes);
      }
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
  //    15/10: até três sementes, e não só a primeira -- o rádio de uma música
  //    só tem umas cinquenta, e numa tarde de Radio gastavam-se: era aí que
  //    voltavam as mesmas. Um pedido por semente, só enquanto o lote não chega.
  const comVideo = seeds.filter((t) => t.source === 'youtube' && /^[\w-]{11}$/.test(t.sourceId)).slice(0, 3);
  for (const daMusica of comVideo) {
    try {
      pool.push(...await lerRadioPeloYtMusic({ playlistId: `RDAMVM${daMusica.sourceId}`, videoId: daMusica.sourceId, params: null }));
    } catch {
      // Sem rede ou o YouTube Music mudou a resposta: segue sem ele.
    }
    if (harvest().length >= limit) return harvest();
  }

  // O modo escolhido na fila mantém as âncoras da sessão, e tem as suas
  // próprias tentativas (`tentativasDoRadio`): um lote curto é preferível a
  // voltar às mesmas sugestões. Inclui a continuação do Smart Shuffle.
  if (context === 'session') return harvest();

  // O autoplay do fim da fila tenta uma vez só (e o Radio na última
  // tentativa): o que faltar sai das parecidas que a memória guardava --
  // repetidas, as ouvidas há mais tempo primeiro, mas do mesmo género. Nada
  // parecido, a fila acaba (nunca o gosto geral, ver em cima).
  return harvest(true);
}
