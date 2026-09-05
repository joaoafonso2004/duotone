/**
 * Duplo de src/state/auth.ts.
 *
 * Uma conta local, que é o caso que não precisa de rede nenhuma. Chega para a
 * `store` saber a quem pertencem os ajustes por faixa.
 */
export const useAuth = {
  getState: () => ({ session: null, offlineUserId: 'utilizador-de-teste' }),
};
