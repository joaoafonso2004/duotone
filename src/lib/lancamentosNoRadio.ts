/**
 * Os lançamentos novos no Radio (16/10, pedido do João).
 *
 * Quando o Radio (ou o autoplay do fim da fila) está num artista com um
 * lançamento novo, uma música desse lançamento entra no lote seguinte -- uma
 * vez só, no início do lote, sem fazer crescer o quarto do mesmo artista.
 *
 * Quem conta: os artistas das sementes do lote (o que se está a ouvir) e os
 * ADOTADOS na sessão -- os que se ouviram até ao fim duas vezes, a mesma conta
 * com que o Radio os passa a âncora. Os artistas que a prateleira New releases
 * segue já têm o lançamento em memória (zero pedidos); um adotado lê-se uma
 * vez, pelas músicas dele que se ouviram (são elas que provam o canal certo).
 * Um artista que só passou na fila não conta: um lançamento dele não é
 * novidade para ninguém, e procurá-lo eram pedidos por cada lote.
 *
 * Puro, sem imports: `scripts/test-lancamentos-no-radio.ts`.
 */

/** Escutas até ao fim, nesta sessão, para um artista que o Radio trouxe passar a contar. */
export const ESCUTAS_PARA_ADOTAR = 2;
/** Quantos artistas se veem por lote, no máximo (os pedidos só acontecem nos adotados sem memória). */
export const MAX_ARTISTAS_POR_LOTE = 4;
/** Um lançamento entra no Radio uma vez; depois disto pode voltar a entrar (o "novo" da Home dura o mesmo). */
export const USADO_DURANTE_MS = 14 * 24 * 60 * 60 * 1000;

export type ArtistaParaLancamento<T> = { chave: string; adotado: boolean; provas: T[] };

/**
 * Os artistas a ver neste lote, sem repetidos: os das sementes primeiro (pela
 * ordem delas), depois os adotados na sessão (o mais recente primeiro).
 * `provas` são as escutas dele nesta sessão, para um adotado sem memória.
 */
export function artistasParaLancamentos<T>(
  sementes: readonly T[],
  ouvidasNaSessao: readonly T[],
  chaveDe: (t: T) => string,
  max: number = MAX_ARTISTAS_POR_LOTE,
): ArtistaParaLancamento<T>[] {
  const escutas = new Map<string, T[]>();
  for (const t of ouvidasNaSessao) {
    const k = chaveDe(t);
    if (!k) continue;
    const lista = escutas.get(k);
    if (lista) lista.push(t); else escutas.set(k, [t]);
  }
  const adotado = (k: string) => (escutas.get(k)?.length ?? 0) >= ESCUTAS_PARA_ADOTAR;
  const fora: ArtistaParaLancamento<T>[] = [];
  const vistos = new Set<string>();
  const juntar = (k: string) => {
    if (!k || vistos.has(k) || fora.length >= max) return;
    vistos.add(k);
    fora.push({ chave: k, adotado: adotado(k), provas: [...(escutas.get(k) ?? [])].reverse() });
  };
  for (const t of sementes) juntar(chaveDe(t));
  for (const t of [...ouvidasNaSessao].reverse()) if (adotado(chaveDe(t))) juntar(chaveDe(t));
  return fora;
}

/**
 * A música do lançamento que entra: a primeira que pode entrar (não está na
 * fila, não se ouviu há pouco, não foi sugerida), e do próprio artista quando
 * há -- num álbum, a primeira faixa costuma ser a de destaque, mas pode ser de
 * um convidado.
 */
export function faixaDoLancamento<T>(
  faixas: readonly T[],
  chave: string,
  chaveDe: (t: T) => string,
  podeEntrar: (t: T) => boolean,
): T | null {
  const elegiveis = faixas.filter(podeEntrar);
  return elegiveis.find((t) => chaveDe(t) === chave) ?? elegiveis[0] ?? null;
}

/**
 * Junta a música ao lote, em segundo lugar (logo no início, sem abrir o lote
 * com ela). O mesmo artista continua a ser no máximo um quarto do lote: se já
 * lá está no teto, ela troca com a última dele em vez de se somar.
 */
export function juntarAoLote<T>(lote: readonly T[], faixa: T, chaveDe: (t: T) => string): T[] {
  const alvo = chaveDe(faixa);
  const teto = Math.max(1, Math.floor((lote.length + 1) / 4));
  let base = [...lote];
  if (base.filter((t) => chaveDe(t) === alvo).length >= teto) {
    let i = base.length - 1;
    while (i >= 0 && chaveDe(base[i]) !== alvo) i--;
    if (i >= 0) base = [...base.slice(0, i), ...base.slice(i + 1)];
  }
  return [...base.slice(0, 1), faixa, ...base.slice(1)];
}
