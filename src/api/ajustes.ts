import { supabase } from '../lib/supabase';
import { currentUserId } from './library';
import type { AjusteDaFaixa, Ganhos, MemoriaDeAjustes } from '../lib/equalizer';

/**
 * O equalizador e a velocidade de cada faixa, do lado do servidor.
 *
 * **Porque é que isto existe.** Estes ajustes viviam só no `AsyncStorage`, que
 * é do aparelho. O PC e o telemóvel tinham memórias separadas para as MESMAS
 * músicas: mexer no equalizador ou na velocidade num deles não chegava ao
 * outro.
 *
 * O armazenamento local FICA — é ele que faz a app arrancar com os ajustes já
 * aplicados, sem esperar pela rede, e é ele que responde quando não há rede
 * nenhuma. O servidor é a segunda cópia, que se funde com a primeira no
 * arranque (`fundirAjustes`).
 *
 * Nada aqui deixa a app parada: falha em silêncio e a memória local continua a
 * mandar. Uma faixa sem ajuste não vale uma mensagem de erro.
 */

/** A chave que a app usa é `fonte:id` — aqui as duas metades são colunas. */
function partirChave(chave: string): { source: string; sourceId: string } | null {
  const corte = chave.indexOf(':');
  if (corte <= 0 || corte === chave.length - 1) return null;
  return { source: chave.slice(0, corte), sourceId: chave.slice(corte + 1) };
}

/** Tudo o que o servidor sabe dos ajustes desta pessoa. */
export async function lerAjustesRemotos(): Promise<MemoriaDeAjustes> {
  const { data, error } = await supabase
    .from('user_track_adjustments')
    .select('source, source_id, rate, gains, seen_at')
    .order('seen_at', { ascending: false });
  if (error || !data) return {};

  const saida: MemoriaDeAjustes = {};
  for (const linha of data as any[]) {
    const visto = Date.parse(linha.seen_at);
    if (!Number.isFinite(visto)) continue;
    saida[`${linha.source}:${linha.source_id}`] = {
      rate: linha.rate ?? null,
      // O `check` da tabela garante dez, mas quem lê não confia em quem escreve.
      ganhos: Array.isArray(linha.gains) && linha.gains.length === 10
        ? (linha.gains as Ganhos)
        : null,
      visto,
    };
  }
  return saida;
}

/**
 * Escreve (ou apaga) o ajuste de uma faixa.
 *
 * Apaga quando não há nada fora do normal, que é a mesma regra do lado local:
 * voltar tudo ao normal é a maneira de desfazer, e uma linha a dizer "1× e
 * plano" só faria a memória crescer com entradas que não dizem nada.
 */
export async function guardarAjusteRemoto(
  chave: string,
  ajuste: AjusteDaFaixa | null,
): Promise<void> {
  const faixa = partirChave(chave);
  if (!faixa) return;

  try {
    const userId = await currentUserId();

    if (!ajuste || (ajuste.rate === null && ajuste.ganhos === null)) {
      await supabase
        .from('user_track_adjustments')
        .delete()
        .eq('user_id', userId)
        .eq('source', faixa.source)
        .eq('source_id', faixa.sourceId);
      return;
    }

    await supabase.from('user_track_adjustments').upsert(
      {
        user_id: userId,
        source: faixa.source,
        source_id: faixa.sourceId,
        rate: ajuste.rate,
        gains: ajuste.ganhos,
        seen_at: new Date(ajuste.visto).toISOString(),
      },
      { onConflict: 'user_id,source,source_id' },
    );
  } catch {
    // Sem sessão ou sem rede: o ajuste já está guardado localmente, e a
    // próxima escrita nesta faixa volta a tentar.
  }
}
