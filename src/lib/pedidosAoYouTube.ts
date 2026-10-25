/**
 * Os pedidos da app ao YouTube: quantos, de que tipo, e quando recuar (16/10).
 *
 * A 16/10 o YouTube começou a travar a ligação de casa do João: a pesquisa
 * respondia 403 ao fim de 5 a 9 s, e alguns vídeos ficavam presos a carregar
 * (medido a partir do PC dele; o amigo, noutra rede, estava bem). O YouTube
 * faz isto a uma ligação que faz demasiados pedidos com ar de automáticos -- e
 * a app não sabia quantos fazia. Agora:
 *
 *   1. **mede**: cada pedido conta, por tipo, e o relatório de reprodução diz
 *      quantos houve na última hora e no dia, e quantos foram recusados;
 *   2. **recua**: à primeira recusa (403 ou 429) o trabalho de FUNDO deixa de
 *      pedir durante `RECUO_INICIAL_MS` (e o dobro a cada recusa seguida, até
 *      `RECUO_MAXIMO_MS`). Quem recua é quem pergunta `emRecuo()` -- o Radio
 *      extra, os lançamentos, a descoberta. O que a pessoa faz à mão (pesquisar,
 *      abrir um artista, tocar) continua a pedir: era a insistência de fundo
 *      que piorava o bloqueio.
 *
 * Sem imports: `scripts/test-pedidos-ao-youtube.ts`.
 */

export type TipoDePedido =
  /** A caixa de pesquisa (e as páginas seguintes). */
  | 'pesquisa'
  /** Procurar no YouTube uma música conhecida (descoberta, importação, Library check). */
  | 'procura-de-musica'
  | 'ytm-pesquisa'
  /** Páginas do YouTube Music: artista, álbum, playlist, letra. */
  | 'ytm-pagina'
  /** Rádios e Mix do YouTube Music (`next`). */
  | 'ytm-radio'
  /** O ponto mais repetido de uma música, para o refrão primeiro (25/10, `next`). */
  | 'refrao'
  | 'outro';

export const TIPOS: readonly TipoDePedido[] = ['pesquisa', 'procura-de-musica', 'ytm-pesquisa', 'ytm-pagina', 'ytm-radio', 'refrao', 'outro'];

export const RECUO_INICIAL_MS = 5 * 60_000;
export const RECUO_MAXIMO_MS = 30 * 60_000;
const GUARDAR_MS = 24 * 60 * 60_000;
const MAXIMO_DE_REGISTOS = 6000;

type Registo = { em: number; tipo: TipoDePedido; estado: number | 'erro' };
let registos: Registo[] = [];
let recuoAte = 0;
let ultimoRecuoMs = 0;
let recusasSeguidas = 0;

/** É uma recusa por excesso de pedidos (e não um vídeo que não existe). */
export const eRecusa = (estado: number | 'erro'): boolean => estado === 403 || estado === 429;

/** O estado HTTP que vem no texto de um erro ("InnerTube HTTP 403"), ou 'erro'. */
export function estadoDoErro(e: unknown): number | 'erro' {
  const texto = e instanceof Error ? e.message : String(e ?? '');
  const m = /HTTP (\d{3})/.exec(texto);
  return m ? Number(m[1]) : 'erro';
}

export function registarPedidoAoYouTube(tipo: TipoDePedido, estado: number | 'erro', agora = Date.now()): void {
  registos.push({ em: agora, tipo, estado });
  if (registos.length > MAXIMO_DE_REGISTOS || registos[0].em < agora - GUARDAR_MS) {
    registos = registos.filter((r) => r.em >= agora - GUARDAR_MS).slice(-MAXIMO_DE_REGISTOS);
  }
  if (eRecusa(estado)) {
    recusasSeguidas++;
    // Uma recusa a meio de um recuo não o encurta; uma nova depois dele dobra-o.
    ultimoRecuoMs = agora < recuoAte ? ultimoRecuoMs : Math.min(RECUO_MAXIMO_MS, ultimoRecuoMs ? ultimoRecuoMs * 2 : RECUO_INICIAL_MS);
    recuoAte = Math.max(recuoAte, agora + ultimoRecuoMs);
  } else if (typeof estado === 'number' && estado < 400 && agora >= recuoAte) {
    // Uma resposta boa depois do recuo: a ligação está limpa outra vez.
    recusasSeguidas = 0;
    ultimoRecuoMs = 0;
  }
}

/** O trabalho de fundo não pede nada ao YouTube enquanto isto for verdade. */
export function emRecuo(agora = Date.now()): boolean {
  return agora < recuoAte;
}

/** Quanto falta para o recuo acabar (0 sem recuo). */
export function faltaDoRecuo(agora = Date.now()): number {
  return Math.max(0, recuoAte - agora);
}

/**
 * Conta um pedido feito por quem chama: o resultado (ou a falha, com o estado
 * HTTP se o erro o disser) fica registado, e a falha continua a subir.
 */
export async function contarPedido<T>(tipo: TipoDePedido, pedido: () => Promise<T>): Promise<T> {
  try {
    const r = await pedido();
    registarPedidoAoYouTube(tipo, 200);
    return r;
  } catch (e) {
    registarPedidoAoYouTube(tipo, estadoDoErro(e));
    throw e;
  }
}

export type ResumoDosPedidos = { total: number; recusados: number; porTipo: Record<TipoDePedido, number> };

export function resumoDosPedidos(desdeMs: number, agora = Date.now()): ResumoDosPedidos {
  const porTipo = Object.fromEntries(TIPOS.map((t) => [t, 0])) as Record<TipoDePedido, number>;
  let total = 0;
  let recusados = 0;
  for (const r of registos) {
    if (r.em < agora - desdeMs) continue;
    total++;
    porTipo[r.tipo]++;
    if (eRecusa(r.estado)) recusados++;
  }
  return { total, recusados, porTipo };
}

const linha = (nome: string, r: ResumoDosPedidos) =>
  `  ${nome}: ${r.total} requests, ${r.recusados} refused (403/429)`
  + (r.total ? ` | ${TIPOS.filter((t) => r.porTipo[t]).map((t) => `${t} ${r.porTipo[t]}`).join(', ')}` : '');

/** A secção do relatório de reprodução. */
export function textoDosPedidos(agora = Date.now()): string {
  const falta = faltaDoRecuo(agora);
  return [
    '== YouTube requests (this app, since it opened) ==',
    linha('last hour', resumoDosPedidos(60 * 60_000, agora)),
    linha('last 24 h', resumoDosPedidos(GUARDAR_MS, agora)),
    falta
      ? `  backing off: background work paused for ${Math.ceil(falta / 60_000)} more min (${recusasSeguidas} refused in a row)`
      : '  not backing off',
  ].join('\n');
}

/** Só para os testes. */
export function limparPedidos(): void {
  registos = [];
  recuoAte = 0;
  ultimoRecuoMs = 0;
  recusasSeguidas = 0;
}
