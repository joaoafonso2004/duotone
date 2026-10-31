import { arredondar } from './playbackRate';

export interface MotorComVelocidade {
  playbackRate: number;
  readonly playing: boolean;
  play: () => void;
}
type PonteNativa = (player: unknown, rate: number) => boolean;
// Native Float values (e.g. 0.899999976) must not cause another rate write.
const diferente = (a: number, b: number) => Math.abs(a-b) > 0.001;

/**
 * A speed change is told to BOTH the native module (`modules/duotone-audio`,
 * `aplicarVelocidade`) and, when it still needs it, expo-video's own property.
 * It went wrong four times, so the reasons stay written down:
 *
 * - expo-video watches the AVPlayer's rate and, when `defaultRate` does not
 *   match the value it holds, ADOPTS `defaultRate` and writes it back into the
 *   player (node_modules/expo-video/ios/VideoPlayer.swift, onRateChanged). A
 *   rate other than zero IS playing in AVFoundation, which is how a pause
 *   turned into play. We cannot remove that rule: expo-video comes
 *   PRECOMPILED in SDK 57 (`[Expo-precompiled] ExpoVideo` in the build log),
 *   so the source patch in `plugins/velocidade-expo-video.js` never reaches
 *   the phone. Found on 23/9 after a build that relied on it: the second
 *   change stayed on the first one.
 * - So expo-video's value has to end equal to `defaultRate`.
 * - The one-second gap on every change (30/9): expo-video's setter is a plain
 *   `rate = x`, and on a playing AVPlayer that re-evaluates the buffer and
 *   goes silent while it does. The native module used to queue its
 *   `playImmediately` for the main thread, so the setter -- which runs right
 *   away, on the JS thread -- always got there first. The native module now
 *   applies the change synchronously and FIRST: buffer wait off,
 *   `defaultRate`, then `playImmediately`. expo-video's watcher adopts the new
 *   `defaultRate` inside that change, so by the time this function looks,
 *   expo-video already holds the value and nothing slow is written.
 *
 * Never written to expo-video for a PAUSED player here: that setter starts
 * playback. The value chosen while paused reaches expo-video on the next
 * explicit play (`tocarNaVelocidade`).
 *
 * `scripts/test-mudanca-velocidade.cjs` models the iPhone -- expo-video's
 * adoption and which writes wait for the buffer -- and replays thousands of
 * interleavings.
 */
export function atualizarVelocidadeDoMotor(player: MotorComVelocidade, rate: number, nativo: PonteNativa) {
  const value = arredondar(rate);
  nativo(player,value);
  if (player.playing && diferente(player.playbackRate,value)) player.playbackRate=value;
}

/**
 * The check after a change (26/9): if the player is PLAYING at another speed
 * than the one asked, apply it again. Returns whether it had to.
 *
 * João's report of 26/9 (build 3.8.2), right after a crossfade had swapped the
 * two engines: asked 1.2, expo-video went 0.8 -> 1.2 -> 0.8 by itself and
 * stayed at 0.8; asked 0.9, it went to 0.9 and back to 1.2 -- "one click
 * behind" again, on every change until the app restarted. Who wrote the old
 * value back is not proven (none of our writes explains it), but the wrong
 * state is STABLE and visible in expo-video's own value, so it is checked and
 * put right instead of trusted. A paused player is never touched: the setter
 * starts playback.
 */
export function corrigirVelocidadeQueFicouAtras(player: MotorComVelocidade, rate: number, nativo: PonteNativa): boolean {
  const value = arredondar(rate);
  if (!player.playing || !diferente(player.playbackRate, value)) return false;
  nativo(player, value);
  // Usually already adopted inside the native change; writing it again would
  // be expo-video's plain `rate = x`, the slow path.
  if (diferente(player.playbackRate, value)) player.playbackRate = value;
  return true;
}

/**
 * An explicit play uses the requested rate from its first audible sample.
 *
 * From a stop it ALWAYS writes expo-video's property, even when expo-video
 * already holds that value: a speed changed while paused went only to the
 * native module (`defaultRate`), and expo-video's value can be an older one
 * that happens to match. Skipping the write then let `play()` start at
 * `defaultRate`, expo-video adopted it, and the NEXT pause played again.
 * The native module hears it too, so a block still queued from an earlier
 * change applies this value and not an older one.
 */
export function tocarNaVelocidade(player: MotorComVelocidade, rate: number, nativo?: PonteNativa) {
  const value = arredondar(rate);
  nativo?.(player,value);
  if (!player.playing || diferente(player.playbackRate,value)) player.playbackRate=value;
  player.play();
}

/**
 * O acerto de andamento do AutoMix fica até ao fim da faixa (31/10).
 *
 * Numa passagem "na batida" a que entra arranca à velocidade dela × a razão dos
 * andamentos (até 4 %: o fader de pitch de um DJ). Duas maneiras de o largar já
 * falharam, as duas por escreverem a velocidade da faixa que AGORA se ouve:
 *
 * - de uma vez (até à 5.4.6): um degrau de até 0,7 de semitom com o
 *   `.varispeed` ("expo-video changed its rate 0.96 -> 1" no relatório de 30/10);
 * - aos poucos (o relaxe da 5.4.7: 2 a 5 passos de ~1 % em 10 s): um corte
 *   por passo. O João, a 31/10: a música seguinte "corta 4 ou 5 vezes e depois
 *   continua normal". Cada escrita de velocidade num AVPlayer a tocar corta
 *   (30/9), mesmo pela nativa.
 *
 * Por isso não se escreve nada: a faixa toca até ao fim à velocidade acertada,
 * como um DJ que deixa o fader onde ficou. A velocidade dela volta na próxima
 * paragem natural, onde uma escrita não se ouve: a faixa seguinte (que arranca
 * à dela), um play depois de uma pausa, ou outro pedido de velocidade.
 */
/** Abaixo disto (0,4 %) não se ouve: aplica-se a velocidade dela, como sempre. */
export const ACERTO_MINIMO = 0.004;
/** A folga para comparar com o motor: o AVPlayer guarda a taxa em Float. */
const FOLGA_DO_MOTOR = 0.002;

export interface AcertoQueFica {
  sourceId: string;
  /** A velocidade a que o motor toca (a acertada), tal como ele a diz. */
  taxa: number;
  /** A velocidade da faixa (a da loja), na grelha do motor. */
  dela: number;
}

/** O acerto a manter quando `sourceId` passa a ser a que se ouve, ou null se não há acerto que se ouça. */
export function acertoQueFica(sourceId: string, taxaDoMotor: number, taxaDela: number): AcertoQueFica | null {
  if (!Number.isFinite(taxaDoMotor) || !Number.isFinite(taxaDela) || taxaDoMotor <= 0 || taxaDela <= 0) return null;
  if (Math.abs(taxaDoMotor - taxaDela) <= ACERTO_MINIMO) return null;
  return { sourceId, taxa: taxaDoMotor, dela: arredondar(taxaDela) };
}

/**
 * O acerto ainda vale? Só para a mesma faixa, o mesmo pedido de velocidade, e
 * com o motor ainda à velocidade acertada: um play depois de uma pausa escreve
 * a dela, e a partir daí é a dela que se ouve.
 */
export function acertoEmVigor(a: AcertoQueFica | null, sourceId: string, taxaPedida: number, taxaDoMotor: number): a is AcertoQueFica {
  return !!a && a.sourceId === sourceId && a.dela === arredondar(taxaPedida)
    && Number.isFinite(taxaDoMotor) && Math.abs(taxaDoMotor - a.taxa) <= FOLGA_DO_MOTOR;
}

/**
 * A velocidade a que a faixa se OUVE: a acertada enquanto o acerto vale, senão
 * a pedida. É a que conta para planear a passagem seguinte (os andamentos
 * comparam-se como se ouvem) e para a dobra da que sai.
 */
export function velocidadeQueSeOuve(a: AcertoQueFica | null, sourceId: string, taxaPedida: number, taxaDoMotor: number): number {
  return acertoEmVigor(a, sourceId, taxaPedida, taxaDoMotor) ? a.taxa : taxaPedida;
}
