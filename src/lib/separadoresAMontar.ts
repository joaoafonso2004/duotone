/**
 * Que separador se monta a seguir, depois da abertura (auditoria 4.2, 4/10).
 *
 * O navegador do iPhone montava as cinco secções no arranque (`lazy: false`),
 * todas no mesmo segundo em que a abertura corre: o relatório da 4.4.1 tinha
 * uma paragem de 943 ms nesse momento. Agora monta a escolhida e as vizinhas
 * (`lazyPreloadDistance: 1`: o deslize mostra a do lado a meio do gesto, e
 * ela não pode estar vazia), e as outras uma a uma depois de a abertura sair,
 * a começar pelas mais perto.
 *
 * Puro, sem imports: `scripts/test-separadores-a-montar.ts`.
 */

/** Espera depois de a abertura sair, e entre um separador e o seguinte. */
export const COMECAR_DEPOIS_MS = 700;
export const ENTRE_SEPARADORES_MS = 400;

export function proximoAMontar(
  rotas: readonly { key: string; name: string }[],
  indice: number,
  jaPedidos: ReadonlySet<string>,
  distanciaJaMontada = 1,
): string | null {
  const candidatas = rotas
    .map((r, i) => ({ r, d: Math.abs(i - indice) }))
    .filter(({ r, d }) => d > distanciaJaMontada && !jaPedidos.has(r.name))
    .sort((a, b) => a.d - b.d);
  return candidatas[0]?.r.name ?? null;
}
