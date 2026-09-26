import { cacheGet, cacheSet, DIA_MS } from './cache';
import { useConnectivity } from '../state/connectivity';
import { artistasPreferidos, artistWeight,feedbackReady,filterSuggestions,trackIsSuppressed } from '../state/recommendationFeedback';
import { ESCUTAS_DE_UM_PREFERIDO } from '../lib/recommendationFeedback';
import { getLibrary, getLibraryKeys } from './library';
import { lerFaixas } from '../lib/cacheDaBiblioteca';
import { chavesDeTodas, chavesDoCatalogo } from '../lib/identidadeDaMusica';
import { artistasParaRecomendacoes, getEscutasRecentes, getHeavyRotation, type TopArtist } from './plays';
import { lerPerfilDeRecomendacoes } from './perfilDeRecomendacoes';
import { paresDeArtistaEPlaylist } from './afinidade';
import {
  topDoArtista, vizinhancaConfirmada, vizinhancaDe, vizinhancaJaDecidida, type FaixaDoCatalogo,
} from './catalogo';
import { searchYouTubeFreeWithChannel } from './ytSearchFree';
import {
  apenasDeConfianca, chaveDeArtista, displayArtist, nomesDeConfianca, tituloNoLeitor,
  type FaixaParaAprender,
  extractArtist,
} from '../lib/artistName';
import {
  alvosDeProcura, artistasVizinhos, retratoDoContexto, vizinhosPorPlaylist,
} from '../lib/afinidade';
import {
  chaveDeCatalogo, pontuarPorGosto, PROVAS_POR_ARTISTA, repartir, type ArtistaDoCatalogo,
} from '../lib/catalogo';
import type { Proveniencia } from '../lib/escolhaDaSugestao';
import { pareceMusica } from '../lib/musica';
import { fetchYouTubePlaylistById, searchYouTubePlaylists } from './youtube';
import { pickBest } from '../lib/trackMatch';
import { trackKey } from '../lib/shuffle';
import {
  aEvitar, chegam, lerHistorico, registarDia, TENTATIVAS_SEM_REPETIR,
} from '../lib/descobertasMostradas';
import { ancorasDoDia, comporMistura, diaDe, misturaGuardada } from '../lib/misturaDoDia';
import type { Track } from '../types';

/**
 * Candidatas para descobrir: música que o utilizador **não tem**, escolhida por
 * se parecer com o que ele ouve. Serve o shuffle inteligente e a prateleira
 * "Discover new" da Pesquisa — um só sítio decide o que é "parecido".
 *
 * **Como isto funcionava, e porque estava mal.** Escolhia-se um artista da
 * biblioteca, pesquisava-se o NOME dele no YouTube e aceitava-se o que viesse.
 * Duas coisas correm mal aí. A primeira: o nome pode não ser de um artista —
 * o extractor tira-o do título, e o `999` que anda colado ao Juice WRLD virou
 * um alvo chamado "999 Music", que trouxe doze faixas de música bhojpuri do
 * canal com esse nome. A segunda, mais de fundo: pesquisar um artista devolve
 * o que o YouTube quiser — reações, entrevistas, compilações — e nada garante
 * que seja sequer dele.
 *
 * **Como funciona agora.** Deixa de se adivinhar e passa a perguntar-se:
 *
 *  1. **Quem ele ouve** — o retrato do contexto e a co-ocorrência nas
 *     playlists dele (`lib/afinidade.ts`). É o sinal pessoal, e é dele que
 *     saem os artistas por onde começar.
 *  2. **Quem se parece com esses** — o catálogo do Deezer (`api/catalogo.ts`),
 *     que sabe o que só se sabe vendo milhões de pessoas a ouvir. Um nome que
 *     não seja de um artista não tem semelhantes nenhuns, e por isso não
 *     produz nada — em vez de produzir doze coisas erradas.
 *  3. **Quais desses ele iria gostar** — os semelhantes reordenados pela
 *     afinidade dele (`ordenarPorGosto`). O catálogo propõe, o gosto escolhe.
 *  4. **Que músicas, ao certo** — as mais ouvidas de cada um, com título e
 *     duração reais.
 *  5. **Onde as ouvir** — aí sim o YouTube, mas a procurar uma faixa concreta
 *     que já se sabe que existe, e com o `lib/trackMatch.ts` a verificar que o
 *     vídeo é mesmo aquele. É a mesma verificação da importação do Spotify,
 *     que resolve este problema — ter a ficha da faixa e faltar o áudio —
 *     desde o início.
 *
 * A pesquisa usa o InnerTube (`ytSearchFree`) e não a Data API: cada procura
 * desta custaria 100 das 10.000 unidades diárias, e agora faz-se uma por faixa.
 */

/**
 * Um artista por onde comecar, e o peso que ele tem no que a pessoa ouve.
 *
 * O peso nao e decoracao: e ele que decide quantos lugares da prateleira
 * cabem a cada lado do gosto. Ver `repartir`.
 */
/**
 * Um artista de onde partir. `provas`: títulos de músicas dele na biblioteca,
 * que é por onde o catálogo confirma que é ESTE artista e não um homónimo (ver
 * `vizinhancaConfirmada`). Vazio para quem veio de fora (Spotify, sementes).
 */
type Alvo = { nome: string; peso: number; provas?: string[] };

/** Uma faixa a procurar, com a âncora e a proveniência que a acompanham até ao
 * leitor. Ver `lib/escolhaDaSugestao.ts`. */
type Desejada = { faixa: FaixaDoCatalogo; ancora: string; proveniencia: Proveniencia };

/** Quantas candidatas devolver. */
const QUANTAS = 12;
/** Por quantos artistas do utilizador começar. Cada um dá até 25 semelhantes. */
const ALVOS = 2;
/**
 * Quantos semelhantes usar, NO TOTAL e não por âncora -- ver o `repartir` mais
 * abaixo, que divide este número pelos alvos conforme o peso de cada um.
 *
 * **Era aqui o tecto, e não no 30.** O `POR_PRATELEIRA` do
 * `state/recomendacoes.ts` pede trinta faixas, mas seis semelhantes a quatro
 * faixas cada davam vinte e quatro no MELHOR dos casos -- antes de sair o que
 * já está na biblioteca, o que já se ouve, o que foi marcado como "não
 * sugerir", e o que o YouTube não confirma. Subir o trinta não fazia aparecer
 * nada; subir isto faz.
 *
 * Dez vezes cinco dá cinquenta, o que põe o pedido de trinta a ser um limite a
 * sério em vez de um número que nunca se alcança. Custa rede -- cada semelhante
 * é uma ida ao catálogo e uma pesquisa no YouTube por faixa -- mas o catálogo
 * vai a cache partilhada e as prateleiras já entram uma a uma.
 */
const SEMELHANTES = 10;
/** Faixas a pedir por artista semelhante. */
const FAIXAS_POR_ARTISTA = 5;
/**
 * Quão fundo se lê o top de cada artista no Deezer. Só se procuram as
 * `FAIXAS_POR_ARTISTA` primeiras que a pessoa ainda não tem nem recebeu: com
 * o top 5 seco, a mesma meia dúzia era procurada todas as vezes e deitada fora
 * depois de gastar a pesquisa (auditoria de 16/9, "pouco catálogo").
 */
const TOP_DO_CATALOGO = 15;

/** A biblioteca inteira, da cache partilhada; vazia se não se conseguir ler. */
async function bibliotecaInteira(): Promise<readonly Track[]> {
  try {
    return await lerFaixas(getLibrary);
  } catch {
    return [];
  }
}

/** Uma música do catálogo que não vale a pena procurar: já é dele, ou já lhe
 * foi mostrada. `jaSugeridas` pode trazer chaves de música, além de uploads. */
function aSaltar(
  biblioteca: readonly Track[],
  jaSugeridas: ReadonlySet<string>,
): (faixa: FaixaDoCatalogo) => boolean {
  const daBiblioteca = chavesDeTodas(biblioteca);
  return (faixa) => chavesDoCatalogo(faixa)
    .some((k) => daBiblioteca.has(k) || jaSugeridas.has(k));
}
/** Procuras em paralelo. Sequencial demorava demasiado; todas de uma vez é
 * pouco simpático para o YouTube. */
const EM_PARALELO = 4;

export async function candidatasParaDescoberta(
  contexto: readonly Track[],
  jaNaFila: ReadonlySet<string>,
  jaSugeridas: ReadonlySet<string>,
  quantas: number = QUANTAS,
  quantosAlvos: number = ALVOS,
  escutas?: ReadonlyMap<string, number>,
  /**
   * Se vier, é preenchido com as descobertas agrupadas pelo ARTISTA DO
   * UTILIZADOR que as trouxe.
   *
   * Sai por parâmetro e não no retorno de propósito: três chamadores já usam
   * esta função e nenhum deles quer o agrupamento. Mudar o tipo de retorno
   * obrigava-os todos a desembrulhar uma coisa que não pediram.
   */
  porAncora?: Map<string, Track[]>,
  /**
   * Artistas confirmados FORA da biblioteca (gosto do Spotify, escolhas do
   * primeiro dia), da chave para o nome escrito. Ver `escolherAlvos`.
   */
  externos?: ReadonlyMap<string, string>,
  /**
   * Numa sessao de reproducao, so o contexto actual fornece ancoras. O perfil
   * global e as playlists continuam a ordenar os semelhantes do catalogo.
   * `'estrito'` (o Smart Shuffle): se nenhum artista do que está a tocar servir
   * de âncora, não há candidatas -- em vez de partir do perfil geral, que era
   * de onde vinham as sugestões sem nada a ver com a música (25/9). O Jam
   * continua com `true`: aí uma fila que seca é pior.
   */
  contextoDaSessao: boolean | 'estrito' = false,
  /**
   * Se vier, recebe a proveniência de cada faixa devolvida, pela `trackKey`.
   * É o Smart Shuffle que a usa para escolher e para não inserir nada sem
   * confiança. Por parâmetro pela mesma razão do `porAncora`.
   */
  proveniencias?: Map<string, Proveniencia>,
): Promise<Track[]> {
  if(useConnectivity.getState().offline)return [];
  await feedbackReady();
  const biblioteca = await bibliotecaInteira();
  const { alvos, afinidade } = await escolherAlvos(
    contexto, quantosAlvos, escutas, externos, contextoDaSessao, undefined, biblioteca,
  );
  if (alvos.length === 0) return [];

  // O que ele já tem fica de fora: é isso que separa descobrir de repetir.
  // Falhar a ler a biblioteca não pode impedir a sugestão — no pior caso
  // sugere-se algo que ele já tinha, que é menos mau do que não sugerir.
  let daBiblioteca: ReadonlySet<string> = new Set();
  try {
    daBiblioteca = await getLibraryKeys();
  } catch {
    // segue sem este filtro
  }

  const desejadas = await faixasParaProcurar(
    alvos, afinidade, undefined, aSaltar(biblioteca, jaSugeridas),
  );
  if (desejadas.length === 0) return [];
  const saida = await resolverDesejadas(
    desejadas, jaNaFila, jaSugeridas, daBiblioteca, quantas, porAncora, undefined, proveniencias,
  );
  return filterSuggestions(saida);
}

/**
 * Procura no YouTube as faixas desejadas, quatro de cada vez.
 *
 * `maxPorAncora` é das misturas: cada âncora precisa de umas quantas faixas,
 * não de todas as que o catálogo propõe. Uma âncora que já chegou deixa de
 * gastar pesquisas, e as outras continuam.
 */
async function resolverDesejadas(
  desejadas: readonly Desejada[],
  jaNaFila: ReadonlySet<string>,
  jaSugeridas: ReadonlySet<string>,
  daBiblioteca: ReadonlySet<string>,
  quantas: number,
  porAncora?: Map<string, Track[]>,
  maxPorAncora?: number,
  proveniencias?: Map<string, Proveniencia>,
): Promise<Track[]> {
  const saida: Track[] = [];
  const vistas = new Set<string>();
  const porAncoraConta = new Map<string, number>();
  const cheia = (ancora: string) =>
    maxPorAncora !== undefined && (porAncoraConta.get(ancora) ?? 0) >= maxPorAncora;
  let i = 0;
  while (i < desejadas.length && saida.length < quantas) {
    const lote: Desejada[] = [];
    while (lote.length < EM_PARALELO && i < desejadas.length) {
      const d = desejadas[i++];
      if (!cheia(d.ancora)) lote.push(d);
    }
    if (lote.length === 0) break;
    const achadas = await Promise.all(lote.map((d) => procurarNoYouTube(d.faixa)));
    for (let n = 0; n < achadas.length; n++) {
      const t = achadas[n];
      if (!t||trackIsSuppressed(t)) continue;
      const k = trackKey(t);
      if (!k || vistas.has(k)) continue;
      if (jaNaFila.has(k) || jaSugeridas.has(k) || daBiblioteca.has(k)) continue;
      // Rede de segurança: o `pickBest` já rejeita quase tudo o que não é a
      // faixa pedida, mas isto não custa nada e apanha o resto.
      if (!pareceMusica(t)) continue;
      // O lote corre em paralelo: a mesma âncora pode encher a meio dele.
      const ancora = lote[n].ancora;
      if (cheia(ancora)) continue;
      vistas.add(k);
      saida.push(t);
      porAncoraConta.set(ancora, (porAncoraConta.get(ancora) ?? 0) + 1);
      proveniencias?.set(k, lote[n].proveniencia);
      // A âncora sobrevive à resolução. É este o passo que faltava: até aqui
      // sabia-se que uma faixa era uma descoberta, e perdia-se de QUEM ela
      // era vizinha -- que é precisamente o que uma mistura precisa de saber.
      if (porAncora && ancora) {
        const lista = porAncora.get(ancora);
        if (lista) lista.push(t); else porAncora.set(ancora, [t]);
      }
      if (saida.length >= quantas) break;
    }
  }
  return saida;
}

/**
 * Que faixas concretas ir procurar, por ordem de interesse.
 *
 * Os artistas do utilizador entram ao lado dos seus semelhantes: uma faixa
 * nova de alguém conhecido continua a ser descoberta. O que já está na fila,
 * na biblioteca ou na memória de sugestões sai depois, pela faixa concreta.
 * Se nenhum alvo resolver no catálogo — sem rede, ou nomes que não são
 * artistas — isto devolve vazio, e a descoberta fica calada em vez de dizer
 * disparates.
 */
async function faixasParaProcurar(
  alvos: readonly Alvo[],
  afinidade: ReadonlyMap<string, number>,
  /** Artistas por âncora, iguais para todas. É o caso das misturas: cada
   * uma é uma prateleira própria e precisa dos seus vizinhos, seja qual for
   * o peso da âncora. Sem isto reparte-se `SEMELHANTES` pelo peso. */
  artistasPorAlvo?: number,
  /** Músicas que não vale a pena procurar. Saltam-se antes da pesquisa. */
  saltar: (faixa: FaixaDoCatalogo) => boolean = () => false,
): Promise<Desejada[]> {
  // Uma lista POR ALVO, e não todas num saco: juntá-las fazia com que o
  // segundo alvo ficasse sempre atrás do primeiro, e as sugestões saíam todas
  // do mesmo lado. Ver `ordenarPorGosto`.
  const listas: ArtistaDoCatalogo[][] = [];
  const pesos: number[] = [];
  // De que alvo veio cada lista. Sem isto o índice de `listas` deixa de bater
  // certo com o de `alvos` -- só entram os alvos que o catálogo resolveu -- e
  // a ligação entre um vizinho e o artista que o trouxe perde-se aqui mesmo.
  const ancoras: string[] = [];
  for (const alvo of alvos) {
    // Confirmado pelas músicas dele: o homónimo com mais fãs já não serve.
    const vizinhanca = await vizinhancaConfirmada(alvo.nome, alvo.provas ?? []).catch(() => null);
    if (!vizinhanca) continue; // não é um artista, não é ESTE artista, ou o catálogo não respondeu
    // A âncora vem primeiro porque é a aproximação mais segura ao gosto. Antes
    // ficava explicitamente excluída e uma faixa nova do artista preferido nem
    // chegava a ser procurada. A chave impede uma resposta estranha do
    // catálogo de repetir o próprio artista nos semelhantes.
    const chaveDaAncora = chaveDeCatalogo(vizinhanca.artista.nome);
    listas.push([
      vizinhanca.artista,
      ...vizinhanca.semelhantes.filter((a) => chaveDeCatalogo(a.nome) !== chaveDaAncora),
    ]);
    pesos.push(alvo.peso);
    ancoras.push(alvo.nome);
  }
  if (listas.length === 0) return [];

  // **Cada lado do gosto leva lugares na medida em que é ouvido.** Antes todos
  // os alvos contribuíam o mesmo, e uma prateleira era metade de cada — o que
  // se ouve a dobrar aparecia na mesma medida do resto. O mínimo de um lugar
  // que a `repartir` garante é a outra metade do pedido: um pouco de tudo.
  const quota = artistasPorAlvo !== undefined
    ? pesos.map(() => artistasPorAlvo)
    : repartir(pesos, SEMELHANTES);
  const escolhidos: ArtistaDoCatalogo[] = [];
  /** Vizinho -> artista do utilizador que o trouxe, e como chegou lá. */
  const deQuemVeio = new Map<ArtistaDoCatalogo['id'], Omit<Desejada, 'faixa'>>();
  const jaEscolhido = new Set<string>();
  const ordenadas = listas.map((lista) => pontuarPorGosto([lista], afinidade));
  const posicoes = ordenadas.map(() => 0);
  const levados = ordenadas.map(() => 0);

  // Uma escolha de cada âncora por ronda. Antes, as quotas eram respeitadas,
  // mas todos os artistas da primeira âncora eram acrescentados antes de se
  // olhar para a segunda; como o Smart Shuffle usa o início da lista, a quota
  // da segunda quase nunca chegava a ser vista.
  while (true) {
    let houveEscolha = false;
    for (let i = 0; i < ordenadas.length; i++) {
      if (levados[i] >= quota[i]) continue;
      while (posicoes[i] < ordenadas[i].length) {
        const { artista: a, posicao, pontos } = ordenadas[i][posicoes[i]++];
        const k = chaveDeCatalogo(a.nome);
        if (!k || jaEscolhido.has(k)) continue;
        jaEscolhido.add(k);
        escolhidos.push(a);
        deQuemVeio.set(a.id, {
          ancora: ancoras[i],
          proveniencia: {
            ancora: chaveDeArtista(ancoras[i]),
            // A lista começa pela própria âncora: é a posição 0.
            propria: posicao === 0,
            posicaoNoCatalogo: posicao,
            pontos,
            ronda: 0,
          },
        });
        levados[i]++;
        houveEscolha = true;
        break;
      }
    }
    if (!houveEscolha) break;
  }

  const porArtista: FaixaDoCatalogo[][] = [];
  /** A mesma ordem do `porArtista`: de onde veio cada artista. */
  const origemDe: Omit<Desejada, 'faixa'>[] = [];
  for (const artista of escolhidos) {
    const top = await topDoArtista(artista.id, TOP_DO_CATALOGO);
    // O top pode trazer o próprio artista ou uma colaboração. Ambos servem:
    // a novidade é decidida pela faixa concreta, não por o nome do artista já
    // existir no gosto da pessoa. O que ele já tem ou já recebeu salta-se aqui,
    // antes da pesquisa, e desce-se no top.
    const novas = top.filter((f) => !saltar(f)).slice(0, FAIXAS_POR_ARTISTA);
    const origem = deQuemVeio.get(artista.id);
    if (novas.length > 0 && origem) {
      porArtista.push(novas);
      origemDe.push(origem);
    }
  }

  // Uma faixa de cada artista antes da segunda de qualquer um: senão a
  // prateleira enchia-se com quatro do mesmo e parecia um álbum.
  const faixas: Desejada[] = [];
  for (let i = 0; i < FAIXAS_POR_ARTISTA; i++) {
    porArtista.forEach((doArtista, n) => {
      const f = doArtista[i];
      const { ancora, proveniencia } = origemDe[n];
      if (f) faixas.push({ faixa: f, ancora, proveniencia: { ...proveniencia, ronda: i } });
    });
  }
  return faixas;
}

/**
 * Encontrar no YouTube uma faixa que se sabe existir.
 *
 * Isto é uma procura, não uma descoberta: sabe-se o artista, o título e a
 * duração, e o `pickBest` verifica que o vídeo é mesmo aquele — com as
 * penalizações que já existiam para ao vivo, remix, karaoke e reações. Sem
 * confiança devolve nada: numa prateleira automática ninguém está lá para
 * corrigir a escolha errada.
 */
/**
 * Exportado porque o segundo catálogo (api/naoLancado.ts) precisa do MESMO
 * resolvedor: dar-lhe outro seria ter duas ideias diferentes de quando um
 * vídeo do YouTube é mesmo a faixa que se pediu.
 */
export async function procurarNoYouTube(
  faixa: FaixaDoCatalogo,
  /**
   * Porta extra sobre o candidato ESCOLHIDO, com os valores tal como o
   * YouTube os deu. Corre antes de qualquer substituição -- é esse o ponto:
   * o `durationSeconds` abaixo cai para a duração do alvo quando a pesquisa
   * não a trouxe, e uma porta que corresse depois estaria a comparar a
   * duração do alvo consigo própria. Ver `aceitarDoYouTube` em lib/tracker.
   */
  aceitar?: (candidato: { titulo: string; duracaoSegundos: number | null }) => boolean,
): Promise<Track | null> {
  let achados;
  try {
    achados = await searchYouTubeFreeWithChannel(`${faixa.artista} ${faixa.titulo}`);
  } catch {
    return null;
  }
  if (achados.length === 0) return null;

  const { best, confident } = pickBest(
    achados.map((a) => ({
      id: a.track.sourceId,
      title: a.track.title,
      channel: a.channel,
      durationSec: a.track.durationSeconds,
    })),
    { title: faixa.titulo, artist: faixa.artista, durationSec: faixa.duracaoS },
  );
  if (!best || !confident) return null;

  const escolhida = achados.find((a) => a.track.sourceId === best.id);
  if (!escolhida) return null;
  if (aceitar && !aceitar({
    titulo: escolhida.track.title,
    duracaoSegundos: escolhida.track.durationSeconds ?? null,
  })) return null;
  // O artista passa a ser o do catálogo e não o que se adivinha do título: é o
  // nome certo, e é o que a biblioteca vai guardar se ele gostar da faixa.
  //
  // A DURAÇÃO vem pelo mesmo caminho quando a pesquisa não a trouxe. O
  // InnerTube nem sequer manda sempre o `lengthText`, e uma faixa sem duração
  // atravessa a app toda: é ela que corrige o contentor do ficheiro
  // descarregado (`fixMp4Duration`) e que arma os dois detetores do fim. Sem
  // ela a música ficava presa no último segundo, sem nunca passar à seguinte
  // -- e só nas sugestões, porque as da biblioteca trazem a duração do
  // Supabase.
  return {
    ...escolhida.track,
    artist: faixa.artista,
    durationSeconds: escolhida.track.durationSeconds ?? faixa.duracaoS,
  };
}

/**
 * "Discover new": só música que ele NÃO tem, escolhida pelo que ele ouve.
 *
 * É a primeira prateleira da Pesquisa e não mistura nada de conhecido — o
 * "Daily flow" já faz essa mistura. Aqui a promessa do título é literal: se
 * aparecer uma faixa que ele já tinha, o nome da prateleira está a mentir.
 *
 * Parte de mais artistas do que o shuffle (que só precisa de uma sugestão de
 * cada vez) porque uma prateleira com duas coisas não é uma prateleira.
 */
/** Uma chave só, reescrita todos os dias, em vez de uma por dia: a cache é por
 *  utilizador e não vale a pena deixar lá o histórico todo. A `v2` no nome
 *  deixa para trás a lista semanal da versão anterior. */
const CHAVE_DO_DIA = 'descobertas:dia:v2';
/** O que se mostrou nos dias anteriores. Ver `lib/descobertasMostradas.ts`. */
const CHAVE_DAS_MOSTRADAS = 'descobertas:mostradas:v2';

/**
 * A descoberta do DIA: uma lista nova todos os dias, sem carregar em nada.
 *
 * **Porque é que isto muda alguma coisa.** A lista era refeita a cada arranque
 * da app: abrias, via-se meia dúzia, fechava-se, e no dia seguinte era outra
 * lista com outras faixas. Nunca chegava a ser *a tua* lista -- e uma lista que
 * se sabe que vai estar lá amanhã é a única que se ouve até ao fim. É a ideia
 * inteira do Discover Weekly do Spotify, e não custa mais nada do que guardar o
 * que já se calculava.
 *
 * Fica no `yt_cache`, que é POR UTILIZADOR e tem RLS por `auth.uid()` (ver o
 * `supabase/schema.sql`): a lista é a mesma no telemóvel e no PC, e não é de
 * mais ninguém.
 *
 * `forcar` existe para o botão de refrescar: sem ele, carregar em refrescar não
 * fazia nada a esta prateleira, que é a mais visível da página.
 *
 * **E a semana seguinte não repete a anterior.** A escolha dos vizinhos é
 * estável, e com o mesmo gosto voltavam as mesmas faixas semana após semana. O
 * que se mostrou nas últimas semanas fica de fora, apertando primeiro e
 * alargando se não chegar -- ver `lib/descobertasMostradas.ts`.
 */
export async function descobertasDoDia(
  limite: number,
  biblioteca: readonly Track[],
  forcar = false,
  /** Só serve a refrescar: ver o `descobrirNovas`. */
  jaSugeridas: ReadonlySet<string> = new Set(),
): Promise<Track[]> {
  const dia = diaDe();
  if (!forcar) {
    const guardado = await cacheGet<{ dia: number; faixas: Track[] }>(CHAVE_DO_DIA, 2 * DIA_MS);
    if (guardado?.dia === dia && guardado.faixas?.length) return guardado.faixas;
  }
  const historico = lerHistorico(await cacheGet<unknown>(CHAVE_DAS_MOSTRADAS, 60 * DIA_MS));
  let faixas: Track[] = [];
  for (const dias of TENTATIVAS_SEM_REPETIR) {
    const evitar = new Set([...jaSugeridas, ...aEvitar(historico, dia, dias)]);
    faixas = await descobrirNovas(limite, biblioteca, evitar, ALVOS_DA_PRATELEIRA);
    // Quem ouve poucos artistas tem poucos vizinhos: excluir um mês inteiro
    // deixava-o sem prateleira. Se não chega, alarga-se a janela.
    if (chegam(faixas.length, limite)) break;
  }
  // Uma lista vazia não se guarda: seria fixar o silêncio durante um dia.
  if (faixas.length > 0) {
    await cacheSet(CHAVE_DO_DIA, { dia, faixas });
    // Com as chaves da MÚSICA, e não só do upload: é por elas que o dia
    // seguinte salta estas antes de pesquisar e desce no top do artista.
    await cacheSet(CHAVE_DAS_MOSTRADAS, registarDia(
      historico, dia, faixas.flatMap((t) => [trackKey(t), ...chavesDoCatalogo({ titulo: t.title, artista: t.artist ?? '' })]),
    ));
  }
  return faixas;
}

/**
 * Quantos artistas da pessoa servem de ponto de partida à PRATELEIRA.
 *
 * Eram os mesmos quatro do Smart Shuffle, que só precisa de uma sugestão de
 * cada vez. Numa prateleira isso dava poucas faixas -- cada alvo traz um
 * punhado de vizinhos e nem toda a pesquisa devolve um vídeo em que se
 * confie, por isso o que chega ao ecrã é sempre menos do que o pedido. Seis
 * alargam o leque sem multiplicar as pesquisas: quem reparte o `limite` pelos
 * alvos é o `repartir`.
 */
const ALVOS_DA_PRATELEIRA = 6;

export async function descobrirNovas(
  limite: number,
  biblioteca: readonly Track[],
  /**
   * O que NÃO se quer ver outra vez.
   *
   * É isto que faz o botão de refrescar significar alguma coisa. A escolha das
   * âncoras e dos vizinhos é determinística de propósito -- para a página não
   * se mexer sozinha entre visitas -- e a consequência é que recalcular com as
   * mesmas entradas dá exactamente a mesma lista. Passando o que já está no
   * ecrã, o refrescar devolve outras.
   */
  jaSugeridas: ReadonlySet<string> = new Set(),
  alvos = 4,
): Promise<Track[]> {
  // A biblioteca TODA: as 60 mais recentes valem inteiras e as outras a um
  // quarto (`retratoDoContexto`). O corte seco deixava de fora os favoritos
  // antigos que não estão em playlists.
  const contexto = biblioteca;
  // **O que ele OUVE, e não o que tem guardado.** A biblioteca diz o que ele
  // salvou uma vez; o histórico diz o que ele põe a tocar, que é a pergunta.
  // Sem isto, sessenta faixas guardadas há um ano pesavam o mesmo que o
  // artista que ele anda a ouvir todos os dias.
  const { escutas, externos } = await lerPerfilDeRecomendacoes();
  return candidatasParaDescoberta(contexto, new Set(), jaSugeridas, limite, alvos, escutas, undefined, externos)
    .catch(() => [] as Track[]);
}

/**
 * O "Daily flow" da Pesquisa, misturado AQUI e não na base de dados.
 *
 * **Porque é que se saiu do `get_flow_mix`.** Aquela função escolhe 70% do
 * histórico e 30% do catálogo **ao acaso** — `order by random()` sobre a
 * tabela `tracks`, sem relação nenhuma com o que a pessoa ouve. É por isso que
 * as recomendações às vezes não diziam nada. A parte dos favoritos continua a
 * vir do servidor, que é quem sabe o histórico; a parte da descoberta passa a
 * sair da afinidade, que é a mesma que serve o shuffle inteligente.
 */
export async function flowDoDia(limite: number, biblioteca: readonly Track[]): Promise<Track[]> {
  const quantosFavoritos = Math.max(1, Math.round(limite * 0.7));
  const favoritos = await getHeavyRotation(quantosFavoritos).catch(() => [] as Track[]);

  const jaLa = new Set(favoritos.map((t) => trackKey(t)));
  // Pelo `descobrirNovas`, e não direto ao `candidatasParaDescoberta`: é ele que
  // leva o gosto do Spotify e as sementes. Direto, uma conta nova (sem
  // histórico nem biblioteca) recebia um flow vazio -- justamente quem vive de
  // uma playlist que se faz sozinha.
  const novas = await descobrirNovas(Math.max(12, limite - favoritos.length), biblioteca, jaLa);

  // Intercaladas e não em bloco: as novas ao fundo eram as que ninguém via.
  const saida: Track[] = [];
  const aCada = Math.max(2, Math.floor(limite / Math.max(1, limite - quantosFavoritos)));
  let iNovas = 0;
  for (let i = 0; i < favoritos.length && saida.length < limite; i++) {
    saida.push(favoritos[i]);
    if ((i + 1) % aCada === 0 && iNovas < novas.length && saida.length < limite) {
      saida.push(novas[iNovas++]);
    }
  }
  while (saida.length < limite && iNovas < novas.length) saida.push(novas[iNovas++]);
  return filterSuggestions(saida);
}

/**
 * A Daily mix a partir do que se OUVIU (26/9) -- as regras e o porquê vivem em
 * `lib/misturaDoDia.ts`. Aqui só se juntam os dados: as escutas da última
 * semana (com a hora), o perfil de sempre, as descobertas de cada âncora (os
 * vizinhos do catálogo, as mesmas do Smart Shuffle) e as conhecidas de cada
 * âncora (o que se ouviu dela, depois a biblioteca e a Heavy Rotation).
 *
 * Sem escutas nem perfil, ou com tão pouco que a mix ficaria a meio, é o
 * `flowDoDia` de antes: uma conta nova continua a ter mix.
 */
async function misturaPeloQueSeOuve(limite: number, biblioteca: readonly Track[]): Promise<Track[]> {
  const agora = Date.now();
  const [recentes, perfil, favoritas] = await Promise.all([
    getEscutasRecentes(7).catch(() => [] as { track: Track; em: number }[]),
    artistasParaRecomendacoes(20).catch(() => [] as TopArtist[]),
    getHeavyRotation(60).catch(() => [] as Track[]),
  ]);
  const chaveDaFaixaArtista = (t: Track) => chaveDeArtista(displayArtist(t));
  const ancoras = ancorasDoDia(
    recentes.map((e) => ({ chave: chaveDaFaixaArtista(e.track), nome: displayArtist(e.track), em: e.em })),
    perfil.map((a) => ({ chave: chaveDeArtista(a.name), nome: a.name, escutas: a.plays })),
    agora,
  );
  if (ancoras.length === 0) return flowDoDia(limite, biblioteca);

  const { vizinhas, ancoras: confirmadas } = await descobertasPorAncora(
    biblioteca, ancoras.map((a) => a.nome), ancoras.length,
  );
  // Só fica quem o catálogo confirmou; o peso volta a somar 1 entre elas.
  const aceites = new Set(confirmadas.map(chaveDeArtista));
  const ficam = ancoras.filter((a) => aceites.has(a.chave));
  if (ficam.length === 0) return flowDoDia(limite, biblioteca);
  const soma = ficam.reduce((s, a) => s + a.peso, 0);
  const finais = ficam.map((a) => ({ ...a, peso: a.peso / soma }));

  // As conhecidas de cada âncora: primeiro o que se ouviu dela esta semana
  // (as mais repetidas à frente), depois a biblioteca, que muda de ordem a
  // cada dia para a mix não abrir sempre com as mesmas.
  const dia = diaDe(agora);
  const conhecidas = new Map<string, Track[]>();
  const juntar = (t: Track) => {
    const k = chaveDaFaixaArtista(t);
    if (!aceites.has(k)) return;
    const lista = conhecidas.get(k) ?? [];
    lista.push(t);
    conhecidas.set(k, lista);
  };
  const vezes = new Map<string, { t: Track; n: number }>();
  for (const e of recentes) {
    const k = trackKey(e.track);
    const v = vezes.get(k);
    if (v) v.n++; else vezes.set(k, { t: e.track, n: 1 });
  }
  [...vezes.values()].sort((a, b) => b.n - a.n).forEach((v) => juntar(v.t));
  const embaralhar = (t: Track) => hashDoDia(`${dia}:${t.sourceId}`);
  [...biblioteca].sort((a, b) => embaralhar(a) - embaralhar(b)).forEach(juntar);
  favoritas.forEach(juntar);

  const mix = comporMistura(finais, vizinhas, conhecidas, limite, trackKey);
  if (mix.length < limite / 2) return flowDoDia(limite, biblioteca);
  // O que faltar vem das favoritas de sempre.
  const jaLa = new Set(mix.map(trackKey));
  for (const t of favoritas) {
    if (mix.length >= limite) break;
    if (!jaLa.has(trackKey(t))) { jaLa.add(trackKey(t)); mix.push(t); }
  }
  return filterSuggestions(mix);
}

/** Um número estável por texto (FNV-1a), para baralhar igual o dia inteiro. */
function hashDoDia(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Uma chave só, reescrita todos os dias, como a da semana. A v2 (26/9) é a
 * mix pelo que se ouve: a de hoje refaz-se em vez de ficar a antiga até amanhã. */
const CHAVE_DA_MISTURA_DO_DIA = 'mistura-do-dia:v2';

/**
 * A Daily mix: o `flowDoDia`, mas a MESMA durante o dia inteiro -- ver
 * `lib/misturaDoDia.ts`. No `yt_cache`, que é por utilizador: a mix é a mesma
 * no iPhone e no PC. `forcar` refaz a de hoje.
 */
export async function misturaDoDia(
  limite: number,
  biblioteca: readonly Track[],
  forcar = false,
): Promise<Track[]> {
  const dia = diaDe();
  if (!forcar) {
    const guardada = misturaGuardada<Track>(await cacheGet<unknown>(CHAVE_DA_MISTURA_DO_DIA, 2 * DIA_MS), dia);
    if (guardada) return guardada;
  }
  const faixas = await misturaPeloQueSeOuve(limite, biblioteca).catch(() => flowDoDia(limite, biblioteca));
  // Vazia não se guarda: seria fixar o silêncio o dia inteiro.
  if (faixas.length > 0) await cacheSet(CHAVE_DA_MISTURA_DO_DIA, { dia, faixas });
  return faixas;
}

/**
 * Por que artistas começar, e o mapa de afinidade que ordena o resto.
 *
 * Na Search, mistura o retrato com vizinhos de playlists, cujo peso agregado é
 * limitado em `alvosDeProcura`. Numa sessão de reprodução, os artistas que
 * estão realmente a tocar são as âncoras; perfil e playlists servem de apoio
 * para ordenar o que o catálogo propõe.
 *
 * A afinidade sai daqui em vez de ser recalculada, porque é a mesma conta: o
 * catálogo vai propor semelhantes e é este mapa que diz quais deles têm que ver
 * com o que ele ouve.
 */
async function escolherAlvos(
  contexto: readonly Track[],
  quantosAlvos: number = ALVOS,
  escutas?: ReadonlyMap<string, number>,
  externos?: ReadonlyMap<string, string>,
  contextoDaSessao: boolean | 'estrito' = false,
  /**
   * Âncoras escolhidas por quem chama, por ordem de prioridade: as misturas
   * já sabem que artistas vão mostrar. Passam pelo mesmo crivo de confiança
   * e deixam de ser sorteadas.
   */
  pedidos?: readonly string[],
  /** A biblioteca inteira. Só serve à confiança nos nomes. */
  biblioteca: readonly Track[] = [],
): Promise<{ alvos: Alvo[]; afinidade: Map<string, number> }> {
  const vazio = { alvos: [] as Alvo[], afinidade: new Map<string, number>() };

  const doContexto = contexto
    .map((t) => ({ artista: displayArtist(t) }))
    .filter((f) => f.artista && f.artista !== 'Unknown artist');
  // Uma biblioteca vazia só cala a descoberta se também não houver escutas.
  // Calava sempre, e quem chegava sem nada guardado -- mas com o gosto do
  // Spotify lido, ou três artistas escolhidos -- não recebia descoberta
  // nenhuma: exatamente quem mais precisa dela.
  if (doContexto.length === 0 && !escutas?.size) return vazio;

  const retrato = retratoDoContexto(doContexto, chaveDeArtista);
  const apoioDoPerfil = new Map<string, number>();

  // Fora de uma sessão, as escutas mandam sobre a simples presença na
  // biblioteca. Dentro da sessão ficam num mapa de apoio: continuam a ordenar
  // os semelhantes, mas não substituem o ambiente que está a tocar. O peso é
  // a RAIZ da contagem para aproximar os extremos.
  if (escutas) {
    for (const [k, tocou] of escutas) {
      if (tocou <= 0) continue;
      const destino = contextoDaSessao ? apoioDoPerfil : retrato;
      destino.set(k, Math.sqrt(tocou));
    }
  }
  if (retrato.size === 0 && apoioDoPerfil.size === 0) return vazio;

  // As chaves são canónicas (minúsculas, sem pontuação) e não servem para
  // pesquisar. Guarda-se por onde se passa o nome como está escrito.
  const nomePorChave = new Map<string, string>();
  for (const t of contexto) {
    const nome = displayArtist(t);
    if (nome) nomePorChave.set(chaveDeArtista(nome), nome);
  }
  // Os de fora trazem o nome escrito como a fonte o escreve; sem isto
  // procurava-se pela chave ("juice wrld"), que resulta, mas por acaso.
  for (const [k, nome] of externos ?? []) {
    if (!nomePorChave.has(k)) nomePorChave.set(k, nome);
  }

  let vizinhos: ReturnType<typeof artistasVizinhos> = [];
  // As linhas cruas da biblioteca, com o canal por tratar: e delas que sai a
  // confianca nos nomes. O contexto entra tambem porque no "Discover new" ele
  // E a biblioteca, e no shuffle e o que esta mesmo a tocar.
  const cruas: FaixaParaAprender[] = contexto.map((t) => ({
    source: t.source, title: t.title, artist: t.artist,
  }));
  // **A biblioteca inteira também conta para a confiança**, em todos os
  // modos. Sem ela, um artista só das gostadas (fora das playlists) com um
  // canal que não é oficial nunca passava o crivo -- e no Smart Shuffle a
  // música que estava a tocar deixava de servir de âncora.
  const noContexto = new Set(contexto.map(trackKey));
  for (const t of biblioteca) {
    if (!noContexto.has(trackKey(t))) cruas.push({ source: t.source, title: t.title, artist: t.artist });
  }
  try {
    const { pares, faixas } = await paresDeArtistaEPlaylist();
    cruas.push(...faixas);
    // Os vizinhos NÃO estão no contexto, por isso os nomes deles só existem
    // aqui. Sem isto pesquisava-se pela chave — "juice wrld" em vez de
    // "Juice WRLD" — que resulta, mas por acaso.
    for (const p of pares) nomePorChave.set(chaveDeArtista(p.artista), p.artista);
    vizinhos = artistasVizinhos(retrato, vizinhosPorPlaylist(pares, chaveDeArtista));
  } catch {
    // sem co-ocorrência: fica a rede de segurança
  }

  // **O crivo que impede um engano de leitura de virar um género inteiro.**
  // O `999` que o extractor tira dos títulos do Juice WRLD é, num catálogo de
  // música, uma banda punk inglesa de 1977 com vinte artistas semelhantes:
  // passa por artista em qualquer verificação feita ao nome. Só a biblioteca
  // dele sabe que aquilo nunca foi música que alguém ouviu. Ver `lib/alvos.ts`.
  const confianca = nomesDeConfianca(cruas);
  // As músicas de cada artista na biblioteca, pelo título que o catálogo
  // escreveria: é com elas que se prova QUEM ele é (`vizinhancaConfirmada`).
  const provasPorChave = new Map<string, Set<string>>();
  for (const f of cruas) {
    const nome = displayArtist(f);
    if (!nome || nome === 'Unknown artist') continue;
    const k = chaveDeArtista(nome);
    const titulo = tituloNoLeitor(f);
    if (!k || !titulo) continue;
    const doArtista = provasPorChave.get(k) ?? new Set<string>();
    if (doArtista.size < PROVAS_POR_ARTISTA * 2) doArtista.add(titulo);
    provasPorChave.set(k, doArtista);
  }
  const provasDe = (k: string) => [...(provasPorChave.get(k) ?? [])];
  // No modo ESTRITO (Smart Shuffle e rádio) o retrato é só o que está a tocar
  // -- música que a pessoa escolheu --, e dispensa o crivo dos nomes: esse
  // existe para nomes lidos de títulos (o `999`), e aqui quem decide se o nome
  // é mesmo aquele artista é a `vizinhancaConfirmada`, com as músicas dele como
  // prova. Sem isto, um artista com uma música só na biblioteca (o Morad de
  // quem acabou de o descobrir na pesquisa) nunca servia de âncora, e o rádio
  // ia buscar o perfil geral (25/9).
  const retratoFiavel = contextoDaSessao === 'estrito'
    ? new Map(retrato)
    : new Map(apenasDeConfianca([...retrato], ([k]) => k, confianca));
  const apoioFiavel = new Map(
    apenasDeConfianca([...apoioDoPerfil], ([k]) => k, confianca),
  );
  vizinhos = apenasDeConfianca(vizinhos, (v) => v.chave, confianca);
  // Os confirmados FORA da biblioteca não passam por este crivo. Ele existe
  // para nomes lidos de TÍTULOS (o `999`), e estes não saíram de título
  // nenhum: vêm da API do Spotify ou de uma escolha feita no catálogo. Com uma
  // biblioteca pequena, o crivo tirava-os todos -- e sobrava a descoberta a
  // partir de um ou dois artistas, sempre os mesmos.
  for (const k of externos?.keys() ?? []) {
    const origem = contextoDaSessao ? apoioDoPerfil : retrato;
    const destino = contextoDaSessao ? apoioFiavel : retratoFiavel;
    const peso = origem.get(k);
    if (peso !== undefined && !destino.has(k)) destino.set(k, peso);
  }
  if (retratoFiavel.size === 0 && apoioFiavel.size === 0 && vizinhos.length === 0) return vazio;
  // OS PREFERIDOS ENTRAM, mesmo os que nao estao na biblioteca.
  //
  // O `artistWeight` MULTIPLICA o que ja la esta, e um artista que nunca se
  // guardou vale zero -- duas vezes e meia zero continua a ser zero. Sem esta
  // injeccao, dizer "mais destas" a uma descoberta nao fazia rigorosamente
  // nada, que e precisamente o caso que da sentido ao botao.
  //
  // A mesma decisao (e a mesma razao) das sementes do primeiro dia: uma
  // escolha explicita vale um artista que se ouve sem ser todos os dias, e o
  // peso faz o resto. Ver `lib/artistasSemente.ts`.
  for (const { chave, nome } of artistasPreferidos()) {
    const destino = contextoDaSessao ? apoioFiavel : retratoFiavel;
    if (!chave || destino.has(chave)) continue;
    destino.set(chave, Math.sqrt(ESCUTAS_DE_UM_PREFERIDO));
    if (nome) nomePorChave.set(chave, nome);
  }
  for (const [k,peso] of retratoFiavel) retratoFiavel.set(k,peso*artistWeight(nomePorChave.get(k)??k));
  for (const [k,peso] of apoioFiavel) apoioFiavel.set(k,peso*artistWeight(nomePorChave.get(k)??k));
  vizinhos=vizinhos.map(v=>({...v,pontos:v.pontos*artistWeight(nomePorChave.get(v.chave)??v.chave)})).sort((a,b)=>b.pontos-a.pontos);

  // A afinidade é indexada pela chave do CATÁLOGO, que é a que o
  // `ordenarPorGosto` usa para casar com os nomes que o Deezer devolve. Numa
  // sessão, perfil e playlists entram aqui como apoio, mas não no sorteio das
  // âncoras logo abaixo.
  const afinidade = new Map<string, number>();
  for (const [k, peso] of [...retratoFiavel, ...apoioFiavel]) {
    const chave = chaveDeCatalogo(nomePorChave.get(k) ?? k);
    afinidade.set(chave, Math.max(afinidade.get(chave) ?? 0, peso));
  }
  for (const v of vizinhos) {
    const k = chaveDeCatalogo(nomePorChave.get(v.chave) ?? v.chave);
    afinidade.set(k, Math.max(afinidade.get(k) ?? 0, v.pontos));
  }

  // O peso vai colado ao alvo: e ele que decide, la a frente, quantos lugares
  // da prateleira cabem a este lado do gosto (ver `repartir`).
  const pesoDe = (chave: string) =>
    retratoFiavel.get(chave) ?? apoioFiavel.get(chave)
      ?? vizinhos.find((v) => v.chave === chave)?.pontos ?? 1;
  if (pedidos) {
    // Confiança: o que passou o crivo acima, o que veio de fora, ou o que a
    // biblioteca confirma. Só sem informação nenhuma se deixa passar tudo.
    const fiaveis = (k: string) => retratoFiavel.has(k) || apoioFiavel.has(k)
      || !!externos?.has(k) || confianca.size === 0 || confianca.has(k);
    const alvos: Alvo[] = [];
    const vistos = new Set<string>();
    for (const nome of pedidos) {
      if (alvos.length >= quantosAlvos) break;
      const k = chaveDeArtista(nome);
      if (!k || vistos.has(k) || !fiaveis(k)) continue;
      vistos.add(k);
      alvos.push({ nome, peso: pesoDe(k), provas: provasDe(k) });
    }
    return { alvos, afinidade };
  }
  // Estrito e sem nenhum artista do que está a tocar em que se confie: nada.
  if (contextoDaSessao === 'estrito' && retratoFiavel.size === 0) return vazio;
  const soContexto = !!contextoDaSessao && retratoFiavel.size > 0;
  const retratoParaAlvos = soContexto
    ? retratoFiavel
    : new Map([...retratoFiavel, ...apoioFiavel]);
  const alvos = alvosDeProcura(retratoParaAlvos, soContexto ? [] : vizinhos, quantosAlvos)
    .map((chave) => ({ nome: nomePorChave.get(chave) ?? chave, peso: pesoDe(chave), provas: provasDe(chave) }))
    .filter((a) => a.nome);
  return { alvos, afinidade };
}


/** Quantas faixas uma âncora precisa de ter antes de valer a pena a rede. */
const VIZINHAS_QUE_CHEGAM = 8;
/** Por quantas âncoras se procura: as misturas que a página mostra. */
export const ANCORAS_DAS_MISTURAS = 6;
/** A própria âncora e dois semelhantes. Com um só, as faixas da âncora que já
 * estão na biblioteca deixavam a mistura abaixo do mínimo e iam à rede. */
const ARTISTAS_POR_ANCORA = 3;

export type DescobertasPorAncora = {
  /** Descobertas pela chave (`chaveDeArtista`) do artista que as trouxe. */
  vizinhas: Map<string, Track[]>;
  /** As âncoras que passaram o crivo, pela ordem pedida. É só a estas que o
   * remendo do YouTube pode acudir. */
  ancoras: string[];
};

/**
 * As descobertas agrupadas pelo artista do utilizador que as trouxe.
 *
 * É isto que faz uma mistura ser uma mistura e não uma lista: o âncora é
 * alguém que ele ouve, e o resto são vizinhos DESSE alguém -- não vizinhos de
 * toda a gente misturados num saco.
 *
 * **As âncoras são as da página.** Eram sorteadas do perfil e das playlists,
 * e a página pedia outros doze: metade das misturas ficava sem vizinhos e ia
 * pedir uma playlist ao YouTube, que custa quota da Data API (auditoria de
 * 16/9). Quem chama passa os artistas pela ordem em que os vai mostrar.
 */
export async function descobertasPorAncora(
  biblioteca: readonly Track[],
  pedidos: readonly string[],
  quantasAncoras = ANCORAS_DAS_MISTURAS,
): Promise<DescobertasPorAncora> {
  const vazio: DescobertasPorAncora = { vizinhas: new Map(), ancoras: [] };
  if (useConnectivity.getState().offline || pedidos.length === 0) return vazio;
  const porAncora = new Map<string, Track[]>();
  let ancoras: string[] = [];
  try {
    await feedbackReady();
    const toda = await bibliotecaInteira();
    const { escutas, externos } = await lerPerfilDeRecomendacoes();
    const { alvos, afinidade } = await escolherAlvos(
      biblioteca, quantasAncoras, escutas, externos, false, pedidos, toda,
    );
    ancoras = alvos.map((a) => a.nome);
    if (alvos.length === 0) return vazio;
    let daBiblioteca: ReadonlySet<string> = new Set();
    try {
      daBiblioteca = await getLibraryKeys();
    } catch {
      // segue sem este filtro, como a descoberta
    }
    const desejadas = await faixasParaProcurar(
      alvos, afinidade, ARTISTAS_POR_ANCORA, aSaltar(toda, new Set()),
    );
    await resolverDesejadas(
      desejadas, new Set(), new Set(), daBiblioteca,
      alvos.length * VIZINHAS_QUE_CHEGAM, porAncora, VIZINHAS_QUE_CHEGAM,
    );
  } catch {
    // Fica o que já se encontrou: as misturas saem com a biblioteca.
  }

  // A chave sai daqui NORMALIZADA, e é isto que faltava.
  //
  // Lá dentro o mapa é preenchido com o nome do artista tal como o catálogo o
  // deu, porque é o que a função tem à mão. Mas quem o lê -- as misturas e a
  // rede do YouTube -- procura pela chave normalizada. Duas chaves diferentes
  // no mesmo mapa: os vizinhos do catálogo nunca eram encontrados, a rede via
  // zero para toda a gente, e o YouTube passava a ser a FONTE em vez do
  // remendo. Exactamente ao contrário do que se queria.
  const vizinhas = new Map<string, Track[]>();
  for (const [nome, faixas] of porAncora) {
    const chave = chaveDeArtista(nome);
    if (!chave) continue;
    const jaLa = vizinhas.get(chave);
    const novas = filterSuggestions(faixas);
    if (jaLa) jaLa.push(...novas); else vizinhas.set(chave, novas);
  }
  return { vizinhas, ancoras };
}

/**
 * A rede: quando o catálogo não dá faixas vizinhas que cheguem, vai-se buscar
 * uma playlist do artista ao YouTube.
 *
 * Não é a fonte, é o remendo -- e a diferença importa. A mistura a sério sai
 * do catálogo, que sabe quem se parece com quem; o primeiro resultado de uma
 * pesquisa no YouTube é uma lotaria e pode ser uma compilação de dez horas ou
 * um `type beat`. A playlist serve apenas para encontrar vídeos: cada um tem
 * ainda de ser de um artista que o Deezer relaciona com a âncora, de casar com
 * uma faixa concreta do catálogo pelo `pickBest` e de trazer daí a duração.
 * Sem essa prova, não entra e a mistura fica mais curta.
 *
 * Preenche o mapa que recebe em vez de devolver outro: quem chama já o tem, e
 * duas fontes na mesma prateleira devem acabar no mesmo sítio.
 */
export async function taparBuracosComOYouTube(
  ancoras: readonly string[],
  vizinhas: Map<string, Track[]>,
  chaveDoNome: (nome: string) => string,
): Promise<void> {
  if (useConnectivity.getState().offline) return;
  for (const nome of ancoras) {
    const chave = chaveDoNome(nome);
    if ((vizinhas.get(chave)?.length ?? 0) >= VIZINHAS_QUE_CHEGAM) continue;
    try {
      const achadas = await searchYouTubePlaylists(`${nome} playlist`, 1);
      const primeira = achadas[0];
      if (!primeira) continue;
      const lista = await fetchYouTubePlaylistById(primeira.id);
      // A decisão da descoberta, se já houve: sem isto, este caminho ia outra
      // vez ao homónimo de mais fãs que a `vizinhancaConfirmada` recusou.
      const decidida = vizinhancaJaDecidida(nome);
      const vizinhanca = decidida !== undefined ? decidida : await vizinhancaDe(nome);
      if (!vizinhanca) continue;

      // O nome extraído não chega para provar afinidade: a única lista
      // permitida é a âncora e os semelhantes que o catálogo devolveu para
      // ela. O ponto 2 da auditoria tornou explícito que uma faixa nova do
      // próprio artista também é descoberta.
      const artistasPermitidos = new Map(
        [vizinhanca.artista, ...vizinhanca.semelhantes]
          .map((a) => [chaveDeCatalogo(a.nome), a] as const),
      );
      const itensPorArtista = new Map<string, typeof lista.items>();
      for (const item of lista.items) {
        const artista = extractArtist(item.title, item.channel || null);
        const chaveDoArtista = chaveDeCatalogo(artista ?? '');
        if (!artistasPermitidos.has(chaveDoArtista)) continue;
        const itens = itensPorArtista.get(chaveDoArtista);
        if (itens) itens.push(item); else itensPorArtista.set(chaveDoArtista, [item]);
      }

      const jaLa = vizinhas.get(chave) ?? [];
      const faltam = Math.max(0, VIZINHAS_QUE_CHEGAM - jaLa.length);
      const usadas = new Set(jaLa.map(trackKey));
      const faixas: Track[] = [];
      for (const [chaveDoArtista, itens] of itensPorArtista) {
        if (faixas.length >= faltam) break;
        const artista = artistasPermitidos.get(chaveDoArtista);
        if (!artista) continue;
        const catalogo = await topDoArtista(artista.id, 5);
        for (const alvo of catalogo) {
          if (faixas.length >= faltam) break;
          const { best, confident } = pickBest(
            itens.map((i) => ({
              id: i.videoId,
              title: i.title,
              channel: i.channel || '',
              durationSec: null,
            })),
            { title: alvo.titulo, artist: alvo.artista, durationSec: alvo.duracaoS },
          );
          if (!best || !confident) continue;
          const item = itens.find((i) => i.videoId === best.id);
          if (!item) continue;
          const faixa: Track = {
            source: 'youtube',
            sourceId: item.videoId,
            title: item.title,
            artist: alvo.artista,
            album: null,
            artworkUrl: item.thumbnail,
            durationSeconds: alvo.duracaoS,
          };
          const identidade = trackKey(faixa);
          if (!identidade || usadas.has(identidade)) continue;
          if (!pareceMusica(faixa) || trackIsSuppressed(faixa)) continue;
          usadas.add(identidade);
          faixas.push(faixa);
        }
      }
      if (faixas.length === 0) continue;
      vizinhas.set(chave, [...jaLa, ...filterSuggestions(faixas)]);
    } catch {
      // Uma âncora sem rede não estraga as outras: a mistura dela sai mais
      // curta, como saía antes de isto existir.
    }
  }
}
