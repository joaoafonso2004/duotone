import type { ComandoDeIntent } from '../../modules/duotone-intents';

/**
 * O que cada comando da Siri faz ao leitor.
 *
 * Vive à parte porque a regra que interessa não é óbvia: os comandos da Siri
 * têm de ser IDEMPOTENTES. Dizer "tocar" com a música já a tocar não pode
 * pausá-la -- e é exactamente isso que aconteceria se isto fosse ligado ao
 * `togglePlay`, que é o que os botões da app usam. Quem carrega num botão vê o
 * estado antes de carregar; quem fala com a Siri não vê nada.
 */
export type AccaoDoLeitor = 'tocar' | 'pausar' | 'seguinte' | 'anterior' | 'nada';

export interface EstadoDoLeitor {
  aTocar: boolean;
  temFaixa: boolean;
}

export function accaoParaComando(
  comando: ComandoDeIntent,
  estado: EstadoDoLeitor
): AccaoDoLeitor {
  // Sem faixa aberta não há nada para retomar, pausar ou saltar. Abrir uma à
  // sorte seria pôr música a tocar que ninguém pediu.
  if (!estado.temFaixa) return 'nada';

  switch (comando) {
    case 'tocar':
      return estado.aTocar ? 'nada' : 'tocar';
    case 'pausar':
      return estado.aTocar ? 'pausar' : 'nada';
    case 'seguinte':
      return 'seguinte';
    case 'anterior':
      return 'anterior';
    default:
      return 'nada';
  }
}
