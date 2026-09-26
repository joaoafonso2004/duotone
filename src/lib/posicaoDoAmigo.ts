/**
 * Onde vai a música de um amigo AGORA (26/9), para a barra de progresso na
 * lateral do PC. A presença traz a posição no instante do `updatedAt`, que é a
 * hora do SERVIDOR; daí para a frente anda o tempo × a velocidade. Os relógios
 * dos dois aparelhos nunca se comparam (a lição do handoff: o PC do João
 * andava 171 s atrasado) -- quem chama passa a hora do servidor.
 *
 * `null` quando não se sabe: presença sem posição (sem a migração, ou de uma
 * versão antiga), ou sem duração para fazer a fração.
 */
export function posicaoDoAmigo(
  faixa: { positionMs?: number; rate?: number; updatedAt?: string; durationSeconds?: number | null } | null | undefined,
  agoraServidorMs: number,
): { ms: number; fracao: number } | null {
  if (!faixa || !Number.isFinite(faixa.positionMs)) return null;
  const desde = Date.parse(faixa.updatedAt ?? '');
  const duracao = (faixa.durationSeconds ?? 0) * 1000;
  if (!Number.isFinite(desde) || !(duracao > 0)) return null;
  const rate = Number(faixa.rate);
  const ritmo = Number.isFinite(rate) && rate >= 0.25 && rate <= 4 ? rate : 1;
  const ms = Math.min(duracao, Math.max(0, faixa.positionMs! + Math.max(0, agoraServidorMs - desde) * ritmo));
  return { ms, fracao: ms / duracao };
}
