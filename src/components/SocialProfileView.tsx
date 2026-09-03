import React,{useCallback,useEffect,useRef,useState} from 'react';
import { ActivityIndicator,Image,Platform,Pressable,ScrollView,Text,View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getSocialProfile,getSocialProfileTracks,type SocialProfile,type ProfileTrack } from '../api/profiles';
import { sendFriendRequest } from '../api/social';
import { useAuth } from '../state/auth';
import { usePlayer } from '../state/player';
import { useSocial } from '../state/social';
import { useProfileMedia } from '../lib/profileMedia';
import { ultimaAtividade } from '../lib/socialPresence';
import { displayArtist } from '../lib/artistName';
import { FriendAvatar } from './FriendAvatar';
import { colors, radii } from './socialTokens';
import { useTheme } from '../state/theme';
import { useSocialBottomPadding } from './useSocialBottomPadding';
import { naoLidasPorAmigo } from '../lib/social';
import { ArtworkCollage } from './ArtworkCollage';
import { RACIO_DA_CAPA } from '../lib/profileImageCrop';
import { ProfileEditor } from './ProfileEditor';
import { SocialTrackActions } from './SocialTrackActions';
import { SocialButton,SocialIconButton,socialStyles as s } from './socialUI';
import type { Track } from '../types';
import type { Playlist } from '../types';
import {
  copiasGuardadas, listPlaylists, listProfilePlaylists,
  savePlaylistCopy, setPlaylistVisibility, unsavePlaylistCopy,
} from '../api/playlists';

export function SocialProfileView({userId,onMessage,onArtist,onStats,onSettings,onSocial,onPlaylist,active=true}:{userId:string;onMessage:(id:string)=>void;onArtist:(name:string)=>void;onStats:()=>void;onSettings?:()=>void;onSocial?:()=>void;onPlaylist?:(id:string)=>void;active?:boolean}) {
  const web=Platform.OS==='web';
  const [width,setWidth]=useState(0);
  const wide=web&&width>=780;
  const columns=web&&width>=1000;
  const bottomPadding=useSocialBottomPadding(!!onSocial);
  const accent=useTheme(x=>x.theme.color);
  const received=useSocial(x=>x.received),seen=useSocial(x=>x.seen);
  const unread=[...naoLidasPorAmigo(received,seen).values()].reduce((n,v)=>n+v,0);
  const myId=useAuth(x=>x.session?.user.id),own=userId===myId;
  const [profile,setProfile]=useState<SocialProfile|null>(null),[most,setMost]=useState<ProfileTrack[]>([]),[recent,setRecent]=useState<ProfileTrack[]>([]);
  const [error,setError]=useState(''),[loading,setLoading]=useState(true),[editing,setEditing]=useState(false),[track,setTrack]=useState<Track|null>(null);
  const [playlists,setPlaylists]=useState<Playlist[]>([]);
  // De que playlists dos outros ja tenho copia. Pergunta-se UMA vez em vez de
  // uma por linha, senao uma lista de dez faz dez idas ao servidor.
  const [guardadas,setGuardadas]=useState<Set<string>>(new Set());
  const [ocupada,setOcupada]=useState<string|null>(null);
  const mutation=useRef(false);
  const view=useRef({userId,myId,active});view.current={userId,myId,active};
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  // As duas listas chegam com 20 entradas cada. Mostradas por inteiro sao
  // quarenta linhas de scroll antes de se chegar ao fim do perfil, num ecra
  // de telemovel. Abrem quando se pedem.
  const [tudoMais,setTudoMais]=useState(false),[tudoRecente,setTudoRecente]=useState(false);
  const request=useRef(0);
  const friends=useSocial(x=>x.friends),now=useSocial(x=>x.now);
  const friend=friends.find(f=>f.friendId===userId);
  const cover=useProfileMedia(profile?.appearance?.cover_path?`storage:${profile.appearance.cover_path}`:null,'cover');
  const load=useCallback(async()=>{
    const id=++request.current;
    setError('');setLoading(true);
    try {
      const p=await getSocialProfile(userId);if(id!==request.current)return;setProfile(p);
      // No meu perfil vejo as minhas todas (para poder escolher quais mostro);
      // no de outra pessoa so as que ela marcou. As copias que ja tenho vem
      // junto, para o botao saber em que estado esta.
      const [m,r,l,c]=await Promise.all([
        p.canView?getSocialProfileTracks(userId):[],
        p.canView?getSocialProfileTracks(userId,true):[],
        own?listPlaylists():(p.canView?listProfilePlaylists(userId):[]),
        own?Promise.resolve(new Set<string>()):copiasGuardadas(),
      ]);
      if(id!==request.current)return;setMost(m);setRecent(r);setPlaylists(l);setGuardadas(c);
    }catch(e:any){if(id===request.current)setError(e.message || 'Could not open this profile.');}finally{if(id===request.current)setLoading(false);}
  },[userId,own]);
  useEffect(()=>{if(!active)return;setProfile(null);setMost([]);setRecent([]);setPlaylists([]);setGuardadas(new Set());void load();return()=>{request.current++;};},[load,friend?.status,active]);
  /** Guardar (ou largar) a playlist de outra pessoa. Fica uma copia minha. */
  const alternarCopia=async(pl:Playlist)=>{
    if(mutation.current || loading) return;
    mutation.current=true;
    const generation=request.current;
    setOcupada(pl.id);setError('');
    const tinha=guardadas.has(pl.id);
    let confirmed=false;
    try {
      if(tinha) await unsavePlaylistCopy(pl.id); else await savePlaylistCopy(pl.id);
      confirmed=true;
      if(generation!==request.current)return;
      setGuardadas(g=>{const n=new Set(g);if(tinha)n.delete(pl.id);else n.add(pl.id);return n;});
    } catch(e:any){ if(generation===request.current)setError(e?.message || 'Could not update your playlists.'); }
    finally { mutation.current=false;setOcupada(null);if(confirmed&&mounted.current&&view.current.active&&view.current.userId===userId&&view.current.myId===myId)void load(); }
  };

  /** Mostrar ou esconder uma playlist minha no perfil. */
  const alternarVisibilidade=async(pl:Playlist)=>{
    if(mutation.current || loading) return;
    mutation.current=true;
    const generation=request.current;
    setOcupada(pl.id);setError('');
    const passaA=!pl.visibleOnProfile;
    let confirmed=false;
    try {
      await setPlaylistVisibility(pl.id,passaA);
      confirmed=true;
      if(generation!==request.current)return;
      setPlaylists(l=>l.map(x=>x.id===pl.id?{...x,visibleOnProfile:passaA}:x));
    } catch(e:any){ if(generation===request.current)setError(e?.message || 'Could not change that.'); }
    finally { mutation.current=false;setOcupada(null);if(confirmed&&mounted.current&&view.current.active&&view.current.userId===userId&&view.current.myId===myId)void load(); }
  };

  const row=(entry:ProfileTrack,index:number,recentes=false)=><View key={`${entry.source}:${entry.sourceId}`} style={s.listRow}>
    {!recentes&&<Text style={[s.muted,{width:20}]}>{index+1}</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel={`Play ${entry.title}`} onPress={()=>void usePlayer.getState().playTrack(entry,recentes?recent:most)}
      style={({pressed,hovered}:any)=>[s.row,{flex:1,minWidth:0,borderRadius:radii.md},(pressed||hovered)&&{backgroundColor:colors.surfacePressed}]}>
      <View style={{width:44,height:44,borderRadius:radii.sm,overflow:'hidden',backgroundColor:colors.surface,alignItems:'center',justifyContent:'center'}}>
        {entry.artworkUrl?<Image source={{uri:entry.artworkUrl}} style={{width:44,height:44}}/>:<Ionicons name="musical-notes" color={colors.textSecondary} size={22}/>}
      </View>
      <View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={s.text}>{entry.title}</Text><Text numberOfLines={1} style={s.muted}>{displayArtist(entry)}</Text></View>
      <Text style={s.muted}>{recentes?new Date(entry.lastPlayed).toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit'}):entry.count}</Text>
    </Pressable><SocialIconButton label={`Options for ${entry.title}`} icon="ellipsis-horizontal" onPress={()=>setTrack(entry)}/>
  </View>;
  const playlistsSection=<View style={{gap:12}}>
    <Text style={s.title}>{own?'Your playlists':'Playlists'}</Text>
    <Text style={s.muted}>{own?'Choose which playlists your friends can see.':'Save your own copy. Changes to the original will not change your copy.'}</Text>
    <View style={{flexDirection:wide?'row':'column',flexWrap:'wrap',gap:12}}>
      {playlists.map(pl=>{
        const marked=own?!!pl.visibleOnProfile:guardadas.has(pl.id);
        const busy=ocupada===pl.id;
        const label=own?(marked?`Hide ${pl.name} from your profile`:`Show ${pl.name} on your profile`):(marked?`Remove your copy of ${pl.name}`:`Save ${pl.name}`);
        return <View key={pl.id} style={[s.card,{padding:12,flexBasis:wide?260:undefined,flexGrow:wide?1:0,minWidth:0}]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Open ${pl.name}`} disabled={!onPlaylist} onPress={()=>onPlaylist?.(pl.id)}
            style={({pressed,hovered}:any)=>[s.row,{minWidth:0},(pressed||hovered)&&{opacity:0.75}]}>
            <View style={{borderRadius:radii.md,overflow:'hidden'}}><ArtworkCollage artworks={pl.artworks} size={56}/></View>
            <View style={{flex:1,minWidth:0}}><Text numberOfLines={2} style={[s.text,{fontWeight:'600'}]}>{pl.name}</Text><Text style={s.muted}>{pl.trackCount} {pl.trackCount===1?'track':'tracks'}</Text></View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary}/>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected:marked,busy,disabled:!!ocupada||loading}}
            disabled={!!ocupada||loading} onPress={()=>void(own?alternarVisibilidade(pl):alternarCopia(pl))}
            style={({pressed,hovered}:any)=>[s.row,{minHeight:44,paddingHorizontal:12,borderRadius:radii.md,backgroundColor:colors.bg},(pressed||hovered)&&{backgroundColor:colors.surfacePressed},busy&&{opacity:0.5}]}>
            {busy?<ActivityIndicator size="small" color={accent}/>:<Ionicons name={own?(marked?'eye':'eye-off-outline'):(marked?'checkmark-circle':'add-circle-outline')} size={22} color={marked?accent:colors.textSecondary}/>}
            <Text style={[s.muted,{color:marked?accent:colors.textSecondary}]}>{own?(marked?'Visible to friends':'Only you'):(marked?'Saved · remove copy':'Save a copy')}</Text>
          </Pressable>
        </View>;
      })}
    </View>
    {!playlists.length&&<Text style={s.muted}>{own?'Playlists you create show up here.':'No playlists shared on this profile yet.'}</Text>}
  </View>;
  return <View style={s.body} onLayout={e=>setWidth(e.nativeEvent.layout.width)}>
    <ScrollView contentContainerStyle={[s.content,{paddingBottom:bottomPadding}]} keyboardShouldPersistTaps="handled">
      {loading&&!profile&&<ActivityIndicator color={accent}/>}
      {!!error&&<View style={s.card}><Text accessibilityRole="alert" style={s.error}>{error}</Text><SocialButton onPress={()=>void load()}>Try again</SocialButton></View>}
      {profile&&<>
        {/* Limitar a largura da capa mantém o recorte 8/3 sem empurrar a pessoa
            para fora da primeira vista. Sem capa não há um retângulo vazio. */}
        <View style={{flexDirection:wide?'row':'column',alignItems:wide?'center':'stretch',gap:24,paddingBottom:24,borderBottomWidth:1,borderColor:colors.border}}>
          {!!profile.appearance?.cover_path&&<View style={{width:wide?'44%':'100%',aspectRatio:RACIO_DA_CAPA,borderRadius:radii.lg,overflow:'hidden',backgroundColor:colors.surfaceHigh}}>
            {cover&&<Image source={{uri:cover}} resizeMode="cover" style={{width:'100%',height:'100%'}}/>}
          </View>}
          <View style={{flex:wide?1:undefined,minWidth:0,gap:12}}>
            <View style={s.row}>
              <FriendAvatar avatarUrl={profile.profile.avatar_url} name={profile.profile.name} size={web?72:80}/>
              <View style={{flex:1,minWidth:0}}><Text style={[s.title,{fontSize:28}]}>{profile.profile.name}</Text><Text style={s.muted}>@{profile.profile.username}</Text>
                {!own&&profile.canView&&<Text style={[s.muted,friend?.online&&{color:colors.online}]}>{friend?.online?'● Online now':ultimaAtividade(friend?.lastSeenAt,now)}</Text>}
              </View>
              <SocialIconButton label="Refresh profile" icon="refresh" onPress={()=>void load()}/>
            </View>
            {!!profile.appearance?.bio&&<Text style={s.text}>{profile.appearance.bio}</Text>}
            <View style={[s.row,{flexWrap:'wrap',gap:8}]}>
              {own?<SocialButton icon="pencil-outline" onPress={()=>setEditing(true)}>Edit profile</SocialButton>:profile.canView?<SocialButton primary icon="chatbubble-outline" onPress={()=>onMessage(userId)}>Message</SocialButton>:<SocialButton primary disabled={friend?.status==='pending'} onPress={()=>{void sendFriendRequest(userId).then(()=>useSocial.getState().refresh()).catch(e=>setError(e.message));}}>{friend?.status==='pending'?'Request pending':'Add friend'}</SocialButton>}
              {own&&onSocial&&<SocialButton primary icon="chatbubbles-outline" badge={unread} onPress={onSocial}>Friends and chats</SocialButton>}
              {profile.canView&&<SocialButton quiet icon="stats-chart-outline" onPress={onStats}>Listening stats</SocialButton>}
              {own&&onSettings&&<SocialIconButton label="Settings" icon="settings-outline" onPress={onSettings}/>}
            </View>
            {friend?.currentlyPlaying&&<Pressable accessibilityRole="button" accessibilityLabel={`Play ${friend.currentlyPlaying.title}`}
              onPress={()=>{const t=friend.currentlyPlaying;if(t)void usePlayer.getState().playTrack({...t,id:t.id??undefined,album:null});}}
              style={({pressed}:any)=>[s.row,{padding:12,borderRadius:radii.md,backgroundColor:colors.surface},pressed&&{opacity:0.7}]}>
              <Ionicons name="play-circle" size={28} color={accent}/><View style={{flex:1,minWidth:0}}><Text style={s.label}>Listening now</Text><Text numberOfLines={1} style={s.text}>{friend.currentlyPlaying.title}</Text></View>
            </Pressable>}
          </View>
        </View>
        {!profile.canView?<Text style={s.muted}>Stats become available once you are friends.</Text>:<>
          {playlistsSection}
          <View style={{gap:16}}>
            <Text style={s.title}>Listening overview</Text>
            <View style={[s.row,{flexWrap:'wrap'}]}>{[[profile.stats?.totalPlays??0,'Plays'],[profile.stats?.uniqueTracks??0,'Tracks'],[profile.friendCount??0,'Friends']].map(([v,label])=><View key={label} style={[s.card,{flex:1,minWidth:85}]}><Text style={s.title}>{v}</Text><Text style={s.muted}>{label}</Text></View>)}</View>
            {profile.stats?.topArtist&&<Pressable accessibilityRole="button" onPress={()=>onArtist(profile.stats!.topArtist!.name)}
              style={({pressed,hovered}:any)=>[s.listRow,(pressed||hovered)&&{backgroundColor:colors.surfacePressed}]}>
              <Ionicons name="mic-outline" size={24} color={colors.textSecondary}/><View style={{flex:1}}><Text style={s.label}>Most played artist</Text><Text style={s.text}>{profile.stats.topArtist.name}</Text></View><Text style={s.muted}>{profile.stats.topArtist.plays} plays</Text><Ionicons name="chevron-forward" size={16} color={colors.textSecondary}/>
            </Pressable>}
          </View>
          <View style={{flexDirection:columns?'row':'column',gap:32}}>
            <View style={{flex:columns?1:undefined,minWidth:0,gap:8}}>
              <Text style={s.title}>Most played</Text>
              {most.length?(tudoMais?most:most.slice(0,5)).map((e,i)=>row(e,i)):<Text style={s.muted}>Nothing played yet.</Text>}
              {most.length>5&&!tudoMais&&<SocialButton quiet onPress={()=>setTudoMais(true)}>Show all {most.length}</SocialButton>}
              {tudoMais&&most.length>0&&most.length%20===0&&<SocialButton quiet onPress={()=>{void getSocialProfileTracks(userId,false,most.length).then(m=>setMost([...most,...m])).catch(e=>setError(e.message));}}>Show more</SocialButton>}
            </View>
            <View style={{flex:columns?1:undefined,minWidth:0,gap:8}}>
              <Text style={s.title}>Recently played</Text>
              {recent.length?(tudoRecente?recent:recent.slice(0,5)).map((e,i)=>row(e,i,true)):<Text style={s.muted}>Your listening history appears here.</Text>}
              {recent.length>5&&!tudoRecente&&<SocialButton quiet onPress={()=>setTudoRecente(true)}>Show all {recent.length}</SocialButton>}
              {tudoRecente&&recent.length>0&&recent.length%20===0&&<SocialButton quiet onPress={()=>{void getSocialProfileTracks(userId,true,recent.length).then(r=>setRecent([...recent,...r])).catch(e=>setError(e.message));}}>Show more</SocialButton>}
            </View>
          </View>
        </>}
      </>}
    </ScrollView>
    {editing&&profile&&<ProfileEditor profile={profile} onClose={()=>setEditing(false)} onSaved={()=>{void load();void useSocial.getState().refresh();}}/>}
    <SocialTrackActions track={track} onClose={()=>setTrack(null)} onArtist={onArtist}/>
  </View>;
}
