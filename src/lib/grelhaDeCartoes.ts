/**
 * Uma grelha de cartões que enche a linha (8/11).
 *
 * Quantos cabem com o lado mínimo, e depois o lado estica para a linha acabar
 * na borda: sem sobra à direita a qualquer largura. É a conta que a grelha de
 * capas da Home (`Shelf grelha`) já fazia; as Playlists tinham cartões de 200
 * fixos e, maximizada, a linha deixava ~120 px vazios à direita.
 *
 * Função pura -- ver scripts/test-grelha-de-cartoes.ts.
 */
export function grelhaQueEnche(
  largura: number, minimo: number, espaco: number, { minColunas = 1, maxColunas = Infinity } = {},
): { colunas: number; lado: number } {
  if (!(largura > 0)) return { colunas: Math.min(maxColunas, Math.max(minColunas, 1)), lado: minimo };
  const cabem = Math.floor((largura + espaco) / (minimo + espaco));
  const colunas = Math.max(minColunas, Math.min(maxColunas, Math.max(1, cabem)));
  return { colunas, lado: Math.floor((largura - espaco * (colunas - 1)) / colunas) };
}
