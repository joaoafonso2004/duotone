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
  /** A capa nova por cima da antiga. */
  cruzarMs: 260,
  /** Um next/prev só dá sentido à transição se a faixa mudou até este tempo depois. */
  janelaDoSaltoMs: 2500,
  /** A capa que saiu só serve de partida se saiu há tão pouco (abrir o leitor mais tarde não cruza). */
  memoriaDaCapaMs: 1500,
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
 * De que capa parte o cruzamento: da que acabou de sair, se for outra.
 *
 * O cubo da capa remonta a cada faixa (o gesto das letras depende disso), por
 * isso a capa anterior tem de ficar lembrada fora dele -- e só vale por um
 * instante, senão abrir o leitor numa música nova minutos depois cruzava com a
 * capa de uma música que já ninguém está a ver.
 */
export function capaDePartida(
  anterior: { uri: string; em: number } | null,
  nova: string | null,
  agora: number,
): string | null {
  if (!anterior || !nova || anterior.uri === nova) return null;
  return agora - anterior.em <= RECUO.memoriaDaCapaMs ? anterior.uri : null;
}
