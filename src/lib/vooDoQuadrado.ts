/**
 * Entrar pelo quadrado (24/11, a opção A de docs/entrar-e-qr-maquete.html; o João:
 * "quero que expanda o quadrado da playlist ou da folder para o ecrã, como se desse
 * a impressão de que estamos a entrar mesmo").
 *
 * Tocar numa playlist, numa pasta, numa mistura ou num artista: a cor da página
 * cresce a partir do quadrado até tapar o ecrã, e a capa voa do cartão para o sítio
 * dela no topo da página. A página abre por baixo SEM animação nativa, no instante
 * em que a cor já tapa tudo, e aparece quando a capa pousa. Voltar pelo botão faz o
 * caminho ao contrário, até ao quadrado de onde saiu. O deslizar da borda continua o
 * do iPhone: para encolher com o dedo, a página de trás tinha de estar viva por
 * baixo, e a pilha nativa tira-a depois de empurrar a nova.
 *
 * Aqui as contas e o pedido, sem imports de runtime (`scripts/test-voo-do-quadrado.ts`).
 * Quem desenha é a `components/CamadaDoQuadrado.tsx`; a página que abre é embrulhada
 * pela `components/PaginaDoQuadrado.tsx`, e a capa dela marca-se com `AlvoDoVoo`.
 */

export type Retangulo = { x: number; y: number; width: number; height: number };
export type FormaDoQuadrado = 'quadrado' | 'circulo';

/** A capa que voa: as mesmas imagens do cartão (uma, ou o mosaico de quatro). */
export type CapaDoVoo = { capas: readonly string[]; forma: FormaDoQuadrado };

/** A mola da entrada da app (`ENTRADA`, lib/movimento.ts), repetida para as contas. */
export const MOLA_DO_VOO = { stiffness: 190, damping: 22, mass: 1 } as const;
/** O véu por cima da página de trás, no máximo. */
export const VEU_MAXIMO = 0.55;
/** A cor a mais do que o ecrã, para os cantos redondos do quadrado ficarem fora dele. */
export const FOLGA_DA_COR = 1.12;
/** A troca final: a camada apaga-se e a página acende, ao mesmo tempo. */
export const TROCA_MS = 180;
/** Ao voltar: a cor tapa a página antes de ela sair (130 até 25/11: a espera antes de encolher sentia-se). */
export const TAPAR_MS = 90;
/** Se a página não disser nada (rebentou, ou demorou), aparece na mesma ao fim disto. */
export const ESPERA_MAXIMA_MS = 1200;

/**
 * A posição da mola de 0 a 1 ao longo do tempo (s), sem velocidade inicial: as
 * mesmas contas do Animated.spring (stiffness/damping/mass), por passos de 1 ms.
 */
export function curvaDaMola(t: number, mola: { stiffness: number; damping: number; mass: number } = MOLA_DO_VOO): number {
  let x = 0, v = 0;
  const dt = 0.001;
  for (let s = 0; s < t; s += dt) {
    const a = (-mola.stiffness * (x - 1) - mola.damping * v) / mola.mass;
    v += a * dt;
    x += v * dt;
  }
  return x;
}

/** Quanto tempo (ms) a mola leva a assentar (a 0,5 % do fim, e parada). */
export function duracaoDaMola(mola = MOLA_DO_VOO): number {
  let x = 0, v = 0, t = 0, quieta = 0;
  const dt = 0.001;
  while (t < 3) {
    const a = (-mola.stiffness * (x - 1) - mola.damping * v) / mola.mass;
    v += a * dt; x += v * dt; t += dt;
    if (Math.abs(x - 1) < 0.005 && Math.abs(v) < 0.05) { if (++quieta > 20) break; } else quieta = 0;
  }
  return Math.round(t * 1000);
}

/** O centro de um retângulo. */
const centro = (r: Retangulo) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/**
 * A cor da página: um quadrado (ou círculo) do tamanho do cartão, que vai do sítio
 * dele para o centro do ecrã e cresce até o tapar todo, com folga. Só `transform`,
 * escala uniforme: os cantos redondos crescem com ele e ficam fora do ecrã.
 */
export function vooDaCor(de: Retangulo, ecra: { width: number; height: number }, forma: FormaDoQuadrado) {
  const lado = Math.max(1, de.width);
  const precisa = forma === 'circulo' ? Math.hypot(ecra.width, ecra.height) : Math.max(ecra.width, ecra.height);
  const c = centro(de);
  return {
    dx: ecra.width / 2 - c.x,
    dy: ecra.height / 2 - c.y,
    escala: (precisa / lado) * FOLGA_DA_COR,
  };
}

/** A capa: de um retângulo para o outro (centro a centro, escala pela largura). */
export function vooDaCapa(de: Retangulo, ate: Retangulo) {
  const a = centro(de), b = centro(ate);
  return { dx: b.x - a.x, dy: b.y - a.y, escala: ate.width / Math.max(1, de.width) };
}

/**
 * A cor tapa o ecrã todo quando o quadrado, já deslocado e crescido, contém os
 * quatro cantos. Com um círculo, quando os quatro cantos ficam dentro dele.
 * `p` é a posição da mola (0 a 1). Os cantos redondos do quadrado contam: o canto
 * do ecrã tem de estar dentro do quadrado menos o arredondado.
 */
export function corTapa(p: number, de: Retangulo, ecra: { width: number; height: number }, forma: FormaDoQuadrado, raio: number): boolean {
  const v = vooDaCor(de, ecra, forma);
  const s = 1 + (v.escala - 1) * p;
  const c = centro(de);
  const cx = c.x + v.dx * p, cy = c.y + v.dy * p;
  const cantos = [[0, 0], [ecra.width, 0], [0, ecra.height], [ecra.width, ecra.height]];
  if (forma === 'circulo') {
    const r = (de.width / 2) * s;
    return cantos.every(([x, y]) => Math.hypot(x - cx, y - cy) <= r);
  }
  const meio = (de.width / 2) * s - raio * s * (1 - Math.SQRT1_2);
  return cantos.every(([x, y]) => Math.abs(x - cx) <= meio && Math.abs(y - cy) <= meio);
}

/**
 * Quando (ms) a cor já tapa tudo: é aí que a página nova abre por baixo, sem
 * animação. Antes disso via-se a de trás desaparecer pelas frestas.
 */
export function momentoDeAbrir(de: Retangulo, ecra: { width: number; height: number }, forma: FormaDoQuadrado, raio: number, mola = MOLA_DO_VOO): number {
  let x = 0, v = 0;
  const dt = 0.001;
  for (let t = 0; t < 3; t += dt) {
    const a = (-mola.stiffness * (x - 1) - mola.damping * v) / mola.mass;
    v += a * dt; x += v * dt;
    if (corTapa(x, de, ecra, forma, raio)) return Math.round((t + dt) * 1000);
  }
  return duracaoDaMola(mola);
}

/**
 * Onde a capa pousa numa página que não tem capa no topo (uma pasta, uma mistura):
 * no título, pequena, e apaga-se a chegar (`apagaAoPousar`).
 */
export function alvoSemCapa(ecra: { width: number }, topo: number): Retangulo {
  return { x: 20, y: topo + 52, width: 40, height: 40 };
}

// ------------------------------------------------------- o pedido ----

export type PedidoDeVoo =
  | { tipo: 'entrar'; id: string; de: Retangulo; raio: number; capa: CapaDoVoo | null; navegar: () => void }
  | { tipo: 'voltar'; id: string; sair: () => void };

let ouvinte: ((p: PedidoDeVoo) => boolean) | null = null;

/** Quem desenha (a camada da raiz no iPhone) fica à escuta. Um de cada vez. */
export function ouvirVoos(f: (p: PedidoDeVoo) => boolean): () => void {
  ouvinte = f;
  return () => { if (ouvinte === f) ouvinte = null; };
}

/** Pede um voo. `false` quando não há quem o desenhe (então navega-se como sempre). */
export function pedirVoo(p: PedidoDeVoo): boolean {
  return ouvinte ? ouvinte(p) : false;
}

let proximo = 0;
export const novoIdDeVoo = (): string => `voo-${Date.now().toString(36)}-${(proximo++).toString(36)}`;

/**
 * A cascata quando a capa pousa (25/11, item 3 do plano, `docs/premium-ios-maquete.html#cascata`):
 * as primeiras linhas sobem e acendem uma a uma. UMA animação de 0 a 1 por página
 * (linear, no driver nativo), e cada linha lê a sua janela dela, já com a curva.
 */
export const CASCATA = {
  /** Só as que se veem ao abrir. */
  linhas: 10,
  /** Quanto sobem, em pt. */
  desvio: 14,
  duracaoMs: 760,
  /** Onde começa cada linha, em fração do total (~30 ms entre elas). */
  passo: 0.04,
  /** Quanto dura cada linha, em fração do total (~460 ms). */
  janela: 0.6,
} as const;

/** A janela de uma linha, amostrada com uma saída suave (o `cubic-bezier(.2,.9,.25,1)` da maquete). */
export function entradaDaLinha(indice: number): { inputRange: number[]; opacidade: number[]; desvio: number[] } {
  const inicio = Math.min(indice, CASCATA.linhas - 1) * CASCATA.passo;
  const inputRange: number[] = [], opacidade: number[] = [], desvio: number[] = [];
  const PONTOS = 6;
  for (let k = 0; k <= PONTOS; k++) {
    const t = k / PONTOS;
    const e = 1 - Math.pow(1 - t, 3);
    inputRange.push(+(inicio + t * CASCATA.janela).toFixed(4));
    opacidade.push(+e.toFixed(4));
    desvio.push(+(CASCATA.desvio * (1 - e)).toFixed(3));
  }
  return { inputRange, opacidade, desvio };
}
