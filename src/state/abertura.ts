import { create } from 'zustand';

/**
 * A abertura está à frente do ecrã.
 *
 * O cartaz de sexta-feira e o aviso de versão nova aparecem sozinhos, e são
 * `Modal`: no iPhone ficam por cima de tudo, incluindo a abertura. Um aviso a
 * subir a meio do eclipse estragava as duas coisas -- por isso esperam por isto.
 *
 * Começa `false` de propósito: quem liga a flag é a própria abertura, ao
 * montar. Se um dia ela sair do `App.tsx`, os avisos continuam a aparecer em
 * vez de ficarem presos à espera de uma abertura que já não existe.
 */
export const useAbertura = create<{ aFrente: boolean }>(() => ({ aFrente: false }));
