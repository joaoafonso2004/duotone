import { pickBest, type MatchCandidate, type MatchTarget } from './trackMatch';
import { searchAttempts } from './searchQuery';
import type { SpotifyCsvRow } from './spotifyCsv';
import { toMatchTarget } from './spotifyCsv';
import type { Track } from '../types';

/**
 * Orquestra a importação de um CSV do Spotify.
 *
 * Separado da interface de propósito: a lógica de ritmo, cancelamento e
 * retoma é onde os erros doem (mil faixas, oito minutos, uma falha a meio),
 * e aqui pode ser testada sem montar um ecrã. A pesquisa entra por
 * parâmetro para os testes correrem sem rede.
 */

/** Resultado de uma faixa do CSV. */
export interface ImportedTrack {
  row: SpotifyCsvRow;
  /** A faixa escolhida, ou null se não se encontrou nada. */
  track: Track | null;
  /**
   * A escolha é boa o suficiente para entrar sem perguntar. A false com
   * `track` preenchido significa "encontrei, mas confirma" — não é falha.
   */
  confident: boolean;
  /**
   * Os outros candidatos, do melhor para o pior, sem a escolhida.
   *
   * Guardadas aqui para o ecrã de revisão poder oferecer alternativas sem
   * repetir a pesquisa: numa importação de mil faixas, voltar à rede para
   * cada correção seria lento e desnecessário — os resultados já vieram.
   */
  alternatives: Track[];
}

/** Alternativas guardadas por faixa. Mais do que isto ninguém percorre. */
const MAX_ALTERNATIVES = 4;

export interface ImportProgress {
  done: number;
  total: number;
  /** Título da faixa acabada de processar, para dar sinal de vida. */
  current: string;
  confident: number;
  uncertain: number;
  missing: number;
}

/** Um resultado de pesquisa com o canal, que o `Track` não guarda. */
export interface SearchHit {
  track: Track;
  channel: string;
}

export interface ImportOptions {
  rows: SpotifyCsvRow[];
  search: (query: string) => Promise<SearchHit[]>;
  onProgress?: (progress: ImportProgress) => void;
  /** Para cancelar a meio sem deixar pedidos pendentes. */
  signal?: AbortSignal;
  /**
   * Faixas já resolvidas numa tentativa anterior, por `uri`. Uma importação
   * interrompida à faixa 700 não pode recomeçar do zero.
   */
  resumeFrom?: Map<string, ImportedTrack>;
}

/**
 * Pedidos em paralelo.
 *
 * Mil pedidos em catadupa apanham limitação do YouTube e a importação morre
 * a meio. Três de cada vez é rápido (mil faixas em poucos minutos) sem
 * parecer um ataque.
 */
const CONCURRENCY = 3;

/** Pausa entre lotes, para o ritmo não ser perfeitamente regular. */
const BATCH_PAUSE_MS = 120;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Falhas seguidas a partir das quais se desiste.
 *
 * Três lotes inteiros sem uma única resposta não é azar nem faixas
 * obscuras: é a pesquisa em baixo. Sem este limite, uma importação de duas
 * mil faixas percorria-as todas para no fim dizer que não encontrou
 * nenhuma -- que foi exactamente como um erro de CORS conseguiu passar por
 * "não encontrado" em vez de por avaria.
 */
const MAX_FALHAS_SEGUIDAS = CONCURRENCY * 3;

/** O resultado de uma faixa, mais se a pesquisa chegou sequer a responder. */
interface Resolvido {
  resultado: ImportedTrack;
  /** Rebentou em todas as tentativas. Não é o mesmo que não existir. */
  falhou: boolean;
}

async function resolveOne(row: SpotifyCsvRow, search: ImportOptions['search']): Promise<Resolvido> {
  const target: MatchTarget = { ...toMatchTarget(row), album: row.album };

  let hits: SearchHit[] = [];
  let falhou = false;
  // A Data API suprime algumas queries curtas e devolve zero sem erro; a
  // segunda tentativa acrescenta contexto. Ver `searchAttempts`.
  for (const query of searchAttempts(`${row.artist} ${row.title}`)) {
    try {
      hits = await search(query);
      falhou = false;
    } catch {
      // Uma falha de rede numa faixa não pode derrubar a importação toda,
      // mas fica marcada: uma faixa que não existe e uma pesquisa que não
      // responde davam as duas "not found", e só uma delas é verdade.
      hits = [];
      falhou = true;
    }
    if (hits.length) break;
  }

  if (!hits.length) return { resultado: { row, track: null, confident: false, alternatives: [] }, falhou };

  const candidates: MatchCandidate[] = hits.map((hit) => ({
    id: hit.track.sourceId,
    title: hit.track.title,
    channel: hit.channel,
    durationSec: hit.track.durationSeconds,
  }));

  const { best, ranked, confident } = pickBest(candidates, target);
  const byId = new Map(hits.map((hit) => [hit.track.sourceId, hit.track]));
  const chosen = best ? (byId.get(best.id) ?? null) : null;

  const alternatives = ranked
    .filter((c) => c.id !== best?.id)
    .map((c) => byId.get(c.id))
    .filter((t): t is Track => !!t)
    .slice(0, MAX_ALTERNATIVES);

  return { resultado: { row, track: chosen, confident: confident && !!chosen, alternatives }, falhou: false };
}

export async function importSpotifyCsv(options: ImportOptions): Promise<ImportedTrack[]> {
  const { rows, search, onProgress, signal, resumeFrom } = options;
  const results: ImportedTrack[] = [];
  let confident = 0;
  let uncertain = 0;
  let missing = 0;
  let falhasSeguidas = 0;

  const tally = (result: ImportedTrack) => {
    if (!result.track) missing++;
    else if (result.confident) confident++;
    else uncertain++;
  };

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    if (signal?.aborted) break;

    const batch = rows.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(
      batch.map(async (row): Promise<Resolvido> => {
        const cached = row.uri ? resumeFrom?.get(row.uri) : undefined;
        return cached ? { resultado: cached, falhou: false } : resolveOne(row, search);
      })
    );

    for (const { resultado, falhou } of settled) {
      falhasSeguidas = falhou ? falhasSeguidas + 1 : 0;
      results.push(resultado);
      tally(resultado);
    }

    onProgress?.({
      done: results.length,
      total: rows.length,
      current: settled[settled.length - 1]?.resultado.row.title ?? '',
      confident,
      uncertain,
      missing,
    });

    if (falhasSeguidas >= MAX_FALHAS_SEGUIDAS) {
      throw new Error('YouTube search is not responding, so no tracks can be matched. Check your connection and try again.');
    }

    // Sem pausa entre lotes o ritmo é constante e destaca-se; e não há
    // vantagem nenhuma em poupar estes milissegundos.
    if (i + CONCURRENCY < rows.length) await sleep(BATCH_PAUSE_MS);
  }

  return results;
}

/** As que entram sem perguntar. */
export const confidentTracks = (results: ImportedTrack[]): Track[] =>
  results.filter((r) => r.confident && r.track).map((r) => r.track!);

/** As que encontraram algo mas pedem confirmação. */
export const uncertainResults = (results: ImportedTrack[]): ImportedTrack[] =>
  results.filter((r) => !r.confident && r.track);

/** As que não encontraram nada. */
export const missingResults = (results: ImportedTrack[]): ImportedTrack[] =>
  results.filter((r) => !r.track);
