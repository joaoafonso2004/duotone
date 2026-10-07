/**
 * Quando dois toques são UM duplo toque (7/10, `DuploToqueParaGostar`).
 *
 * 300 ms é a janela do iOS para o duplo toque nos seus próprios ecrãs; mais
 * longa, dois toques soltos (tocar na capa para ver, e outra vez) já gostavam.
 * Sem imports: `scripts/test-duplo-toque.ts`.
 */
export const JANELA_DO_DUPLO_TOQUE_MS = 300;

/** `anterior` é o instante do toque anterior (0 = nenhum). */
export function duploToque(anterior: number, agora: number): boolean {
  return anterior > 0 && agora >= anterior && agora - anterior <= JANELA_DO_DUPLO_TOQUE_MS;
}

/** O duplo toque só gosta: nunca tira uma música das Liked Songs. */
export function deveGuardar(jaGuardada: boolean | null): boolean {
  return jaGuardada === false;
}
