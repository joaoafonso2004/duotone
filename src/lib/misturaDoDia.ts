/**
 * A Daily mix: uma playlist que se refaz sozinha todos os dias, à mão de semear.
 *
 * Nasceu da forma como um amigo do João ouve música -- "só ouço uma playlist
 * que o Spotify atualiza conforme o que vamos ouvindo" (13/9) -- e das
 * playlists que o Spotify gera estarem fechadas a apps novas. A app faz a sua:
 * o `flowDoDia` (as mais ouvidas intercaladas com descobertas, já a partir do
 * gosto do Spotify quando foi lido), a MESMA durante o dia inteiro e igual no
 * iPhone e no PC, porque vive na cache da conta.
 *
 * - **O dia é o de UTC**, como a semana do "Discover new": o que importa é mudar
 *   uma vez por dia, não à meia-noite de ninguém em particular.
 * - **As primeiras `GUARDAR_EM_WIFI` ficam descarregadas em segundo plano**, só
 *   em Wi-Fi: carregar no play da mix começa logo, sem esperar pelo download --
 *   a outra metade da mesma queixa. Em dados móveis não se gasta nada por conta.
 *
 * Sem imports de runtime: testado em Node puro (scripts/test-mistura-do-dia.ts).
 */

export const MUSICAS_DA_MISTURA = 30;
export const GUARDAR_EM_WIFI = 12;

export function diaDe(agora: number = Date.now()): number {
  return Math.floor(agora / 86_400_000);
}

/** A mistura guardada, se for DESTE dia e tiver alguma coisa. */
export function misturaGuardada<T>(valor: unknown, dia: number): T[] | null {
  if (!valor || typeof valor !== 'object') return null;
  const v = valor as { dia?: unknown; faixas?: unknown };
  return v.dia === dia && Array.isArray(v.faixas) && v.faixas.length > 0 ? (v.faixas as T[]) : null;
}

/**
 * Quais descarregar agora: das primeiras da lista (as que tocam primeiro), as do
 * YouTube que ainda não estão em disco. Nada sem rede nem em dados móveis.
 */
export function faixasParaGuardar<T extends { source: string; sourceId: string }>(
  faixas: readonly T[],
  jaGuardada: (sourceId: string) => boolean,
  rede: { offline: boolean; dadosMoveis: boolean },
  maximo: number = GUARDAR_EM_WIFI,
): T[] {
  if (rede.offline || rede.dadosMoveis) return [];
  const vistas = new Set<string>();
  const saida: T[] = [];
  for (const faixa of faixas.slice(0, maximo)) {
    if (faixa.source !== 'youtube' || !faixa.sourceId || vistas.has(faixa.sourceId)) continue;
    vistas.add(faixa.sourceId);
    if (jaGuardada(faixa.sourceId)) continue;
    saida.push(faixa);
  }
  return saida;
}
