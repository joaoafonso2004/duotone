import { supabase } from '../lib/supabase';

/**
 * Manda um relato ("Report a problem", 15/11) pela função `relatar_problema`
 * (supabase/relatar-problema.sql). Um pedido só, e só quando a pessoa carrega
 * em "Send report". O servidor recusa com uma frase para pessoas (3 por dia,
 * pausa) que o `mensagemDeErro` mostra tal como vem.
 */
export async function relatarProblema(r: {
  comentario: string;
  relatorio: string | null;
  plataforma: string;
  versao: string;
}): Promise<void> {
  const { error } = await supabase.rpc('relatar_problema', {
    p_comentario: r.comentario,
    p_relatorio: r.relatorio,
    p_plataforma: r.plataforma,
    p_versao: r.versao,
  });
  if (error) throw error;
}
