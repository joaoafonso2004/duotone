import { getLibraryKeys } from './library';
import { searchYouTube } from './youtube';
import { displayArtist } from '../lib/artistName';
import { trackKey } from '../lib/shuffle';
import type { Track } from '../types';

/**
 * Candidatas para o shuffle inteligente: música que o utilizador **não tem**.
 *
 * Isto existe porque o shuffle inteligente estava a ser alimentado pelo rádio
 * (`api/radio.ts`), e o rádio foi feito para outra coisa: continuar a tocar
 * quando a fila acaba. A primeira fonte dele é a PRÓPRIA biblioteca filtrada
 * pelos artistas do momento — o que para o rádio é bom (é música garantidamente
 * do gosto dele) e para descobrir é inútil, porque já é dele.
 *
 * O sintoma que isso deu: uma sugestão à primeira e mais nenhuma. As mesmas
 * sementes devolviam as mesmas faixas, todas já na fila ou já sugeridas, e o
 * modo calava-se sem dizer porquê.
 *
 * Aqui a ordem é ao contrário: procura-se FORA, e o que é do utilizador é
 * excluído em vez de preferido.
 *
 * **Isto ainda não é o algoritmo de afinidade.** É a versão que faz a
 * funcionalidade funcionar: pesquisa por um artista do contexto e fica pelo que
 * é novo. O que falta — cruzar artistas, pesar co-ocorrência nas playlists,
 * servir também as recomendações da Pesquisa — está no plano e é outro
 * trabalho.
 */

/** Quantas candidatas pedir. Chegam poucas: só se usa uma de cada vez. */
const QUANTAS = 12;

export async function candidatasParaDescoberta(
  contexto: readonly Track[],
  jaNaFila: ReadonlySet<string>,
  jaSugeridas: ReadonlySet<string>,
): Promise<Track[]> {
  const artista = artistaDoContexto(contexto);
  if (!artista) return [];

  // Uma só pesquisa, e o `searchYouTube` guarda em cache sete dias — a segunda
  // vez pelo mesmo artista não gasta quota nenhuma.
  const achadas = await searchYouTube(artista);
  if (achadas.length === 0) return [];

  // O que ele já tem fica de fora: é isso que separa "descobrir" de "repetir".
  // Falhar a ler a biblioteca não pode impedir a sugestão — no pior caso
  // sugere-se algo que ele ja tinha, o que e menos mau do que nao sugerir.
  let daBiblioteca: ReadonlySet<string> = new Set();
  try {
    daBiblioteca = await getLibraryKeys();
  } catch {
    // segue sem este filtro
  }

  const saida: Track[] = [];
  for (const t of achadas) {
    const k = trackKey(t);
    if (!k || jaNaFila.has(k) || jaSugeridas.has(k) || daBiblioteca.has(k)) continue;
    saida.push(t);
    if (saida.length >= QUANTAS) break;
  }
  return saida;
}

/**
 * Por que artista se procura.
 *
 * **Aleatório entre os do contexto, e não o da última faixa.** Com o último a
 * mandar, uma sessão inteira de Juice WRLD só traz Juice WRLD, e ao fim de
 * duas sugestões a pesquisa está esgotada — que é metade do problema de agora.
 * Escolhendo ao acaso entre os que estão a tocar, cada sugestão parte de outro
 * sítio e o poço demora muito mais a secar.
 */
function artistaDoContexto(contexto: readonly Track[]): string | null {
  const nomes = new Set<string>();
  for (const t of contexto) {
    const nome = displayArtist(t);
    if (nome && nome !== 'Unknown artist') nomes.add(nome);
  }
  const lista = [...nomes];
  if (lista.length === 0) return null;
  return lista[Math.floor(Math.random() * lista.length)];
}
