import { supabase } from '../lib/supabase';
import type { FaixaResolvida } from './catalogo';

/**
 * A tabela partilhada de metadados por faixa (supabase/track-catalog.sql).
 *
 * A chave é a FAIXA e não o utilizador: resolver uma vez serve toda a gente, e
 * ninguém paga a espera outra vez. Falhar aqui nunca é motivo para parar nada —
 * quem chama fica com o que a app adivinha, que é o comportamento de sempre.
 */

export type ChaveDeFaixa = { source: string; sourceId: string };

export const chaveDoCatalogo = (source: string, sourceId: string) => `${source}:${sourceId}`;

/** Quantas faixas por pedido. O `in` do PostgREST vai no URL, e um URL tem fim. */
const LOTE = 150;

export async function lerCatalogoDeFaixas(
  chaves: readonly ChaveDeFaixa[],
): Promise<Map<string, FaixaResolvida>> {
  const mapa = new Map<string, FaixaResolvida>();
  const porFonte = new Map<string, string[]>();
  for (const c of chaves) {
    if (!c.sourceId) continue;
    const lista = porFonte.get(c.source) ?? [];
    lista.push(c.sourceId);
    porFonte.set(c.source, lista);
  }

  for (const [source, ids] of porFonte) {
    const unicos = Array.from(new Set(ids));
    for (let i = 0; i < unicos.length; i += LOTE) {
      try {
        const { data, error } = await supabase
          .from('track_catalog')
          .select('source,source_id,artist,title,album,artwork_url,prova')
          .eq('source', source)
          .in('source_id', unicos.slice(i, i + LOTE));
        if (error || !data) continue;
        for (const linha of data as any[]) {
          if (!linha.artist && !linha.title) continue;
          mapa.set(chaveDoCatalogo(linha.source, linha.source_id), {
            artista: linha.artist ?? '',
            titulo: linha.title ?? '',
            album: linha.album ?? null,
            capa: linha.artwork_url ?? null,
            prova: linha.prova === 'duracao' ? 'duracao' : 'artista',
          });
        }
      } catch {
        // Sem rede, ou sem a migração aplicada: segue-se sem catálogo.
      }
    }
  }
  return mapa;
}

/** Acrescenta ao catálogo. A tabela não aceita update: a primeira fica. */
export async function guardarNoCatalogo(
  chave: ChaveDeFaixa,
  faixa: FaixaResolvida,
): Promise<void> {
  try {
    await supabase.from('track_catalog').upsert({
      source: chave.source,
      source_id: chave.sourceId,
      artist: faixa.artista,
      title: faixa.titulo,
      album: faixa.album,
      artwork_url: faixa.capa,
      prova: faixa.prova,
    }, { onConflict: 'source,source_id', ignoreDuplicates: true });
  } catch {
    // Perder a partilha só faz o próximo dispositivo resolver outra vez.
  }
}
