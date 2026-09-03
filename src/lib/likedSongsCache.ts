import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Track } from '../types';

// Dados de apresentação locais, por conta. Não são uma sessão nem concedem
// acesso ao servidor. O áudio continua a ser validado no sistema de ficheiros.
const key=(userId:string)=>`liked-songs:1:${userId}`;
const revisions=new Map<string,number>();
const writes=new Map<string,Promise<void>>();
export const likedCacheRevision=(id:string)=>revisions.get(id)??0;
export async function readLikedSongsCache(id:string):Promise<Track[]>{
  await writes.get(id);
  try{const raw=await AsyncStorage.getItem(key(id));const data=raw?JSON.parse(raw):[];return Array.isArray(data)?data.filter(t=>t&&typeof t.sourceId==='string'&&typeof t.title==='string'):[];}catch{return [];}
}
function write(id:string,change:(old:Track[])=>Track[]):Promise<void>{
  const previous=writes.get(id)??Promise.resolve();
  const job=previous.catch(()=>{}).then(async()=>{
    const raw=await AsyncStorage.getItem(key(id));
    let old:Track[]=[];try{const parsed=raw?JSON.parse(raw):[];if(Array.isArray(parsed))old=parsed;}catch{}
    await AsyncStorage.setItem(key(id),JSON.stringify(change(old)));
  }).catch(()=>{/* Uma falha de disco não desfaz um like confirmado no servidor. */});
  writes.set(id,job);return job;
}
export function cacheLikedSongs(id:string,tracks:Track[],revision:number):Promise<void>{
  return write(id,old=>likedCacheRevision(id)===revision?tracks:old);
}
export function changeCachedLikes(id:string,change:(tracks:Track[])=>Track[]):Promise<void>{
  revisions.set(id,likedCacheRevision(id)+1);return write(id,change);
}
