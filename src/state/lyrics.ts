import AsyncStorage from '@react-native-async-storage/async-storage';
import {create} from 'zustand';
import {fetchLyrics,type LyricsData} from '../api/lyrics';
import {lyricsIdentity} from '../lib/lyricsMatch';
import {useConnectivity} from './connectivity';
import type {Track} from '../types';
type Entry={status:'loading'|'ready'|'missing'|'error';data:LyricsData|null;message?:string};
type Cached={at:number;data:LyricsData|null};
const KEY='lyrics:v3',cache=new Map<string,Cached>(),pending=new Map<string,Promise<void>>();
let hydration:Promise<void>|null=null,writes=Promise.resolve();
export const useLyrics=create<{entries:Record<string,Entry>}>(()=>({entries:{}}));
export function lyricsCacheKey(track:Track){const id=lyricsIdentity(track);return JSON.stringify([track.source,track.sourceId,id.title,id.artist,Math.round(track.durationSeconds??0)]);}
function publish(key:string,entry:Entry){useLyrics.setState(s=>({entries:{...Object.fromEntries(Object.entries(s.entries).slice(-80)),[key]:entry}}));}
async function hydrate(){
  if(!hydration)hydration=AsyncStorage.getItem(KEY).then(raw=>{if(raw)for(const [k,v] of JSON.parse(raw))if(typeof v?.at==='number')cache.set(k,v);}).catch(()=>{});
  return hydration;
}
function persist(){const rows=[...cache].sort((a,b)=>b[1].at-a[1].at).slice(0,60);cache.clear();for(const [k,v] of rows)cache.set(k,v);
  writes=writes.catch(()=>{}).then(()=>AsyncStorage.setItem(KEY,JSON.stringify(rows))).catch(()=>{});
}
export function ensureLyrics(track:Track,force=false):Promise<void>{
  const key=lyricsCacheKey(track);if(pending.has(key))return pending.get(key)!;
  const task=(async()=>{
    await hydrate();const cached=cache.get(key);
    if(cached&&!force&&(useConnectivity.getState().offline||Date.now()-cached.at<(cached.data?30*86400000:3600000))){publish(key,{status:cached.data?'ready':'missing',data:cached.data});return;}
    if(useConnectivity.getState().offline){publish(key,{status:'error',data:null,message:'Connect to the internet to load these lyrics.'});return;}
    publish(key,{status:'loading',data:null});
    try{const identity=lyricsIdentity(track),data=await fetchLyrics(identity.title,identity.artist,track.durationSeconds??undefined);
      cache.set(key,{at:Date.now(),data});persist();publish(key,{status:data?'ready':'missing',data});
    }catch(e:any){publish(key,{status:'error',data:null,message:e?.name==='AbortError'?'Lyrics took too long to load. Try again.':e?.message||'Could not load lyrics. Try again.'});}
  })().finally(()=>pending.delete(key));pending.set(key,task);return task;
}
