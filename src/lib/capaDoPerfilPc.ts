/**
 * O perfil no PC com a capa por página (30/10, passo 5 de `docs/PLANO-ELEVAR-PC.md`).
 *
 * A fotografia cobre a janela toda e fica presa enquanto a página sobe por cima:
 * escurece e afasta-se (escala e subida) com o scroll, e a pista "SCROLL"
 * apaga-se. Era um cabeçalho de 320 a 560 pt onde a fotografia (guardada a 3:2)
 * aparecia cortada a um terço, e nunca se via inteira. Aqui só a conta, para o
 * teste a correr em Node puro; a casa é `components/ProfileHeroPc.web.tsx`.
 */

/** Quanto do scroll (em alturas da janela) leva a capa ao máximo do afastamento. */
export const ESCURECER_MAXIMO = 0.78;
export const ESCALA_EXTRA = 0.14;
export const SUBIDA_PX = 26;
/** A pista "SCROLL" apaga-se logo: a um sexto do caminho já não está. */
export const PISTA_APAGA_EM = 1 / 6;

/** De 0 (no topo) a 1 (uma janela inteira rolada). Alturas que não são números dão 0. */
export function progressoDaRolagem(rolado: number, altura: number): number {
  if (!(altura > 0) || !Number.isFinite(rolado)) return 0;
  return Math.min(1, Math.max(0, rolado / altura));
}

export interface EstadoDaCapa { escala: number; subida: number; veu: number; pista: number }

/** O que cada camada da capa faz com o progresso `p` (0 a 1): só transform e opacidade. */
export function estadoDaCapa(p: number): EstadoDaCapa {
  const x = Math.min(1, Math.max(0, Number.isFinite(p) ? p : 0));
  return {
    escala: 1 + x * ESCALA_EXTRA,
    subida: -SUBIDA_PX * x,
    veu: x * ESCURECER_MAXIMO,
    pista: Math.max(0, 1 - x / PISTA_APAGA_EM),
  };
}

/**
 * O tamanho do nome (em pt): 96 a toda a largura, e a descer para um nome
 * comprido não passar da janela (as letras do display têm ~0,55 do corpo de
 * largura). Nunca abaixo de 40.
 */
export function tamanhoDoNome(nome: string, largura: number): number {
  const letras = Math.max(6, nome.trim().length);
  if (!(largura > 0)) return 64;
  return Math.round(Math.min(96, Math.max(40, (largura - 120) / (letras * 0.55))));
}

/** A tecla F abre e fecha a capa inteira: sem modificadores e fora de um campo de escrita. */
export function eTeclaDaCapa(e: { key: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; shiftKey?: boolean;
  target?: { tagName?: string; isContentEditable?: boolean } | null }): boolean {
  if (e.key !== 'f' && e.key !== 'F') return false;
  if (e.ctrlKey || e.altKey || e.metaKey) return false;
  const alvo = e.target;
  if (alvo?.isContentEditable) return false;
  const marca = (alvo?.tagName ?? '').toUpperCase();
  return marca !== 'INPUT' && marca !== 'TEXTAREA' && marca !== 'SELECT';
}
