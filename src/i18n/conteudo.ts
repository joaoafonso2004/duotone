/**
 * O que vem dos DADOS e não do código: títulos de músicas e nomes de artistas.
 *
 * A tradução corre sobre o texto que se mostra, por isso uma música chamada
 * "Home" ou "Yesterday" seria traduzida como um rótulo. `tituloDaFaixa` e
 * `displayArtist` (`src/lib/artistName.ts`) marcam aqui o que devolvem, e o
 * tradutor deixa esses textos como estão. O artistName é testado sozinho em
 * Node, por isso chega cá por `globalThis` e não por import.
 */
const conteudos = new Set<string>();
const LIMITE = 50_000;

export function marcarConteudo(texto: string): void {
  if (texto && conteudos.size < LIMITE) conteudos.add(texto.trim());
}

export function eConteudo(texto: string): boolean {
  return conteudos.has(texto.trim());
}

(globalThis as { __duotoneConteudo?: (t: string) => void }).__duotoneConteudo = marcarConteudo;
