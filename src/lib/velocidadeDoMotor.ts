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
 * A speed change also has to be told to expo-video, or it undoes it (22/9).
 *
 * expo-video watches the AVPlayer's rate to notice a speed picked in the system
 * controls, and its rule is: if `defaultRate` does not match the value it holds,
 * the user changed it elsewhere, so adopt `defaultRate` and write it back to the
 * player. The native module changes the live rate first and writes `defaultRate`
 * right after, so that watcher wakes up while `defaultRate` is still the value
 * from the PREVIOUS change -- and expo-video puts that old speed back. Every
 * change after the first one landed one step behind.
 *
 * Writing the same value into expo-video's own property keeps the two in step,
 * so the watcher never has a reason to correct anything. With the build patch in
 * `plugins/velocidade-expo-video` its setter only touches the player when the
 * value really differs, so this costs nothing when the module already applied it.
 *
 * The same mismatch is what made pause stop working: a pause is a rate change,
 * the watcher woke up on it, adopted `defaultRate` and wrote it into the player
 * -- and in AVFoundation a rate other than zero IS playing. The music came back
 * with the button still saying pause.
 *
 * Still never written for a PAUSED player: that setter starts playback.
 */
export function atualizarVelocidadeDoMotor(player: MotorComVelocidade, rate: number, nativo: PonteNativa) {
  const value = arredondar(rate);
  nativo(player,value);
  if (player.playing && diferente(player.playbackRate,value)) player.playbackRate=value;
}

/** An explicit play uses the requested rate from its first audible sample. */
export function tocarNaVelocidade(player: MotorComVelocidade, rate: number) {
  const value = arredondar(rate);
  if (diferente(player.playbackRate,value)) player.playbackRate=value;
  player.play();
}
