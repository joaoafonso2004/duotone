import React,{useCallback,useEffect,useRef,useState} from 'react';
import { ActivityIndicator,Image,Platform,Pressable,ScrollView,Text,View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getSocialProfile,getSocialProfileTracks,type ProfileHighlights,type SocialProfile,type ProfileTrack } from '../api/profiles';
import { loadProfileSections } from '../api/profileSections';
import { missingProfilePlaylistColumns,PROFILE_SHARING_UNAVAILABLE } from '../lib/profileSchema';
import { sendFriendRequest } from '../api/social';
import { useAuth } from '../state/auth';
import { usePlayer } from '../state/player';
import { useSocial } from '../state/social';
import { useProfileMedia } from '../lib/profileMedia';
import { ultimaAtividade } from '../lib/socialPresence';
import { displayArtist } from '../lib/artistName';
import { colors, radii, SOCIAL_GUTTER } from './socialTokens';
import { useTheme } from '../state/theme';
import { useSocialBottomPadding } from './useSocialBottomPadding';
import { naoLidasPorAmigo } from '../lib/social';
import { ArtworkCollage } from './ArtworkCollage';
import { ProfileEditor } from './ProfileEditor';
import { ProfileHero } from './ProfileHero';
import { ProfilePlaylistPicker } from './ProfilePlaylistPicker';
import { SocialTrackActions } from './SocialTrackActions';
import { SocialButton,SocialIconButton,socialStyles as s } from './socialUI';
import type { Track } from '../types';
import type { Playlist } from '../types';
import {
  savePlaylistCopy, setPlaylistVisibility, unsavePlaylistCopy,
} from '../api/playlists';

export function SocialProfileView({userId,onMessage,onArtist,onStats,onSettings,onSocial,onPlaylist,onBack,active=true}:{userId:string;onMessage:(id:string)=>void;onArtist:(name:string)=>void;onStats:()=>void;onSettings?:()=>void;onSocial?:()=>void;onPlaylist?:(id:string)=>void;onBack?:()=>void;active?:boolean}) {
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
  const [highlights,setHighlights]=useState<ProfileHighlights>({playlistIds:[],moment:null});
  const [highlightsLoaded,setHighlightsLoaded]=useState(false);
  const [playlists,setPlaylists]=useState<Playlist[]>([]);
  const [choosingPlaylists,setChoosingPlaylists]=useState(false);
  const [sectionErrors,setSectionErrors]=useState({most:'',recent:'',playlists:'',copies:''});
  const [playlistMutationError,setPlaylistMutationError]=useState('');
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
  /**
   * `silencioso` atualiza por baixo, sem apagar o que já está no ecrã.
   *
   * Guardar uma playlist, mudar a visibilidade de outra, sair do editor --
   * cada uma destas recarregava o perfil inteiro com o estado de carregamento
   * ligado, e o ecrã piscava a cada toque. Quem já está a ver o perfil não
   * precisa de o ver desaparecer para saber que alguma coisa mudou.
   */
  const load=useCallback(async(silencioso=false)=>{
    const id=++request.current;
    setError('');
    if(!silencioso){setLoading(true);setHighlightsLoaded(false);}
    try {
      const p=await getSocialProfile(userId);if(id!==request.current)return;setProfile(p);
      const result=await loadProfileSections(userId,own,p.canView);
      if(id!==request.current)return;
      const {most:m,recent:r,playlists:l,copies:c,highlights:h}=result;
      if(m.status==='fulfilled')setMost(m.value);
      if(r.status==='fulfilled')setRecent(r.value);
      if(l.status==='fulfilled')setPlaylists(l.value);
      if(c.status==='fulfilled')setGuardadas(c.value);
      if(h.status==='fulfilled'){setHighlights(h.value);setHighlightsLoaded(true);}
      setSectionErrors({
        most:m.status==='rejected'?'Could not load your most played songs.':'',
        recent:r.status==='rejected'?'Could not load listening history.':'',
        playlists:l.status==='rejected'?(missingProfilePlaylistColumns(l.reason)?PROFILE_SHARING_UNAVAILABLE:'Could not load playlists.'):'',
        copies:c.status==='rejected'?'Could not check your saved playlists.':'',
      });
    }catch{if(id===request.current)setError('Could not open this profile. Please try again.');}finally{if(id===request.current&&!silencioso)setLoading(false);}
  },[userId,own]);
  // Limpar só quando se troca de pessoa: o que está no ecrã passa a ser de
  // outra conta e não pode ficar à vista. Uma mudança de amizade ou uma ação
  // não são motivo para apagar nada.
  useEffect(()=>{
    setProfile(null);setEditing(false);setChoosingPlaylists(false);setPlaylistMutationError('');
    setSectionErrors({most:'',recent:'',playlists:'',copies:''});setHighlights({playlistIds:[],moment:null});
    setMost([]);setRecent([]);setTudoMais(false);setTudoRecente(false);setPlaylists([]);setGuardadas(new Set());
  },[userId]);
  const jaLido=useRef<string|null>(null);
  useEffect(()=>{
    if(!active)return;
    // Só a primeira leitura de cada pessoa mostra o carregamento; as
    // seguintes entram por baixo.
    const primeira=jaLido.current!==userId;
    jaLido.current=userId;
    void load(!primeira);
    return()=>{request.current++;};
  },[load,friend?.status,active,userId]);
  /** Guardar (ou largar) a playlist de outra pessoa. Fica uma copia minha. */
  const alternarCopia=async(pl:Playlist)=>{
    if(mutation.current || loading || sectionErrors.copies) return;
    mutation.current=true;
    const generation=request.current;
    setOcupada(pl.id);setPlaylistMutationError('');
    const tinha=guardadas.has(pl.id);
    let confirmed=false;
    try {
      if(tinha) await unsavePlaylistCopy(pl.id); else await savePlaylistCopy(pl.id);
      confirmed=true;
      if(generation!==request.current)return;
      setGuardadas(g=>{const n=new Set(g);if(tinha)n.delete(pl.id);else n.add(pl.id);return n;});
    } catch{ if(generation===request.current)setPlaylistMutationError('Could not update your saved playlists. Please try again.'); }
    finally { mutation.current=false;setOcupada(null);if(confirmed&&mounted.current&&view.current.active&&view.current.userId===userId&&view.current.myId===myId)void load(true); }
  };

  /** Mostrar ou esconder uma playlist minha no perfil. */
  const alternarVisibilidade=async(pl:Playlist)=>{
    if(mutation.current || loading) return;
    mutation.current=true;
    const generation=request.current;
    setOcupada(pl.id);setPlaylistMutationError('');
    const passaA=!pl.visibleOnProfile;
    let confirmed=false;
    try {
      await setPlaylistVisibility(pl.id,passaA);
      confirmed=true;
      if(generation!==request.current)return;
      setPlaylists(l=>l.map(x=>x.id===pl.id?{...x,visibleOnProfile:passaA}:x));
    } catch(e){ if(generation===request.current)setPlaylistMutationError(missingProfilePlaylistColumns(e)?PROFILE_SHARING_UNAVAILABLE:'Could not change this playlist. Please try again.'); }
    finally { mutation.current=false;setOcupada(null);if(confirmed&&mounted.current&&view.current.active&&view.current.userId===userId&&view.current.myId===myId)void load(true); }
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
  const visiblePlaylists=playlists.filter(p=>!own||p.visibleOnProfile);
  /**
   * Uma secção que falha diz o que aconteceu e cala-se. O botão de repetir que
   * estava aqui não valia a linha que ocupava -- e chegavam a aparecer dois,
   * empilhados por baixo do mesmo título. Quem quer tentar outra vez já tem
   * por onde: puxar a página para baixo no iPhone, ou o refrescar do cabeçalho
   * no Windows.
   */
  const sectionFailure=(message:string)=><Text accessibilityRole="alert" style={s.muted}>{message}</Text>;
  const playlistsSection=<View style={{gap:12}}>
    <View style={[s.row,{justifyContent:'space-between'}]}>
      <Text style={s.title}>{own?'Your playlists':'Playlists'}</Text>
      {own&&<SocialIconButton label="Choose playlists to share" icon="add-circle-outline" onPress={()=>{setPlaylistMutationError('');setChoosingPlaylists(true);}}/>}
    </View>
    {!!sectionErrors.playlists&&sectionFailure(sectionErrors.playlists)}
    {!!sectionErrors.copies&&sectionFailure(sectionErrors.copies)}
    {!!playlistMutationError&&!choosingPlaylists&&<Text accessibilityRole="alert" style={s.error}>{playlistMutationError}</Text>}
    <View style={{flexDirection:wide?'row':'column',flexWrap:wide?'wrap':'nowrap',gap:12}}>
      {[...visiblePlaylists].sort((a,b)=>{const rank=(id:string)=>{const i=highlights.playlistIds.indexOf(id);return i<0?3:i;};return rank(a.id)-rank(b.id);}).map(pl=>{
        const marked=guardadas.has(pl.id),busy=ocupada===pl.id;
        return <View key={pl.id} style={[s.card,{padding:12,width:wide?undefined:'100%',flexDirection:'row',alignItems:'center',flexBasis:wide?280:undefined,flexGrow:wide?1:0,minWidth:0}]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Open ${pl.name}`} disabled={!onPlaylist} onPress={()=>onPlaylist?.(pl.id)}
            style={({pressed,hovered}:any)=>[s.row,{flex:1,minWidth:0},(pressed||hovered)&&{opacity:0.75}]}>
            <View style={{borderRadius:radii.md,overflow:'hidden'}}><ArtworkCollage artworks={pl.artworks} size={56}/></View>
            <View style={{flex:1,minWidth:0}}><Text numberOfLines={2} style={[s.text,{fontWeight:'600'}]}>{pl.name}</Text><Text style={s.muted}>{pl.trackCount} {pl.trackCount===1?'track':'tracks'}</Text></View>
            {own&&<Ionicons name="chevron-forward" size={16} color={colors.textSecondary}/>}
          </Pressable>
          {!own&&<Pressable accessibilityRole="button" accessibilityLabel={marked?`Remove your copy of ${pl.name}`:`Save a copy of ${pl.name}`} aria-selected={marked} aria-busy={busy} aria-disabled={!!ocupada||loading||!!sectionErrors.copies} accessibilityState={{selected:marked,busy,disabled:!!ocupada||loading||!!sectionErrors.copies}}
            disabled={!!ocupada||loading||!!sectionErrors.copies} onPress={()=>void alternarCopia(pl)} style={{minHeight:44,minWidth:56,alignItems:'center',justifyContent:'center',gap:3,opacity:sectionErrors.copies?0.4:1}}>
            {busy?<ActivityIndicator size="small" color={accent}/>:<Ionicons name={marked?'checkmark-circle':'add-circle-outline'} size={24} color={marked?accent:colors.textSecondary}/>}
            <Text style={s.muted}>{marked?'Saved':'Save'}</Text>
          </Pressable>}
        </View>;
      })}
    </View>
    {!visiblePlaylists.length&&!sectionErrors.playlists&&(loading?<ActivityIndicator color={accent}/>:<Text style={s.muted}>No playlists shared yet</Text>)}
  </View>;
  return <View style={s.body} onLayout={e=>setWidth(e.nativeEvent.layout.width)}>
    {/* Sem puxar-para-recarregar: era a unica pagina da app que reagia ao
        gesto, e um gesto que so existe num sitio nao se aprende. Recarrega
        ao voltar a entrar, e no Windows pelo refrescar do cabecalho. */}
    <ScrollView contentContainerStyle={{paddingBottom:bottomPadding}} keyboardShouldPersistTaps="handled">
      <ProfileHero profile={profile} own={own} cover={cover} unread={unread}
        status={!own&&profile?.canView?(friend?.online?'● Online now':ultimaAtividade(friend?.lastSeenAt,now)):undefined}
        onEdit={()=>setEditing(true)} onSocial={onSocial} onSettings={onSettings} onBack={onBack} onStats={onStats}
        onMessage={()=>onMessage(userId)} onRefresh={()=>void load()} pending={friend?.status==='pending'}
        onAddFriend={()=>{void sendFriendRequest(userId).then(()=>useSocial.getState().refresh()).catch(()=>setError('Could not send the friend request. Please try again.'));}}/>
      <View style={{paddingHorizontal:SOCIAL_GUTTER,gap:28}}>
      {loading&&!profile&&<ActivityIndicator color={accent}/>}
      {!!error&&sectionFailure(error)}
      {profile&&<>
        {friend?.currentlyPlaying&&profile.canView&&<Pressable accessibilityRole="button" accessibilityLabel={`Play ${friend.currentlyPlaying.title}`}
          onPress={()=>{const t=friend.currentlyPlaying;if(t)void usePlayer.getState().playTrack({...t,id:t.id??undefined,album:null});}}
          style={({pressed}:any)=>[s.row,s.card,pressed&&{opacity:0.7}]}>
          <Ionicons name="play-circle" size={28} color={accent}/><View style={{flex:1,minWidth:0}}><Text style={s.label}>Listening now</Text><Text numberOfLines={1} style={s.text}>{friend.currentlyPlaying.title}</Text></View>
        </Pressable>}
        {!profile.canView?<Text style={s.muted}>Stats become available once you are friends.</Text>:<>
          {highlights.moment&&<View style={[s.card,{gap:12}]}>
            <Text style={s.label}>Song of the moment</Text>
            <View style={s.row}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Play ${highlights.moment.title}`} onPress={()=>void usePlayer.getState().playTrack(highlights.moment!,[highlights.moment!])} style={[s.row,{flex:1,minWidth:0}]}>
                {highlights.moment.artworkUrl?<Image source={{uri:highlights.moment.artworkUrl}} style={{width:56,height:56,borderRadius:radii.sm}}/>:<Ionicons name="musical-notes" size={40} color={accent}/>}
                <View style={{flex:1,minWidth:0}}><Text numberOfLines={2} style={s.text}>{highlights.moment.title}</Text><Text numberOfLines={1} style={s.muted}>{displayArtist(highlights.moment)}</Text></View>
                <Ionicons name="play-circle" size={32} color={accent}/>
              </Pressable>
              <SocialIconButton label={`Options for ${highlights.moment.title}`} icon="ellipsis-horizontal" onPress={()=>setTrack(highlights.moment)}/>
            </View>
          </View>}
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
              {!!sectionErrors.most&&sectionFailure(sectionErrors.most)}
              {most.length?(tudoMais?most:most.slice(0,5)).map((e,i)=>row(e,i)):loading?<ActivityIndicator color={accent}/>:!sectionErrors.most&&<Text style={s.muted}>Nothing played yet.</Text>}
              {most.length>5&&!tudoMais&&<SocialButton quiet onPress={()=>setTudoMais(true)}>Show all {most.length}</SocialButton>}
              {tudoMais&&most.length>0&&most.length%20===0&&<SocialButton quiet onPress={()=>{void getSocialProfileTracks(userId,false,most.length).then(m=>setMost([...most,...m])).catch(e=>setError(e.message));}}>Show more</SocialButton>}
            </View>
            <View style={{flex:columns?1:undefined,minWidth:0,gap:8}}>
              <Text style={s.title}>Recently played</Text>
              {!!sectionErrors.recent&&sectionFailure(sectionErrors.recent)}
              {recent.length?(tudoRecente?recent:recent.slice(0,5)).map((e,i)=>row(e,i,true)):loading?<ActivityIndicator color={accent}/>:!sectionErrors.recent&&<Text style={s.muted}>Your listening history appears here.</Text>}
              {recent.length>5&&!tudoRecente&&<SocialButton quiet onPress={()=>setTudoRecente(true)}>Show all {recent.length}</SocialButton>}
              {tudoRecente&&recent.length>0&&recent.length%20===0&&<SocialButton quiet onPress={()=>{void getSocialProfileTracks(userId,true,recent.length).then(r=>setRecent([...recent,...r])).catch(e=>setError(e.message));}}>Show more</SocialButton>}
            </View>
          </View>
        </>}
      </>}
      </View>
    </ScrollView>
    {editing&&profile&&<ProfileEditor profile={profile} highlights={highlightsLoaded&&!sectionErrors.playlists?highlights:null} playlists={playlists} onClose={()=>setEditing(false)} onSaved={()=>{void load(true);void useSocial.getState().refresh();}}/>}
    {choosingPlaylists&&own&&<ProfilePlaylistPicker playlists={playlists} loading={loading} busy={ocupada} error={playlistMutationError||sectionErrors.playlists}
      onToggle={p=>void alternarVisibilidade(p)} onClose={()=>setChoosingPlaylists(false)} onRetry={()=>{setPlaylistMutationError('');void load();}}/>}
    <SocialTrackActions track={track} onClose={()=>setTrack(null)} onArtist={onArtist}/>
  </View>;
}
