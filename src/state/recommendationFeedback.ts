import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { ajustarSugestoes,pesoDoArtista,preferidos,type Feedback } from '../lib/recommendationFeedback';
import { chaveDeArtista,displayArtist } from '../lib/artistName';
import { trackKey } from '../lib/shuffle';
import type { Track } from '../types';

type State={userId:string|null;items:Feedback[];ready:boolean;busy:boolean;revision:number};
export const useRecommendationFeedback=create<State>(()=>({userId:null,items:[],ready:false,busy:false,revision:0}));
let generation=0;
let pending:Promise<void>=Promise.resolve();
const storageKey=(id:string)=>`recommendation-feedback:${id}`;
export function loadRecommendationFeedback(userId:string|null):Promise<void>{
  const run=++generation;
  useRecommendationFeedback.setState({userId,items:[],ready:false,busy:false});
  pending=(async()=>{
    if(!userId){useRecommendationFeedback.setState({ready:true});return;}
    try {
      const raw=await AsyncStorage.getItem(storageKey(userId));
      const items=raw?JSON.parse(raw):[];
      if(run===generation&&Array.isArray(items))useRecommendationFeedback.setState({items:items.filter(p=>p&&(p.kind==='track'||p.kind==='artist')&&typeof p.key==='string'&&typeof p.label==='string')});
    }catch{/* Sem cache local continua com as preferências do servidor. */}
    try {
      const items:Feedback[]=[];
      for(let offset=0;;offset+=1000){
        const {data,error}=await supabase.from('recommendation_feedback').select('kind,key,label').eq('user_id',userId).order('kind').order('key').range(offset,offset+999);
        if(error)throw error;
        items.push(...(data??[]) as Feedback[]);
        if(!data||data.length<1000)break;
      }
      if(run!==generation)return;
      useRecommendationFeedback.setState(s=>({items,revision:s.revision+1}));
      await AsyncStorage.setItem(storageKey(userId),JSON.stringify(items));
    }catch{/* Sem rede conserva a última leitura deste utilizador. */}
    finally{if(run===generation)useRecommendationFeedback.setState({ready:true});}
  })();
  return pending;
}
export const feedbackReady=()=>pending;
export const trackIsSuppressed=(t:Track)=>useRecommendationFeedback.getState().items.some(p=>p.kind==='track'&&p.key===trackKey(t));
export const artistPreferenceKey=(t:Track)=>chaveDeArtista(displayArtist(t));
export const filterSuggestions=(tracks:readonly Track[])=>ajustarSugestoes(tracks,useRecommendationFeedback.getState().items,trackKey,artistPreferenceKey);
export function artistWeight(name:string):number {
  return pesoDoArtista(useRecommendationFeedback.getState().items,chaveDeArtista(name));
}
/** Os artistas de quem se pediu MAIS. Ver `lib/recommendationFeedback.ts`. */
export const artistasPreferidos=()=>preferidos(useRecommendationFeedback.getState().items);
export async function setRecommendationFeedback(item:Feedback,enabled:boolean):Promise<void>{
  await pending;
  const state=useRecommendationFeedback.getState(),run=generation;
  if(!state.userId)throw new Error('Sign in to save your preferences.');
  if(state.busy)throw new Error('Wait for the previous change to finish.');
  useRecommendationFeedback.setState({busy:true});
  try {
    const query=supabase.from('recommendation_feedback');
    // "Mais deste" e "menos deste" sao a MESMA pergunta com respostas opostas:
    // guardar as duas deixava o peso a depender de qual delas fosse lida
    // primeiro. Ligar uma apaga a outra, aqui e na base.
    const oposto=item.kind==='artist'?'artist_more':item.kind==='artist_more'?'artist':null;
    if(enabled&&oposto){
      const {error:limpo}=await query.delete().match({user_id:state.userId,kind:oposto,key:item.key});
      if(limpo)throw new Error('Could not save this preference. Check your connection and try again.');
    }
    const {error}=enabled?await query.upsert({user_id:state.userId,...item}):await query.delete().match({user_id:state.userId,kind:item.kind,key:item.key});
    if(error)throw new Error('Could not save this preference. Check your connection and try again.');
    if(run!==generation)return;
    // Fora as linhas desta chave que esta escrita substitui: a propria, e a
    // oposta quando se esta a LIGAR uma (a desligar so sai a que se pediu).
    const items=state.items.filter(p=>p.key!==item.key
      ||(p.kind!==item.kind&&!(enabled&&p.kind===oposto)));
    if(enabled)items.push(item);
    useRecommendationFeedback.setState(s=>({items,revision:s.revision+1}));
    await AsyncStorage.setItem(storageKey(state.userId),JSON.stringify(items)).catch(()=>{});
  }finally{if(run===generation)useRecommendationFeedback.setState({busy:false});}
}
