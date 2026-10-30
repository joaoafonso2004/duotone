/**
 * A base do "dois tons" do PC (30/10, `docs/pc-elevar-maquete.html`): a capa
 * repousa a dois tons e revela a cor ao tocar-lhe. A parte que não depende do
 * DOM vive aqui, para o teste a correr em Node puro; o resto está em
 * `desktop/duotone.web.tsx` e nas regras `duo*` e `brilho` da `casca.web.tsx`.
 */

/** Os dois tons por omissão: o do preto e o do branco da capa a cinzentos. */
export const TOM_ESCURO = '#0a0b10';
export const TOM_CLARO = '#cfd3de';

/**
 * Uma miniatura 4:3 do YouTube traz o vídeo 16:9 com duas faixas pretas
 * (`capaComBarras`). Num quadrado de qualquer lado a imagem desenha-se a 16/9 da
 * largura por 4/3 da altura, centrada: é a conta de `molduraSemBarras` (modoLimpo),
 * em percentagens, porque a capa de um cartão não tem lado fixo.
 */
export const SEM_BARRAS = { width: '177.78%', height: '133.33%', left: '-38.89%', top: '-16.67%' } as const;

/**
 * Onde está o rato dentro do cartão, para o brilho de metal o seguir (`--mx`,
 * `--my`). Fora do cartão, ou sem tamanho, o brilho fica ao centro; um rato
 * que passa nos limites é apertado para dentro, para o foco não fugir.
 */
export function posicaoNoCartao(
  r: { left: number; top: number; width: number; height: number }, x: number, y: number,
): { mx: string; my: string } {
  if (![r.left, r.top, r.width, r.height, x, y].every(Number.isFinite) || r.width <= 0 || r.height <= 0) {
    return { mx: '50%', my: '50%' };
  }
  const dentro = (v: number, tam: number) => Math.min(tam, Math.max(0, v));
  return { mx: `${Math.round(dentro(x - r.left, r.width))}px`, my: `${Math.round(dentro(y - r.top, r.height))}px` };
}
