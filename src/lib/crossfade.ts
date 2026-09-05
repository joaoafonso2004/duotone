/**
 * As decisões da passagem entre faixas, sem tocar em nenhum motor de áudio.
 *
 * Todo o crossfade se resume a quatro perguntas, e estão todas aqui: pode-se
 * fazer, já é altura, que volumes é que os dois motores levam neste instante, e
 * o que acontece quando alguém interrompe a meio.
 *
 * Vive à parte porque é a parte que se consegue PROVAR. O resto — dois
 * AVPlayers, a troca de papéis, quem publica o ecrã de bloqueio — só um
 * telemóvel confirma, e cada tentativa é uma build. Quanto mais decisão viver
 * aqui, menos há para descobrir lá.
 *
 * Funções puras -- ver scripts/test-crossfade.ts.
 */

/** As durações oferecidas. Zero é a definição desligada, que é a que vem de
 * origem: um crossfade não pedido numa app de música é uma surpresa. */
export const DURACOES_DO_CROSSFADE = [0, 3, 6, 9] as const;
export type DuracaoDoCrossfade = (typeof DURACOES_DO_CROSSFADE)[number];

export type ContextoDoCrossfade = {
  /** Segundos escolhidos nas Definições. 0 desliga tudo. */
  duracaoDoFade: number;
  /** A duração da faixa a tocar, ou null quando não é de confiança. */
  duracaoSegundos: number | null;
  posicaoSegundos: number;
  temFaixaSeguinte: boolean;
  /** Repeat "one" repete a MESMA faixa: não há passagem nenhuma a fazer. */
  repeatUma: boolean;
  /** Fora do motor nativo (embed do YouTube) não há dois players para cruzar. */
  backendNativo: boolean;
  /** O segundo motor já tem a faixa seguinte pronta a soar. */
  seguinteCarregada: boolean;
  /** Já está uma passagem a decorrer. */
  aDecorrer: boolean;
};

/**
 * Estão reunidas as condições para haver passagem nesta faixa?
 *
 * A guarda da duração é a que interessa mais: a duração do YouTube mente com
 * alguma frequência, e sem ela não se sabe quando é o fim. Sem duração de
 * confiança não há crossfade — cai-se no corte de sempre, que funciona.
 *
 * Exige-se também que a faixa seja pelo menos o dobro do fade: cruzar seis
 * segundos numa faixa de oito é quase só fade.
 */
export function podeCrossfade(c: ContextoDoCrossfade): boolean {
  if (c.duracaoDoFade <= 0) return false;
  if (!c.backendNativo || !c.temFaixaSeguinte || c.repeatUma) return false;
  const d = c.duracaoSegundos;
  if (d == null || !Number.isFinite(d) || d <= 0) return false;
  return d >= c.duracaoDoFade * 2;
}

/** É agora. Uma vez só por faixa — quem chama garante isso com o `aDecorrer`. */
export function deveComecarCrossfade(c: ContextoDoCrossfade): boolean {
  if (c.aDecorrer || !c.seguinteCarregada) return false;
  if (!podeCrossfade(c)) return false;
  // A posição tem de ter andado: no instante zero de uma faixa curta, `falta`
  // podia já estar dentro da janela e a passagem começava antes de a música
  // chegar a ouvir-se.
  if (c.posicaoSegundos <= 0) return false;
  const falta = c.duracaoSegundos! - c.posicaoSegundos;
  return falta <= c.duracaoDoFade;
}

/**
 * Os dois volumes num instante da passagem.
 *
 * A curva é de IGUAL POTÊNCIA, e não linear. Somar dois volumes lineares que se
 * cruzam a meio dá 0,5 + 0,5 = 1 em amplitude, mas o ouvido responde à potência
 * — e aí o meio do caminho afunda de forma audível. Com seno e cosseno a soma
 * das potências mantém-se constante, e a passagem não tem buraco no meio.
 *
 * Os tetos entram porque cada faixa tem o seu, vindo da normalização de
 * loudness: a passagem tem de respeitar os dois, senão a que entra salta.
 */
export function volumesDoCrossfade(
  decorridoSegundos: number,
  duracaoDoFade: number,
  tetoQueSai: number,
  tetoQueEntra: number,
): { sai: number; entra: number } {
  if (!(duracaoDoFade > 0)) return { sai: 0, entra: tetoQueEntra };
  const x = Math.min(1, Math.max(0, decorridoSegundos / duracaoDoFade));
  return {
    sai: tetoQueSai * Math.cos((x * Math.PI) / 2),
    entra: tetoQueEntra * Math.sin((x * Math.PI) / 2),
  };
}

export type Interrupcao = 'salto' | 'anterior' | 'faixa-nova' | 'pausa' | 'seek' | 'fechar';
export type AcaoAoInterromper = 'cortar' | 'suspender' | 'abortar';

/**
 * O que fazer quando alguém mexe a meio de uma passagem.
 *
 * São três saídas, e a diferença entre duas delas é a que custou a ver:
 *
 * - `cortar` termina a passagem JÁ e quem estava a entrar fica a tocar
 *   sozinho, no seu teto. É o caso de quem carrega em seguinte: a faixa que
 *   estava a entrar é precisamente a que a pessoa pediu.
 * - `abortar` faz o contrário: cala quem estava a entrar e devolve a faixa
 *   atual ao seu teto. É o caso do `seek` (a posição deixou de estar no fim,
 *   a razão da passagem desapareceu) e o de saltar para uma faixa QUALQUER,
 *   que não é a que estava a entrar -- deixá-la a tocar punha duas músicas
 *   ao mesmo tempo.
 * - `suspender` pára os dois e guarda o ponto, para a passagem continuar de
 *   onde ia. Só a pausa: quem pausa quer voltar.
 *
 * O `oQueEntraFicaATocar` é o que separa `cortar` de `abortar`, e não o
 * motivo: carregar em seguinte e escolher à mão a faixa seguinte são o mesmo
 * acontecimento visto de dois sítios.
 */
export function acaoAoInterromper(
  motivo: Interrupcao,
  oQueEntraFicaATocar = false,
): AcaoAoInterromper {
  if (motivo === 'pausa') return 'suspender';
  return oQueEntraFicaATocar ? 'cortar' : 'abortar';
}
