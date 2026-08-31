import { getLibraryKeys } from './library';
import { getHeavyRotation } from './plays';
import { paresDeArtistaEPlaylist } from './afinidade';
import { topDoArtista, vizinhancaDe, type FaixaDoCatalogo } from './catalogo';
import { searchYouTubeFreeWithChannel } from './ytSearchFree';
import { chaveDeArtista, displayArtist } from '../lib/artistName';
import {
  alvosDeProcura, artistasVizinhos, retratoDoContexto, vizinhosPorPlaylist,
} from '../lib/afinidade';
import { chaveDeCatalogo, ordenarPorGosto, type ArtistaDoCatalogo } from '../lib/catalogo';
import { pareceMusica } from '../lib/musica';
import { pickBest } from '../lib/trackMatch';
import { trackKey } from '../lib/shuffle';
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

/** Quantas candidatas devolver. */
const QUANTAS = 12;
/** Por quantos artistas do utilizador começar. Cada um dá até 25 semelhantes. */
const ALVOS = 2;
/** Quantos semelhantes usar. Mais do que isto e já não se parecem com nada. */
const SEMELHANTES = 6;
/** Faixas a pedir por artista semelhante. */
const FAIXAS_POR_ARTISTA = 4;
/** Procuras em paralelo. Sequencial demorava demasiado; todas de uma vez é
 * pouco simpático para o YouTube. */
const EM_PARALELO = 4;

export async function candidatasParaDescoberta(
  contexto: readonly Track[],
  jaNaFila: ReadonlySet<string>,
  jaSugeridas: ReadonlySet<string>,
  quantas: number = QUANTAS,
  quantosAlvos: number = ALVOS,
): Promise<Track[]> {
  const { alvos, afinidade } = await escolherAlvos(contexto, quantosAlvos);
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

  const desejadas = await faixasParaProcurar(alvos, afinidade, contexto);
  if (desejadas.length === 0) return [];

  const saida: Track[] = [];
  const vistas = new Set<string>();
  for (let i = 0; i < desejadas.length && saida.length < quantas; i += EM_PARALELO) {
    const lote = desejadas.slice(i, i + EM_PARALELO);
    const achadas = await Promise.all(lote.map(procurarNoYouTube));
    for (const t of achadas) {
      if (!t) continue;
      const k = trackKey(t);
      if (!k || vistas.has(k)) continue;
      if (jaNaFila.has(k) || jaSugeridas.has(k) || daBiblioteca.has(k)) continue;
      // Rede de segurança: o `pickBest` já rejeita quase tudo o que não é a
      // faixa pedida, mas isto não custa nada e apanha o resto.
      if (!pareceMusica(t)) continue;
      vistas.add(k);
      saida.push(t);
      if (saida.length >= quantas) break;
    }
  }
  return saida;
}

/**
 * Que faixas concretas ir procurar, por ordem de interesse.
 *
 * Os artistas do utilizador servem de ponto de partida e ficam de fora do
 * resultado: procura-se ao lado, não no meio. Se nenhum deles resolver no
 * catálogo — sem rede, ou nomes que não são artistas — isto devolve vazio, e a
 * descoberta fica calada em vez de dizer disparates.
 */
async function faixasParaProcurar(
  alvos: readonly string[],
  afinidade: ReadonlyMap<string, number>,
  contexto: readonly Track[],
): Promise<FaixaDoCatalogo[]> {
  // Quem ele já ouve não é descoberta. Inclui os alvos e todo o contexto,
  // porque o catálogo devolve muitas vezes os artistas uns dos outros.
  const jaOuve = new Set<string>();
  for (const nome of alvos) jaOuve.add(chaveDeCatalogo(nome));
  for (const t of contexto) {
    const nome = displayArtist(t);
    if (nome) jaOuve.add(chaveDeCatalogo(nome));
  }

  // Uma lista POR ALVO, e não todas num saco: juntá-las fazia com que o
  // segundo alvo ficasse sempre atrás do primeiro, e as sugestões saíam todas
  // do mesmo lado. Ver `ordenarPorGosto`.
  const listas: ArtistaDoCatalogo[][] = [];
  for (const alvo of alvos) {
    const vizinhanca = await vizinhancaDe(alvo);
    if (!vizinhanca) continue; // não é um artista, ou o catálogo não respondeu
    if (vizinhanca.semelhantes.length > 0) listas.push(vizinhanca.semelhantes);
  }
  if (listas.length === 0) return [];

  const escolhidos = ordenarPorGosto(listas, afinidade, jaOuve).slice(0, SEMELHANTES);

  const porArtista: FaixaDoCatalogo[][] = [];
  for (const artista of escolhidos) {
    const top = await topDoArtista(artista.id, FAIXAS_POR_ARTISTA);
    if (top.length > 0) porArtista.push(top);
  }

  // Uma faixa de cada artista antes da segunda de qualquer um: senão a
  // prateleira enchia-se com quatro do mesmo e parecia um álbum.
  const faixas: FaixaDoCatalogo[] = [];
  for (let i = 0; i < FAIXAS_POR_ARTISTA; i++) {
    for (const doArtista of porArtista) {
      const f = doArtista[i];
      if (f) faixas.push(f);
    }
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
async function procurarNoYouTube(faixa: FaixaDoCatalogo): Promise<Track | null> {
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
  // O artista passa a ser o do catálogo e não o que se adivinha do título: é o
  // nome certo, e é o que a biblioteca vai guardar se ele gostar da faixa.
  return { ...escolhida.track, artist: faixa.artista };
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
export async function descobrirNovas(
  limite: number,
  biblioteca: readonly Track[],
): Promise<Track[]> {
  const contexto = biblioteca.slice(0, 60);
  return candidatasParaDescoberta(contexto, new Set(), new Set(), limite, 4)
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
  const novas = await candidatasParaDescoberta(biblioteca, jaLa, new Set())
    .catch(() => [] as Track[]);

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
  return saida;
}

/**
 * Por que artistas começar, e o mapa de afinidade que ordena o resto.
 *
 * Primeiro os VIZINHOS — quem partilha playlists com os artistas que estão a
 * tocar. Se não houver co-ocorrência nenhuma (uma biblioteca sem playlists, ou
 * a consulta a falhar), caem-se nos próprios artistas do contexto: sem essa
 * rede o modo ficava mudo, que já foi um defeito real.
 *
 * A afinidade sai daqui em vez de ser recalculada, porque é a mesma conta: o
 * catálogo vai propor semelhantes e é este mapa que diz quais deles têm que ver
 * com o que ele ouve.
 */
async function escolherAlvos(
  contexto: readonly Track[],
  quantosAlvos: number = ALVOS,
): Promise<{ alvos: string[]; afinidade: Map<string, number> }> {
  const vazio = { alvos: [] as string[], afinidade: new Map<string, number>() };

  const doContexto = contexto
    .map((t) => ({ artista: displayArtist(t) }))
    .filter((f) => f.artista && f.artista !== 'Unknown artist');
  if (doContexto.length === 0) return vazio;

  const retrato = retratoDoContexto(doContexto, chaveDeArtista);
  if (retrato.size === 0) return vazio;

  // As chaves são canónicas (minúsculas, sem pontuação) e não servem para
  // pesquisar. Guarda-se por onde se passa o nome como está escrito.
  const nomePorChave = new Map<string, string>();
  for (const t of contexto) {
    const nome = displayArtist(t);
    if (nome) nomePorChave.set(chaveDeArtista(nome), nome);
  }

  let vizinhos: ReturnType<typeof artistasVizinhos> = [];
  try {
    const pares = await paresDeArtistaEPlaylist();
    // Os vizinhos NÃO estão no contexto, por isso os nomes deles só existem
    // aqui. Sem isto pesquisava-se pela chave — "juice wrld" em vez de
    // "Juice WRLD" — que resulta, mas por acaso.
    for (const p of pares) nomePorChave.set(chaveDeArtista(p.artista), p.artista);
    vizinhos = artistasVizinhos(retrato, vizinhosPorPlaylist(pares, chaveDeArtista));
  } catch {
    // sem co-ocorrência: fica a rede de segurança
  }

  // A afinidade é indexada pela chave do CATÁLOGO, que é a que o
  // `ordenarPorGosto` usa para casar com os nomes que o Deezer devolve.
  const afinidade = new Map<string, number>();
  for (const [k, peso] of retrato) {
    afinidade.set(chaveDeCatalogo(nomePorChave.get(k) ?? k), peso);
  }
  for (const v of vizinhos) {
    const k = chaveDeCatalogo(nomePorChave.get(v.chave) ?? v.chave);
    afinidade.set(k, Math.max(afinidade.get(k) ?? 0, v.pontos));
  }

  const alvos = alvosDeProcura(retrato, vizinhos, quantosAlvos)
    .map((chave) => nomePorChave.get(chave) ?? chave)
    .filter(Boolean);
  return { alvos, afinidade };
}
