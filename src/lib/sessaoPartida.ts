/**
 * A sessão do leitor guardada em DUAS chaves: a fila à parte, o resto (faixa,
 * posição, índice) na chave de sempre.
 *
 * A posição muda a cada segundo, e com ela o `persist` escrevia a sessão
 * inteira de três em três segundos -- fila incluída. Numa fila de 2 000 faixas
 * eram quase 1 MB de JSON serializado e escrito no disco a cada escrita,
 * durante a música toda, para guardar um número (24/9). A fila só se escreve
 * quando MUDA (é imutável na store: mudar é outra referência).
 *
 * A leitura aceita as duas formas: uma sessão gravada por uma versão anterior
 * traz a fila lá dentro e continua a abrir.
 *
 * Sem imports de runtime -- testado em scripts/test-sessao-partida.ts.
 */

export const SUFIXO_DA_FILA = ':fila';

type Valor = { state: Record<string, unknown>; version?: number };

/** O que escrever: a sessão sem a fila, e a fila só se não for a última escrita. */
export function partirSessao(valor: Valor, ultimaFila: unknown): { sessao: string; fila: string | null; filaEscrita: unknown } {
  const { queue, ...resto } = valor.state;
  const sessao = JSON.stringify({ ...valor, state: resto });
  if (queue === ultimaFila) return { sessao, fila: null, filaEscrita: ultimaFila };
  return { sessao, fila: JSON.stringify(queue ?? []), filaEscrita: queue };
}

/** Junta as duas chaves. Sem fila guardada à parte, vale a de dentro (formato antigo). */
export function juntarSessao(sessao: string | null, fila: string | null): Valor | null {
  if (!sessao) return null;
  const valor = JSON.parse(sessao) as Valor;
  if (valor?.state && !('queue' in valor.state)) {
    let lida: unknown = null;
    try { lida = fila ? JSON.parse(fila) : null; } catch { lida = null; }
    if (Array.isArray(lida)) valor.state.queue = lida;
    else {
      // A fila perdeu-se (a app morreu entre as duas escritas, ou o disco
      // falhou): fica a faixa atual sozinha, e o índice aponta para ela.
      valor.state.queue = valor.state.current ? [valor.state.current] : [];
      valor.state.queueIndex = 0;
    }
  }
  return valor;
}
