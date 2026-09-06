import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConnectivity } from '../state/connectivity';
import { chaveDeArtista } from '../lib/artistName';
import { parseCsv } from '../lib/spotifyCsv';
import { ABAS_PREFERIDAS, faixasDoTracker, type FaixaDoTracker } from '../lib/tracker';

/**
 * A ponte para os *trackers* da comunidade — o segundo catálogo.
 *
 * O que decide vive todo em `lib/tracker.ts`. Aqui é só transporte: ir buscar
 * o índice de artistas, ir buscar uma folha, e não deixar que nada disto
 * estrague o que já funciona.
 *
 * **Três regras, e nenhuma é negociável.**
 *
 * 1. É um projeto de comunidade, sem licença declarada e sem limites de uso
 *    documentados. Pode desaparecer amanhã. Portanto tudo aqui falha em
 *    silêncio e devolve vazio — nunca uma excepção que suba.
 * 2. Nada disto entra no caminho da reprodução. Só é chamado por um ecrã que
 *    a pessoa abriu de propósito.
 * 3. O campo `links` das folhas aponta para alojadores de terceiros e é
 *    IGNORADO. O que se importa são metadados; para ouvir, a app procura no
 *    YouTube como já faz para tudo o resto.
 */

const INDICE = 'https://artists.artistgrid.cx/artists.csv';
const API = 'https://trackerapi.artistgrid.cx';

/** Uma folha grande são umas dezenas de KB, e isto corre em dados móveis. */
const ESPERA_MS = 12_000;
const CHAVE_DO_INDICE = 'tracker:indice';
/** O índice muda devagar — artistas novos, não faixas. Um dia chega. */
const VALIDADE_DO_INDICE_MS = 24 * 60 * 60 * 1000;

export interface ArtistaComTracker {
  nome: string;
  /** O id da folha de cálculo, que é o que a API usa. */
  folha: string;
  /** A comunidade marcou esta como a melhor para este artista. */
  melhor: boolean;
}

async function pedir(url: string): Promise<Response | null> {
  if (useConnectivity.getState().offline) return null;
  try {
    const corte = new AbortController();
    const t = setTimeout(() => corte.abort(), ESPERA_MS);
    const r = await fetch(url, { signal: corte.signal });
    clearTimeout(t);
    return r.ok ? r : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// O índice: 573 artistas, ~50 KB
// ---------------------------------------------------------------------------

let indiceEmMemoria: Map<string, ArtistaComTracker> | null = null;

/** Da tabela para o mapa, pela chave canónica do artista. */
function lerIndice(csv: string): Map<string, ArtistaComTracker> {
  const mapa = new Map<string, ArtistaComTracker>();
  const linhas = parseCsv(csv);
  if (linhas.length < 2) return mapa;

  const cabecalho = linhas[0].map((c) => c.trim().toLowerCase());
  const iNome = cabecalho.indexOf('name');
  const iUrl = cabecalho.indexOf('url');
  const iMelhor = cabecalho.indexOf('best');
  if (iNome < 0 || iUrl < 0) return mapa;

  for (const l of linhas.slice(1)) {
    const nome = (l[iNome] ?? '').trim();
    const folha = (l[iUrl] ?? '').trim();
    if (!nome || !folha) continue;
    const chave = chaveDeArtista(nome);
    if (!chave) continue;
    const entrada: ArtistaComTracker = {
      nome,
      folha,
      melhor: iMelhor >= 0 && (l[iMelhor] ?? '').trim().toLowerCase() === 'true',
    };
    // A mesma pessoa tem várias folhas -- `Playboi Carti`, `Playboi Carti
    // [Alt]`, `Playboi Carti Fit Pics`. A chave canónica separa-as, e entre
    // duas com a MESMA chave fica a que a comunidade marcou como melhor.
    const jaLa = mapa.get(chave);
    if (!jaLa || (entrada.melhor && !jaLa.melhor)) mapa.set(chave, entrada);
  }
  return mapa;
}

async function indice(): Promise<Map<string, ArtistaComTracker>> {
  if (indiceEmMemoria) return indiceEmMemoria;

  try {
    const cru = await AsyncStorage.getItem(CHAVE_DO_INDICE);
    if (cru) {
      const { em, csv } = JSON.parse(cru);
      if (typeof em === 'number' && Date.now() - em < VALIDADE_DO_INDICE_MS && typeof csv === 'string') {
        indiceEmMemoria = lerIndice(csv);
        return indiceEmMemoria;
      }
    }
  } catch {
    // Cache ilegível: vai-se à rede, que é o caminho normal.
  }

  const r = await pedir(INDICE);
  if (!r) return indiceEmMemoria ?? new Map();
  try {
    const csv = await r.text();
    indiceEmMemoria = lerIndice(csv);
    AsyncStorage.setItem(CHAVE_DO_INDICE, JSON.stringify({ em: Date.now(), csv })).catch(() => {});
    return indiceEmMemoria;
  } catch {
    return new Map();
  }
}

/** Há tracker para este artista? O nome vem como a app o mostra. */
export async function trackerDoArtista(nome: string): Promise<ArtistaComTracker | null> {
  const chave = chaveDeArtista(nome);
  if (!chave) return null;
  return (await indice()).get(chave) ?? null;
}

// ---------------------------------------------------------------------------
// As faixas de um artista
// ---------------------------------------------------------------------------

/**
 * As abas que a comunidade curou.
 *
 * O `main` traz tudo e pode ser enorme -- o do Chief Keef são 664 KB. Para uma
 * prateleira que carrega sozinha ao abrir a app, e em dados móveis, isso não
 * se faz. E o `best` é melhor pergunta na mesma: «do que ele nunca lançou, o
 * que é que vale a pena ouvir?». Um artista sem estas abas simplesmente não
 * entra na prateleira.
 */
export const ABAS_CURADAS = ['best', 'grails'] as const;

const faixasEmMemoria = new Map<string, FaixaDoTracker[]>();
const abaEmMemoria = new Map<string, { aba: string; total: number } | null>();

/**
 * Que aba usar, e quantas faixas tem. Custa umas centenas de bytes.
 *
 * Vem separado das faixas de propósito, e a razão é medida: o tracker do
 * Chief Keef não tem `best` nem `grails`, cai no `main`, e o `main` dele são
 * **664 KB**. Descarregar isso ao ABRIR a página de um artista -- antes de a
 * pessoa sequer tocar no separador, e em dados móveis -- não se faz. Com o
 * `meta` sabe-se se há tracker e mostra-se o separador; as faixas só descem
 * quando alguém o abre.
 */
export async function abaDoTracker(folha: string): Promise<{ aba: string; total: number } | null> {
  if (abaEmMemoria.has(folha)) return abaEmMemoria.get(folha) ?? null;

  const meta = await pedir(`${API}/sh/${encodeURIComponent(folha)}/meta`);
  if (!meta) return null;
  try {
    const abas = (await meta.json())?.tabs ?? {};
    const escolhida = ABAS_PREFERIDAS.find((a) => abas[a]);
    const r = escolhida
      ? { aba: escolhida, total: Number(abas[escolhida]?.count) || 0 }
      : null;
    abaEmMemoria.set(folha, r);
    return r;
  } catch {
    return null;
  }
}

/**
 * As faixas da aba escolhida. Só em memória, e só durante a sessão: são
 * dezenas ou centenas de KB por artista e não vale a pena enchê-lo no disco.
 */
export async function faixasDoArtista(
  folha: string,
  abasAceites?: readonly string[],
): Promise<FaixaDoTracker[]> {
  const guardadas = faixasEmMemoria.get(folha);
  if (guardadas) return guardadas;

  const escolhida = await abaDoTracker(folha);
  if (!escolhida) return [];
  // A prateleira da Pesquisa só aceita as abas curadas -- ver a nota em
  // `CURADAS`. Sem isto, um artista sem `best` arrastava o `main` inteiro.
  if (abasAceites && !abasAceites.includes(escolhida.aba)) return [];

  const r = await pedir(`${API}/sh/${encodeURIComponent(folha)}/tab/${escolhida.aba}`);
  if (!r) return [];
  try {
    const faixas = faixasDoTracker(await r.json());
    faixasEmMemoria.set(folha, faixas);
    return faixas;
  } catch {
    return [];
  }
}
