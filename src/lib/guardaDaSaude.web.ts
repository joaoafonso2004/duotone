/**
 * No PC a guarda é o localStorage (síncrono, sobrevive a recarregar a página).
 * Ver `guardaDaSaude.ts`.
 */
export type ChaveDaSaude = 'incidentes' | 'sessao';

const prefixo = 'duotone:saude:';

export function lerDaGuarda(chave: ChaveDaSaude): string | null {
  try {
    return globalThis.localStorage?.getItem(prefixo + chave) ?? null;
  } catch {
    return null;
  }
}

export function escreverNaGuarda(chave: ChaveDaSaude, texto: string): void {
  try {
    globalThis.localStorage?.setItem(prefixo + chave, texto);
  } catch {
    // modo privado ou quota: sem registo, e mais nada
  }
}
