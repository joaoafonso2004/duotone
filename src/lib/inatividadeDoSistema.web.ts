/**
 * Segundos desde o último toque no rato ou no teclado do computador, pelo
 * `powerMonitor.getSystemIdleTime()` do processo principal. Conta o sistema
 * inteiro, e não só a janela do Duotone: é isso que deixa saber que a pessoa
 * está ao PC mesmo com outra app à frente.
 *
 * No browser, sem ponte do Electron, não se sabe -- e `null` quer dizer isso.
 */
export async function segundosSemInteracao(): Promise<number | null> {
  const ponte = typeof window !== 'undefined' ? window.duotoneDesktop?.segundosSemInteracao : undefined;
  if (!ponte) return null;
  try {
    const s = Number(await ponte());
    return Number.isFinite(s) && s >= 0 ? s : null;
  } catch {
    return null;
  }
}
