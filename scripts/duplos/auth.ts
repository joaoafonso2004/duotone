/**
 * Duplo de src/state/auth.ts.
 *
 * Por omissão, uma conta local, que é o caso que não precisa de rede nenhuma.
 * Chega para a `store` saber a quem pertencem os ajustes por faixa. Com
 * `controlo.sessao`, passa a haver uma sessão -- é o que liga a memória do Smart
 * Shuffle à conta.
 */
import { controlo } from './controlo.ts';

export const useAuth = {
  getState: () => ({
    session: controlo.sessao ? { user: { id: controlo.sessao } } : null,
    offlineUserId: 'utilizador-de-teste',
  }),
};
