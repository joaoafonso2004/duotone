/**
 * O que fazer quando a posição da faixa deixa de avançar.
 *
 * Há duas paragens diferentes e a distância ao fim é que as separa:
 *
 *  - **Longe do fim** o stream progressivo não arrancou ou morreu a meio
 *    (típico de músicas longas em 4G). Vale a pena trocar para o ficheiro
 *    descarregado, que arranca de certeza.
 *  - **No último par de segundos** não há nada a recuperar: o áudio acabou. Há
 *    streams do YouTube que declaram no contentor mais duração do que têm de
 *    dados, e o AVPlayer fica à espera do resto sem nunca emitir o
 *    `AVPlayerItemDidPlayToEndTime`. Sem isto a música ficava presa a 3:06 de
 *    3:07 e a fila não avançava.
 *
 * Função pura -- ver scripts/test-fim-de-faixa.ts.
 */

export type AcaoDoWatchdog = 'nada' | 'avancar' | 'descarregar';

/** A que distância do fim se considera que a faixa já lá está. */
export const PERTO_DO_FIM_S = 2;

/** Parado no fim. Com o timeUpdate a 2 s em segundo plano são duas
 * atualizações falhadas — longe de um falso positivo. */
export const PRESO_NO_FIM_MS = 4000;

/** Parado a meio. Mais folga: aqui ainda pode ser buffering a sério. */
export const PRESO_A_MEIO_MS = 6000;

export function acaoDoWatchdog(estado: {
  /** A app tenciona tocar? Em pausa não se faz nada. */
  querTocar: boolean;
  /** Há quanto tempo a posição não muda. */
  paradoMs: number;
  posicaoSegundos: number;
  /** 0 quando desconhecida — aí não se arrisca o salto. */
  duracaoSegundos: number;
  /** Já se tentou o ficheiro descarregado nesta faixa. */
  jaDescarregou: boolean;
}): AcaoDoWatchdog {
  if (!estado.querTocar) return 'nada';

  const perto =
    estado.duracaoSegundos > 0 &&
    estado.posicaoSegundos >= estado.duracaoSegundos - PERTO_DO_FIM_S;

  if (perto) return estado.paradoMs > PRESO_NO_FIM_MS ? 'avancar' : 'nada';
  if (estado.jaDescarregou) return 'nada';
  return estado.paradoMs > PRESO_A_MEIO_MS ? 'descarregar' : 'nada';
}

/** Quão perto do fim é preciso estar para o buffer vazio valer como fim. */
export const SEM_DADOS_PERTO_DO_FIM_S = 2;

/**
 * O caminho que funciona com o ecrã bloqueado.
 *
 * O `setInterval` acima é suspenso pelo iOS quando o ecrã apaga, por isso não
 * chega para resolver isto de vez. O `statusChange` do expo-video, esse, vem de
 * KVO no AVPlayer e continua a chegar.
 *
 * E é ele que distingue os dois casos que em JS pareciam iguais
 * (ver VideoPlayerObserver.swift, onTimeControlStatusChanged):
 *
 *   - pausa            -> timeControlStatus `.paused`                 -> readyToPlay
 *   - encravamento     -> `.waitingToPlayAtSpecifiedRate`             -> loading
 *
 * Exige-se também que o motor tenha mesmo parado (`aTocar` falso): um aviso de
 * buffer a meio da reprodução normal não conta.
 */
export function fimPorFaltaDeDados(estado: {
  querTocar: boolean;
  /** `player.status === 'loading'`. */
  aCarregar: boolean;
  /** `player.playing` — durante a reprodução normal é verdadeiro. */
  aTocar: boolean;
  posicaoSegundos: number;
  duracaoSegundos: number;
}): boolean {
  if (!estado.querTocar || !estado.aCarregar || estado.aTocar) return false;
  if (estado.duracaoSegundos <= 0) return false;
  return estado.posicaoSegundos >= estado.duracaoSegundos - SEM_DADOS_PERTO_DO_FIM_S;
}
