import AsyncStorage from '@react-native-async-storage/async-storage';
import {AppState,Platform} from 'react-native';
import {create} from 'zustand';
import {supabase} from '../lib/supabase';
import {AdjustmentSync,type AdjustmentSnapshot,type AdjustmentStatus} from '../lib/adjustmentSync';
import {daPersistencia,type AjusteDaFaixa,type MemoriaDeAjustes} from '../lib/equalizer';
import {lerAjustesRemotos,guardarAjusteRemoto} from '../api/ajustes';
import {useConnectivity} from './connectivity';
import {useAuth} from './auth';
import {appEstaVisivel} from '../lib/appVisibility';

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
    readRemote:()=>lerAjustesRemotos(userId),writeRemote:(k,v)=>guardarAjusteRemoto(userId,k,v),
    apply,status:status=>{if(!stopped)useAdjustmentSync.setState({status});},
  });
  const flush=()=>{if(timer)clearTimeout(timer);timer=setTimeout(()=>{if(online())void engine.sync();},500);};
  active={userId,engine,flush};
  for(const [k,v] of Object.entries(early.get(userId)??{}))engine.edit(k,v);early.delete(userId);
  const reconnect=useConnectivity.subscribe(s=>{if(!s.offline)flush();});
  const focus=AppState.addEventListener('change',state=>{if(state==='active')flush();});
  // Há Realtime e cada edição já agenda um flush. Este intervalo é apenas uma
  // recuperação; 15 s repetia leituras sem alterações e mantinha a app/janela
  // escondida ocupada sem benefício.
  const interval=setInterval(()=>{if(online())void engine.sync();},120000);
  const channel=supabase.channel(`track-adjustments:${userId}`).on('postgres_changes',
    {event:'*',schema:'public',table:'user_track_adjustments',filter:`user_id=eq.${userId}`},flush).subscribe();
  if(Platform.OS==='web'){window.addEventListener('online',flush);window.addEventListener('focus',flush);document.addEventListener('visibilitychange',flush);}
  flush();
  return()=>{stopped=true;engine.stop();if(active?.engine===engine)active=null;if(timer)clearTimeout(timer);
    clearInterval(interval);reconnect();focus.remove();void supabase.removeChannel(channel);
    if(Platform.OS==='web'){window.removeEventListener('online',flush);window.removeEventListener('focus',flush);document.removeEventListener('visibilitychange',flush);}};
}
