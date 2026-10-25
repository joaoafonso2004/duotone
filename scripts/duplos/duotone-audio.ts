/** Duplo de modules/duotone-audio. Sem binário nativo não há EQ. */
export const temAudioNativo = false;
export function ligarAudioNativo(): void {}
export function aplicarEqualizadorNativo(): void {}
export const temAutomixNativo = false;
export async function analisarRitmoNativo(): Promise<number[]> { return []; }
export async function agendarEntradaNativa(): Promise<boolean> { return false; }
