/**
 * O vídeo da música no Now Playing do PC (16/10, pedido do João).
 *
 * O leitor do PC é o IFrame do YouTube, que já toca o VÍDEO -- escondido num
 * quadrado de 1 px. Mostrá-lo não custa rede nenhuma a mais: o iframe muda-se
 * para cima da capa com `moveBefore` (o Chromium muda-o sem o recarregar) e
 * volta para o esconderijo quando não se mostra.
 *
 * Só se mostra a TOCAR, e não nas pontas: em pausa o player do YouTube põe
 * por cima a sua sobreposição; depois de cada arranque, retoma ou buffering
 * mostra uns segundos o título, o ícone da troca e o "Mais vídeos" da pausa
 * (visto no browser a 16/10: ainda lá aos 4 s, já não aos 9); e nos últimos
 * segundos vêm os ecrãs finais com outros vídeos. Nesses momentos volta a
 * capa. A interface não diz que usa o YouTube, e o vídeo também não.
 *
 * Puro, sem imports: `scripts/test-video-no-leitor.ts`.
 */

/** Depois de começar (ou voltar) a tocar, quanto se espera antes de mostrar: as sobreposições do player. */
export const ESPERA_NO_ARRANQUE_MS = 6000;
/** Os últimos segundos ficam com a capa (os ecrãs finais do vídeo). */
export const MARGEM_DO_FIM_MS = 20_000;

export function deveMostrarVideo(e: {
  ligado: boolean;
  temPalco: boolean;
  aTocar: boolean;
  /** Desde quando o motor confirmou que toca esta faixa (`null`: não toca). */
  aTocarDesde: number | null;
  posicaoMs: number;
  duracaoMs: number;
  agora: number;
}): boolean {
  if (!e.ligado || !e.temPalco || !e.aTocar || e.aTocarDesde == null) return false;
  if (e.agora - e.aTocarDesde < ESPERA_NO_ARRANQUE_MS) return false;
  return !(e.duracaoMs > 0 && e.duracaoMs - e.posicaoMs <= MARGEM_DO_FIM_MS);
}

/**
 * Como o vídeo enche o quadrado da capa: 16:9 com a altura do quadrado e
 * cortado dos lados, ao centro (como um vídeo de fundo, sem faixas pretas).
 */
export const ESTILO_NO_PALCO = 'position:absolute;top:0;left:50%;height:100%;width:177.78%;'
  + 'transform:translateX(-50%);border:0;pointer-events:none;opacity:0;transition:opacity 350ms ease';
