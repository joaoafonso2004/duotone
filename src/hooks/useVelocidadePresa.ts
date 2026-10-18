import { useOuvirJuntos } from '../state/ouvirJuntos';
import { useSeguirAmigo } from '../state/seguirAmigo';

/**
 * A velocidade que o motor usa quando NÃO é a escolhida (18/10).
 *
 * Numa Jam toda a gente anda a 1x (`velocidadeNaSessao`, lib/jam.ts), e a
 * ouvir com um amigo anda-se à velocidade dele (`ritmoDeQuemSigo`). O motor
 * já fazia isso nas duas plataformas, mas a barra do Speed não sabia: deixava
 * mexer, gravava o valor na conta e o som não mudava -- o João, numa Jam em
 * que nem sabia que estava, deu-o como avariado. Quem desenha a barra mostra-a
 * parada neste valor, com o motivo por baixo.
 *
 * A mesma ordem do motor: seguir um amigo ganha à Jam.
 */
export function useVelocidadePresa(): { ritmo: number; motivo: string } | null {
  const ritmoDoAmigo = useSeguirAmigo((s) => (s.seguindo ? s.ritmo ?? 1 : null));
  const emJam = useOuvirJuntos((s) => !!s.sessao);
  if (ritmoDoAmigo != null) return { ritmo: ritmoDoAmigo, motivo: "While you listen along, you play at your friend's speed." };
  if (emJam) return { ritmo: 1, motivo: 'Everyone plays at 1x in a Jam.' };
  return null;
}
