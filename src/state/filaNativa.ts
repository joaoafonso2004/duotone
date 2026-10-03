/**
 * A fila numa folha NATIVA do iOS (3/10, item 7 de `docs/barra-home-folhas.html`):
 * é um ecrã do stack (`Fila`, `presentation: 'formSheet'`), e não um filho do
 * leitor. O que só o leitor sabe fazer -- abrir a folha do Jam, baixar o leitor
 * antes de ir para a página de um artista -- chega à folha por aqui.
 */
type Accoes = {
  abrirSessao?: () => void;
  verArtista?: (nome: string) => void;
};

let accoes: Accoes = {};

/** O leitor regista-as ao montar; devolve quem as tira. */
export function registarAccoesDaFila(novas: Accoes): () => void {
  accoes = novas;
  return () => { if (accoes === novas) accoes = {}; };
}

export function accoesDaFila(): Accoes {
  return accoes;
}
