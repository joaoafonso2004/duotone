import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { ajustarSugestoes,pesoDoArtista,preferidos,type Feedback } from '../lib/recommendationFeedback';
import {
  GUARDAR_EVENTOS_MS,juntarAprendizagens,pesoDaAprendizagem,registarEscutaAprendida,registarSaltoAprendido,
  type EventoAprendido,
} from '../lib/aprendizagemDeRecomendacoes';
import { cacheGet,cacheSet } from '../api/cache';
import { useConnectivity } from './connectivity';
import { chaveDeArtista,displayArtist } from '../lib/artistName';
import { trackKey } from '../lib/shuffle';
import { chavesDaMusica } from '../lib/identidadeDaMusica';
import type { Track } from '../types';

type State={userId:string|null;items:Feedback[];saltos:EventoAprendido[];ready:boolean;busy:boolean;revision:number};
export const useRecommendationFeedback=create<State>(()=>({userId:null,items:[],saltos:[],ready:false,busy:false,revision:0}));
let generation=0;
let pending:Promise<void>=Promise.resolve();
const storageKey=(id:string)=>`recommendation-feedback:${id}`;
// v2: eventos (saltos e escutas) em vez de rejeições. A v1 nunca saiu numa versão.
const learningStorageKey=(id:string)=>`recommendation-learning:v2:${id}`;
/** Na conta (`yt_cache`, uma linha por pessoa com RLS): é assim que um skip no
 * iPhone também ensina o PC. */
const CHAVE_NA_CONTA='recomendacoes:aprendizagem:v2';
const REVER_A_CONTA_MS=10*60*1000;
export function loadRecommendationFeedback(userId:string|null):Promise<void>{
  const run=++generation;
  useRecommendationFeedback.setState({userId,items:[],saltos:[],ready:false,busy:false});
  pending=(async()=>{
    if(!userId){useRecommendationFeedback.setState({ready:true});return;}
    try {
      const raw=await AsyncStorage.getItem(storageKey(userId));
      const items=raw?JSON.parse(raw):[];
      if(run===generation&&Array.isArray(items))useRecommendationFeedback.setState({items:items.filter(p=>p&&(p.kind==='track'||p.kind==='artist'||p.kind==='artist_more')&&typeof p.key==='string'&&typeof p.label==='string')});
    }catch{/* Sem cache local continua com as preferências do servidor. */}
    try {
      const raw=await AsyncStorage.getItem(learningStorageKey(userId));
      const saltos=juntarAprendizagens(raw?JSON.parse(raw):[],[]);
      if(run===generation)useRecommendationFeedback.setState({saltos});
    }catch{/* Uma aprendizagem local inválida começa vazia. */}
    // Não espera: sem rede, ou com a conta lenta, fica o que o aparelho sabe.
    void trazerAprendizagemDaConta(userId,run,true);
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
/** Cada descoberta passa por aqui: é a deixa para rever a conta, no máximo
 * de 10 em 10 minutos, sem a fazer esperar. */
export const feedbackReady=()=>{
  const {userId}=useRecommendationFeedback.getState();
  if(userId)void trazerAprendizagemDaConta(userId,generation,false);
  return pending;
};
export const trackIsSuppressed=(t:Track)=>useRecommendationFeedback.getState().items.some(p=>p.kind==='track'&&p.key===trackKey(t));
export const artistPreferenceKey=(t:Track)=>chaveDeArtista(displayArtist(t));
const learnedWeight=(key:string)=>pesoDaAprendizagem(useRecommendationFeedback.getState().saltos,key);

export const filterSuggestions=(tracks:readonly Track[])=>ajustarSugestoes(
  tracks,useRecommendationFeedback.getState().items,trackKey,artistPreferenceKey,learnedWeight,
);
export function artistWeight(name:string):number {
  const key=chaveDeArtista(name),explicit=pesoDoArtista(useRecommendationFeedback.getState().items,key);
  // O botão explícito ganha sempre ao que foi inferido dos skips.
  return explicit===1?learnedWeight(key):explicit;
}
/** Os artistas de quem se pediu MAIS. Ver `lib/recommendationFeedback.ts`. */
export const artistasPreferidos=()=>preferidos(useRecommendationFeedback.getState().items);

function identidadeDaMusica(track:Track):string {
  const chaves=chavesDaMusica(track);
  return chaves.find((chave)=>chave.startsWith('musica2:'))
    ??chaves.find((chave)=>chave.startsWith('musica:'))??trackKey(track);
}

function guardarAprendizagem(userId:string,saltos:EventoAprendido[]):void {
  void AsyncStorage.setItem(learningStorageKey(userId),JSON.stringify(saltos)).catch(()=>{});
}

const podeIrAConta=(userId:string,run:number)=>run===generation
  &&useRecommendationFeedback.getState().userId===userId&&!useConnectivity.getState().offline;

/** Junta o que a conta tem ao que o aparelho sabe, se ainda for a mesma conta. */
function aplicarDaConta(userId:string,run:number,naConta:unknown):void {
  if(run!==generation||useRecommendationFeedback.getState().userId!==userId)return;
  const antes=useRecommendationFeedback.getState().saltos;
  const saltos=juntarAprendizagens(antes,naConta);
  if(saltos.length===antes.length)return;
  useRecommendationFeedback.setState(s=>({saltos,revision:s.revision+1}));
  guardarAprendizagem(userId,saltos);
}

const contaLidaEm=new Map<string,number>();
async function trazerAprendizagemDaConta(userId:string,run:number,forcar:boolean):Promise<void>{
  const agora=Date.now();
  if(!forcar&&(contaLidaEm.get(userId)??0)>agora-REVER_A_CONTA_MS)return;
  if(!podeIrAConta(userId,run))return;
  contaLidaEm.set(userId,agora);
  const naConta=await cacheGet<unknown>(CHAVE_NA_CONTA,GUARDAR_EVENTOS_MS);
  if(naConta)aplicarDaConta(userId,run,naConta);
}

/**
 * Em fila, e sempre a juntar com o que lá está antes de escrever: dois envios
 * em paralelo liam a mesma versão e um apagava o outro (a mesma lição da
 * memória do Smart Shuffle). Best-effort: sem rede fica no aparelho, e o
 * próximo envio leva tudo.
 */
let envioParaAConta:Promise<void>=Promise.resolve();
function enviarAprendizagemParaAConta(userId:string):void {
  const run=generation;
  envioParaAConta=envioParaAConta.catch(()=>{}).then(async()=>{
    if(!podeIrAConta(userId,run))return;
    const naConta=await cacheGet<unknown>(CHAVE_NA_CONTA,GUARDAR_EVENTOS_MS);
    if(!podeIrAConta(userId,run))return;
    const saltos=juntarAprendizagens(useRecommendationFeedback.getState().saltos,naConta);
    await cacheSet(CHAVE_NA_CONTA,saltos);
    aplicarDaConta(userId,run,saltos);
  });
  envioParaAConta.catch(()=>{});
}

/** Para os testes: espera pelo envio que estiver em curso. */
export const aprendizagemEnviada=()=>envioParaAConta.catch(()=>{});

/** Só o player chama isto, depois de confirmar som e um skip manual <30 s. */
export function aprenderComSaltoDeRecomendacao(track:Track):void {
  const state=useRecommendationFeedback.getState();
  if(!state.userId)return;
  const saltos=registarSaltoAprendido(
    state.saltos,artistPreferenceKey(track),identidadeDaMusica(track),Date.now(),
  );
  useRecommendationFeedback.setState(s=>({saltos,revision:s.revision+1}));
  guardarAprendizagem(state.userId,saltos);
  enviarAprendizagemParaAConta(state.userId);
}

/** Uma recomendação que chegou ao limiar de escuta desfaz a rejeição mais antiga. */
export function aprenderComEscutaDeRecomendacao(track:Track):void {
  const state=useRecommendationFeedback.getState();
  if(!state.userId)return;
  const saltos=registarEscutaAprendida(state.saltos,artistPreferenceKey(track),Date.now());
  if(saltos.length===state.saltos.length)return;
  useRecommendationFeedback.setState(s=>({saltos,revision:s.revision+1}));
  guardarAprendizagem(state.userId,saltos);
  enviarAprendizagemParaAConta(state.userId);
}

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
