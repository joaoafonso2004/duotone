/**
 * A luz como estado (S2 da auditoria de 31/10, `docs/elevacao-maquete.html`).
 *
 * Uma peça só, o Reflexo, em duas formas: em PLANO, uma banda de luz que passa
 * por uma superfície (os avisos); em DISCO, o laço do metal escovado (o play do
 * PC, C3, mais abaixo). As quatro regras:
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
    /** Ocupa sem perguntar (o dedo): nunca encurta uma luz que já lá está. */
    ocupar(ms: number): void {
      ocupadaAte = Math.max(ocupadaAte, agora() + ms);
    },
  };
}

const luz = criarLuz();
export const pedirLuz = luz.pedir;

/*
 * A forma em DISCO (C3, o play e a pausa do PC, 1/11): o laço do metal
 * escovado, as duas cunhas opostas de luz de um botão de alumínio. As contas
 * são as do `scripts/gerar-reflexo-do-disco.py` (o sprite da maquete), em CSS:
 * no PC não há ficheiro a carregar, e a janela do mini leitor, que é outro
 * documento, desenha-o igual.
 */

/** Quão estreitas são as cunhas: o expoente do cos(2θ), como no gerador. */
export const ESTREITEZA_DO_LACO = 6;
/** O laço por cima do metal, em `screen` (a maquete: "reflexo a 60 %"). */
export const OPACIDADE_DO_REFLEXO = 0.6;
/** Com menos movimento o laço não roda: muda de ângulo num degrau (150 ms). */
export const DEGRAU_DO_REFLEXO_MS = 150;

const branco = (a: number) => `rgba(255,255,255,${Math.round(a * 1000) / 1000})`;

/**
 * O laço como `conic-gradient`: luz cos(2(θ-45°))⁶ (as cunhas no canto de cima
 * à direita e no de baixo à esquerda, como o sprite), de `passo` em `passo` graus.
 */
export function lacoConico(passo = 7.5): string {
  const paragens: string[] = [];
  for (let g = 0; g <= 360; g += passo) {
    const c = Math.max(0, Math.cos(2 * ((g - 45) * Math.PI) / 180));
    paragens.push(`${branco(c ** ESTREITEZA_DO_LACO)} ${g}deg`);
  }
  return `conic-gradient(${paragens.join(', ')})`;
}

/**
 * Mais forte a meio do raio, como no gerador: √(1 - (2r - 1,1)²). O metal perto
 * do centro e da borda é menos plano e não apanha a luz. Vai como máscara.
 */
export function quedaDoReflexo(): string {
  const paragens: string[] = [];
  for (let i = 0; i <= 10; i++) {
    const r = i / 10;
    paragens.push(`${branco(Math.sqrt(Math.max(0, 1 - (2 * r - 1.1) ** 2)))} ${r * 100}%`);
  }
  return `radial-gradient(circle closest-side, ${paragens.join(', ')})`;
}

/**
 * Os riscos concêntricos: anéis finos, um pouco mais escuros, que tiram ao
 * laço o ar de spot e lhe dão o de metal (o gerador modula a luz em 22 %).
 */
export const RISCOS_DO_REFLEXO = `repeating-radial-gradient(circle, ${branco(1)} 0 0.6px, ${branco(0.78)} 0.6px 1.3px)`;

/**
 * Quanto o laço roda, e com quê:
 * - pausa: trava como um prato de gira-discos, meia volta a perder velocidade
 *   (o travão);
 * - play: arranca, um quarto de volta com um pequeno ressalto (a mola SOLTAR).
 * Sempre no mesmo sentido: o prato não anda para trás.
 */
export function voltaDoDisco(aTocar: boolean): { graus: number; curva: 'soltar' | 'travar' } {
  return aTocar ? { graus: 90, curva: 'soltar' } : { graus: 180, curva: 'travar' };
}

/**
 * O dedo manda (princípio 4): o play roda SEMPRE, mesmo com outra luz a
 * passar. Mas ocupa a luz enquanto roda, para que um aviso que chegue nesse
 * momento seja o degrau e não uma segunda luz a andar.
 */
export function ocuparLuz(ms: number): void {
  luz.ocupar(ms);
}
