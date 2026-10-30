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
 * Largar o acerto de andamento do AutoMix aos poucos (30/10).
 *
 * Numa passagem "na batida" a que entra arranca à velocidade dela × a razão dos
 * andamentos (até 4 %: o fader de pitch de um DJ). No fim a loja muda de faixa
 * e o motor punha logo a velocidade dela: um DEGRAU de até 4 % (0,7 de semitom
 * com o `.varispeed`) NA FAIXA QUE AGORA SE OUVE -- a que sai já estava calada,
 * e foi aí que a nota "com a que sai já calada" enganou. O relatório de 30/10
 * mostra-o ("expo-video changed its rate 0.96 -> 1", "0.972 -> 0.95") e o João
 * reportou "mudanças de velocidade" e cortes nas transições. Agora a velocidade
 * volta à dela em poucos passos de ~1 %, ao ritmo do `timeUpdate` (e não de um
 * temporizador: com o ecrã bloqueado o iOS suspende-os).
 *
 * Poucos passos (2 a 5): cada mudança de velocidade num AVPlayer pode dar um
 * corte curto (30/9), e a nativa já a aplica por dentro, sem reavaliar o buffer.
 */
export const RELAXE_DURACAO_S = 10;
/** Abaixo disto (0,4 %) não se ouve: muda-se de uma vez, como sempre. */
export const RELAXE_MINIMO = 0.004;
export const RELAXE_PASSO_ALVO = 0.01;
export const RELAXE_PASSOS_MAXIMOS = 5;

export interface RelaxeDaVelocidade { de: number; para: number; passos: number; duracaoS: number }

/** O plano para voltar de `de` (a velocidade acertada) a `para` (a da faixa), ou null se não vale a pena. */
export function planoDoRelaxe(de: number, para: number): RelaxeDaVelocidade | null {
  if (!Number.isFinite(de) || !Number.isFinite(para) || de <= 0 || para <= 0) return null;
  const delta = Math.abs(para - de);
  if (delta <= RELAXE_MINIMO) return null;
  const passos = Math.min(RELAXE_PASSOS_MAXIMOS, Math.max(2, Math.ceil(delta / RELAXE_PASSO_ALVO)));
  return { de, para, passos, duracaoS: RELAXE_DURACAO_S };
}

/** A velocidade do passo `k` (1 a `passos`), na grelha do motor; o último é exatamente o destino. */
export function velocidadeDoPasso(p: RelaxeDaVelocidade, k: number): number {
  if (k >= p.passos) return arredondar(p.para);
  return arredondar(p.de + ((p.para - p.de) * Math.max(0, k)) / p.passos);
}

/** Quantos passos já devem estar dados, `decorridoS` depois de a faixa passar a ser a que se ouve. */
export function passosDevidos(p: RelaxeDaVelocidade, decorridoS: number): number {
  if (!Number.isFinite(decorridoS) || decorridoS <= 0) return 0;
  return Math.min(p.passos, Math.floor(decorridoS / (p.duracaoS / p.passos)));
}
