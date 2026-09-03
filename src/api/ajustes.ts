import {supabase} from '../lib/supabase';
import {normalizar,type AjusteDaFaixa,type MemoriaDeAjustes} from '../lib/equalizer';

/** Leitura paginada e limitada à conta cuja sincronização está em curso. */
export async function lerAjustesRemotos(userId:string):Promise<MemoriaDeAjustes> {
  const result:MemoriaDeAjustes={};
  for(let offset=0;;offset+=1000){
    const {data,error}=await supabase.from('user_track_adjustments')
      .select('source,source_id,rate,gains,seen_at').eq('user_id',userId)
      .order('source').order('source_id').range(offset,offset+999);
    if(error)throw error;
    for(const row of data??[]){
      const visto=Date.parse(row.seen_at);if(!Number.isFinite(visto))continue;
      result[`${row.source}:${row.source_id}`]={rate:row.rate??null,ganhos:row.gains?normalizar(row.gains):null,visto};
    }
    if(!data||data.length<1000)break;
  }
  return result;
}

/** Inserir sem substituir; atualizar só se a edição for mais recente.
 * Dois pedidos fora de ordem nunca fazem regressar um preset antigo.
 * Repor 1×/Flat é uma escolha explícita: conservar a data impede que um
 * aparelho offline ressuscite a configuração anterior depois de um DELETE.
 */
export async function guardarAjusteRemoto(userId:string,chave:string,ajuste:AjusteDaFaixa):Promise<void> {
  const at=chave.indexOf(':');if(at<1||at===chave.length-1)throw Error('Invalid track');
  const value={user_id:userId,source:chave.slice(0,at),source_id:chave.slice(at+1),
    rate:ajuste.rate,gains:ajuste.ganhos,seen_at:new Date(ajuste.visto).toISOString()};
  const inserted=await supabase.from('user_track_adjustments').upsert(value,{onConflict:'user_id,source,source_id',ignoreDuplicates:true});
  if(inserted.error)throw inserted.error;
  const updated=await supabase.from('user_track_adjustments').update(value)
    .eq('user_id',userId).eq('source',value.source).eq('source_id',value.source_id).lt('seen_at',value.seen_at);
  if(updated.error)throw updated.error;
}
