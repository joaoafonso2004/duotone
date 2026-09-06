import { requireOptionalNativeModule } from 'expo';

/**
 * Ponte JS para os atalhos da Siri (ver ios/AtalhosDoDuotone.swift).
 *
 * `requireOptionalNativeModule` devolve null quando o binário não inclui o
 * módulo (Expo Go, build antiga, Android) — e aí isto é tudo no-op, como no
 * resto dos módulos nativos da app.
 */
const nativo = requireOptionalNativeModule('DuotoneIntents');

export type ComandoDeIntent = 'tocar' | 'pausar' | 'seguinte' | 'anterior';

const COMANDOS: ComandoDeIntent[] = ['tocar', 'pausar', 'seguinte', 'anterior'];

/** Regista quem trata dos comandos da Siri. Devolve o unsubscribe. */
export function addIntentListener(
  aoReceber: (comando: ComandoDeIntent) => void
): () => void {
  if (!nativo) return () => {};
  const sub = nativo.addListener('onComandoDeIntent', (e: { comando?: string }) => {
    // O nome vem do lado nativo como texto; um comando que não conheçamos é
    // ignorado em vez de rebentar -- as duas metades podem ficar desalinhadas
    // por uma build antiga.
    const comando = COMANDOS.find((c) => c === e?.comando);
    if (comando) aoReceber(comando);
  });
  return () => sub.remove();
}

/** Há módulo nativo de atalhos nesta build? */
export function atalhosDisponiveis(): boolean {
  return !!nativo;
}
