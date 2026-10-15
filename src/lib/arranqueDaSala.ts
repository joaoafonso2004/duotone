import type { Track } from '../types';
import type { SessaoDeEscuta } from '../api/ouvirJuntos';

/** Recalcula quando o ficheiro ficou pronto, antes de sair qualquer som. */
export function posicaoDaSalaParaFaixa(
  track: Pick<Track, 'source' | 'sourceId'>,
  sessao: SessaoDeEscuta | null,
  lerPosicao: () => number | null,
): number | null {
  if (sessao?.track?.source !== track.source || sessao.track.sourceId !== track.sourceId) return null;
  const ms = lerPosicao();
  if (ms == null || !Number.isFinite(ms)) return null;
  const duracao = (sessao.track.durationSeconds ?? 0) * 1000;
  return Math.max(0, duracao > 0 ? Math.min(ms, duracao) : ms);
}

/**
 * O acerto ao PRIMEIRO SOM de uma faixa de um Jam no PC (15/10). A faixa
 * carrega calada já na posição da sala, mas o IFrame demora a arrancar e a
 * sala anda entretanto. Medido o motor no primeiro "a tocar", devolve para
 * onde saltar (ainda calado), ou `null` se já está dentro da tolerância.
 * Sem relógio da sala ou sem a leitura do motor, não se salta.
 */
export function acertoNoPrimeiroSom(salaMs: number | null, motorMs: number | null, toleranciaMs: number): number | null {
  if (salaMs == null || motorMs == null || !Number.isFinite(salaMs) || !Number.isFinite(motorMs)) return null;
  return Math.abs(salaMs - motorMs) > toleranciaMs ? Math.max(0, salaMs) : null;
}
