/**
 * De onde vem o que está a tocar: o "From Chill Vibes" do Now Playing do PC.
 *
 * Pura e sem imports de runtime, testada em `scripts/test-origem-da-fila.ts`.
 * A store guarda a origem (`origemDaFila`); isto decide quando ela muda e o
 * que se diz dela.
 */

export type TipoDeOrigem =
  | 'playlist' | 'guardadas' | 'artista' | 'album' | 'mistura' | 'prateleira' | 'pesquisa';

export type OrigemDaFila = {
  tipo: TipoDeOrigem;
  /** Como se vê: o nome da playlist, do artista, da prateleira, ou o texto procurado. */
  nome: string;
  /** Para voltar lá: o id da playlist ou da mistura. */
  id?: string;
};

type Chamada = { interno: boolean; mesmaFila: boolean };

/**
 * A origem depois de um `playTrack`.
 *
 * `pedida` tem três valores e os três contam: uma origem (quem tocou disse de
 * onde), `null` (disse que não há nenhuma) e `undefined` (não disse nada).
 *
 * Sem nada dito, só uma lista NOVA a apaga. O `next`, o `prev` e o salto de uma
 * faixa que falhou são `interno`; tocar numa linha do Up next passa a MESMA
 * fila. Nenhum deles começou nada, e a origem fica. Uma lista nova de um ecrã
 * que ainda não diz de onde vem fica sem origem: é melhor calar do que mostrar
 * a da lista anterior.
 */
export function origemAoTocar(
  anterior: OrigemDaFila | null,
  pedida: OrigemDaFila | null | undefined,
  { interno, mesmaFila }: Chamada,
): OrigemDaFila | null {
  if (pedida !== undefined) return valida(pedida);
  return interno || mesmaFila ? anterior : null;
}

/** Se a chamada começa uma lista nova -- e com ela caem as marcas do rádio. */
export function comecaListaNova(
  pedida: OrigemDaFila | null | undefined,
  { interno, mesmaFila }: Chamada,
): boolean {
  return pedida !== undefined || (!interno && !mesmaFila);
}

function valida(o: OrigemDaFila | null): OrigemDaFila | null {
  const nome = o?.nome?.trim();
  if (!o || !nome) return null;
  return { ...o, nome };
}

export type RotuloDaOrigem = {
  /** O que vem antes do nome ("From", "From search"). */
  antes: string;
  nome: string;
  /** Para onde leva um clique no nome; `null` quando não há sítio para ir. */
  alvo: OrigemDaFila | null;
};

/** Só estas têm página. Um álbum abre num diálogo, uma prateleira não é página. */
const NAVEGAVEIS: ReadonlySet<TipoDeOrigem> = new Set(['playlist', 'guardadas', 'artista', 'mistura']);

function alvoDe(o: OrigemDaFila): OrigemDaFila | null {
  if (!NAVEGAVEIS.has(o.tipo)) return null;
  if ((o.tipo === 'playlist' || o.tipo === 'mistura') && !o.id) return null;
  return o;
}

/**
 * A frase por cima do Now Playing, ou nada.
 *
 * O que a app meteu na fila NÃO veio da lista: uma faixa do rádio ou uma
 * sugestão do Smart Shuffle a dizer "From Chill Vibes" era mentir -- e é
 * precisamente onde alguém olha para perceber porque é que aquilo está a tocar.
 */
export function rotuloDaOrigem(
  origem: OrigemDaFila | null,
  faixa: { sugerida: boolean; doRadio: boolean },
): RotuloDaOrigem | null {
  if (faixa.sugerida) {
    return origem
      ? { antes: 'Smart shuffle pick for', nome: origem.nome, alvo: alvoDe(origem) }
      : { antes: 'From', nome: 'Smart shuffle', alvo: null };
  }
  if (faixa.doRadio) return { antes: 'From', nome: 'Radio', alvo: null };
  if (!origem) return null;
  if (origem.tipo === 'pesquisa') return { antes: 'From search', nome: `“${origem.nome}”`, alvo: null };
  if (origem.tipo === 'album') return { antes: 'From album', nome: origem.nome, alvo: null };
  return { antes: 'From', nome: origem.nome, alvo: alvoDe(origem) };
}
