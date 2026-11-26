/**
 * O andamento e a tonalidade de uma música, para o About do iPhone (26/11, item 22
 * do plano, `docs/maquetes-da-lista-2026-11-25.html#m22`): "Tempo 124 BPM" e
 * "Key A minor · 8A". Saem do que o AutoMix já mediu e guardou no aparelho
 * (`lib/ritmoGuardado.ts`: as janelas do início e do fim, AsyncStorage, nunca o
 * Supabase). Numa música que ainda não foi medida, ou com medidas pouco claras,
 * `null`: a linha não aparece.
 *
 * Puro (`scripts/test-andamento-da-faixa.ts`).
 */
import { batidaSegura, camelot, TOM_CONFIAVEL, type Ritmo, type Tom } from './ritmo';

/** As doze notas, a começar no dó (a `tonica` do `Tom`). */
export const NOTAS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'] as const;

export type AndamentoDaFaixa = {
  /** Batidas por minuto, arredondadas, ou `null`. */
  bpm: number | null;
  /** A tonalidade mais clara das duas janelas, ou `null`. */
  tom: Tom | null;
};

/**
 * O andamento: o da janela do início, se a batida lá é segura; senão o do fim. A
 * tonalidade: a mais confiante das duas, acima do limiar do AutoMix.
 */
export function andamentoDaFaixa(r: { inicio: Ritmo | null; fim: Ritmo | null } | null | undefined): AndamentoDaFaixa {
  if (!r) return { bpm: null, tom: null };
  const janelas = [r.inicio, r.fim].filter((j): j is Ritmo => !!j);
  const comBatida = janelas.find((j) => batidaSegura(j) && j.bpm > 0);
  const tons = janelas.map((j) => j.tom).filter((t): t is Tom => !!t && t.confianca >= TOM_CONFIAVEL);
  const tom = tons.sort((a, b) => b.confianca - a.confianca)[0] ?? null;
  return { bpm: comBatida ? Math.round(comBatida.bpm) : null, tom };
}

/** "A minor · 8A": a tonalidade e o lugar dela na roda de Camelot. */
export function textoDaTonalidade(t: Tom): string {
  const c = camelot(t);
  return `${NOTAS[((t.tonica % 12) + 12) % 12]} ${t.menor ? 'minor' : 'major'} · ${c.numero}${c.letra}`;
}

/** Quanto dura uma batida, em ms: o ritmo do ponto que pulsa. */
export function periodoDaBatida(bpm: number): number {
  return Math.round(60_000 / Math.max(40, Math.min(220, bpm)));
}
