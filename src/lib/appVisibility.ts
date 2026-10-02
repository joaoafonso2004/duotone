import { AppState, Platform } from 'react-native';

/**
 * Verdade apenas quando há interface visível para atualizar.
 *
 * No Electron/React Native Web o AppState permanece normalmente `active`
 * mesmo com a janela minimizada para o tabuleiro. `document.visibilityState`
 * é a fonte certa nesse caso. No iOS usa-se o ciclo de vida nativo.
 */
export function appEstaVisivel(): boolean {
  if (Platform.OS === 'web') {
    return typeof document === 'undefined' || document.visibilityState !== 'hidden';
  }
  return AppState.currentState === 'active';
}

/** Observa também janelas minimizadas no PC, onde AppState fica active. */
export function ouvirVisibilidade(aoMudar: (visivel: boolean) => void): () => void {
  const mudar = () => aoMudar(appEstaVisivel());
  const app = AppState.addEventListener('change', mudar);
  const web = Platform.OS === 'web' && typeof document !== 'undefined';
  if (web) document.addEventListener('visibilitychange', mudar);
  return () => {
    app.remove();
    if (web) document.removeEventListener('visibilitychange', mudar);
  };
}

/** Suspende o próprio temporizador quando não há interface para atualizar. */
export function intervaloComAppVisivel(
  atualizar: () => void,
  intervaloMs: number,
): () => void {
  let parado = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const ajustar = () => {
    if (parado) return;
    if (!appEstaVisivel()) {
      if (timer !== null) clearInterval(timer);
      timer = null;
    } else if (timer === null) {
      timer = setInterval(() => { if (appEstaVisivel()) atualizar(); }, intervaloMs);
    }
  };
  const pararEscuta = ouvirVisibilidade(ajustar);
  ajustar();
  return () => {
    parado = true;
    if (timer !== null) clearInterval(timer);
    pararEscuta();
  };
}
