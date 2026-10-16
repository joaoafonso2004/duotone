/**
 * Onde nasce um menu junto ao dedo, no iPhone (16/10, I1 da auditoria de UI).
 *
 * Abre por baixo de quem o pediu; se não couber, por cima; se também não,
 * encostado ao fundo da zona segura. Nunca sai dela: o de antes, sem lugar em
 * baixo, subia até 12 pt do topo do ecrã -- por baixo da ilha -- e um menu
 * mais alto do que o ecrã saía pelo fundo. Mais alto do que a zona segura,
 * fica com a altura dela e rola por dentro (`altura` < `natural`).
 *
 * Sem imports: `scripts/test-menus-do-iphone.ts`.
 */
export type ZonaDoEcra = { altura: number; topo: number; fundo: number };
export type AncoraDoMenu = { y: number; height: number };

export const MARGEM_DO_MENU = 12;

export function posicaoDoMenu(
  ancora: AncoraDoMenu,
  natural: number,
  ecra: ZonaDoEcra,
  margem = MARGEM_DO_MENU,
): { topo: number; altura: number } {
  const minTopo = ecra.topo + margem;
  const maxFundo = ecra.altura - ecra.fundo - margem;
  const altura = Math.max(0, Math.min(natural, maxFundo - minTopo));
  const emBaixo = ancora.y + ancora.height + margem;
  if (emBaixo + altura <= maxFundo) return { topo: emBaixo, altura };
  const emCima = ancora.y - margem - altura;
  if (emCima >= minTopo) return { topo: emCima, altura };
  return { topo: Math.max(minTopo, maxFundo - altura), altura };
}
