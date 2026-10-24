import type React from 'react';

/** Onde se carregou, e se o amigo está na mesma Jam (um participante). */
export type AbrirMenuDoAmigo = (amigoId: string, e: any, opcoes?: { naTuaJam?: boolean }) => void;

/**
 * O menu de um amigo no botão direito é só do PC (`MenuDoAmigoNoPc.web.tsx`,
 * 24/10). No iPhone o toque longo abre a folha do amigo, pelo seu caminho.
 */
export function useMenuDoAmigoNoPc(_notify?: (texto: string) => void): { abrirMenuDoAmigo: AbrirMenuDoAmigo; menuDoAmigo: React.ReactNode } {
  return { abrirMenuDoAmigo: () => {}, menuDoAmigo: null };
}
