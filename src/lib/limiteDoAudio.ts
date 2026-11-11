/**
 * O teto do áudio guardado no iPhone, escolhido nas Definições (11/11).
 *
 * Era 300 MB fixos. Agora é uma barra que vai de 10 MB até sem limite, por
 * degraus: um polegar não acerta em 37 MB, e de 10 MB a 20 GB a escala tem de
 * ser quase logarítmica para os primeiros degraus não ficarem num pixel. São
 * 15 posições, uns 18 pt cada numa barra de 270 pt.
 *
 * O teto conta a cache E os downloads pedidos: os mais antigos saem quando o
 * passam (`pruneAudioCacheLRU`). No PC não há áudio guardado, por isso esta
 * escolha só existe no iPhone.
 *
 * Só contas, para se testarem em Node (`scripts/test-limite-do-audio.ts`).
 */

const MB = 1024 * 1024;

/** Os degraus da barra, em MB. O último é sem limite. */
export const DEGRAUS_MB: readonly number[] = [
  10, 25, 50, 100, 200, 300, 500, 750, 1024, 2048, 3072, 5120, 10240, 20480, Infinity,
];

/** O de sempre, e o de quem nunca mexeu na barra. */
export const LIMITE_DE_ORIGEM = 300 * MB;

export const SEM_LIMITE = Infinity;

export function bytesDoDegrau(i: number): number {
  const d = Math.max(0, Math.min(DEGRAUS_MB.length - 1, Math.round(i)));
  return DEGRAUS_MB[d] * MB;
}

/** O degrau mais perto de um limite (um valor antigo fora da escala cai no vizinho). */
export function degrauDoLimite(bytes: number): number {
  if (!Number.isFinite(bytes)) return DEGRAUS_MB.length - 1;
  let melhor = 0;
  for (let i = 1; i < DEGRAUS_MB.length - 1; i++) {
    if (Math.abs(DEGRAUS_MB[i] * MB - bytes) < Math.abs(DEGRAUS_MB[melhor] * MB - bytes)) melhor = i;
  }
  return melhor;
}

/** "10 MB", "750 MB", "1 GB", "20 GB", "Unlimited". */
export function rotuloDoLimite(bytes: number): string {
  if (!Number.isFinite(bytes)) return 'Unlimited';
  const mb = Math.round(bytes / MB);
  if (mb < 1024) return `${mb} MB`;
  const gb = mb / 1024;
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
}

/**
 * Do que está guardado no aparelho para bytes. Guarda-se o número de MB, ou
 * `unlimited`; o resto (nada, lixo, um zero) é o de origem -- um valor estragado
 * nunca pode ser "apaga tudo".
 */
export function lerLimite(guardado: string | null | undefined): number {
  if (guardado === 'unlimited') return SEM_LIMITE;
  const mb = Number(guardado);
  if (!guardado || !Number.isFinite(mb) || mb < DEGRAUS_MB[0]) return LIMITE_DE_ORIGEM;
  return Math.round(mb) * MB;
}

export function escreverLimite(bytes: number): string {
  return Number.isFinite(bytes) ? String(Math.round(bytes / MB)) : 'unlimited';
}
