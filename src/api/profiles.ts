import { supabase } from '../lib/supabase';
import type { DbPlayStats } from './plays';
import type { Track } from '../types';

export interface PublicProfile { id: string; name: string; username: string; avatar_url: string | null }
export async function getSocialConversations():Promise<PublicProfile[]>{
  const {data,error}=await supabase.rpc('get_social_conversations');if(error)throw error;return data??[];
}
export interface ProfileAppearance {
  avatar_path: string | null; legacy_avatar_url: string | null; cover_path: string | null;
  cover_position: number; emoji: string; gradient_index: number; bio: string; accent: string; version: number;
}
export interface SocialProfile {
  profile: PublicProfile; canView: boolean; appearance: ProfileAppearance | null;
  stats: DbPlayStats | null; friendCount: number | null;
}
export type ProfileTrack = Track & { count: number; lastPlayed: number };
export type ProfileHighlights = { playlistIds: string[]; moment: Track | null };
export async function getProfileHighlights(id: string): Promise<ProfileHighlights> {
  const {data,error}=await supabase.rpc('get_profile_highlights',{target_user_id:id});
  if(error)throw error;
  return data;
}
export async function saveProfileCustomization(value: ProfileAppearance,name:string,username:string,highlights:ProfileHighlights):Promise<void> {
  const {error}=await supabase.rpc('save_profile_customization',{
    p_value:{...value,username},p_version:value.version,p_name:name.trim(),
    p_playlists:highlights.playlistIds,p_moment:highlights.moment?.id??null,
  });
  if(error)throw new Error(error.code==='40001'?'O perfil foi alterado noutro dispositivo. Fecha e volta a abrir o editor.':error.message);
}

/**
 * Os perfis públicos já lidos, por 30 min (23/10, os logs do Supabase). Cada
 * atualização do Social -- a inbox, as conversas, os grupos, os amigos -- pedia
 * outra vez o nome e a fotografia das mesmas pessoas: ~30 `get_public_profiles`
 * por hora num PC à vista. Uma mudança num perfil chega pelo Realtime (a tabela
 * `profiles`, no `state/social.ts`), e aí esquece-se tudo; sair da conta também.
 */
const PERFIS_VALEM_MS = 30 * 60_000;
const perfisLidos = new Map<string, { perfil: PublicProfile; em: number }>();

/** Esquece os perfis lidos: um perfil mudou (Realtime), ou a conta saiu. */
export function esquecerPerfisPublicos(): void {
  perfisLidos.clear();
}

export async function getPublicProfiles(ids: string[]): Promise<PublicProfile[]> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return [];
  const agora = Date.now();
  const faltam = unicos.filter((id) => {
    const lido = perfisLidos.get(id);
    return !lido || agora - lido.em >= PERFIS_VALEM_MS;
  });
  for (let i=0;i<faltam.length;i+=200) {
    const { data,error } = await supabase.rpc('get_public_profiles',{p_ids:faltam.slice(i,i+200)});
    if (error) throw error;
    const em = Date.now();
    for (const p of (data ?? []) as PublicProfile[]) perfisLidos.set(p.id, { perfil: p, em });
  }
  return unicos.flatMap((id) => { const p = perfisLidos.get(id)?.perfil; return p ? [p] : []; });
}
export async function searchPublicProfiles(query: string): Promise<PublicProfile[]> {
  const {data,error}=await supabase.rpc('get_public_profiles',{p_query:query.trim().slice(0,80)});
  if(error) throw error;
  return data ?? [];
}
export async function getSocialProfile(id: string): Promise<SocialProfile> {
  const {data,error}=await supabase.rpc('get_social_profile',{target_user_id:id});
  if(error) throw error;
  return data as SocialProfile;
}
export function appearanceOf(p: SocialProfile): ProfileAppearance {
  if(p.appearance) return p.appearance;
  const raw=p.profile.avatar_url;
  const parts=raw?.startsWith('emoji:') ? raw.split(':') : [];
  return {avatar_path:null,legacy_avatar_url:parts.length ? null : raw,cover_path:null,cover_position:0.5,
    emoji:parts[1] || '🎧',gradient_index:Number(parts[2]) || 0,bio:'',accent:'#A78BFA',version:0};
}
export async function getSocialProfileTracks(id: string,recent=false,offset=0): Promise<ProfileTrack[]> {
  const {data,error}=await supabase.rpc('get_social_profile_tracks',{target_user_id:id,p_recent:recent,p_limit:20,p_offset:offset});
  if(error) throw error;
  return (data ?? []).map((r:any)=>({id:r.id || undefined,source:r.source,sourceId:r.source_id,title:r.title,
    artist:r.artist,album:r.album,artworkUrl:r.artwork_url,durationSeconds:r.duration_seconds,
    count:Number(r.play_count),lastPlayed:Date.parse(r.max_played_at)}));
}
export async function saveProfileAppearance(value: ProfileAppearance,name: string,username?:string): Promise<void> {
  const {error}=await supabase.rpc('save_profile_appearance',{p_value:{...value,username},p_version:value.version,p_name:name.trim()});
  if(error) throw new Error(error.code==='40001' ? 'O perfil foi alterado noutro dispositivo. Fecha e volta a abrir o editor.' : error.message);
}

/** Sem uma leitura confirmada, editar a identidade conserva os destaques. */
export async function saveProfileEdits(value:ProfileAppearance,name:string,username:string,highlights:ProfileHighlights|null):Promise<void> {
  if(highlights)await saveProfileCustomization(value,name,username,highlights);
  else await saveProfileAppearance(value,name,username);
}
