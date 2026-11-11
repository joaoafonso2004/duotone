import { displayArtist } from '../lib/artistName';
import {
  computeStats,
  periodStart,
  type ListeningStats,
  type PlayRow,
  type StatsPeriod,
} from '../lib/listeningStats';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { idDaConta } from '../lib/idDaConta';
import {
  aPartirDe,
  cobre,
  compactar,
  descompactar,
  juntarEscutas,
  lerGuardado,
  MAXIMO_NO_DISCO,
  planoDeLeitura,
  type HistoricoGuardado,
} from '../lib/historicoDeEscutas';

/**
 * Vai buscar o histórico de reproduções e agrega-o.
 *
 * A agregação é feita no cliente, em `lib/listeningStats.ts`, e não numa
 * função SQL — ver a nota lá sobre porquê. Aqui só há transporte.
 */

/** O PostgREST devolve no máximo 1000 linhas por pedido (`max-rows`), por
 * isso o histórico é lido às páginas. */
const PAGE = 1000;
/** Teto de segurança: 20 páginas chegam para anos de utilização pessoal e
 * impedem que "Sempre" puxe um histórico enorme num telemóvel em 4G. */
const MAX_PAGES = 20;

export interface StatsResult {
  stats: ListeningStats;
  /** Bateu no teto de páginas: os números são um mínimo, não o total. */
  truncated: boolean;
  /** A consulta falhou (tipicamente: falta a política de SELECT em `plays`
   * — ver supabase/listening-stats.sql). Distinto de "ainda não ouviste
   * nada", e a UI tem de dizer coisas diferentes nos dois casos. */
  unavailable: boolean;
}

function rowToPlay(row: any): PlayRow | null {
  const t = row?.tracks;
  if (!t?.source_id) return null;
  const track = {
    source: t.source as string,
    title: (t.title as string) ?? '',
    artist: (t.artist as string) ?? null,
  };
  return {
    playedAt: row.played_at,
    source: track.source,
    sourceId: t.source_id,
    title: track.title,
    // Normalizado aqui e não na agregação: é o mesmo extrator que dá nome aos
    // artistas no resto da app, senão o top daqui não batia certo com o das
    // outras listas.
    artist: displayArtist(track),
    artworkUrl: (t.artwork_url as string) ?? null,
    durationSeconds: (t.duration_seconds as number) ?? null,
  };
}

type Leitura = { rows: PlayRow[]; truncated: boolean; unavailable: boolean };

/** As páginas de uma leitura, da mais recente para a mais antiga. `null` se falhou. */
async function lerPaginas(
  start: number | null,
  conta: string,
  targetUserId?: string,
): Promise<{ rows: PlayRow[]; truncated: boolean } | null> {
  const rows: PlayRow[] = [];
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const {data,error} = targetUserId
      ? await supabase.rpc('get_social_profile_plays', {target_user_id:targetUserId,p_since:start === null ? null : new Date(start).toISOString(),p_offset:page*PAGE})
      : await supabase.from('plays').select('played_at, tracks (source, source_id, title, artist, artwork_url, duration_seconds)')
        .eq('user_id',conta).order('played_at',{ascending:false}).range(page*PAGE,page*PAGE+PAGE-1)
        .gte('played_at',start === null ? '1970-01-01T00:00:00Z' : new Date(start).toISOString());

    if (error) return null;
    if (!data || data.length === 0) break;

    for (const row of data) {
      const play = rowToPlay(row);
      if (play) rows.push(play);
    }

    if (data.length < PAGE) break;
    if (page === MAX_PAGES - 1) truncated = true;
  }
  return { rows, truncated };
}

/**
 * As escutas da PRÓPRIA conta passam pelo histórico guardado no aparelho
 * (`lib/historicoDeEscutas.ts`): a primeira leitura traz o período pedido, as
 * seguintes só o que é novo. Os mesmos dados, sem descarregar o histórico
 * inteiro a cada abertura das estatísticas (11/11, egress).
 */
const historicoEmMemoria = new Map<string, HistoricoGuardado>();
const aLer = new Map<string, Promise<Leitura>>();
const chaveNoDisco = (conta: string) => `historico-de-escutas:v1:${conta}`;

async function historicoGuardado(conta: string): Promise<HistoricoGuardado | null> {
  const emMemoria = historicoEmMemoria.get(conta);
  if (emMemoria) return emMemoria;
  try {
    const h = lerGuardado(await AsyncStorage.getItem(chaveNoDisco(conta)), conta);
    if (h) historicoEmMemoria.set(conta, h);
    return h;
  } catch {
    return null;
  }
}

async function guardarHistorico(h: HistoricoGuardado): Promise<void> {
  historicoEmMemoria.set(h.conta, h);
  try {
    const texto = JSON.stringify(h);
    if (texto.length <= MAXIMO_NO_DISCO) await AsyncStorage.setItem(chaveNoDisco(h.conta), texto);
    else await AsyncStorage.removeItem(chaveNoDisco(h.conta));
  } catch { /* Sem disco, fica a memória: a próxima abertura da app relê. */ }
}

async function lerAsMinhas(start: number | null, conta: string): Promise<Leitura> {
  const agora = Date.now();
  const h = await historicoGuardado(conta);
  const plano = planoDeLeitura(h, conta, start, agora);
  const responder = (g: HistoricoGuardado): Leitura => {
    const rows = descompactar(g);
    const maisAntiga = rows.length ? Date.parse(rows[rows.length - 1].playedAt) : null;
    // Só faltam escutas se a leitura bateu no teto E o período pedido vai além da mais antiga.
    const truncated = g.truncado && (start === null || maisAntiga === null || start < maisAntiga);
    return { rows: aPartirDe(rows, start), truncated, unavailable: false };
  };
  if (plano.tipo === 'nada' && h) return responder(h);

  const lidas = await lerPaginas(plano.tipo === 'nada' ? start : plano.desde, conta);
  if (!lidas) {
    // Sem rede (ou sem a política): o que está guardado ainda serve.
    if (h && cobre(h, start)) return responder(h);
    return { rows: [], truncated: false, unavailable: true };
  }
  const novo = plano.tipo === 'novas' && h
    ? compactar(conta, juntarEscutas(descompactar(h), lidas.rows), {
      lidoEm: h.lidoEm, leituraEm: agora, desde: h.desde, truncado: h.truncado,
    })
    : compactar(conta, lidas.rows, {
      lidoEm: agora, leituraEm: agora, desde: plano.tipo === 'tudo' ? plano.desde : start, truncado: lidas.truncated,
    });
  await guardarHistorico(novo);
  return responder(novo);
}

/** O histórico em bruto, às páginas. `start` a null lê tudo.
 *
 * Vive separado da agregação porque há mais do que uma: as estatísticas
 * agregam por período, a retrospetiva por ano civil. A consulta é a mesma e
 * não deve ser escrita duas vezes. */
export async function lerReproducoes(
  start: number | null,
  targetUserId?: string
): Promise<Leitura> {
  try {
    // A sessão guardada, sem ir à rede (o `getUser` era um pedido ao Auth a cada leitura).
    const conta = await idDaConta();
    if (!conta) return { rows: [], truncated: false, unavailable: false };

    if (targetUserId && targetUserId !== conta) {
      const lidas = await lerPaginas(start, conta, targetUserId);
      return lidas ? { ...lidas, unavailable: false } : { rows: [], truncated: false, unavailable: true };
    }

    // Duas leituras ao mesmo tempo (as estatísticas e o Resumo do mês) esperam pela mesma.
    const chave = `${conta}|${start ?? 'tudo'}`;
    const emCurso = aLer.get(chave);
    if (emCurso) return emCurso;
    const pedido = lerAsMinhas(start, conta).finally(() => { if (aLer.get(chave) === pedido) aLer.delete(chave); });
    aLer.set(chave, pedido);
    return pedido;
  } catch {
    return { rows: [], truncated: false, unavailable: true };
  }
}

export async function fetchListeningStats(
  period: StatsPeriod,
  now: number = Date.now(),
  targetUserId?: string
): Promise<StatsResult> {
  const { rows, truncated, unavailable } = await lerReproducoes(periodStart(period, now), targetUserId);
  return { stats: computeStats(rows, period, now), truncated, unavailable };
}
