import React,{useCallback,useEffect,useRef,useState} from 'react';
import { ActivityIndicator,Image,Pressable,ScrollView,Text,View } from 'react-native';
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
import { colors } from '../theme';
import { ProfileEditor } from './ProfileEditor';
import { SocialTrackActions } from './SocialTrackActions';
import { SocialButton,socialStyles as s } from './socialUI';
import type { Track } from '../types';
import type { Playlist } from '../types';
import { listPlaylists } from '../api/playlists';

export function SocialProfileView({userId,onMessage,onArtist,onStats,onSettings,onSocial,onPlaylist}:{userId:string;onMessage:(id:string)=>void;onArtist:(name:string)=>void;onStats:()=>void;onSettings?:()=>void;onSocial?:()=>void;onPlaylist?:(id:string)=>void}) {
  const myId=useAuth(x=>x.session?.user.id),own=userId===myId;
  const [profile,setProfile]=useState<SocialProfile|null>(null),[most,setMost]=useState<ProfileTrack[]>([]),[recent,setRecent]=useState<ProfileTrack[]>([]);
  const [error,setError]=useState(''),[loading,setLoading]=useState(true),[editing,setEditing]=useState(false),[track,setTrack]=useState<Track|null>(null);
  const [playlists,setPlaylists]=useState<Playlist[]>([]);
  const request=useRef(0);
  const friends=useSocial(x=>x.friends),now=useSocial(x=>x.now);
  const friend=friends.find(f=>f.friendId===userId);
  const cover=useProfileMedia(profile?.appearance?.cover_path?`storage:${profile.appearance.cover_path}`:null,'cover');
  const load=useCallback(async()=>{
    const id=++request.current;
    setError('');setLoading(true);
    try {
      const p=await getSocialProfile(userId);if(id!==request.current)return;setProfile(p);
      const [m,r,l]=await Promise.all([p.canView?getSocialProfileTracks(userId):[],p.canView?getSocialProfileTracks(userId,true):[],own?listPlaylists():[]]);
      if(id!==request.current)return;setMost(m);setRecent(r);setPlaylists(l);
    }catch(e:any){if(id===request.current)setError(e.message || 'Could not open this profile.');}finally{if(id===request.current)setLoading(false);}
  },[userId,own]);
  useEffect(()=>{setProfile(null);setMost([]);setRecent([]);setPlaylists([]);void load();return()=>{request.current++;};},[load,friend?.status]);
  const row=(entry:ProfileTrack,index:number,recentes=false)=><View key={`${entry.source}:${entry.sourceId}`} style={[s.row,{paddingVertical:12,borderBottomWidth:1,borderColor:colors.border}]}>
    {!recentes&&<Text style={[s.muted,{width:20}]}>{index+1}</Text>}
    <Pressable accessibilityRole="button" onPress={()=>void usePlayer.getState().playTrack(entry,recentes?recent:most)} style={[s.row,{flex:1}]}>
      {entry.artworkUrl?<Image source={{uri:entry.artworkUrl}} style={{width:44,height:44,borderRadius:9}}/>:<Ionicons name="musical-notes" color={colors.textSecondary} size={30}/>}
      <View style={{flex:1}}><Text numberOfLines={1} style={s.text}>{entry.title}</Text><Text numberOfLines={1} style={s.muted}>{displayArtist(entry)}</Text></View>
      <Text style={s.muted}>{recentes?new Date(entry.lastPlayed).toLocaleDateString('pt-PT'):entry.count}</Text>
    </Pressable><Pressable accessibilityLabel={`Options de ${entry.title}`} onPress={()=>setTrack(entry)} hitSlop={12}><Ionicons name="ellipsis-horizontal" size={22} color={colors.textSecondary}/></Pressable>
  </View>;
  return <View style={s.body}><ScrollView contentContainerStyle={s.content}>
    {loading&&!profile&&<ActivityIndicator color={colors.accent}/>}
    {!!error&&<View style={s.card}><Text style={s.error}>{error}</Text><SocialButton onPress={()=>void load()}>Tentar novamente</SocialButton></View>}
    {profile&&<>
      <View style={{borderRadius:24,overflow:'hidden',backgroundColor:(profile.appearance?.accent || colors.accent)+'22'}}>
        <View style={{aspectRatio:8/3,maxHeight:300,backgroundColor:colors.surfaceHigh}}>{cover&&<Image source={{uri:cover}} style={{width:'100%',height:'100%'}} resizeMode="cover"/>}</View>
        <View style={{padding:22,paddingTop:0,gap:15}}>
          <View style={[s.row,{marginTop:-36,alignItems:'flex-end',justifyContent:'space-between'}]}><View style={{borderRadius:52,borderWidth:5,borderColor:colors.bg}}><FriendAvatar avatarUrl={profile.profile.avatar_url} name={profile.profile.name} size={90}/></View>
            {own?<SocialButton onPress={()=>setEditing(true)}>Edit profile</SocialButton>:profile.canView?<SocialButton onPress={()=>onMessage(userId)}>Message</SocialButton>:<SocialButton onPress={()=>{void sendFriendRequest(userId).then(()=>useSocial.getState().refresh()).catch(e=>setError(e.message));}}>{friend?.status==='pending'?'Request pending':'Add friend'}</SocialButton>}
          </View>
          <View style={s.row}><View style={{flex:1}}><Text style={[s.title,{fontSize:28}]}>{profile.profile.name}</Text><Text style={s.muted}>@{profile.profile.username}</Text></View><Pressable accessibilityLabel="Refresh profile" onPress={()=>void load()}><Ionicons name="refresh" color={colors.textSecondary} size={20}/></Pressable></View>
          {!own&&profile.canView&&<Text style={[s.muted,friend?.online&&{color:colors.online}]}>{friend?.online?'● Online now':ultimaAtividade(friend?.lastSeenAt,now)}</Text>}
          {!!profile.appearance?.bio&&<Text style={s.text}>{profile.appearance.bio}</Text>}
          {friend?.currentlyPlaying&&<SocialButton onPress={()=>{const t=friend.currentlyPlaying;if(t)void usePlayer.getState().playTrack({...t,id:t.id??undefined,album:null});}}>♫ Ouvir {friend.currentlyPlaying.title}</SocialButton>}
          {own&&<View style={[s.row,{flexWrap:'wrap'}]}>{onSocial&&<SocialButton quiet onPress={onSocial}>Friends and chats</SocialButton>}{onSettings&&<SocialButton quiet onPress={onSettings}>Settings</SocialButton>}</View>}
        </View>
      </View>
      {!profile.canView?<Text style={s.muted}>Stats become available once you are friends.</Text>:<>
        <View style={[s.row,{flexWrap:'wrap',justifyContent:'space-between'}]}>{[[profile.stats?.totalPlays ?? 0,'Plays'],[profile.stats?.uniqueTracks ?? 0,'Tracks'],[profile.friendCount ?? 0,'Amigos']].map(([v,label])=><View key={label} style={[s.card,{flex:1,minWidth:90}]}><Text style={s.title}>{v}</Text><Text style={s.muted}>{label}</Text></View>)}</View>
        {profile.stats?.topArtist&&<Pressable onPress={()=>onArtist(profile.stats!.topArtist!.name)} style={s.card}><Text style={s.label}>Most played artist</Text><Text style={s.title}>{profile.stats.topArtist.name}</Text><Text style={s.muted}>{profile.stats.topArtist.plays} plays</Text></Pressable>}
        <SocialButton onPress={onStats}>View listening stats</SocialButton>
        <View style={s.card}><Text style={s.label}>Most played</Text>{most.length?most.map((e,i)=>row(e,i)):<Text style={s.muted}>Nothing played yet.</Text>}{most.length>0&&most.length%20===0&&<SocialButton onPress={()=>{void getSocialProfileTracks(userId,false,most.length).then(m=>setMost([...most,...m])).catch(e=>setError(e.message));}}>Show more</SocialButton>}</View>
        <View style={s.card}><Text style={s.label}>Ouvidas recentemente</Text>{recent.length?recent.map((e,i)=>row(e,i,true)):<Text style={s.muted}>History shows up here once there is listening to show.</Text>}{recent.length>0&&recent.length%20===0&&<SocialButton onPress={()=>{void getSocialProfileTracks(userId,true,recent.length).then(r=>setRecent([...recent,...r])).catch(e=>setError(e.message));}}>Show recent</SocialButton>}</View>
        {own&&onPlaylist&&<View style={s.card}><Text style={s.label}>Your playlists</Text>{playlists.length?playlists.map(p=><Pressable key={p.id} style={[s.row,{paddingVertical:10}]} onPress={()=>onPlaylist(p.id)}><Ionicons name="albums-outline" size={24} color={colors.accent}/><Text style={[s.text,{flex:1}]}>{p.name}</Text><Text style={s.muted}>{p.trackCount} tracks</Text></Pressable>):<Text style={s.muted}>Playlists you create show up here.</Text>}</View>}
      </>}
    </>}
  </ScrollView>{editing&&profile&&<ProfileEditor profile={profile} onClose={()=>setEditing(false)} onSaved={()=>{void load();void useSocial.getState().refresh();}}/>}<SocialTrackActions track={track} onClose={()=>setTrack(null)} onArtist={onArtist}/></View>;
}
