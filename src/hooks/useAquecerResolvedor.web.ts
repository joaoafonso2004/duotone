import { useEffect, useRef } from 'react';
import { useAbertura } from '../state/abertura';
import { useConnectivity } from '../state/connectivity';
import { aquecerOMotor } from '../desktop/motorDeAudio.web';

/**
 * No PC só conta o motor só de áudio da casca Tauri (no Electron o leitor é o
 * IFrame e `aquecerOMotor` não faz nada). As mesmas regras do iPhone: depois
 * da abertura, com sessão e com rede, uma vez por arranque. Ver `aquecerOMotor`.
 */
export function useAquecerResolvedor(userId: string | undefined): void {
  const offline = useConnectivity((s) => s.offline);
  const naAbertura = useAbertura((s) => s.aFrente);
  const feito = useRef(false);

  useEffect(() => {
    if (feito.current || !userId || offline || naAbertura) return;
    const id = setTimeout(() => {
      feito.current = true;
      void aquecerOMotor().catch(() => {});
    }, 1500);
    return () => clearTimeout(id);
  }, [userId, offline, naAbertura]);
}
