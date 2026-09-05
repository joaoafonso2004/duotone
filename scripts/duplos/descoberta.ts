/**
 * Duplo de src/api/descoberta.ts -- programável.
 *
 * É daqui que saem as sugestões do shuffle inteligente, e é a resposta que o
 * teste precisa de mandar. Conta também as chamadas, para se poder afirmar o
 * contrário: que num certo caso NÃO se foi à rede.
 */
import { controlo } from './controlo.ts';
import type { Track } from '../../src/types.ts';

export function candidatasParaDescoberta(): Promise<Track[]> {
  controlo.chamadas.candidatas++;
  return Promise.resolve([...controlo.candidatas]);
}
