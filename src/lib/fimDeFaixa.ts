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
 * E há uma terceira paragem, que durante muito tempo não estava aqui: a que
 * **nunca arranca**. Nem posição a avançar, nem download a avançar, nada. Essa
 * não tem recuperação nenhuma -- o que tem de haver é um LIMITE, para a app
 * poder dizer que falhou em vez de ficar em 0:00 a fingir que carrega.
 *
 * Função pura -- ver scripts/test-fim-de-faixa.ts.
 */

export type AcaoDoWatchdog = 'nada' | 'descarregar' | 'desistir';

/** A que distância do fim se considera que a faixa já lá está. */
export const PERTO_DO_FIM_S = 2;

/** Parado a meio. Mais folga: aqui ainda pode ser buffering a sério. */
export const PRESO_A_MEIO_MS = 6000;

/** Abaixo disto considera-se que a faixa nunca chegou a arrancar. */
export const ARRANCOU_S = 0.5;

/**
 * Quanto tempo sem NADA a mexer antes de dar a tentativa por perdida.
 *
 * Generoso: 4G lento a descarregar um ficheiro grande é lento, mas mexe -- e
 * enquanto mexer isto não dispara. Só conta o tempo em que nem a posição nem
 * o download avançam.
 */
export const DESISTIR_MS = 45000;

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
  /**
   * Há quanto tempo o download não avança um único byte. `null` quando não há
   * download nenhum em curso -- e aí, com a posição parada em zero, não há
   * mesmo nada a acontecer.
   */
  downloadParadoMs?: number | null;
}): AcaoDoWatchdog {
  if (!estado.querTocar) return 'nada';

  const perto =
    estado.duracaoSegundos > 0 &&
    estado.posicaoSegundos >= estado.duracaoSegundos - PERTO_DO_FIM_S;

  // Perto do fim não se faz nada AQUI. Este caminho só sabe que a posição
  // parou, e uma pausa parada é indistinguível de um encravamento parado --
  // avançar por relógio saltava uma faixa que o utilizador tinha pausado nos
  // últimos segundos. Quem trata do fim é o `fimPorFaltaDeDados`, que tem o
  // sinal que separa os dois casos.
  if (perto) return 'nada';

  if (!estado.jaDescarregou) {
    return estado.paradoMs > PRESO_A_MEIO_MS ? 'descarregar' : 'nada';
  }

  // Já se tentou o ficheiro descarregado. Trocar outra vez não resolve nada --
  // mas isso NÃO pode querer dizer "não fazer nada, para sempre".
  //
  // Era o que dizia. E como `jaDescarregou` é posto a verdadeiro ANTES de o
  // download começar, entrar no caminho progressivo desarmava o watchdog por
  // completo: se o download encravasse, a faixa ficava em 0:00 sem erro, sem
  // recuperação e sem limite de tempo. A única saída era reiniciar a app.
  //
  // Aqui não se inventa uma recuperação que não existe: reconhece-se a
  // desistência, para que quem chama possa dizê-lo ao utilizador e destrancar
  // o estado, em vez de deixar a app a fingir que ainda está a carregar.
  const nuncaArrancou = estado.posicaoSegundos <= ARRANCOU_S;
  const downloadParado =
    estado.downloadParadoMs == null || estado.downloadParadoMs > DESISTIR_MS;
  if (nuncaArrancou && estado.paradoMs > DESISTIR_MS && downloadParado) return 'desistir';

  return 'nada';
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

/**
 * Que duração dar aos dois detetores acima.
 *
 * Em todo o resto da app o `player.duration` fica DE FORA, e por boa razão: há
 * m4a do YouTube que declaram o dobro, e com um deles a barra mentia e a
 * passagem do crossfade começava a meio da música.
 *
 * Aqui entra -- mas em ÚLTIMO recurso, só quando a app não sabe a duração de
 * mais lado nenhum. O que torna isto seguro é o sentido do erro. A pergunta que
 * se faz a seguir é "já passei do fim menos dois segundos?", e uma duração
 * grande de mais nunca chega a ser atingida: perde-se a deteção, que é
 * exatamente o que já acontecia sem duração nenhuma. Mau seria uma duração
 * PEQUENA de mais -- essa saltava uma faixa a meio -- e não é essa a forma
 * deste defeito.
 *
 * Sem isto, uma faixa que chega à fila sem duração ficava presa no último
 * segundo PARA SEMPRE. É o caso das sugestões do shuffle inteligente quando o
 * InnerTube não manda o `lengthText`: o contentor declara mais dados do que
 * tem, o AVPlayer espera pelo resto e nunca emite o `playToEnd`, e as duas
 * redes de segurança estavam ambas caladas por não haver duração.
 *
 * Aceita lixo de propósito: antes de o item carregar, o AVPlayer devolve `NaN`
 * ou `Infinity` na duração.
 */
export function duracaoParaDetetarOFim(
  conhecida: number | null | undefined,
  doMotor: number | null | undefined,
): number {
  if (typeof conhecida === 'number' && Number.isFinite(conhecida) && conhecida > 0) {
    return conhecida;
  }
  if (typeof doMotor === 'number' && Number.isFinite(doMotor) && doMotor > 0) {
    return doMotor;
  }
  return 0;
}
