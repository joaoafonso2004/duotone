import AsyncStorage from '@react-native-async-storage/async-storage';
import {AppState,Platform} from 'react-native';
import {create} from 'zustand';
import {supabase} from '../lib/supabase';
import {AdjustmentSync,precisaDeRecuperar,type AdjustmentSnapshot,type AdjustmentStatus} from '../lib/adjustmentSync';
import {daPersistencia,type AjusteDaFaixa,type MemoriaDeAjustes} from '../lib/equalizer';
import {lerAjustesRemotos,guardarAjusteRemoto} from '../api/ajustes';
import {useConnectivity} from './connectivity';
import {useAuth} from './auth';
import {appEstaVisivel,intervaloComAppVisivel} from '../lib/appVisibility';

export const useAdjustmentSync=create<{status:AdjustmentStatus}>(()=>({status:'loading'}));
let active:{userId:string;engine:AdjustmentSync;flush:()=>void}|null=null;
const early=new Map<string,MemoriaDeAjustes>();
export function queueTrackAdjustment(userId:string,key:string,value:AjusteDaFaixa){
  if(active?.userId===userId){active.engine.edit(key,value);active.flush();}
  else early.set(userId,{...early.get(userId),[key]:value});
}
export function retryAdjustmentSync(){active?.flush();}

export function startTrackAdjustmentSync(userId:string,apply:(values:MemoriaDeAjustes)=>void):()=>void {
  useAdjustmentSync.setState({status:'loading'});
  let stopped=false,timer:ReturnType<typeof setTimeout>|undefined;
  /** O canal está `SUBSCRIBED`, e quando foi a última leitura inteira. */
  let aoVivo=false,jaLigou=false,ultimaLeitura=0;
  const key=`track-adjustments:v2:${userId}`;
  const online=()=>!stopped&&!useConnectivity.getState().offline
    &&useAuth.getState().session?.user.id===userId&&appEstaVisivel();
  const engine=new AdjustmentSync({
    readLocal:async()=>{
      const raw=await AsyncStorage.getItem(key);
      if(raw){const parsed=JSON.parse(raw);return {values:daPersistencia(JSON.stringify(parsed.values)),pending:daPersistencia(JSON.stringify(parsed.pending))};}
      // A cache antiga não tinha conta. Atribuí-la uma só vez à primeira conta
      // migrada evita copiar preferências entre utilizadores no mesmo aparelho.
      const owner=await AsyncStorage.getItem('track-adjustments:legacy-owner');
      if(stopped||owner&&owner!==userId)return {values:{},pending:{}};
      const values=daPersistencia(await AsyncStorage.getItem('pref:ajustesPorFaixa'));
      if(stopped)return {values:{},pending:{}};
      await AsyncStorage.setItem('track-adjustments:legacy-owner',userId);
      return {values,pending:{...values}};
    },
    writeLocal:async(snapshot:AdjustmentSnapshot)=>{await AsyncStorage.setItem(key,JSON.stringify(snapshot));},
    readRemote:async()=>{const lidos=await lerAjustesRemotos(userId);ultimaLeitura=Date.now();return lidos;},
    writeRemote:(k,v)=>guardarAjusteRemoto(userId,k,v),
    apply,status:status=>{if(!stopped)useAdjustmentSync.setState({status});},
  });
  const flush=()=>{if(timer)clearTimeout(timer);timer=setTimeout(()=>{if(online())void engine.sync();},500);};
  // Recuperação (30/9, egress): com o Realtime ligado, as mudanças chegam por
  // ele, e a tabela inteira só se relê de dez em dez minutos -- ou ao voltar à
  // janela passados cinco. Sem ele, como antes.
  const recuperar=(janelaMs:number)=>{if(precisaDeRecuperar(aoVivo,ultimaLeitura,Date.now(),janelaMs))flush();};
  const aoFocar=()=>recuperar(5*60_000);
  active={userId,engine,flush};
  for(const [k,v] of Object.entries(early.get(userId)??{}))engine.edit(k,v);early.delete(userId);
  const reconnect=useConnectivity.subscribe(s=>{if(!s.offline)flush();});
  // No iPhone, voltar à app relê: em segundo plano o Realtime pode ter caído
  // sem avisar, e isto acontece poucas vezes. No PC o foco muda a toda a hora.
  const focus=AppState.addEventListener('change',state=>{if(state==='active'){if(Platform.OS==='web')aoFocar();else flush();}});
  // Há Realtime e cada edição já agenda um flush. Este intervalo é apenas uma
  // recuperação; 15 s repetia leituras sem alterações e mantinha a app/janela
  // escondida ocupada sem benefício.
  // Só com a app à vista (6/10): no tabuleiro do PC relia o dia todo.
  const pararIntervalo=intervaloComAppVisivel(()=>recuperar(10*60_000),120000);
  const channel=supabase.channel(`track-adjustments:${userId}`).on('postgres_changes',
    {event:'*',schema:'public',table:'user_track_adjustments',filter:`user_id=eq.${userId}`},(payload)=>{
      // O eco da própria escrita não relê nada; o que veio de outro aparelho, sim.
      const linha=payload.new as {source?:string;source_id?:string;seen_at?:string}|null;
      if(payload.eventType!=='DELETE'&&linha?.source&&linha.source_id
        &&engine.jaSabe(`${linha.source}:${linha.source_id}`,Date.parse(linha.seen_at??'')))return;
      flush();
    }).subscribe((estado)=>{
      const antes=aoVivo;aoVivo=estado==='SUBSCRIBED';
      // Voltou a ligar: o que mudou entretanto não veio por ele. A primeira
      // ligação não, que o arranque já agendou a sua leitura.
      if(aoVivo&&!antes&&jaLigou)flush();
      if(aoVivo)jaLigou=true;
    });
  if(Platform.OS==='web'){window.addEventListener('online',flush);window.addEventListener('focus',aoFocar);document.addEventListener('visibilitychange',aoFocar);}
  flush();
  return()=>{stopped=true;engine.stop();if(active?.engine===engine)active=null;if(timer)clearTimeout(timer);
    pararIntervalo();reconnect();focus.remove();void supabase.removeChannel(channel);
    if(Platform.OS==='web'){window.removeEventListener('online',flush);window.removeEventListener('focus',aoFocar);document.removeEventListener('visibilitychange',aoFocar);}};
}
