import type { Friendship } from '../api/social';
import type { AmigoAOuvir, EstadoDoWidget } from '../../modules/duotone-widget';
import type { Track } from '../types';
import { displayArtist } from './artistName';

/**
 * O que o widget mostra, decidido aqui.
 *
 * Fica em lógica pura e fora do Swift de propósito: do outro lado não há
 * compilador que ligue os dois lados nem forma de correr um teste. Tudo o que
 * é decisão -- quem entra, por que ordem, quantos cabem -- vive deste lado, e
 * ao widget só chega uma lista já feita.
 */

/**
 * Quantos amigos cabem.
 *
 * Um widget médio dá para três linhas sem encolher a letra. Mostrar mais era
 * mostrar pior, e um widget que não se lê de relance não serve para nada.
 */
export const MAXIMO_DE_AMIGOS = 3;

/**
 * Enquanto a app está viva, renova também a hora do retrato social.
 *
 * Sem este limite, `quando` ficava preso à última mudança de música e um
 * "Updated ... ago" podia dizer horas apesar de a app ter acabado de
 * confirmar que nada mudou. Cinco minutos mantém o rótulo honesto sem pedir
 * ao WidgetKit um redesenho a cada batimento de presença.
 */
export const INTERVALO_DO_RETRATO_MS = 5 * 60 * 1000;

/** Um nome vazio não identifica ninguém; o utilizador é o recurso. */
const nomeDe = (amigo: Friendship): string =>
  amigo.name?.trim() || amigo.username?.trim() || 'Someone';

/**
 * Os amigos a ouvir alguma coisa neste momento.
 *
 * A ordem é a do nome e não a da chegada: a lista da presença muda de ordem a
 * cada actualização, e um widget onde as pessoas trocam de sítio sozinhas
 * parece avariado. Por nome fica estável entre desenhos.
 *
 * Só entram amizades aceites: um pedido por responder não é um amigo, e não
 * tem nada que fazer no ecrã inicial de ninguém.
 */
export function amigosAOuvir(amigos: Friendship[]): AmigoAOuvir[] {
  return amigos
    .filter((a) => a.status === 'accepted' && a.online && a.currentlyPlaying?.title)
    .map((a) => ({
      id: a.friendId,
      nome: nomeDe(a),
      titulo: a.currentlyPlaying!.title,
      // O campo `artist` do YouTube é o CANAL, e o canal traz "- Topic"
      // colado. É a mesma limpeza que a app faz em todo o lado.
      artista: displayArtist({
        title: a.currentlyPlaying!.title,
        artist: a.currentlyPlaying!.artist ?? null,
      } as Track),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome) || a.id.localeCompare(b.id))
    .slice(0, MAXIMO_DE_AMIGOS);
}

/**
 * O estado completo.
 *
 * A faixa só conta quando está mesmo a tocar: um widget a anunciar uma música
 * em pausa há duas horas mente sobre o que se está a ouvir.
 */
export function montarEstado(opcoes: {
  faixa: Track | null;
  aTocar: boolean;
  cor: string | null;
  amigos: Friendship[];
  agora?: number;
}): EstadoDoWidget {
  const { faixa, aTocar, cor, amigos, agora = Date.now() } = opcoes;
  return {
    faixa:
      faixa && aTocar
        ? {
            titulo: faixa.title,
            artista: displayArtist(faixa),
            capa: faixa.artworkUrl ?? null,
          }
        : null,
    cor,
    amigos: amigosAOuvir(amigos),
    quando: agora,
  };
}

/**
 * Se vale a pena reescrever.
 *
 * Cada escrita manda o WidgetKit redesenhar, e redesenhar custa bateria. A
 * presença actualiza-se de 45 em 45 segundos mesmo quando nada mudou -- sem
 * esta comparação, o widget acordava a toda a hora para desenhar o mesmo.
 *
 * O `quando` fica fora da comparação do conteúdo, mas força uma renovação de
 * cinco em cinco minutos. Assim o texto "Updated ... ago" mede uma
 * sincronização real sem redesenhar a cada batimento.
 */
export function mudou(anterior: EstadoDoWidget | null, novo: EstadoDoWidget): boolean {
  if (!anterior) return true;
  const semRelogio = ({ quando, ...resto }: EstadoDoWidget) => JSON.stringify(resto);
  if (semRelogio(anterior) !== semRelogio(novo)) return true;
  return novo.quando - anterior.quando >= INTERVALO_DO_RETRATO_MS;
}
