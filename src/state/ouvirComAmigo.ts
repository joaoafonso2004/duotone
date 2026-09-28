import type { Friendship } from '../api/social';
import { useOuvirJuntos } from './ouvirJuntos';
import { useSeguirAmigo } from './seguirAmigo';

/**
 * Ir ouvir com um amigo (iPhone e PC; vivia dentro do `AmigosAOuvir`). Duas
 * portas, e a segunda existe sempre:
 *
 *  - se ele tem um Jam aberto, ENTRA-SE nele (o servidor deixa qualquer
 *    amigo): foi aberto de propósito para se ouvir junto;
 *  - se não tem, SEGUE-SE (27/9, "Listen along", `state/seguirAmigo.ts`): a
 *    mesma música que ele, no mesmo segundo, e a seguinte quando ele passar à
 *    seguinte -- sem ele ter de abrir nada. Antes tocava-se só a música em que
 *    ele estava, e quando ela acabava voltava-se à fila de cada um.
 *
 * Falhar não diz nada: quem carregou volta a carregar.
 */
export async function ouvirComAmigo(amigo: Friendship, sessaoId?: string | null): Promise<void> {
  if (sessaoId) {
    try {
      await useOuvirJuntos.getState().juntarSe(sessaoId, 'friend_presence');
      return;
    } catch {
      // O Jam pode ter acabado entre a leitura e o toque: segue-se na mesma.
    }
  }
  if (!amigo.currentlyPlaying) return;
  useSeguirAmigo.getState().iniciar(amigo.friendId, amigo.name || amigo.username || 'your friend');
}
