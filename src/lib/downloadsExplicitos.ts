/**
 * O que é um download, separado do que está em disco.
 *
 * Havia uma confusão só: o ícone ↓ e o "Remove download" perguntavam se o
 * ficheiro EXISTIA (`isAudioCached`). Só que tocar uma música também a deixa em
 * disco (o motor nativo toca sempre de um ficheiro local), e o Smart Cache e a
 * Daily mix também. Ouvir uma faixa uma vez punha-a com ar de descarregada; o
 * "Download" sobre uma faixa em cache APAGAVA-A (era um alternar sobre o
 * ficheiro); e um download acabado não ficava protegido da limpeza -- só o
 * cadeado do ecrã de Downloads protegia.
 *
 * Agora são duas perguntas diferentes:
 * - **toca sem rede?** -- o ficheiro está em disco (`isAudioCached`), venha de
 *   onde vier. Continua a ser o que o filtro offline e os menus usam para saber
 *   se se pode tocar.
 * - **foi pedido?** -- há um PEDIDO guardado aqui. Só esses levam o ↓, o
 *   "Remove download", a linha no ecrã de Downloads e a proteção da limpeza.
 *
 * Um pedido guarda uma cópia da faixa (título, artista, capa): a lista de
 * Downloads mostra-se sem rede, e uma faixa que saiu da biblioteca continua lá.
 *
 * Sem imports de runtime (só tipos), como o `lib/radio.ts`: é o que o deixa
 * correr em Node puro nos testes.
 */
import type { Track } from '../types';

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Quanto tempo os ficheiros que já estavam em disco na primeira abertura desta
 * versão ficam a salvo da limpeza. Não há maneira de saber quais deles foram
 * downloads a sério (antes disto, tocar e descarregar davam o mesmo ficheiro),
 * e em vez de um ecrã para os rever -- que só serviria uma vez -- ficam uma
 * semana protegidos. Quem quiser guardar algum carrega em "Download", que
 * sobre um ficheiro que já existe não gasta rede nenhuma. Decisão do João
 * (22/9).
 */
export const PROTECAO_DA_MIGRACAO_MS = 7 * DIA_MS;

/** A faixa como estava quando se pediu o download. Sem o id da base de dados. */
export type FaixaDoDownload = Pick<Track, 'sourceId' | 'title' | 'artist' | 'album' | 'artworkUrl' | 'durationSeconds'>;

export interface PedidoDeDownload {
  pedidoEm: number;
  /** `null` nos pedidos que vieram dos fixados antigos, que só guardavam o id. */
  faixa: FaixaDoDownload | null;
}

export interface Migracao {
  /** Até quando os `ids` ficam a salvo da limpeza. */
  ate: number;
  ids: string[];
}

export interface Registo {
  pedidos: Record<string, PedidoDeDownload>;
  migracao: Migracao | null;
}

/**
 * O que a interface mostra de uma faixa. `em-falta` é um pedido sem ficheiro e
 * sem download a andar: falhou, a app fechou a meio, ou a cache foi
 * invalidada. Continua pedido -- a lista de Downloads oferece-se para o repetir.
 */
export type SituacaoDoDownload = 'nenhum' | 'a-descarregar' | 'descarregada' | 'em-falta';

/** O que um menu precisa de saber. Um pedido em falta volta a oferecer "Download". */
export type DownloadNoMenu = 'nenhum' | 'a-descarregar' | 'descarregada';

export function registoVazio(): Registo {
  return { pedidos: {}, migracao: null };
}

export function situacaoDoDownload(e: { pedido: boolean; emDisco: boolean; aDescarregar: boolean }): SituacaoDoDownload {
  if (!e.pedido) return 'nenhum';
  if (e.emDisco) return 'descarregada';
  if (e.aDescarregar) return 'a-descarregar';
  return 'em-falta';
}

export function downloadNoMenu(s: SituacaoDoDownload): DownloadNoMenu {
  return s === 'em-falta' ? 'nenhum' : s;
}

export function copiaDaFaixa(t: Track): FaixaDoDownload {
  return {
    sourceId: t.sourceId,
    title: t.title,
    artist: t.artist,
    album: t.album,
    artworkUrl: t.artworkUrl,
    durationSeconds: t.durationSeconds,
  };
}

/** Uma faixa que se pode tocar, mesmo sem a cópia (fica o id no lugar do título). */
export function faixaDoPedido(id: string, p: PedidoDeDownload | undefined): Track {
  const f = p?.faixa;
  return {
    source: 'youtube',
    sourceId: id,
    title: f?.title ?? id,
    artist: f?.artist ?? null,
    album: f?.album ?? null,
    artworkUrl: f?.artworkUrl ?? null,
    durationSeconds: f?.durationSeconds ?? null,
  };
}

/** Pede (ou volta a pedir) o download. Um pedido repetido mantém a data do primeiro. */
export function comPedido(r: Registo, t: Track, agora: number): Registo {
  const antes = r.pedidos[t.sourceId];
  return {
    ...r,
    pedidos: { ...r.pedidos, [t.sourceId]: { pedidoEm: antes?.pedidoEm ?? agora, faixa: copiaDaFaixa(t) } },
  };
}

/**
 * Tira o pedido. Tira-o também da proteção da migração: quem carrega em
 * "Remove download" quer o ficheiro fora, e o ficheiro sai junto.
 */
export function semPedido(r: Registo, id: string): Registo {
  if (!(id in r.pedidos) && !r.migracao?.ids.includes(id)) return r;
  const pedidos = { ...r.pedidos };
  delete pedidos[id];
  const migracao = r.migracao ? { ...r.migracao, ids: r.migracao.ids.filter((x) => x !== id) } : null;
  return { pedidos, migracao };
}

/** O que a limpeza automática não pode apagar agora. */
export function protegidosDaLimpeza(r: Registo, agora: number): string[] {
  const ids = new Set(Object.keys(r.pedidos));
  if (r.migracao && agora < r.migracao.ate) for (const id of r.migracao.ids) ids.add(id);
  return [...ids];
}

/**
 * A primeira abertura desta versão: os fixados antigos passam a pedidos, e o
 * resto do que está em disco fica protegido `PROTECAO_DA_MIGRACAO_MS`.
 */
export function migrarDosFixados(fixados: readonly string[], emDisco: readonly string[], agora: number): Registo {
  const pedidos: Record<string, PedidoDeDownload> = {};
  for (const id of fixados) pedidos[id] = { pedidoEm: agora, faixa: null };
  const ids = [...new Set(emDisco)].filter((id) => !(id in pedidos));
  return { pedidos, migracao: ids.length > 0 ? { ate: agora + PROTECAO_DA_MIGRACAO_MS, ids } : null };
}

/**
 * A chave antiga (`downloads_fixados`, uma lista de ids) continua a ser
 * escrita: uma versão anterior instalada por cima lê-a e continua a proteger
 * os downloads. É uma projeção, não uma segunda fonte -- só se lê na migração.
 */
export function projecaoAntiga(r: Registo): string[] {
  return Object.keys(r.pedidos);
}

export function lerFixadosAntigos(cru: string | null): string[] {
  if (!cru) return [];
  try {
    const lista: unknown = JSON.parse(cru);
    return Array.isArray(lista) ? lista.filter((v): v is string => typeof v === 'string' && v.length > 0) : [];
  } catch {
    return [];
  }
}

function lerFaixa(v: any, id: string): FaixaDoDownload | null {
  if (!v || typeof v !== 'object' || typeof v.title !== 'string') return null;
  const texto = (x: unknown) => (typeof x === 'string' ? x : null);
  return {
    sourceId: id,
    title: v.title,
    artist: texto(v.artist),
    album: texto(v.album),
    artworkUrl: texto(v.artworkUrl),
    durationSeconds: typeof v.durationSeconds === 'number' && Number.isFinite(v.durationSeconds) ? v.durationSeconds : null,
  };
}

/**
 * `null` quando a chave não existe (é a primeira abertura: migrar). Um valor
 * que não se consegue ler ATIRA: tratá-lo como vazio fazia a gravação seguinte
 * apagar os downloads todos.
 */
export function lerRegisto(cru: string | null): Registo | null {
  if (cru === null) return null;
  const v: any = JSON.parse(cru);
  if (!v || typeof v !== 'object' || v.versao !== 1 || typeof v.pedidos !== 'object' || v.pedidos === null) {
    throw new Error('Registo de downloads ilegível');
  }
  const pedidos: Record<string, PedidoDeDownload> = {};
  for (const [id, p] of Object.entries<any>(v.pedidos)) {
    if (!id || !p || typeof p !== 'object') continue;
    pedidos[id] = {
      pedidoEm: typeof p.pedidoEm === 'number' && Number.isFinite(p.pedidoEm) ? p.pedidoEm : 0,
      faixa: lerFaixa(p.faixa, id),
    };
  }
  const m = v.migracao;
  const migracao = m && typeof m.ate === 'number' && Array.isArray(m.ids)
    ? { ate: m.ate, ids: m.ids.filter((x: unknown): x is string => typeof x === 'string') }
    : null;
  return { pedidos, migracao };
}

export function escreverRegisto(r: Registo): string {
  return JSON.stringify({ versao: 1, pedidos: r.pedidos, migracao: r.migracao });
}

/** Os pedidos por ordem para a lista: os mais recentes primeiro. */
export function pedidosPorOrdem(r: Registo): string[] {
  return Object.keys(r.pedidos).sort((a, b) => r.pedidos[b].pedidoEm - r.pedidos[a].pedidoEm || a.localeCompare(b));
}
