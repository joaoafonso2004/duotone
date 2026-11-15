import { supabase } from '../lib/supabase';
import { dadosDaLinha, lerLinha, type LinhaDosPresets, type MemoriaDePresets } from '../lib/presetsDoEqualizador';

/**
 * Os presets do equalizador na conta (supabase/eq-presets.sql).
 *
 * A mesma forma dos ajustes por faixa (api/ajustes.ts): uma linha por preset,
 * e o `seen_at` decide quem ganha. O conteúdo vai num `jsonb` porque os presets
 * e a escolha do carro têm formas diferentes, e nenhuma coluna tem de ser lida
 * pelo servidor.
 */
export async function lerPresetsRemotos(userId: string): Promise<MemoriaDePresets> {
  const saida: MemoriaDePresets = {};
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('user_eq_presets')
      .select('preset_id,data,seen_at').eq('user_id', userId)
      .order('preset_id').range(offset, offset + 499);
    if (error) throw error;
    for (const row of data ?? []) {
      const l = lerLinha(row.preset_id, row.data, Date.parse(row.seen_at));
      if (l) saida[row.preset_id] = l;
    }
    if (!data || data.length < 500) break;
  }
  return saida;
}

/** Inserir sem substituir; atualizar só se a edição for mais recente. Dois
 * pedidos fora de ordem nunca fazem regressar uma versão antiga. */
export async function guardarPresetRemoto(userId: string, id: string, linha: LinhaDosPresets): Promise<void> {
  const valor = {
    user_id: userId, preset_id: id, data: dadosDaLinha(linha),
    seen_at: new Date(linha.visto).toISOString(),
  };
  const inserido = await supabase.from('user_eq_presets')
    .upsert(valor, { onConflict: 'user_id,preset_id', ignoreDuplicates: true });
  if (inserido.error) throw inserido.error;
  const atualizado = await supabase.from('user_eq_presets').update(valor)
    .eq('user_id', userId).eq('preset_id', id).lt('seen_at', valor.seen_at);
  if (atualizado.error) throw atualizado.error;
}
