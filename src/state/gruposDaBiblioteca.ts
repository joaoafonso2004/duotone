// A lista e o detalhe do artista usam o mesmo agrupamento, calculado uma vez
// por biblioteca e versão do catálogo. O WeakMap não retém contas antigas.
import type { Track } from '../types';
import { agruparPorArtista } from '../lib/artistName';
import { comCatalogo, useCatalogoDeFaixas } from './catalogoDeFaixas';

type Grupos = ReturnType<typeof agruparPorArtista<Track>>;
const cache = new WeakMap<Track[], { versao: number; grupos: Grupos }>();

export function gruposDaBiblioteca(faixas: Track[]): Grupos {
  const versao = useCatalogoDeFaixas.getState().versao;
  const anterior = cache.get(faixas);
  if (anterior?.versao === versao) return anterior.grupos;
  const grupos = agruparPorArtista(faixas.map(comCatalogo));
  cache.set(faixas, { versao, grupos });
  return grupos;
}
