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

/**
 * Por onde sai o som, como o iOS o diz (`AVAudioSessionPortDescription`):
 * `tipo` é o `portType` em bruto ("Speaker", "Headphones",
 * "BluetoothA2DPOutput"...) e `nome` o que se vê nas Definições do iPhone.
 */
export type Saida = { tipo: string; nome: string };

/** O altifalante e o auscultador do próprio iPhone: o som que toda a gente ouve. */
const INTERNAS = new Set(['Speaker', 'Receiver']);

export function ehInterna(saida: Saida | null | undefined): boolean {
  return !!saida && INTERNAS.has(saida.tipo);
}

export type FimDaInterrupcao = {
  /** A app queria estar a tocar quando o áudio lhe foi tirado. */
  tocavaAntes: boolean;
  /** O sistema pediu a retoma (`AVAudioSession.InterruptionOptions.shouldResume`). */
  oSistemaPede: boolean;
  /** Por onde saía o som quando a interrupção começou. Vazio num binário antigo. */
  saidaAntes?: Saida | null;
  /** Por onde sairia agora. Vazio num binário antigo. */
  saidaDepois?: Saida | null;
  /** O iOS disse, a meio, que a saída anterior desapareceu. */
  saidaRemovidaAMeio?: boolean;
};

/**
 * Volta a tocar sozinha?
 *
 * A PRIMEIRA pergunta é se a app estava mesmo a tocar quando o áudio lhe foi
 * tirado. Uma interrupção que apanha a música já em pausa não tem nada para
 * devolver, e arrancar som que ninguém pediu é pior do que não fazer nada.
 *
 * A SEGUNDA é o `shouldResume` do próprio sistema, e é ela que separa os dois
 * casos que daqui pareciam iguais. Um som de passagem — o vídeo que acabou, a
 * chamada que se desligou — devolve o áudio e pede a retoma. Outra app de
 * MÚSICA que ficou com ele não pede nada: voltar a tocar seria pôr duas
 * músicas uma por cima da outra.
 *
 * A TERCEIRA é por onde o som vai sair. **Quem estava de auscultadores e os
 * perdeu durante a chamada não pode ficar com a música no altifalante.** Isso
 * decidia-se pelo aviso de "saída removida" a meio da chamada, e era o que
 * impedia a retoma com AirPods (16/9): numa chamada o iOS troca o aparelho do
 * perfil de música para o de mãos-livres e chama a isso "a saída anterior
 * desapareceu", com os AirPods ainda nos ouvidos. Agora comparam-se as saídas
 * do princípio e do fim: só não se retoma se se passou de uns auscultadores
 * (ou do carro) para o altifalante. O aviso a meio só decide quando o binário
 * não traz as saídas.
 */
export function deveRetomar(fim: FimDaInterrupcao): boolean {
  if (!fim.tocavaAntes || !fim.oSistemaPede) return false;
  if (fim.saidaAntes && fim.saidaDepois) {
    return !(!ehInterna(fim.saidaAntes) && ehInterna(fim.saidaDepois));
  }
  return !fim.saidaRemovidaAMeio;
}

/** Uma linha para o relatório de reprodução, sem nada que identifique a pessoa. */
export function descreverSaida(saida: Saida | null | undefined): string {
  return saida?.tipo ? saida.tipo : 'unknown output';
}
