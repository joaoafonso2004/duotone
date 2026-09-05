/**
 * O iOS a tirar e a devolver o áudio.
 *
 * Uma chamada, um alarme, um vídeo do Instagram a começar com som — o sistema
 * tira o áudio à app e o AVPlayer pára. Do lado do JS isso chegava como uma
 * pausa igual a qualquer outra, e a máquina de estados trata as confirmações do
 * motor como FASE e nunca como intenção, de propósito (ver
 * `lib/playbackMachine.ts`). Resultado: a música calava-se e a app continuava a
 * mostrar-se a tocar, e era preciso carregar em pausa e outra vez em play para
 * voltar a ouvir.
 *
 * O expo-video não observa isto — só o `mediaServicesWereReset`. Quem avisa é o
 * `modules/duotone-remote-commands`, que já estava a ouvir o sistema para os
 * botões do Lock Screen.
 *
 * Função pura -- ver scripts/test-interrupcao-de-audio.ts.
 */

export type FimDaInterrupcao = {
  /** A app queria estar a tocar quando o áudio lhe foi tirado. */
  tocavaAntes: boolean;
  /** O sistema pediu a retoma (`AVAudioSession.InterruptionOptions.shouldResume`). */
  oSistemaPede: boolean;
};

/**
 * Volta a tocar sozinha?
 *
 * São duas perguntas, e as duas têm de dar que sim.
 *
 * A PRIMEIRA é se a app estava mesmo a tocar quando o áudio lhe foi tirado. Uma
 * interrupção que apanha a música já em pausa não tem nada para devolver, e
 * arrancar som que ninguém pediu é pior do que não fazer nada.
 *
 * A SEGUNDA é o `shouldResume` do próprio sistema, e é ela que separa os dois
 * casos que daqui pareciam iguais. Um som de passagem — o vídeo que acabou, a
 * chamada que se desligou — devolve o áudio e pede a retoma. Outra app de
 * MÚSICA que ficou com ele não pede nada: voltar a tocar seria pôr duas
 * músicas uma por cima da outra, e num carro ou nuns auscultadores é
 * exatamente o que ninguém quer.
 *
 * Não se adivinha nenhuma das duas: a primeira lê-se da nossa própria intenção
 * no instante em que a interrupção começou, a segunda vem do iOS.
 */
export function deveRetomar(fim: FimDaInterrupcao): boolean {
  return fim.tocavaAntes && fim.oSistemaPede;
}
