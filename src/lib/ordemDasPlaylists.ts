/**
 * A grelha das Playlists do PC (30/10, passo 2 de `docs/PLANO-ELEVAR-PC.md`):
 * a pesquisa, a ordem (Recent / A–Z / Most tracks) e a linha por baixo do
 * título ("15 playlists · 3 collaborative"). Puro, para o teste a correr em Node.
 */
import { correspondeAPesquisa } from './searchText';

export type OrdemDasPlaylists = 'recent' | 'az' | 'most';

export const OPCOES_DE_ORDEM: readonly { id: OrdemDasPlaylists; rotulo: string }[] = [
  { id: 'recent', rotulo: 'Recent' },
  { id: 'az', rotulo: 'A–Z' },
  { id: 'most', rotulo: 'Most tracks' },
];

type Linha = { name: string; trackCount: number; colaborativa?: boolean };

/**
 * "Recent" é a ordem em que a loja as dá (as mexidas há pouco primeiro), sem
 * a mexer. "A–Z" ignora maiúsculas e acentos; "Most tracks" desempata pelo nome.
 * Devolve uma cópia: nunca altera a lista da loja.
 */
export function ordenarPlaylists<T extends Linha>(lista: readonly T[], ordem: OrdemDasPlaylists): T[] {
  const copia = [...lista];
  const nome = (p: T) => p.name.localeCompare.bind(p.name);
  if (ordem === 'az') return copia.sort((a, b) => nome(a)(b.name, undefined, { sensitivity: 'base' }));
  if (ordem === 'most') return copia.sort((a, b) => b.trackCount - a.trackCount || nome(a)(b.name, undefined, { sensitivity: 'base' }));
  return copia;
}

/** As que correspondem à pesquisa (pelo nome; sem texto, todas). */
export function filtrarPlaylists<T extends Linha>(lista: readonly T[], pesquisa: string): T[] {
  return pesquisa.trim() ? lista.filter((p) => correspondeAPesquisa(pesquisa, p.name)) : [...lista];
}

/** "15 playlists · 3 collaborative", "1 playlist"; vazio quando não há nenhuma. */
export function resumoDasPlaylists(lista: readonly Linha[]): string {
  if (!lista.length) return '';
  const n = lista.length;
  const colab = lista.filter((p) => p.colaborativa).length;
  return `${n} ${n === 1 ? 'playlist' : 'playlists'}${colab ? ` · ${colab} collaborative` : ''}`;
}
