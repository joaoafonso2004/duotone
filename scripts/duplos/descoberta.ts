/**
 * Duplo de src/api/descoberta.ts -- programável.
 *
 * É daqui que saem as sugestões do shuffle inteligente, e é a resposta que o
 * teste precisa de mandar. Conta também as chamadas, para se poder afirmar o
 * contrário: que num certo caso NÃO se foi à rede.
 */
import { controlo } from './controlo.ts';
import type { Track } from '../../src/types.ts';
import type { Proveniencia } from '../../src/lib/escolhaDaSugestao.ts';

export function candidatasParaDescoberta(
  contexto: readonly Track[], _naFila?: ReadonlySet<string>, _sugeridas?: ReadonlySet<string>,
  _quantas?: number, _alvos?: number, escutas?: ReadonlyMap<string, number>,
  _porAncora?: Map<string, Track[]>, externos?: ReadonlyMap<string, string>,
  contextoDaSessao?: boolean,
  proveniencias?: Map<string, Proveniencia>,
): Promise<Track[]> {
  controlo.chamadas.candidatas++;
  controlo.contextosDaDescoberta.push([...contexto]);
  controlo.perfisDaDescoberta.push({ escutas, externos, contextoDaSessao });
  const resposta = controlo.candidatasPendentes.shift() ?? Promise.resolve([...controlo.candidatas]);
  // Por omissão, cada candidata é da própria âncora e passa o mínimo; um teste
  // programa `controlo.proveniencias` para afirmar o contrário.
  return resposta.then((faixas) => {
    faixas.forEach((t, i) => {
      const k = `${t.source}:${t.sourceId}`;
      proveniencias?.set(k, controlo.proveniencias.get(t.sourceId)
        ?? { ancora: 'duplo', propria: true, posicaoNoCatalogo: 0, pontos: 2, ronda: i });
    });
    return faixas;
  });
}
