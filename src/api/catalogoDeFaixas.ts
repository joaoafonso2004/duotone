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
          .select(temGeneroEAno
            ? 'source,source_id,artist,title,album,artwork_url,prova,genero,ano'
            : 'source,source_id,artist,title,album,artwork_url,prova')
          .eq('source', source)
          .in('source_id', unicos.slice(i, i + LOTE));
        if (error && temGeneroEAno && semColuna(error)) {
          // A migração ainda não correu: desliga e tenta outra vez sem elas.
          temGeneroEAno = false;
          i -= LOTE;
          continue;
        }
        if (error || !data) continue;
        for (const linha of data as any[]) {
          if (!linha.artist && !linha.title) continue;
          mapa.set(chaveDoCatalogo(linha.source, linha.source_id), {
            artista: linha.artist ?? '',
            titulo: linha.title ?? '',
            album: linha.album ?? null,
            // Sem a migração aplicada, as colunas não existem e vêm undefined:
            // fica null, que é a verdade -- não se sabe.
            genero: linha.genero ?? null,
            ano: typeof linha.ano === 'number' ? linha.ano : null,
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

/**
 * A base já tem as colunas do género e do ano?
 *
 * A migração `supabase/metadados-genero-e-ano.sql` corre à mão, e até correr as
 * colunas não existem. Isso não pode partir nada: pedir uma coluna que não
 * existe faz o PostgREST devolver erro -- **devolver, e não atirar**, por isso
 * um `try/catch` à volta não apanha nada e a falha passa em silêncio. Sem esta
 * bandeira, a leitura do catálogo inteiro era saltada e a escrita deixava de
 * partilhar seja o que fosse.
 *
 * Começa optimista e desliga-se à primeira recusa. Uma vez por sessão.
 */
let temGeneroEAno = true;

/** Acrescenta ao catálogo. A tabela não aceita update: a primeira fica. */
export async function guardarNoCatalogo(
  chave: ChaveDeFaixa,
  faixa: FaixaResolvida,
): Promise<void> {
  const base = {
    source: chave.source,
    source_id: chave.sourceId,
    artist: faixa.artista,
    title: faixa.titulo,
    album: faixa.album,
    artwork_url: faixa.capa,
    prova: faixa.prova,
  };
  const opcoes = { onConflict: 'source,source_id', ignoreDuplicates: true } as const;
  try {
    if (temGeneroEAno) {
      const { error } = await supabase.from('track_catalog')
        .upsert({ ...base, genero: faixa.genero, ano: faixa.ano }, opcoes);
      if (!error) return;
      if (!semColuna(error)) return;
      temGeneroEAno = false;
    }
    await supabase.from('track_catalog').upsert(base, opcoes);
  } catch {
    // Perder a partilha só faz o próximo dispositivo resolver outra vez.
  }
}

/**
 * O erro é "essa coluna não existe"?
 *
 * O PostgREST usa o `PGRST204` para uma coluna desconhecida no corpo, e o
 * `42703` do próprio Postgres quando ela aparece num `select`. A mensagem
 * entra na conta como rede de segurança: os códigos já mudaram uma vez.
 */
function semColuna(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  if (erro.code === 'PGRST204' || erro.code === '42703') return true;
  const m = (erro.message ?? '').toLowerCase();
  return m.includes('genero') || m.includes('ano') || m.includes('column');
}
