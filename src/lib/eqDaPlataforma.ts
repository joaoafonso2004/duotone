/**
 * O equalizador de cada plataforma (15/11, pedido do João: "um equalizer
 * completamente separado no iOS e no PC").
 *
 * Os ajustes de cada música (EQ e velocidade, `user_track_adjustments`) e os
 * presets (`user_eq_presets`) viviam numa só linha por conta, e uma mudança no
 * PC aparecia no iPhone. Agora cada plataforma tem as suas linhas na MESMA
 * tabela, sem migração: o iPhone fica com as de sempre, e o PC escreve e lê as
 * que começam por `pc~`. Cada um ignora as do outro, também as que chegam pelo
 * Realtime.
 *
 * A linha do padrão (`padrao:global`) fica de fora: só leva a velocidade
 * padrão, que continua a ser uma para as duas. O EQ padrão já era de cada
 * plataforma desde 31/10 (`pref:eqPadrao:ios` e `:windows`).
 *
 * A plataforma vem do `navigator.product` (só o React Native o põe a
 * 'ReactNative'), como no `chaveDoEqPadrao`: importar o `Platform` arrastava o
 * react-native para os testes. Sem imports: `scripts/test-eq-da-plataforma.ts`.
 */
export const PREFIXO_DO_PC = 'pc~';

export function eNoPc(): boolean {
  return !(typeof navigator !== 'undefined' && (navigator as { product?: string }).product === 'ReactNative');
}

/** O id como vai para o servidor, nesta plataforma. */
export function idNoServidor(id: string, noPc: boolean = eNoPc()): string {
  return noPc ? PREFIXO_DO_PC + id : id;
}

/** O id como a app o conhece, ou `null` quando a linha é da outra plataforma. */
export function idDaPlataforma(id: string, noPc: boolean = eNoPc()): string | null {
  const doPc = id.startsWith(PREFIXO_DO_PC);
  if (doPc !== noPc) return null;
  return doPc ? id.slice(PREFIXO_DO_PC.length) : id;
}
