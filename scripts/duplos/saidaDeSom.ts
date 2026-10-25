/**
 * Duplo do `src/state/saidaDeSom` (o verdadeiro lê a saída do iOS pelo
 * `state/carro`, que importa o react-native). O teste muda a saída à mão com
 * `mudarSaida`, como se se ligassem outros auscultadores.
 */
type Saida = { tipo: string; nome: string } | null;
let ouvinte: ((s: Saida) => void) | null = null;
let atual: Saida = null;

export function ouvirSaidaDeSom(aoMudar: (s: Saida) => void): () => void {
  ouvinte = aoMudar;
  aoMudar(atual);
  return () => { ouvinte = null; };
}

export function mudarSaida(s: Saida): void {
  atual = s;
  ouvinte?.(s);
}
