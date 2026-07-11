import { requireOptionalNativeModule } from 'expo';

/**
 * Ponte JS para o módulo nativo de comandos remotos (ver ios/…Module.swift).
 *
 * `requireOptionalNativeModule` devolve null quando o binário não inclui o
 * módulo (Expo Go, build antiga, Android) — nesse caso tudo aqui é no-op,
 * para a app continuar a funcionar sem os botões no Lock Screen.
 */
const native = requireOptionalNativeModule('DuotoneRemoteCommands');

export function setRemoteCommandsEnabled(next: boolean, previous: boolean): void {
  native?.setCommandsEnabled(next, previous);
}

/** Regista handlers para os botões do Lock Screen; devolve o unsubscribe. */
export function addRemoteCommandListeners(
  onNext: () => void,
  onPrevious: () => void
): () => void {
  if (!native) return () => {};
  const a = native.addListener('onNextTrack', onNext);
  const b = native.addListener('onPreviousTrack', onPrevious);
  return () => {
    a.remove();
    b.remove();
  };
}
