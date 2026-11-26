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

/** Quantos pontos a placa de uma linha levantada entra de cada lado (os cantos redondos à vista). */
export const RECUO_DA_PLACA = 8;
/** O ar entre a linha levantada e o menu. */
export const ESPACO_ATE_A_PREVIA = 10;

/**
 * Onde vai o menu quando há uma linha levantada (26/11, o João: "o menu nunca
 * deve ficar por cima da música"). Por baixo dela se couber, senão por cima; se
 * não couber em nenhum dos lados, a linha sobe (`desvioDaPrevia`, negativo) até
 * o menu caber por baixo, e o menu rola por dentro se mesmo assim não couber.
 * Nunca se tapam: `topo` >= fundo da linha já deslocada.
 */
export function lugarComPrevia(
  ret: AncoraDoMenu,
  natural: number,
  ecra: ZonaDoEcra,
  margem = MARGEM_DO_MENU,
): { topo: number; altura: number; desvioDaPrevia: number } {
  const cima = ecra.topo + margem;
  const baixo = ecra.altura - ecra.fundo - margem;
  const emBaixo = ret.y + ret.height + ESPACO_ATE_A_PREVIA;
  if (emBaixo + natural <= baixo) return { topo: emBaixo, altura: natural, desvioDaPrevia: 0 };
  const emCima = ret.y - ESPACO_ATE_A_PREVIA - natural;
  if (emCima >= cima) return { topo: emCima, altura: natural, desvioDaPrevia: 0 };
  const y = Math.max(cima, Math.min(ret.y, baixo - natural - ESPACO_ATE_A_PREVIA - ret.height));
  const topo = y + ret.height + ESPACO_ATE_A_PREVIA;
  return { topo, altura: Math.max(0, Math.min(natural, baixo - topo)), desvioDaPrevia: y - ret.y };
}
