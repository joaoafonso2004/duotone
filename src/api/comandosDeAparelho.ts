import { supabase } from '../lib/supabase';
import { VALIDADE_DO_PEDIDO_MS, type Pedido, type TipoDePedido } from '../lib/duotoneConnect';

/**
 * O transporte das ordens do Duotone Connect: a tabela `pedidos_ao_aparelho`
 * (`supabase/duotone-connect.sql`) e o canal de Realtime que as faz chegar num
 * instante.
 *
 * **Sem a migração corrida, isto tem de ser inofensivo.** É a mesma regra do
 * `api/playerSessions.ts`: um pedido a uma tabela que não existe não pode
 * rebentar no ecrã nem encher a consola. Da primeira vez que o servidor diz
 * que não a conhece, desliga-se tudo até a app reiniciar -- e o "Play on…"
 * some-se em vez de aparecer um botão que dá erro.
 */

/** `null` = ainda não se perguntou; `false` = a migração não está aplicada. */
let tabelaExiste: boolean | null = null;

/** Tabela (PGRST205/42P01) ou função (PGRST202/42883) que não existem. */
function naoExiste(error: { code?: string } | null | undefined): boolean {
  return !!error && ['PGRST205', 'PGRST202', '42P01', '42883'].includes(error.code ?? '');
}

function marcarSeFalta(error: { code?: string } | null | undefined): boolean {
  if (naoExiste(error)) { tabelaExiste = false; return true; }
  return false;
}

/** O que a app já sabe sobre a migração: para a UI não oferecer o que não há. */
export function connectDisponivel(): boolean {
  return tabelaExiste !== false;
}

function linhaParaPedido(row: any): Pedido {
  const criado = Date.parse(row.criado_em ?? '');
  return {
    id: row.id,
    deAparelho: row.de_aparelho,
    paraAparelho: row.para_aparelho,
    tipo: row.tipo as TipoDePedido,
    // Sem carimbo legível conta como acabada de criar: recusar uma ordem por
    // causa de uma data estranha era pior do que executá-la.
    criadoEm: Number.isFinite(criado) ? criado : Date.now(),
    estado: row.estado,
    detalhe: row.detalhe ?? null,
  };
}

/** Manda uma ordem a outro aparelho. `null` se a migração não está aplicada. */
export async function mandarPedido(
  deAparelho: string,
  paraAparelho: string,
  tipo: TipoDePedido,
): Promise<Pedido | null> {
  if (tabelaExiste === false || !deAparelho || !paraAparelho || deAparelho === paraAparelho) return null;
  const { data, error } = await supabase
    .from('pedidos_ao_aparelho')
    .insert({ de_aparelho: deAparelho, para_aparelho: paraAparelho, tipo })
    .select()
    .single();
  if (error) {
    if (marcarSeFalta(error)) return null;
    throw error;
  }
  tabelaExiste = true;
  return linhaParaPedido(data);
}

/** Diz a quem mandou o que aconteceu. Falhar aqui não desfaz o que já se fez. */
export async function responderPedido(
  id: string,
  estado: 'feito' | 'recusado',
  detalhe?: string,
): Promise<void> {
  if (tabelaExiste === false) return;
  const { error } = await supabase
    .from('pedidos_ao_aparelho')
    .update({ estado, respondido_em: new Date().toISOString(), detalhe: detalhe ?? null })
    .eq('id', id);
  if (error && !marcarSeFalta(error)) {
    // Em silêncio: a ordem foi executada: não vale a pena estragar o ecrã
    // porque o carimbo de resposta não chegou.
  }
}

/**
 * As ordens pendentes para este aparelho, das que ainda valem.
 *
 * Existe para o arranque e para quando o Realtime falha: quem chega agora tem
 * de apanhar a ordem que foi escrita há dez segundos.
 */
export async function pedidosParaMim(meuAparelho: string): Promise<Pedido[]> {
  if (tabelaExiste === false || !meuAparelho) return [];
  const desde = new Date(Date.now() - VALIDADE_DO_PEDIDO_MS).toISOString();
  const { data, error } = await supabase
    .from('pedidos_ao_aparelho')
    .select('*')
    .eq('para_aparelho', meuAparelho)
    .eq('estado', 'pendente')
    .gte('criado_em', desde)
    .order('criado_em', { ascending: true })
    .limit(10);
  if (error) {
    if (marcarSeFalta(error)) return [];
    throw error;
  }
  tabelaExiste = true;
  return (data ?? []).map(linhaParaPedido);
}

export async function verPedido(id: string): Promise<Pedido | null> {
  if (tabelaExiste === false) return null;
  const { data, error } = await supabase.from('pedidos_ao_aparelho').select('*').eq('id', id).maybeSingle();
  if (error) {
    if (marcarSeFalta(error)) return null;
    throw error;
  }
  return data ? linhaParaPedido(data) : null;
}

/**
 * Fica à escuta das ordens para este aparelho.
 *
 * O filtro vai no servidor (`para_aparelho`), e a RLS já garante que só
 * chegam as da própria conta -- as duas coisas juntas são o que faz um
 * aparelho nunca ver ordens que não lhe dizem respeito.
 */
export function ouvirPedidos(meuAparelho: string, aoChegar: (pedido: Pedido) => void): () => void {
  if (tabelaExiste === false || !meuAparelho) return () => {};
  const canal = supabase
    .channel(`pedidos:${meuAparelho}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'pedidos_ao_aparelho', filter: `para_aparelho=eq.${meuAparelho}` },
      (payload) => { try { aoChegar(linhaParaPedido(payload.new)); } catch { /* uma linha estranha não parte a escuta */ } },
    )
    .subscribe();
  return () => { void supabase.removeChannel(canal); };
}

/** Fica à escuta da resposta a UMA ordem, para quem a mandou. */
export function ouvirResposta(id: string, aoMudar: (pedido: Pedido) => void): () => void {
  if (tabelaExiste === false || !id) return () => {};
  const canal = supabase
    .channel(`pedido:${id}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'pedidos_ao_aparelho', filter: `id=eq.${id}` },
      (payload) => { try { aoMudar(linhaParaPedido(payload.new)); } catch { /* idem */ } },
    )
    .subscribe();
  return () => { void supabase.removeChannel(canal); };
}

/** Apaga as ordens velhas desta conta. Chamada de vez em quando, sem pressa. */
export async function limparPedidosVelhos(): Promise<void> {
  if (tabelaExiste === false) return;
  const { error } = await supabase.rpc('limpar_pedidos_ao_aparelho');
  if (error) marcarSeFalta(error);
}
