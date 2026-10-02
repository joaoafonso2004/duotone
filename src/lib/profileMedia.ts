import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type ProfileMediaKind = 'avatar' | 'cover';
export const mediaBucket = (kind:ProfileMediaKind) => kind==='avatar' ? 'profile-avatars' : 'profile-covers';
/**
 * Quanto vale um link assinado: 6 horas (2/10). Eram 5 minutos, e cada avatar à
 * vista pedia outro de 4 em 4 -- também em segundo plano, e no PC o dia todo. E
 * como o link mudava, a imagem descarregava-se outra vez de cada vez: pedidos
 * ao Storage, linhas de log e egress, por cada amigo com foto. O balde continua
 * privado; o link é que dura uma tarde (`LINK_VALE_S`).
 */
const LINK_VALE_S = 6 * 60 * 60;
/** Renova-se com esta folga antes de caducar. */
const RENOVAR_ANTES_MS = 10 * 60 * 1000;
const cache = new Map<string,{url:string;until:number}>();
const pending = new Map<string,Promise<string>>();
let generation=0;
export function clearProfileMediaCache() { generation++; cache.clear(); pending.clear(); }
export async function signedProfileMedia(kind:ProfileMediaKind,path:string):Promise<string> {
  const key=`${kind}:${path}`, cached=cache.get(key);
  if(cached && cached.until>Date.now()+RENOVAR_ANTES_MS) return cached.url;
  if(pending.has(key)) return pending.get(key)!;
  const gen=generation;
  const request=(async()=>{
    const {data,error}=await supabase.storage.from(mediaBucket(kind)).createSignedUrl(path,LINK_VALE_S);
    if(error || !data) throw error || new Error('Image unavailable.');
    if(gen===generation) cache.set(key,{url:data.signedUrl,until:Date.now()+LINK_VALE_S*1000});
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
    // Um pedido quando monta (partilhado com os outros avatares da mesma
    // pessoa) e outro só perto de o link caducar -- não de 4 em 4 minutos.
    let timer:ReturnType<typeof setTimeout>|undefined;
    const load=()=>signedProfileMedia(kind,raw.slice(8)).then(u=>{
      if(!alive)return;
      setUrl(u);
      const ate=cache.get(`${kind}:${raw.slice(8)}`)?.until;
      if(ate)timer=setTimeout(()=>void load(),Math.max(60_000,ate-Date.now()-RENOVAR_ANTES_MS));
    }).catch(()=>{if(alive)setUrl(null);});
    void load();
    return ()=>{alive=false;if(timer)clearTimeout(timer);};
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
