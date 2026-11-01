/**
 * A luz como estado (S2 da auditoria de 31/10, `docs/elevacao-maquete.html`).
 *
 * Uma peça só, o Reflexo. Aqui fica a forma em PLANO, uma banda de luz que
 * passa por uma superfície. A forma em disco, o laço do metal escovado, chega
 * com o play e a pausa (C3), que é quem a usa. As quatro regras:
 *
 *  1. Muda-se de estado movendo a luz, não as coisas.
 *  2. **Uma luz a andar de cada vez** (`pedirLuz`). Se outra já está a passar,
 *     a segunda vira um degrau de opacidade, sem se deslocar. Duas bandas ao
 *     mesmo tempo liam-se como uma montra, não como um estado.
 *  3. A direção é o significado: → avançar, juntar, seguinte; ← voltar,
 *     desfazer, tirar; ↓ chegada.
 *  4. A luz nunca dá a volta em ciclo, salvo ao carregar, e aí no máximo 4 s.
 *
 * Com menos movimento, a luz salta: é sempre o degrau.
 *
 * Quem desenha: `desktop/Luz.web.ts` (Web Animations) e `components/BandaDeLuz.tsx`
 * (o `Animated` com o driver nativo). Sem imports: `scripts/test-luz.ts`.
 */

export type DirecaoDaLuz = 'avancar' | 'voltar' | 'chegada';

/**
 * A banda anda com o TRAVÃO, e não com uma mola. É a quinta peça da física
 * (o `Animated.decay` do iPhone, a curva `travar` do PC): a luz é atirada e
 * vai perdendo velocidade. As quatro molas põem 90 % do caminho no primeiro
 * terço, e a banda atravessava o aviso em 200 ms, um clarão e não uma luz a
 * passar (visto no Chromium a 1/11). Com o travão atravessa-o em ~370 ms.
 * Perde esta parte da velocidade por milissegundo, a mesma do `molasEmCss`.
 */
export const TRAVAO = 0.994;
/** Até assentar (falta 0,2 % do caminho): ~1 s, quase todo já fora da superfície. */
export const LUZ_MS = Math.round(Math.log(0.002) / Math.log(TRAVAO));
/** O degrau: a segunda luz, ou com menos movimento. Acende e apaga, sem andar. */
export const DEGRAU_MS = 420;
/** A carregar, a luz pode dar a volta, mas nunca mais do que isto (regra 4). */
export const CICLO_MAXIMO_MS = 4000;

/** O pico da banda: uma luz que passa, não um flash. */
export const OPACIDADE_DA_BANDA = 0.24;
/** O degrau é metade: lê-se como a mesma luz, sem se deslocar. */
export const OPACIDADE_DO_DEGRAU = 0.12;
/** A banda ocupa esta parte do lado por onde anda. */
export const LARGURA_DA_BANDA = 0.45;

/**
 * Por onde a banda anda, em larguras dela própria (o `translate` em % do
 * elemento da banda). Começa e acaba fora da superfície: entra por um lado e
 * sai pelo outro, sem nunca parar à vista.
 */
export function trajetoDaBanda(d: DirecaoDaLuz): { eixo: 'x' | 'y'; de: number; para: number } {
  // A mesma folga dos dois lados: com folgas diferentes, a luz ← ficava mais
  // tempo à vista do que a → (480 contra 375 ms, medido no Chromium a 1/11).
  const folga = 0.4;
  const fora = -1 - folga;
  const doOutroLado = 1 / LARGURA_DA_BANDA + folga;
  if (d === 'chegada') return { eixo: 'y', de: fora, para: doOutroLado };
  return d === 'avancar' ? { eixo: 'x', de: fora, para: doOutroLado } : { eixo: 'x', de: doOutroLado, para: fora };
}

/**
 * Quanto tempo a banda está À VISTA: do início até sair pelo outro lado. O
 * resto do travão já é fora da superfície. É isto que ocupa a luz (regra 2):
 * uma segunda luz depois de a primeira sair não tem de ser um degrau.
 */
function tempoAVista(): number {
  const { de, para } = trajetoDaBanda('avancar');
  const saida = (1 / LARGURA_DA_BANDA - de) / (para - de);
  return Math.round(Math.log(1 - saida) / Math.log(TRAVAO));
}
export const LUZ_A_PASSAR_MS = tempoAVista();

/**
 * A direção do aviso que chega (o primeiro uso, como na maquete):
 * - quem avisa pode dizê-la (`luz`): largar uma música numa playlist mostra
 *   "Added to …" com "Undo", e juntou;
 * - um erro não acende. Nada avançou, e uma luz por cima de uma falha
 *   lia-se como uma festa;
 * - com "Undo" e sem mais nada, foi uma coisa que SAIU (o aviso nasceu para
 *   isso, 3/10): ←;
 * - uma informação chegou: ↓;
 * - um sucesso juntou ou guardou: →.
 */
export function direcaoDoAviso(a: {
  tipo?: 'feito' | 'erro' | 'info'; desfazer?: unknown; luz?: DirecaoDaLuz | null;
} | null | undefined): DirecaoDaLuz | null {
  if (!a) return null;
  if (a.luz !== undefined) return a.luz;
  if (a.tipo === 'erro') return null;
  if (a.desfazer) return 'voltar';
  return a.tipo === 'info' ? 'chegada' : 'avancar';
}

/** Quanto tempo uma luz a carregar pode andar em ciclo (regra 4). */
export function duracaoDoCiclo(pedido: number): number {
  return Math.max(0, Math.min(CICLO_MAXIMO_MS, pedido));
}

/**
 * O registo da regra 2. É pelo RELÓGIO e não por "acabei": uma animação
 * cortada a meio (o aviso que sai, o ecrã que muda) nunca chega a avisar, e
 * a luz ficava presa para sempre.
 */
export function criarLuz(agora: () => number = () => Date.now()) {
  let ocupadaAte = 0;
  return {
    /** `true`: esta luz anda. `false`: outra está a passar, faz o degrau. */
    pedir(ms: number = LUZ_A_PASSAR_MS): boolean {
      const t = agora();
      if (t < ocupadaAte) return false;
      ocupadaAte = t + ms;
      return true;
    },
    ocupada: () => agora() < ocupadaAte,
  };
}

const luz = criarLuz();
export const pedirLuz = luz.pedir;
