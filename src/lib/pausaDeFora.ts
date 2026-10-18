/**
 * Pausar e retomar FORA da app no iPhone (18/10): o ecrã bloqueado, o Centro
 * de Controlo, os AirPods, o carro.
 *
 * Esses comandos são do expo-video: ele pausa (ou toca) o AVPlayer e o JS só
 * recebe o `playingChange`. A store trata as confirmações do motor como FASE e
 * nunca como intenção (de propósito: uma confirmação atrasada ressuscitava a
 * reprodução), por isso a app continuava a "querer tocar". O watchdog via a
 * posição parada ~10 s, julgava o stream preso, trocava para o ficheiro (o
 * recuo do Opus para o AAC) e voltava a tocar: "a música voltou sozinha depois
 * de eu a pausar" (João, 5.1.8, ecrã bloqueado).
 *
 * O AVPlayer diz porque parou: `timeControlStatus` 0 é PAUSADO (alguém
 * mandou), 1 é À ESPERA de dados (um stream preso), 2 é a tocar. Vem no texto
 * do `estadoDaVelocidadeNativa` ("rate=… status=0 …"). Num binário sem ele não
 * se decide nada, e fica como antes.
 *
 * Sem imports: `scripts/test-pausa-de-fora.ts`.
 */

/** Quanto se espera antes de decidir: as chamadas e os auscultadores avisam antes, e as pausas de passagem do próprio motor acabam antes. */
export const PAUSA_DE_FORA_MS = 700;
/** Para quem decide uma interrupção logo a seguir (ver `pausouDeForaHaPouco`). */
const JANELA_DA_PAUSA_DE_FORA_MS = PAUSA_DE_FORA_MS + 600;
/** A música tinha mesmo de estar a andar: o último avanço da posição há menos disto. */
export const ANDAVA_HA_MENOS_DE_MS = 3500;

/** O `timeControlStatus` do AVPlayer, lido do estado nativo, ou `null` sem ele. */
export function estadoDoMotor(estadoNativo: string): 0 | 1 | 2 | null {
  const m = /\bstatus=(\d)\b/.exec(estadoNativo);
  if (!m) return null;
  const n = Number(m[1]);
  return n === 0 || n === 1 || n === 2 ? n : null;
}

/**
 * Foi a pessoa que pausou fora da app? Só com tudo isto ao mesmo tempo:
 * a app queria tocar, o motor que parou é o ativo e é desta faixa, está
 * PAUSADO (0, não à espera), a música ia a andar até há pouco (não é um
 * arranque nem uma troca de fonte depois de encravar), e longe do fim.
 */
export function pausaDeFora(e: {
  queriaTocar: boolean;
  motorAtivoEDestaFaixa: boolean;
  aTocar: boolean;
  estadoNativo: string;
  posicaoS: number;
  duracaoS: number | null;
  msDesdeOUltimoAvanco: number;
  entregaAMeio: boolean;
}): boolean {
  if (!e.queriaTocar || !e.motorAtivoEDestaFaixa || e.aTocar || e.entregaAMeio) return false;
  if (estadoDoMotor(e.estadoNativo) !== 0) return false;
  if (e.posicaoS <= 1) return false;
  if (e.duracaoS && e.posicaoS > e.duracaoS - 2) return false;
  return e.msDesdeOUltimoAvanco < ANDAVA_HA_MENOS_DE_MS;
}

/** Foi a pessoa que carregou em play fora da app (com a app em pausa)? */
export function playDeFora(e: {
  queriaTocar: boolean;
  motorAtivoEDestaFaixa: boolean;
  aTocar: boolean;
  estadoNativo: string;
}): boolean {
  if (e.queriaTocar || !e.motorAtivoEDestaFaixa || !e.aTocar) return false;
  return estadoDoMotor(e.estadoNativo) === 2;
}

let pausaDeForaEm = 0;
/** A pausa de fora acabou de mudar a intenção. */
export function marcarPausaDeFora(agora: number = Date.now()): void {
  pausaDeForaEm = agora;
}
/**
 * Uma interrupção (uma chamada) que chega logo a seguir a uma pausa de fora
 * conta como "estava a tocar": se a pausa foi dela e não da pessoa, a música
 * volta quando a chamada acabar.
 */
export function pausouDeForaHaPouco(agora: number = Date.now()): boolean {
  return agora - pausaDeForaEm < JANELA_DA_PAUSA_DE_FORA_MS;
}
