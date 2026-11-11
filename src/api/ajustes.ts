import {supabase} from '../lib/supabase';
import {normalizar,type AjusteDaFaixa,type MemoriaDeAjustes} from '../lib/equalizer';

/** Uma linha do `user_track_adjustments` (lida, ou trazida por um aviso do Realtime). */
export function linhaDoAjuste(row:{source?:unknown;source_id?:unknown;rate?:unknown;gains?:unknown;seen_at?:unknown}|null|undefined):[string,AjusteDaFaixa]|null{
  if(!row||typeof row.source!=='string'||typeof row.source_id!=='string'||!row.source||!row.source_id)return null;
  const visto=Date.parse(String(row.seen_at??''));if(!Number.isFinite(visto))return null;
  return [`${row.source}:${row.source_id}`,{rate:typeof row.rate==='number'?row.rate:null,ganhos:row.gains?normalizar(row.gains as any):null,visto}];
}

/**
 * Leitura paginada e limitada à conta cuja sincronização está em curso.
 *
 * Com `desde` (ms), só as linhas editadas a partir daí (11/11, egress): o
 * `seen_at` é a hora da edição. Era a tabela inteira a cada edição -- duas
 * vezes -- e a cada regresso à app: 47 leituras numa hora, numa só conta.
 */
export async function lerAjustesRemotos(userId:string,desde:number|null=null):Promise<MemoriaDeAjustes> {
  const result:MemoriaDeAjustes={};
  for(let offset=0;;offset+=1000){
    let pedido=supabase.from('user_track_adjustments')
      .select('source,source_id,rate,gains,seen_at').eq('user_id',userId);
    if(desde!==null)pedido=pedido.gte('seen_at',new Date(desde).toISOString());
    const {data,error}=await pedido.order('source').order('source_id').range(offset,offset+999);
    if(error)throw error;
    for(const row of data??[]){
      const linha=linhaDoAjuste(row);if(linha)result[linha[0]]=linha[1];
    }
    if(!data||data.length<1000)break;
  }
  return result;
}

/** `undefined` até se saber; `false` se a base de dados não tem a função. */
let funcaoDoAjuste:boolean|undefined;
const funcaoEmFalta=(e:{code?:string})=>e.code==='PGRST202'||e.code==='42883';

/** Inserir sem substituir; atualizar só se a edição for mais recente.
 * Dois pedidos fora de ordem nunca fazem regressar um preset antigo.
 * Repor 1×/Flat é uma escolha explícita: conservar a data impede que um
 * aparelho offline ressuscite a configuração anterior depois de um DELETE.
 */
export async function guardarAjusteRemoto(userId:string,chave:string,ajuste:AjusteDaFaixa):Promise<void> {
  const at=chave.indexOf(':');if(at<1||at===chave.length-1)throw Error('Invalid track');
  const value={user_id:userId,source:chave.slice(0,at),source_id:chave.slice(at+1),
    rate:ajuste.rate,gains:ajuste.ganhos,seen_at:new Date(ajuste.visto).toISOString()};
  // Um só comando, com a mesma regra (supabase/escritas-atomicas.sql). A
  // função escreve pela sessão (auth.uid()), e quem chama passa sempre o
  // utilizador da sessão. Sem a migração, os dois pedidos de sempre.
  if(funcaoDoAjuste!==false){
    const {error}=await supabase.rpc('guardar_ajuste_da_faixa',{p_source:value.source,p_source_id:value.source_id,
      p_rate:value.rate,p_gains:value.gains,p_seen_at:value.seen_at});
    if(!error){funcaoDoAjuste=true;return;}
    if(!funcaoEmFalta(error))throw error;
    funcaoDoAjuste=false;
  }
  const inserted=await supabase.from('user_track_adjustments').upsert(value,{onConflict:'user_id,source,source_id',ignoreDuplicates:true});
  if(inserted.error)throw inserted.error;
  const updated=await supabase.from('user_track_adjustments').update(value)
    .eq('user_id',userId).eq('source',value.source).eq('source_id',value.source_id).lt('seen_at',value.seen_at);
  if(updated.error)throw updated.error;
}
