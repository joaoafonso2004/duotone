import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type ProfileMediaKind = 'avatar' | 'cover';
export const mediaBucket = (kind:ProfileMediaKind) => kind==='avatar' ? 'profile-avatars' : 'profile-covers';
const cache = new Map<string,{url:string;until:number}>();
const pending = new Map<string,Promise<string>>();
let generation=0;
export function clearProfileMediaCache() { generation++; cache.clear(); pending.clear(); }
export async function signedProfileMedia(kind:ProfileMediaKind,path:string):Promise<string> {
  const key=`${kind}:${path}`, cached=cache.get(key);
  if(cached && cached.until>Date.now()+30000) return cached.url;
  if(pending.has(key)) return pending.get(key)!;
  const gen=generation;
  const request=(async()=>{
    const {data,error}=await supabase.storage.from(mediaBucket(kind)).createSignedUrl(path,300);
    if(error || !data) throw error || new Error('Image unavailable.');
    if(gen===generation) cache.set(key,{url:data.signedUrl,until:Date.now()+270000});
    return data.signedUrl;
  })().finally(()=>{if(gen===generation) pending.delete(key);});
  pending.set(key,request);
  return request;
}
export function useProfileMedia(raw:string|null|undefined,kind:ProfileMediaKind='avatar') {
  const [url,setUrl]=useState<string|null>(raw && !raw.startsWith('storage:') ? raw : null);
  useEffect(()=>{
    let alive=true;
    setUrl(raw && !raw.startsWith('storage:') ? raw : null);
    if(!raw?.startsWith('storage:')) return;
    const load=()=>signedProfileMedia(kind,raw.slice(8)).then(u=>{if(alive)setUrl(u);}).catch(()=>{if(alive)setUrl(null);});
    void load(); const timer=setInterval(()=>void load(),240000);
    return ()=>{alive=false;clearInterval(timer);};
  },[raw,kind]);
  return url;
}

export async function removeProfileMedia(kind:ProfileMediaKind,paths:string[]) {
  if(!paths.length) return;
  const {error}=await supabase.storage.from(mediaBucket(kind)).remove(paths);
  if(error) throw error;
}

/** O Storage exige a remoção dos objetos pela API antes de eliminar a conta. */
export async function removeOwnProfileMedia() {
  const {data:{user},error}=await supabase.auth.getUser();
  if(error||!user)throw new Error('Your session has expired.');
  for(const kind of ['avatar','cover'] as const){
    const folder=`${user.id}/${kind}`;
    for(;;){
      const {data,error:failure}=await supabase.storage.from(mediaBucket(kind)).list(folder,{limit:100});
      if(failure)throw failure;
      const files=(data??[]).filter(f=>f.id).map(f=>`${folder}/${f.name}`);
      if(!files.length)break;
      await removeProfileMedia(kind,files);
    }
  }
  clearProfileMediaCache();
}
