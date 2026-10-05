/**
 * Onde foi o último toque no ecrã do iPhone (5/10, auditoria de consistência
 * M1). O "…" de uma linha passou a abrir o menu junto ao dedo (o
 * `MenuFlutuante`, como o do leitor), e as listas não mediam o botão: são
 * dezenas de ecrãs a chamar o mesmo menu. A raiz da app (`RootNavigator.tsx`)
 * regista cada toque na fase de captura, antes de qualquer botão.
 *
 * Sem imports. Sem toque nenhum ainda, o meio do ecrã.
 */
export type AncoraDoToque = { x: number; y: number; width: number; height: number };

let ultimo: { x: number; y: number } | null = null;

export function registarToque(x: number, y: number): void {
  if (Number.isFinite(x) && Number.isFinite(y)) ultimo = { x, y };
}

export function ancoraDoUltimoToque(ecra: { largura: number; altura: number }): AncoraDoToque {
  const p = ultimo ?? { x: ecra.largura / 2, y: ecra.altura / 3 };
  return { x: p.x, y: p.y, width: 1, height: 1 };
}
