import type { TipoDeRadio } from '../state/player';

/**
 * O menu da pastilha do Radio (18/10, `docs/radio-menu.html` e a variante A de
 * `docs/radio-menu-animacao.html`): com o Radio desligado, carregar abre este
 * menu, e escolhe-se entre o Radio de uma música e o Mix de tudo o que se
 * ouve. Só os nomes, sem texto por baixo (pedido do João). O mesmo nas duas
 * plataformas; cada uma desenha o seu (`MenuDoRadio.tsx` / `.web.tsx`).
 */
export const MENU_DO_RADIO = {
  titulo: 'Radio',
  opcoes: [
    { tipo: 'musica', rotulo: 'Songs like this one' },
    { tipo: 'mix', rotulo: 'Mix' },
  ] as const satisfies readonly { tipo: TipoDeRadio; rotulo: string }[],
};

/** O que a pastilha diz ligada, por tipo. */
export const ROTULO_LIGADO: Record<TipoDeRadio, string> = { musica: 'Radio on', mix: 'Mix on' };

/** O que o cabeçalho da fila do iPhone acrescenta ("UP NEXT (12) · MIX"). */
export const MARCA_DA_FILA: Record<TipoDeRadio, string> = { musica: 'RADIO', mix: 'MIX' };

/**
 * As quatro capas do quadrado do Mix: as músicas mais ouvidas no aparelho, uma
 * por artista, só as que têm capa. Do histórico do aparelho: zero pedidos.
 */
export function capasDoMix<T extends { artworkUrl: string | null; count: number; lastPlayed: number }>(
  contagens: readonly T[],
  artistaDe: (t: T) => string,
  quantas = 4,
): string[] {
  const vistos = new Set<string>();
  const capas: string[] = [];
  for (const c of [...contagens].sort((a, b) => b.count - a.count || b.lastPlayed - a.lastPlayed)) {
    if (capas.length >= quantas) break;
    const artista = artistaDe(c);
    if (!c.artworkUrl || !artista || vistos.has(artista)) continue;
    vistos.add(artista);
    capas.push(c.artworkUrl);
  }
  return capas;
}
