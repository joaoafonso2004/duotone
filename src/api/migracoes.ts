import { MIGRACOES, migracoesEmFalta, type EstadoDasMigracoes } from '../lib/migracoes';
import { supabase } from '../lib/supabase';

/**
 * Pergunta à base que ficheiros de `supabase/` faltam (lib/migracoes.ts).
 * Uma chamada, com as marcas todas; só quando se gera o relatório de
 * reprodução -- não custa nada ao resto da app.
 */
export async function verificarMigracoes(): Promise<EstadoDasMigracoes> {
  try {
    const { data, error } = await supabase.rpc('marcas_em_falta', { p_marcas: MIGRACOES.map((m) => m.marca) });
    if (error) {
      if ((error as { code?: string }).code === 'PGRST202') return { tipo: 'sem-verificador' };
      return { tipo: 'erro', mensagem: error.message };
    }
    return { tipo: 'ok', emFalta: migracoesEmFalta(Array.isArray(data) ? (data as string[]) : []) };
  } catch (e: any) {
    return { tipo: 'erro', mensagem: e?.message ?? 'no connection' };
  }
}
