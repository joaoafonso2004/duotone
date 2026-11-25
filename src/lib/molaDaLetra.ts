/**
 * A letra com mola, linha a linha (25/11, item 4 do plano de melhorias,
 * `docs/premium-ios-maquete.html#letra`). Só no iPhone, com "Flowing lyrics"
 * (Customise › Lyrics, ligada de origem).
 *
 * Como: quando a linha cantada muda, o `LyricsView` salta o scroll de uma vez
 * (sem animação) e avisa aqui quanto saltou. Cada `LinhaDaLetra` põe-se onde
 * estava (desvia-se esse tanto) e volta ao sítio com uma mola, com um atraso que
 * cresce para baixo da linha nova: as de baixo chegam depois, como na Apple Music.
 * Sem React Native: puro, para o teste (`test-mola-da-letra.ts`).
 */
export const MOLA_DA_LETRA = {
  /** O atraso de cada linha abaixo da nova (a da maquete). */
  atrasoPorLinhaMs: 40,
  /** Só as linhas perto da nova se mexem; as outras estão fora do ecrã. */
  linhasAcima: 3,
  linhasAbaixo: 12,
  /** A linha cantada cresce isto. */
  escalaAtiva: 1.04,
  /** Uma mola leve, com um pouco de ressalto (~0,7 s). */
  rigidez: 140,
  amortecimento: 17,
} as const;

export type SaltoDaLetra = { delta: number; ativa: number };
const quemOuve = new Set<(s: SaltoDaLetra) => void>();

/** O scroll saltou `delta` pontos para a linha `ativa`. */
export function avisarSaltoDaLetra(delta: number, ativa: number): void {
  for (const f of quemOuve) f({ delta, ativa });
}

export function ouvirSaltoDaLetra(f: (s: SaltoDaLetra) => void): () => void {
  quemOuve.add(f);
  return () => { quemOuve.delete(f); };
}

/** Se esta linha se mexe neste salto (`null`: não, fica no sítio) e com que atraso. */
export function atrasoDaLinha(indice: number, ativa: number): number | null {
  if (indice < ativa - MOLA_DA_LETRA.linhasAcima || indice > ativa + MOLA_DA_LETRA.linhasAbaixo) return null;
  // As de cima (já cantadas) e a nova partem juntas; as de baixo, uma a uma.
  return Math.max(0, indice - ativa) * MOLA_DA_LETRA.atrasoPorLinhaMs;
}
