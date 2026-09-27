import { supabase } from './supabase';

/**
 * O id de quem tem a sessão, SEM ir à rede (27/9).
 *
 * O `auth.getUser()` é um pedido ao servidor de autenticação de cada vez que se
 * chama, e era chamado antes de quase tudo: cada leitura da biblioteca, da
 * inbox e das playlists, cada escrita da sessão de handoff. Eram dezenas de
 * pedidos por minuto só para saber um id que já está no aparelho, a somar ao
 * egress e aos logs que o Supabase cobrou a 27/9. O `getSession()` lê a sessão
 * guardada (e renova o token se tiver expirado).
 *
 * Quem garante o acesso continua a ser a RLS: este id serve para FILTRAR, não
 * para autorizar.
 */
export async function idDaConta(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}
