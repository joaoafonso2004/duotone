/**
 * O motor diz que está a tocar e o relógio não anda.
 *
 * ## Porque é que isto existe em vez de uma correcção da causa
 *
 * Este bug já levou duas explicações minhas e as duas estavam erradas.
 *
 * A primeira dizia que a máquina de estados saltava um passo no `ended`; era
 * verdade que saltava, mas o `isPlaying` vem da INTENÇÃO e não da fase, por
 * isso não era isso que travava nada. A segunda dizia que a guarda do
 * `_sincronizarPausa` engolia a ordem de tocar; era verdade que engolia, e o
 * `_forcarReproducao` passou a mandá-la sempre -- e o convidado continuou
 * preso nos 0:00.
 *
 * O que sobrevive às duas tentativas é uma observação, não uma teoria: **o
 * `play()` chega ao motor e o motor não anda**, e quem cura é o SEEK que a
 * pausa do anfitrião provoca. Isso aponta para o AVPlayer -- que acabou de
 * tocar um item até ao fim e recebe outro por baixo -- e não para nada que se
 * veja daqui.
 *
 * Portanto: em vez de uma terceira teoria, uma rede. Se a sessão diz que se
 * está a tocar, o ficheiro está cá, e a posição não anda durante tempo que
 * chegue, aplica-se exactamente o remédio que funciona à mão. Não é elegante
 * e não finge ser uma explicação. É uma coisa que se recupera sozinha em vez
 * de ficar à espera que alguém carregue em pausa.
 *
 * Sem imports de runtime: `scripts/test-arranque-travado.ts` corre isto em
 * Node puro.
 */

/**
 * Quanto tempo parado antes de se empurrar.
 *
 * Tem de ser maior do que um soluço de rede e menor do que a paciência de
 * quem está à espera. Dois segundos e meio: quem está do outro lado ainda
 * pensa que a música está a começar.
 */
export const PARADO_DEMAIS_MS = 2500;

/**
 * Quantas vezes se tenta na mesma faixa.
 *
 * Três. Se três seeks não arrancaram, o problema não é este e insistir passa a
 * ser um seek de dois em dois segundos numa música que ninguém está a ouvir --
 * que é pior do que estar parado.
 */
export const EMPURROES_POR_FAIXA = 3;

export type EstadoDoArranque = {
  /** A sessão diz que se está a tocar. */
  sessaoATocar: boolean;
  /** A app tenciona estar a tocar (a intenção, não a fase). */
  querTocar: boolean;
  /** O motor tem mesmo esta faixa carregada e responde. */
  pronta: boolean;
  /** Posição do motor, em ms. */
  posicaoMs: number;
  /** Há quanto tempo a posição está no mesmo sítio. */
  paradoMs: number;
  /** Quantos empurrões já se deram nesta faixa. */
  empurroesDados: number;
};

/**
 * Vale a pena empurrar agora?
 *
 * O `posicaoMs` entra na decisão de propósito: só se empurra uma faixa que
 * nunca chegou a arrancar. Uma que parou a meio é outro problema -- fim de
 * faixa, buffer vazio, rede -- e tem quem trate dela no `fimDeFaixa.ts`.
 * Empurrar aqui seria dois watchdogs a saltar sobre o mesmo sintoma.
 */
export function precisaDeEmpurrao(e: EstadoDoArranque): boolean {
  if (!e.sessaoATocar || !e.querTocar || !e.pronta) return false;
  if (e.empurroesDados >= EMPURROES_POR_FAIXA) return false;
  if (e.posicaoMs > 1000) return false;
  return e.paradoMs >= PARADO_DEMAIS_MS;
}
