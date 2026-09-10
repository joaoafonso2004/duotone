import { agruparPorArtista, chaveDeArtista, displayArtist } from '../lib/artistName';
import {
  aceitarDoYouTube, chaveDaMusica, crivoDeNovidade, porOuvir, type FaixaDoTracker, type FaixaGuardada,
} from '../lib/tracker';
import { ABAS_CURADAS, faixasDoArtista, trackerDoArtista } from './trackers';
import { procurarNoYouTube } from './descoberta';
import { getProfileRecentlyPlayed, getTopArtists } from './plays';
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
 *
 * **"New to you" é uma promessa, e cumpre-se em dois crivos.** Antes de ir ao
 * YouTube, pelo TÍTULO (`porOuvir`): sai o que já tens, o que ouviste há pouco
 * e o que ocultaste, em qualquer versão. Depois, pelo UPLOAD e pela música
 * (`crivoDeNovidade`): sai o vídeo exato que já conheces, e a prateleira não
 * mostra duas versões da mesma música. Só excluía as guardadas, e uma faixa
 * ouvida ontem voltava aqui como descoberta.
 */

/**
 * Quanto do histórico conta como "já ouvida".
 *
 * Músicas DISTINTAS, não reproduções: o `get_profile_recently_played` agrega
 * por faixa. Trezentas cobrem semanas de escuta, e é uma leitura de uma tabela
 * já agregada, por isso não pesa.
 */
const HISTORICO_RECENTE = 300;

/** Uma faixa que já se conhece, venha ela da biblioteca, do histórico ou das ocultadas. */
type Conhecida = {
  id: string;
  titulo: string;
  duracaoSegundos: number | null;
  /** Chaves de artista por onde esta faixa pode ser do artista em causa. Vazio = de qualquer um. */
  artistas: string[];
};

function conhecidaDaFaixa(t: {
  source: string; sourceId: string; title: string; artist: string | null; durationSeconds: number | null;
}): Conhecida {
  // O canal e o artista que o título diz: o `artist` de uma faixa do YouTube é
  // muitas vezes o canal, e é pelo título que o nome verdadeiro aparece.
  const artistas = [chaveDeArtista(t.artist), chaveDeArtista(displayArtist(t as Track))].filter(Boolean) as string[];
  return { id: `${t.source}:${t.sourceId}`, titulo: t.title, duracaoSegundos: t.durationSeconds, artistas };
}

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

/** As faixas do tracker de um artista que ele ainda não conhece. */
async function faltamDeste(
  nome: string,
  conhecidas: readonly Conhecida[],
): Promise<FaixaDoTracker[]> {
  const artista = await trackerDoArtista(nome);
  if (!artista) return [];
  const doTracker = await faixasDoArtista(artista.folha, ABAS_CURADAS);
  if (doTracker.length === 0) return [];

  const alvo = chaveDeArtista(nome);
  // As ocultadas não trazem artista (só o título que tinham), por isso contam
  // para todos: esconder de mais custa uma sugestão, e é o erro barato.
  const dele: FaixaGuardada[] = conhecidas
    .filter((c) => c.artistas.length === 0 || c.artistas.includes(alvo))
    .map((c) => ({ titulo: c.titulo, duracaoSegundos: c.duracaoSegundos }));
  return porOuvir(doTracker, dele);
}

export async function nuncaLancadas(
  limite: number,
  biblioteca: readonly Track[],
  /** As ocultadas nas sugestões ("não recomendar esta"): `source:sourceId` e o título. */
  ocultadas: readonly { key: string; label: string }[] = [],
): Promise<Track[]> {
  const nomes = await artistasDeInteresse(biblioteca);
  if (nomes.length === 0) return [];

  // Sem histórico (sem rede, conta nova) segue-se com o resto: um crivo mais
  // curto é melhor do que prateleira nenhuma.
  const recentes = await getProfileRecentlyPlayed(HISTORICO_RECENTE).catch(() => []);
  const conhecidas: Conhecida[] = [
    ...biblioteca.map(conhecidaDaFaixa),
    ...recentes.map((r) => conhecidaDaFaixa({ ...r, artist: r.artist ?? null })),
    ...ocultadas.map((o) => ({ id: o.key, titulo: o.label, duracaoSegundos: null, artistas: [] })),
  ];

  // Uma lista intercalada, e não os seis do primeiro artista seguidos: uma
  // prateleira que é toda do mesmo não parece uma descoberta, parece um erro.
  const porArtista: { artista: string; faixas: FaixaDoTracker[] }[] = [];
  for (const nome of nomes) {
    if (porArtista.length >= ARTISTAS) break;
    const faixas = await faltamDeste(nome, conhecidas);
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
  const passa = crivoDeNovidade(conhecidas.map((c) => c.id));
  for (let i = 0; i < pedidos.length && saida.length < limite; i += EM_PARALELO) {
    const lote = pedidos.slice(i, i + EM_PARALELO);
    const achadas = await Promise.all(lote.map(({ artista, faixa }) => procurarNoYouTube(
      { artista, titulo: faixa.titulo, duracaoS: faixa.duracaoSegundos },
      // A porta. Sem ela a prateleira enchia-se de type beats -- ver a nota
      // em `aceitarDoYouTube`.
      (candidato) => aceitarDoYouTube(faixa, candidato),
    ).catch(() => null)));
    achadas.forEach((t, n) => {
      if (!t || saida.length >= limite) return;
      // A música pelo título da FOLHA, que é limpo; o do YouTube traz o canal,
      // "(unreleased)" e o resto do caos.
      const { artista, faixa } = lote[n];
      if (passa(`${t.source}:${t.sourceId}`, chaveDaMusica(chaveDeArtista(artista) ?? '', faixa.titulo))) saida.push(t);
    });
  }
  return saida;
}
