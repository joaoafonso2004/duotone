/**
 * A linha de baixo do título de uma lista (30/10, passo 3 de `docs/PLANO-ELEVAR-PC.md`):
 * "73 songs · 4 h 12 min". As faixas sem duração conhecida contam como música
 * mas não somam tempo; se nenhuma a tem, fica só o número.
 */

/** "4 h 12 min", "38 min", "1 min" (menos de um minuto sobe a um); "" sem tempo nenhum. */
export function duracaoTotal(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos <= 0) return '';
  const minutos = Math.max(1, Math.round(segundos / 60));
  const h = Math.floor(minutos / 60), m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "1 song", "73 songs · 4 h 12 min". */
export function resumoDaLista(faixas: readonly { durationSeconds?: number | null }[]): string {
  const n = faixas.length;
  const contagem = `${n} ${n === 1 ? 'song' : 'songs'}`;
  const tempo = duracaoTotal(faixas.reduce((soma, f) => soma + (f.durationSeconds && f.durationSeconds > 0 ? f.durationSeconds : 0), 0));
  return tempo ? `${contagem} · ${tempo}` : contagem;
}
