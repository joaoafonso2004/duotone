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
  /**
   * O instante em que a MÚSICA acaba, que raramente é onde o ficheiro acaba.
   *
   * Vem da análise da cauda (ver `fimDaFaixa.ts`). Sem ela fica o fim do
   * ficheiro, que é o comportamento de sempre -- e numa faixa com três
   * segundos de silêncio no fim isso cruzava a seguinte com o nada.
   */
  fimMusicalSegundos?: number | null;
};

/** Onde a passagem deve estar terminada. */
export function fimEfectivo(c: Pick<ContextoDoCrossfade, 'duracaoSegundos' | 'fimMusicalSegundos'>): number {
  const d = c.duracaoSegundos ?? 0;
  const fim = c.fimMusicalSegundos;
  if (fim == null || !Number.isFinite(fim) || fim <= 0) return d;
  // Nunca depois do fim do ficheiro, e nunca tão cedo que a passagem não caiba.
  return Math.min(fim, d);
}

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
  const falta = fimEfectivo(c) - c.posicaoSegundos;
  return falta <= c.duracaoDoFade;
}

/**
 * No PC o segundo motor é outro IFrame do YouTube, e um IFrame precisa de tempo
 * para carregar um vídeo (e às vezes de mostrar um anúncio antes). A seguinte
 * prepara-se, calada, com esta antecedência antes de a passagem começar.
 */
export const ANTECEDENCIA_DO_PC_S = 15;

/**
 * É altura de carregar a seguinte no motor em espera? Só quando a passagem vai
 * mesmo acontecer (as mesmas condições do `podeCrossfade`), e só uma vez --
 * `seguinteCarregada` diz que já está.
 */
export function devePrepararSeguinte(c: ContextoDoCrossfade, antecedencia: number): boolean {
  if (c.aDecorrer || c.seguinteCarregada || !podeCrossfade(c)) return false;
  if (c.posicaoSegundos <= 0) return false;
  return fimEfectivo(c) - c.posicaoSegundos <= c.duracaoDoFade + antecedencia;
}

/**
 * Quanto da passagem já decorreu, lido da POSIÇÃO da faixa que sai. Negativo
 * quando a posição saiu da janela da passagem -- um seek para trás a meio: aí
 * a passagem já não tem razão de ser e aborta-se.
 */
export function decorridoDaPassagem(
  c: Pick<ContextoDoCrossfade, 'duracaoSegundos' | 'fimMusicalSegundos' | 'posicaoSegundos' | 'duracaoDoFade'>,
): number {
  return c.duracaoDoFade - (fimEfectivo(c) - c.posicaoSegundos);
}

/**
 * Com quanta antecedência, em segundos de MÚSICA, o ritmo da posição acelera
 * antes de a passagem poder começar. Com o ecrã bloqueado a posição chega de 2
 * em 2 s, e a 2× isso são 4 s de música: oito deixam sempre pelo menos uma
 * leitura rápida antes da janela da passagem.
 */
export const ANTECEDENCIA_DO_RITMO_S = 8;

export type ContextoDoRitmo = {
  /** Há uma passagem a decorrer. */
  aPassar: boolean;
  /** A faixa seguinte já está carregada no motor em espera. */
  seguintePronta: boolean;
  /** A app está à frente: há barra de progresso e letras para mexer. */
  ativa: boolean;
  posicaoSegundos: number | null;
  duracaoSegundos: number | null;
  fimMusicalSegundos?: number | null;
  duracaoDoFade: number;
};

/**
 * De quanto em quanto tempo o motor manda a posição, em segundos.
 *
 *  - durante uma passagem, 0,25 s, para a curva não se ouvir aos degraus;
 *  - com a faixa seguinte pronta, 0,5 s, para não se perder o instante de
 *    começar a passagem -- mas com o ecrã bloqueado SÓ perto do fim. A seguinte
 *    fica pronta logo no início de cada música, e o 0,5 s valia daí até ao fim:
 *    com o telemóvel no bolso eram quatro vezes mais travessias nativo -> JS do
 *    que os 2 s de sempre, durante a música inteira;
 *  - de resto, 1 s à frente e 2 s atrás.
 *
 * Sem saber onde a faixa vai ou onde acaba, fica o ritmo rápido: é o de sempre.
 */
export function intervaloDaPosicao(c: ContextoDoRitmo): number {
  if (c.aPassar) return 0.25;
  if (c.seguintePronta && (c.ativa || pertoDaPassagem(c))) return 0.5;
  return c.ativa ? 1 : 2;
}

function pertoDaPassagem(c: ContextoDoRitmo): boolean {
  const d = c.duracaoSegundos;
  const p = c.posicaoSegundos;
  if (d == null || !Number.isFinite(d) || d <= 0 || p == null || !Number.isFinite(p)) return true;
  const fade = Math.max(0, c.duracaoDoFade || 0);
  return fimEfectivo({ duracaoSegundos: d, fimMusicalSegundos: c.fimMusicalSegundos }) - p <= fade + ANTECEDENCIA_DO_RITMO_S;
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
