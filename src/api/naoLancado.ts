import { agruparPorArtista, chaveDeArtista } from '../lib/artistName';
import { aceitarDoYouTube, porOuvir, type FaixaDoTracker } from '../lib/tracker';
import { ABAS_CURADAS, faixasDoArtista, trackerDoArtista } from './trackers';
import { procurarNoYouTube } from './descoberta';
import { getTopArtists } from './plays';
import type { Track } from '../types';

/**
 * "Nunca lançado": a prateleira do segundo catálogo, já pronta a tocar.
 *
 * **O que a distingue do "Discover new", que está mesmo ao lado.** Esse
 * pergunta ao catálogo pelas faixas mais ouvidas de artistas VIZINHOS dos
 * teus — e um catálogo, por construção, só sabe de música que saiu. Esta sabe
 * o que os artistas que TU JÁ OUVES nunca lançaram. Um vai para fora e para o
 * lançado; a outra vai para dentro e para o que não existe em catálogo nenhum.
 *
 * **Porque é que isto não é uma lista de nomes.** A primeira versão mostrava os
 * títulos do tracker e deixava a procura para quem lesse. Isso obriga a pessoa
 * a trabalhar, e uma prateleira de texto ao lado de prateleiras de capas é um
 * corpo estranho. Aqui cada nome é resolvido numa FAIXA a sério -- pelo mesmo
 * `procurarNoYouTube` que o "Discover new" usa, com o `pickBest` a confirmar
 * que o vídeo é mesmo aquele. O que não se confirma não entra.
 *
 * Falha em silêncio de ponta a ponta: sem trackers para os teus artistas, sem
 * rede, ou sem nada que se confirme, a prateleira não aparece. Nunca deixa uma
 * excepção subir para o carregamento das outras.
 */

/** Quantos artistas se sondam por carregamento. Cada um é uma folha a descer. */
const ARTISTAS = 3;
/**
 * Quantas faixas se tentam por artista.
 *
 * Mais do que as que se querem, porque nem todas se confirmam: medido em três
 * trackers, sete em cada quinze passam a porta do `aceitarDoYouTube`. As que
 * não passam são as que valem: type beats com o nome do artista no título, e
 * outra música qualquer cuja duração calhou.
 */
const POR_ARTISTA = 10;
/** Procuras em paralelo. O mesmo que a descoberta usa. */
const EM_PARALELO = 4;

/**
 * Os artistas por onde começar, do mais ouvido para o menos.
 *
 * O histórico manda, e a biblioteca é a rede de segurança: uma conta acabada
 * de criar não tem histórico nenhum, mas pode ter acabado de importar mil
 * faixas.
 */
async function artistasDeInteresse(biblioteca: readonly Track[]): Promise<string[]> {
  const nomes: string[] = [];
  const vistos = new Set<string>();
  const juntar = (nome: string | null | undefined) => {
    const k = chaveDeArtista(nome);
    if (!nome || !k || vistos.has(k)) return;
    vistos.add(k);
    nomes.push(nome);
  };

  try {
    for (const a of await getTopArtists(20)) if (a.plays > 0) juntar(a.name);
  } catch {
    // sem histórico: fica a biblioteca
  }
  for (const g of agruparPorArtista(biblioteca).slice(0, 20)) juntar(g.nome);
  return nomes;
}

/** As faixas do tracker de um artista que ele ainda não tem. */
async function faltamDeste(
  nome: string,
  biblioteca: readonly Track[],
): Promise<FaixaDoTracker[]> {
  const artista = await trackerDoArtista(nome);
  if (!artista) return [];
  const doTracker = await faixasDoArtista(artista.folha, ABAS_CURADAS);
  if (doTracker.length === 0) return [];

  const alvo = chaveDeArtista(nome);
  const dele = biblioteca.filter((t) => chaveDeArtista(t.artist) === alvo);
  return porOuvir(doTracker, dele.map((t) => ({
    titulo: t.title, duracaoSegundos: t.durationSeconds,
  })));
}

export async function nuncaLancadas(
  limite: number,
  biblioteca: readonly Track[],
): Promise<Track[]> {
  const nomes = await artistasDeInteresse(biblioteca);
  if (nomes.length === 0) return [];

  // Uma lista intercalada, e não os seis do primeiro artista seguidos: uma
  // prateleira que é toda do mesmo não parece uma descoberta, parece um erro.
  const porArtista: { artista: string; faixas: FaixaDoTracker[] }[] = [];
  for (const nome of nomes) {
    if (porArtista.length >= ARTISTAS) break;
    const faixas = await faltamDeste(nome, biblioteca);
    if (faixas.length > 0) porArtista.push({ artista: nome, faixas: faixas.slice(0, POR_ARTISTA) });
  }
  if (porArtista.length === 0) return [];

  const pedidos: { artista: string; faixa: FaixaDoTracker }[] = [];
  for (let i = 0; i < POR_ARTISTA; i++) {
    for (const { artista, faixas } of porArtista) {
      const f = faixas[i];
      if (f) pedidos.push({ artista, faixa: f });
    }
  }

  const saida: Track[] = [];
  const vistas = new Set<string>();
  for (let i = 0; i < pedidos.length && saida.length < limite; i += EM_PARALELO) {
    const lote = pedidos.slice(i, i + EM_PARALELO);
    const achadas = await Promise.all(lote.map(({ artista, faixa }) => procurarNoYouTube(
      { artista, titulo: faixa.titulo, duracaoS: faixa.duracaoSegundos },
      // A porta. Sem ela a prateleira enchia-se de type beats -- ver a nota
      // em `aceitarDoYouTube`.
      (candidato) => aceitarDoYouTube(faixa, candidato),
    ).catch(() => null)));
    for (const t of achadas) {
      if (!t || vistas.has(t.sourceId)) continue;
      vistas.add(t.sourceId);
      saida.push(t);
      if (saida.length >= limite) break;
    }
  }
  return saida;
}
