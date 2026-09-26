/**
 * O questionário da primeira vez (26/9, pedido do João): quando aparece. Puro
 * e sem imports: `scripts/test-boas-vindas.ts`.
 *
 * Uma vez por CONTA, e só a quem é mesmo novo: quem já tem músicas guardadas
 * está a usar a app há muito, e uma atualização não pode abrir-lhe um
 * questionário por cima. A esses marca-se como feito sem mostrar nada.
 */
export const GUARDADAS_DE_QUEM_JA_USA = 10;
export const PEDIDOS = 3;

export type DecisaoDasBoasVindas = 'mostrar' | 'marcar-feito' | 'nada' | 'esperar';

export function decidirBoasVindas(e: {
  /** Já feito nesta conta (lido do `pref:boasVindas`), ou `null` se ainda não se leu. */
  feito: boolean | null;
  /** As guardadas já foram lidas. */
  bibliotecaLida: boolean;
  guardadas: number;
  /** A abertura ainda está à frente: nada sobe por cima dela. */
  aberturaAFrente: boolean;
}): DecisaoDasBoasVindas {
  if (e.feito === true) return 'nada';
  if (e.feito === null || !e.bibliotecaLida || e.aberturaAFrente) return 'esperar';
  return e.guardadas >= GUARDADAS_DE_QUEM_JA_USA ? 'marcar-feito' : 'mostrar';
}
