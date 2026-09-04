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
