/**
 * O que os cartões de entrada da Home dizem (30/10, passo 6 de
 * `docs/PLANO-ELEVAR-PC.md`). Puro, para o teste a correr em Node:
 * `desktop/EntradasDaHome.web.tsx` só desenha.
 */

export type EntradaDoContinuar = { etiqueta: string; botao: string; acao: 'abrir' | 'retomar' };

/**
 * A faixa que já está a tocar não precisa de ser retomada: o cartão leva ao
 * leitor ("Now playing", "Open"). Parada (a sessão da última vez, ou uma
 * pausa) é "Continue listening" e o botão retoma.
 */
export function entradaDoContinuar(aTocar: boolean): EntradaDoContinuar {
  return aTocar
    ? { etiqueta: 'Now playing', botao: 'Open', acao: 'abrir' }
    : { etiqueta: 'Continue listening', botao: 'Resume', acao: 'retomar' };
}

/** "47 songs · from what you listen to". */
export function resumoDaMistura(n: number): string {
  return `${n} ${n === 1 ? 'song' : 'songs'} · from what you listen to`;
}

/**
 * As prateleiras que a Home guarda atrás de um botão (as menos usadas), e o
 * texto do botão: os quatro primeiros nomes que têm conteúdo e um "+N". Sem
 * nenhuma com conteúdo, não há botão (devolve null).
 */
export function resumoDasOutras(prateleiras: readonly { nome: string; quantas: number }[]): { nomes: string[]; texto: string } | null {
  const nomes = prateleiras.filter((p) => p.quantas > 0).map((p) => p.nome);
  if (!nomes.length) return null;
  const visiveis = nomes.slice(0, 4);
  const resto = nomes.length - visiveis.length;
  return { nomes, texto: `${visiveis.join(' · ')}${resto > 0 ? `  +${resto}` : ''}` };
}
