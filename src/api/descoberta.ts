import { getLibraryKeys } from './library';
import { paresDeArtistaEPlaylist } from './afinidade';
import { searchYouTube } from './youtube';
import { chaveDeArtista, displayArtist } from '../lib/artistName';
import {
  alvosDeProcura, artistasVizinhos, retratoDoContexto, vizinhosPorPlaylist,
} from '../lib/afinidade';
import { trackKey } from '../lib/shuffle';
import type { Track } from '../types';

/**
 * Candidatas para o shuffle inteligente: música que o utilizador **não tem**,
 * escolhida por se parecer com o que está a ouvir.
 *
 * **Porque é que isto existe à parte do rádio.** O shuffle inteligente estava
 * a ser alimentado pelo `api/radio.ts`, e o rádio foi feito para o contrário:
 * continuar a tocar quando a fila acaba. A primeira fonte dele é a PRÓPRIA
 * biblioteca filtrada pelos artistas do momento — para o rádio isso é bom,
 * para descobrir é inútil, porque já é dele. O sintoma foi uma sugestão à
 * primeira e mais nenhuma.
 *
 * **Como se decide o que é "relacionado".** Ver `lib/afinidade.ts`: não há
 * géneros nem características de áudio nestas faixas, e o sinal que existe é o
 * artista. A partir dele, dois artistas que aparecem nas mesmas playlists
 * estão relacionados *para esta pessoa* — o que aqui vale mais do que uma
 * verdade geral sobre música.
 */

/** Quantas candidatas devolver. Chegam poucas: usa-se uma de cada vez. */
const QUANTAS = 12;
/** Quantos artistas tentar antes de desistir. Cada um é uma pesquisa, e o
 * `searchYouTube` guarda em cache sete dias — mas a quota é diária. */
const ALVOS = 2;

export async function candidatasParaDescoberta(
  contexto: readonly Track[],
  jaNaFila: ReadonlySet<string>,
  jaSugeridas: ReadonlySet<string>,
): Promise<Track[]> {
  const alvos = await escolherAlvos(contexto);
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

  const saida: Track[] = [];
  for (const alvo of alvos) {
    let achadas: Track[] = [];
    try {
      achadas = await searchYouTube(alvo);
    } catch {
      continue; // sem rede ou sem quota: tenta o alvo seguinte
    }
    for (const t of achadas) {
      const k = trackKey(t);
      if (!k || jaNaFila.has(k) || jaSugeridas.has(k) || daBiblioteca.has(k)) continue;
      saida.push(t);
      if (saida.length >= QUANTAS) return saida;
    }
  }
  return saida;
}

/**
 * Por que artistas procurar.
 *
 * Primeiro tenta os VIZINHOS — quem partilha playlists com os artistas que
 * estão a tocar. É isso que faz a sugestão parecer-se com a playlist e não com
 * uma faixa dela.
 *
 * Se não houver co-ocorrência nenhuma (uma biblioteca sem playlists, ou a
 * consulta a falhar), cai nos próprios artistas do contexto. Sem essa rede o
 * modo ficava mudo — que foi exatamente o defeito anterior.
 */
async function escolherAlvos(contexto: readonly Track[]): Promise<string[]> {
  const doContexto = contexto
    .map((t) => ({ artista: displayArtist(t) }))
    .filter((f) => f.artista && f.artista !== 'Unknown artist');
  if (doContexto.length === 0) return [];

  const retrato = retratoDoContexto(doContexto, chaveDeArtista);
  if (retrato.size === 0) return [];

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

  return alvosDeProcura(retrato, vizinhos, ALVOS)
    .map((chave) => nomePorChave.get(chave) ?? chave)
    .filter(Boolean);
}
