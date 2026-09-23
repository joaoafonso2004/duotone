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
 * A speed change has ONE writer: the native module (`modules/duotone-audio`,
 * `aplicarVelocidade`). expo-video's own property is only the fallback for a
 * binary without the module (it returns false).
 *
 * History, because it went wrong twice:
 *
 * - 22/9 (3.7.6): the second change landed one step behind, and pause stopped
 *   pausing. expo-video watches the AVPlayer's rate and, when `defaultRate` did
 *   not match the value it held, ADOPTED `defaultRate` and wrote it back into
 *   the player. The fix then was to also write expo-video's property from here,
 *   so the two stayed in step.
 * - 23/9: it still happened, rarely, when changing the speed several times on
 *   the same song. Two writers were the problem: this JS write happens NOW, on
 *   the JS thread, and the native module applies its value LATER, in a block on
 *   the main thread. With two quick taps (0.9 then 1.1) the late 0.9 block ran
 *   after the JS had already written 1.1, and expo-video's watcher adopted the
 *   stale value. Now: the native module applies the LATEST request whichever
 *   block runs, expo-video no longer adopts anything (the build patch in
 *   `plugins/velocidade-expo-video.js`), and only one side writes.
 *
 * Still never written to expo-video for a PAUSED player: that setter starts
 * playback (in AVFoundation a rate other than zero IS playing).
 */
export function atualizarVelocidadeDoMotor(player: MotorComVelocidade, rate: number, nativo: PonteNativa) {
  const value = arredondar(rate);
  if (nativo(player,value)) return;
  if (player.playing && diferente(player.playbackRate,value)) player.playbackRate=value;
}

/**
 * An explicit play uses the requested rate from its first audible sample.
 *
 * The native module hears it too (when there is one): it remembers the LAST
 * request per player, and a speed block still queued from an earlier change
 * must apply this value, not an older one.
 */
export function tocarNaVelocidade(player: MotorComVelocidade, rate: number, nativo?: PonteNativa) {
  const value = arredondar(rate);
  nativo?.(player,value);
  if (diferente(player.playbackRate,value)) player.playbackRate=value;
  player.play();
}
