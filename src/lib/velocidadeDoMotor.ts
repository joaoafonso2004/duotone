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
 * `aplicarVelocidade`) and expo-video's own property. It went wrong three
 * times, so the reasons stay written down:
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
 * - So expo-video's value has to stay equal to `defaultRate`: this writes it
 *   here, now (22/9), and the native module applies the LAST request per
 *   player in its main-thread block (23/9) -- before that, a late block from
 *   an earlier tap put a stale value back ("one click behind").
 *
 * Never written to expo-video for a PAUSED player here: that setter starts
 * playback. The value chosen while paused reaches expo-video on the next
 * explicit play (`tocarNaVelocidade`).
 *
 * `scripts/test-mudanca-velocidade.cjs` models the iPhone -- the queued native
 * block and expo-video's adoption -- and replays thousands of interleavings.
 */
export function atualizarVelocidadeDoMotor(player: MotorComVelocidade, rate: number, nativo: PonteNativa) {
  const value = arredondar(rate);
  nativo(player,value);
  if (player.playing && diferente(player.playbackRate,value)) player.playbackRate=value;
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
