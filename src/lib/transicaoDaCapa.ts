/**
 * O "Recuo subtil" do skip na capa 3D do iPhone.
 *
 * Escolhido a 14/9 depois de três rondas de previews: o parafuso, a pilha, o
 * tombar e companhia foram rejeitados por não serem "clean". Ficou o mínimo que
 * ainda se lê como movimento: a caixa recua um pouco ao longo do seu eixo,
 * desvia-se no sentido do skip -- seguinte para a direita, anterior para a
 * esquerda -- e volta com uma mola leve, enquanto a capa nova cruza por cima da
 * antiga.
 *
 * Aqui só os números e as decisões; o movimento vive no `CapaFlutuante3D` e o
 * cruzamento no `CapaComTransicao`. Sem imports de runtime, testado em
 * `scripts/test-transicao-da-capa.ts`.
 */

export const RECUO = {
  /** Quanto a caixa recua ao longo do seu eixo, em lados. */
  profundidade: 0.1,
  /** O desvio lateral no sentido do skip, em lados. */
  desvio: 0.035,
  /** A ida é curta; a volta é uma mola. */
  idaMs: 150,
  mola: { speed: 14, bounciness: 5 },
  /** A capa nova a cruzar com a antiga (a `transition` do expo-image, no CapaComTransicao). */
  cruzarMs: 260,
  /** Um next/prev só dá sentido à transição se a faixa mudou até este tempo depois. */
  janelaDoSaltoMs: 2500,
} as const;

/** +1 = seguinte (direita), -1 = anterior (esquerda), 0 = a faixa mudou sem skip. */
export type Sentido = 1 | -1 | 0;
export type SaltoDaFaixa = { direcao: 1 | -1; em: number };

export function sentidoDaTransicao(salto: SaltoDaFaixa | null | undefined, agora: number): Sentido {
  if (!salto) return 0;
  const idade = agora - salto.em;
  return idade >= 0 && idade <= RECUO.janelaDoSaltoMs ? salto.direcao : 0;
}

/**
 * O movimento, em pontos -- ou null quando não há recuo: na capa Simple (não há
 * caixa para recuar) e com Reduzir movimento. Nesses casos fica só o cruzamento.
 */
export function recuoDaCapa(o: {
  lado: number; sentido: Sentido; capa3D: boolean; reduzirMovimento: boolean;
}): { profundidade: number; desvio: number } | null {
  if (!o.capa3D || o.reduzirMovimento || o.lado <= 0) return null;
  return { profundidade: -RECUO.profundidade * o.lado, desvio: RECUO.desvio * o.lado * o.sentido };
}

/**
 * A mola do `Animated.spring` a partir de `speed`/`bounciness`: a mesma
 * conversão que o React Native faz por dentro (SpringConfig.fromBouncinessAndSpeed),
 * para a curva amostrada ser a mola que se aprovou e não uma parecida.
 */
export function molaDoRN(bounciness: number, speed: number): { rigidez: number; amortecimento: number } {
  const normalizar = (v: number, a: number, b: number) => (v - a) / (b - a);
  const projetar = (n: number, a: number, b: number) => a + n * (b - a);
  const linear = (t: number, a: number, b: number) => t * b + (1 - t) * a;
  const quadOut = (t: number, a: number, b: number) => linear(2 * t - t * t, a, b);
  const f1 = (x: number) => 0.0007 * x ** 3 - 0.031 * x ** 2 + 0.64 * x + 1.28;
  const f2 = (x: number) => 0.000044 * x ** 3 - 0.006 * x ** 2 + 0.36 * x + 2;
  const f3 = (x: number) => 0.00000045 * x ** 3 - 0.000332 * x ** 2 + 0.1078 * x + 5.84;
  const semRessalto = (t: number) => (t <= 18 ? f1(t) : t <= 44 ? f2(t) : f3(t));
  const b = projetar(normalizar(bounciness / 1.7, 0, 20), 0, 0.8);
  const tensao = projetar(normalizar(speed / 1.7, 0, 20), 0.5, 200);
  const atrito = quadOut(b, semRessalto(tensao), 0.01);
  return { rigidez: (tensao - 30) * 3.62 + 194, amortecimento: (atrito - 8) * 3 + 25 };
}

/**
 * O "Recuo subtil" inteiro como UMA curva (2/10), para o motor nativo o
 * percorrer de uma vez: a ida (`idaMs`, ease-out) e a volta (a mola
 * `RECUO.mola`, a partir do ponto mais fundo e parada).
 *
 * Eram duas animações em sequência, e quem arrancava a segunda (a volta) era o
 * JavaScript -- no instante em que está ocupado a trocar de faixa. A caixa
 * ficava parada no fundo ~150 ms e depois saltava: o "encrava e dá snap" (João,
 * vídeo de 2/10). Assim não há passagem pelo JavaScript a meio.
 *
 * `curva` vai de 0 (no sítio) a 1 (o fundo, aos `idaMs`) e volta a 0. `largar`
 * é por onde sai o que sobrava de um recuo anterior (skips seguidos): 1 no
 * início, 0 no fim da ida -- a caixa parte de onde estava, sem saltar.
 */
export function curvaDoSkip(): { duracaoMs: number; inputRange: number[]; curva: number[]; largar: number[] } {
  const ida = RECUO.idaMs;
  const { rigidez, amortecimento } = molaDoRN(RECUO.mola.bounciness, RECUO.mola.speed);
  // A volta, simulada ao meio milissegundo até estar parada (como o RN: 0,001).
  const volta: number[] = [];
  let x = 1, v = 0;
  const dt = 0.0005;
  for (let passo = 0; passo < 4000; passo++) {
    if (passo % 2 === 0) volta.push(x);
    if (passo > 0 && Math.abs(x) < 0.001 && Math.abs(v) < 0.001) break;
    const a = -rigidez * x - amortecimento * v;
    v += a * dt;
    x += v * dt;
  }
  const duracaoMs = ida + volta.length - 1;
  const tempos: number[] = [];
  for (let ms = 0; ms < ida; ms += 10) tempos.push(ms);
  for (let ms = ida; ms < duracaoMs; ms += 16) tempos.push(ms);
  tempos.push(duracaoMs);
  const quadOut = (t: number) => 1 - (1 - t) * (1 - t);
  const curva = tempos.map((ms) => (ms <= ida ? quadOut(ms / ida) : ms >= duracaoMs ? 0 : volta[Math.round(ms - ida)]!));
  const largar = tempos.map((ms) => (ms >= ida ? 0 : 1 - quadOut(ms / ida)));
  return { duracaoMs, inputRange: tempos.map((ms) => ms / duracaoMs), curva, largar };
}

/** O valor de uma curva amostrada em `t` (0 a 1), como o `interpolate` o daria. */
export function naCurva(inputRange: readonly number[], valores: readonly number[], t: number): number {
  if (t <= inputRange[0]!) return valores[0]!;
  for (let i = 1; i < inputRange.length; i++) {
    if (t <= inputRange[i]!) {
      const a = inputRange[i - 1]!, b = inputRange[i]!;
      return valores[i - 1]! + (valores[i]! - valores[i - 1]!) * ((t - a) / (b - a || 1));
    }
  }
  return valores[valores.length - 1]!;
}
