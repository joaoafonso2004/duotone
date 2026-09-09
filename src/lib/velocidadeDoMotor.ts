import { arredondar } from './playbackRate';

export interface MotorComVelocidade {
  playbackRate: number;
  readonly playing: boolean;
  play: () => void;
}
type PonteNativa = (player: unknown, rate: number) => boolean;
// Native Float values (e.g. 0.899999976) must not cause another rate write.
const diferente = (a: number, b: number) => Math.abs(a-b) > 0.001;

export function atualizarVelocidadeDoMotor(player: MotorComVelocidade, rate: number, nativo: PonteNativa) {
  const value = arredondar(rate);
  if (nativo(player,value)) return;
  // expo-video's rate setter starts playback. Never use it for a paused player.
  if (player.playing && diferente(player.playbackRate,value)) player.playbackRate=value;
}

/** An explicit play uses the requested rate from its first audible sample. */
export function tocarNaVelocidade(player: MotorComVelocidade, rate: number) {
  const value = arredondar(rate);
  if (diferente(player.playbackRate,value)) player.playbackRate=value;
  player.play();
}
