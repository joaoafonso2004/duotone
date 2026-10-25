import type { SaidaDeSom } from '../lib/autoeq';
import { useSaidaDeAudio } from './carro';

/**
 * Por onde sai o som, para o Recommended do equalizador (25/10).
 *
 * No iPhone já se sabe: o `state/carro.ts` lê a saída do iOS a cada mudança
 * (o tipo de porta e o nome, "AirPods Pro de João"), e isto só a acompanha.
 * O par do PC (`saidaDeSom.web.ts`) lê-a do Windows.
 */
export function ouvirSaidaDeSom(aoMudar: (saida: SaidaDeSom | null) => void): () => void {
  aoMudar(useSaidaDeAudio.getState().saida);
  return useSaidaDeAudio.subscribe((s) => aoMudar(s.saida));
}
