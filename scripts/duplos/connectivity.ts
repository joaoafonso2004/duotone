/**
 * Duplo de src/state/connectivity.ts.
 *
 * A `store` só lhe pede `getState().offline`, e o teste liga e desliga a rede
 * pelo `controlo`. Não é um zustand a sério de propósito: só precisa da forma.
 */
import { controlo } from './controlo.ts';

export const useConnectivity = {
  getState: () => ({ offline: controlo.offline }),
};
