import { createContext } from 'react';

/**
 * A linha que a procura das Definições encontrou (27/11): acende um instante, para
 * se ver onde está. O valor é o rótulo dela. Lida pela lista agrupada do iPhone
 * (`ListaAgrupada`) e pelas linhas das Definições do PC.
 */
export const RealceDaLinha = createContext<string | null>(null);
