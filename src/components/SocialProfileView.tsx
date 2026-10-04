import React,{useCallback,useEffect,useRef,useState} from 'react';
import { ActivityIndicator,Animated,Image,Platform,Pressable,ScrollView,StyleSheet,Text,View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { appearanceOf,getSocialProfile,getSocialProfileTracks,saveProfileCustomization,type ProfileHighlights,type SocialProfile,type ProfileTrack } from '../api/profiles';
import { loadProfileSections } from '../api/profileSections';
import { missingProfilePlaylistColumns,PROFILE_SHARING_UNAVAILABLE } from '../lib/profileSchema';
import { sendFriendRequest } from '../api/social';
import { useAuth } from '../state/auth';
import { usePlayer } from '../state/player';
import { useSocial } from '../state/social';
import { useProfileMedia } from '../lib/profileMedia';
import { ultimaAtividade } from '../lib/socialPresence';
import { chaveDeArtista, displayArtist, tituloDaFaixa } from '../lib/artistName';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { colors, radii, SOCIAL_GUTTER } from './socialTokens';
import { useTheme } from '../state/theme';
import { useSocialBottomPadding } from './useSocialBottomPadding';
import { naoLidasPorAmigo } from '../lib/social';
import { ArtworkCollage } from './ArtworkCollage';
import { ProfileEditor } from './ProfileEditor';
import { BotoesDoPerfil, ProfileHero } from './ProfileHero';
import { usePuxarParaAtualizar } from './PuxarParaAtualizar';
import { guardarPerfil, ouvirPerfis, perfilEmCache } from '../lib/cachePerfil';
import { SkeletonDoPerfil } from './Skeleton';
import { SocialTrackActions } from './SocialTrackActions';
import { SocialIconButton,socialStyles as s } from './socialUI';
import type { Track } from '../types';
import type { Playlist } from '../types';
import { savePlaylistCopy, unsavePlaylistCopy } from '../api/playlists';

export function SocialProfileView({userId,onMessage,onArtist,onStats,onVocesOsDois,onSettings,onSocial,onPlaylist,onBack,active=true,scrollRef}:{userId:string;onMessage:(id:string)=>void;onArtist:(name:string)=>void;onStats:()=>void;onVocesOsDois?:(nome?:string)=>void;onSettings?:()=>void;onSocial?:()=>void;onPlaylist?:(id:string)=>void;onBack?:()=>void;active?:boolean;
  /** A lista do perfil, para o separador do iPhone a levar ao topo (3/10). */
  scrollRef?:React.RefObject<any>}) {
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
  /** O ⋯ aberto é o da música do momento: no teu perfil leva o "Remove from profile". */
  const [trackDoMomento,setTrackDoMomento]=useState(false);
  const safe=useSafeAreaInsets();
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
      // Num perfil alheio, uma leitura recusada nunca pode conservar uma lista
      // cuja proveniencia nao foi confirmada. Privacidade ganha a cache.
      else if(!own)setPlaylists([]);
      if(c.status==='fulfilled')setGuardadas(c.value);
      if(h.status==='fulfilled'){setHighlights(h.value);setHighlightsLoaded(true);}
      // A leitura boa fica guardada: a proxima abertura pinta com ela e so
      // depois actualiza, em vez de mostrar uma roda a girar.
      guardarPerfil(userId,{
        perfil:p,
        most:m.status==='fulfilled'?m.value:[],
        recent:r.status==='fulfilled'?r.value:[],
        playlists:l.status==='fulfilled'?l.value:[],
        guardadas:c.status==='fulfilled'?c.value:new Set<string>(),
        highlights:h.status==='fulfilled'?h.value:{playlistIds:[],moment:null},
        highlightsLidos:h.status==='fulfilled',
      });
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
    setEditing(false);setPlaylistMutationError('');
    setSectionErrors({most:'',recent:'',playlists:'',copies:''});
    setTudoMais(false);setTudoRecente(false);
    // Se ja se leu esta pessoa nesta sessao, o ecra pinta JA com o que se
    // sabe e a leitura nova corre por baixo. Limpar tudo aqui era o que
    // obrigava a uma roda a girar mesmo quando nada tinha mudado.
    const guardado=perfilEmCache(userId);
    if(guardado){
      setProfile(guardado.perfil as any);
      setMost(guardado.most as any);setRecent(guardado.recent as any);
      setPlaylists(guardado.playlists as any);setGuardadas(guardado.guardadas);
      setHighlights(guardado.highlights as any);setHighlightsLoaded(guardado.highlightsLidos);
      setLoading(false);
      return;
    }
    setProfile(null);setHighlights({playlistIds:[],moment:null});
    setMost([]);setRecent([]);setPlaylists([]);setGuardadas(new Set());
  },[userId]);
  // O que o aquecimento traz com o ecra ja montado (ver `ouvirPerfis`). So se
  // pinta se nao houver perfil nenhum a vista: o que ja la esta e mais novo.
  const perfilNoEcra=useRef(false);
  useEffect(()=>{perfilNoEcra.current=!!profile;},[profile]);
  useEffect(()=>ouvirPerfis((id)=>{
    if(id!==userId||perfilNoEcra.current)return;
    const guardado=perfilEmCache(userId);
    if(!guardado)return;
    setProfile(guardado.perfil as any);
    setMost(guardado.most as any);setRecent(guardado.recent as any);
    setPlaylists(guardado.playlists as any);setGuardadas(guardado.guardadas);
    setHighlights(guardado.highlights as any);setHighlightsLoaded(guardado.highlightsLidos);
    setLoading(false);
  }),[userId]);
  const jaLido=useRef<string|null>(null);
  useEffect(()=>{
    if(!active)return;
    // Só a primeira leitura de cada pessoa mostra o carregamento; as
    // seguintes entram por baixo.
    // Silenciosa tambem quando ha cache: o ecra ja tem conteudo, e pousar-lhe
    // um carregamento por cima seria esconder o que ja se ve.
    const primeira=jaLido.current!==userId&&!perfilEmCache(userId);
    jaLido.current=userId;
    // O aquecimento global e exclusivo do perfil autenticado. Chama-lo aqui
    // com o id de um amigo guardava as NOSSAS playlists sob a chave dele.
    // Perfis alheios usam apenas cache criada por uma leitura real desse perfil.
    void load(!primeira);
    return()=>{request.current++;};
  },[load,friend?.status,active,userId]);
  /**
   * Tirar a musica destacada a partir do proprio cartao.
   *
   * O servidor sempre soube tirá-la e o editor sempre teve o botão, mas o
   * único caminho até lá era abrir o editor e descer até aos destaques -- e o
   * ⋯ do cartão abre as opções da FAIXA, que é outra coisa. Quem quer tirá-la
   * procura-a aqui.
   */
  const [aTirarMoment,setATirarMoment]=useState(false);
  const tirarMoment=async()=>{
    if(!profile||aTirarMoment)return;
    setATirarMoment(true);setError('');
    try{
      await saveProfileCustomization(appearanceOf(profile),profile.profile.name,profile.profile.username,{...highlights,moment:null});
      setHighlights(h=>({...h,moment:null}));
      void load(true);
    }catch(e:any){ setError(e?.message || 'Could not remove the song. Please try again.'); }
    finally{ setATirarMoment(false); }
  };

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

  // Quem pede o perfil a seguir (puxar para atualizar, 4/10): só o iPhone.
  const puxar=usePuxarParaAtualizar(()=>load(true),safe.top+8);

  // A barra de cima com o nome: aparece quando o nome passa por baixo dela.
  const rolagem=useRef(new Animated.Value(0)).current;
  const aoRolar=useRef(Animated.event([{nativeEvent:{contentOffset:{y:rolagem}}}],{useNativeDriver:true})).current;
  const [fimDoNome,setFimDoNome]=useState(330);

  const row=(entry:ProfileTrack,index:number,recentes=false)=><View key={`${entry.source}:${entry.sourceId}`} style={[s.row,{gap:12,minHeight:58}]}>
    {!recentes&&<Text style={[s.muted,{width:20,textAlign:'center',fontVariant:['tabular-nums']}]}>{index+1}</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel={`Play ${entry.title}`} onPress={()=>void usePlayer.getState().playTrack(entry,recentes?recent:most)}
      style={({pressed,hovered}:any)=>[s.row,{flex:1,minWidth:0,borderRadius:radii.md,gap:12},(pressed||hovered)&&{backgroundColor:colors.surfacePressed}]}>
      <View style={{width:46,height:46,borderRadius:radii.sm,overflow:'hidden',backgroundColor:colors.surface,alignItems:'center',justifyContent:'center'}}>
        {entry.artworkUrl?<Image source={{uri:capaParaLista(entry.artworkUrl)!}} style={{width:46,height:46}}/>:<Ionicons name="musical-notes" color={colors.textSecondary} size={22}/>}
      </View>
      <View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={[s.text,{fontWeight:'500'}]}>{tituloDaFaixa(entry)}</Text><Text numberOfLines={1} style={s.muted}>{displayArtist(entry)}</Text></View>
      {/* Nas mais tocadas o número é a contagem e diz alguma coisa; nas
          recentes a data não acrescentava nada. */}
      {!recentes&&<Text style={[s.muted,{fontVariant:['tabular-nums']}]}>{entry.count}</Text>}
    </Pressable><SocialIconButton label={`Options for ${entry.title}`} icon="ellipsis-horizontal" onPress={()=>setTrack(entry)}/>
  </View>;
  const visiblePlaylists=playlists.filter(p=>!own||p.visibleOnProfile);
  /**
   * Uma secção que falha diz o que aconteceu e cala-se. Quem quer tentar outra
   * vez puxa a página para baixo (iPhone) ou usa o refrescar (PC).
   */
  const sectionFailure=(message:string)=><Text accessibilityRole="alert" style={s.muted}>{message}</Text>;
  /** O título de uma secção, com o link à direita ("See all", "Edit", "Stats"). */
  const titulo=(texto:string,link?:{rotulo:string;onPress:()=>void},pequeno=false)=><View style={[s.row,{justifyContent:'space-between',alignItems:'baseline'}]}>
    <Text accessibilityRole="header" style={pequeno?{fontSize:18,fontWeight:'700',color:colors.text}:[s.title,{fontSize:22}]}>{texto}</Text>
    {link&&<Pressable accessibilityRole="button" onPress={link.onPress} hitSlop={10}><Text style={{fontSize:14,fontWeight:'600',color:accent}}>{link.rotulo}</Text></Pressable>}
  </View>;
  /** Cartões que deslizam no iPhone; no PC, uma grelha que dobra. */
  const fila=(filhos:React.ReactNode,gap=12)=>web
    ? <View style={{flexDirection:'row',flexWrap:'wrap',gap}}>{filhos}</View>
    : <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginHorizontal:-SOCIAL_GUTTER}} contentContainerStyle={{paddingHorizontal:SOCIAL_GUTTER,gap}}>{filhos}</ScrollView>;

  // As playlists em cartões (4/10). Escolher quais aparecem e quais vão à
  // frente passou para o Edit profile: o ⊕ e os ⊖ desta lista saíram.
  const playlistsSection=<View style={{gap:12}}>
    {titulo(own?'Your playlists':'Playlists',own&&profile?{rotulo:'Edit',onPress:()=>setEditing(true)}:undefined)}
    {!!sectionErrors.playlists&&sectionFailure(sectionErrors.playlists)}
    {!!sectionErrors.copies&&sectionFailure(sectionErrors.copies)}
    {!!playlistMutationError&&<Text accessibilityRole="alert" style={s.error}>{playlistMutationError}</Text>}
    {visiblePlaylists.length>0&&fila([...visiblePlaylists].sort((a,b)=>{const rank=(id:string)=>{const i=highlights.playlistIds.indexOf(id);return i<0?3:i;};return rank(a.id)-rank(b.id);}).map(pl=>{
      const marked=guardadas.has(pl.id),busy=ocupada===pl.id;
      return <View key={pl.id} style={{width:150}}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${pl.name}`} disabled={!onPlaylist} onPress={()=>onPlaylist?.(pl.id)}
          style={({pressed,hovered}:any)=>[(pressed||hovered)&&{opacity:0.8}]}>
          <View style={{borderRadius:radii.md,overflow:'hidden'}}><ArtworkCollage artworks={pl.artworks} size={150}/></View>
          <Text numberOfLines={1} style={[s.text,{fontWeight:'600',marginTop:8,fontSize:14}]}>{pl.name}</Text>
          <Text style={[s.muted,{fontSize:12.5}]}>{pl.trackCount} {pl.trackCount===1?'track':'tracks'}</Text>
        </Pressable>
        {/* Guardar uma cópia da playlist de um amigo: no canto da capa. */}
        {!own&&<Pressable accessibilityRole="button" accessibilityLabel={marked?`Remove your copy of ${pl.name}`:`Save a copy of ${pl.name}`}
          accessibilityState={{selected:marked,busy,disabled:!!ocupada||loading||!!sectionErrors.copies}}
          disabled={!!ocupada||loading||!!sectionErrors.copies} onPress={()=>void alternarCopia(pl)}
          style={{position:'absolute',top:8,right:8,width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center',
            backgroundColor:'rgba(10,10,15,0.62)',opacity:sectionErrors.copies?0.4:1}}>
          {busy?<ActivityIndicator size="small" color={accent}/>:<Ionicons name={marked?'checkmark':'add'} size={20} color={marked?accent:colors.text}/>}
        </Pressable>}
      </View>;
    }))}
    {!visiblePlaylists.length&&!sectionErrors.playlists&&(loading?<ActivityIndicator color={accent}/>:<Text style={s.muted}>{own?'No playlists on your profile yet. Choose them in Edit profile.':'No playlists shared yet'}</Text>)}
  </View>;

  /**
   * Os artistas mais ouvidos, para os círculos (4/10, escuta C). Saem das
   * músicas mais tocadas, que já vêm para o perfil de quem quer que seja: não
   * há leitura nova nem função nova no servidor. Sem contagem por baixo -- é
   * uma soma das 20 primeiras, não o total de escutas, e não se apresenta
   * como se fosse.
   */
  const artistas=(()=>{
    const porChave=new Map<string,{nome:string;soma:number;capa:string|null}>();
    for(const e of most){
      const nome=displayArtist(e);
      if(!nome||nome==='Unknown artist')continue;
      const k=chaveDeArtista(nome);
      const a=porChave.get(k);
      if(a)a.soma+=e.count||0;
      else porChave.set(k,{nome,soma:e.count||0,capa:e.artworkUrl??null});
    }
    return [...porChave.values()].sort((a,b)=>b.soma-a.soma).slice(0,8);
  })();

  const vistaRecente=tudoRecente
    ? recent.map((e,i)=>row(e,i,true))
    : fila(recent.slice(0,20).map(e=><Pressable key={`${e.source}:${e.sourceId}`} accessibilityRole="button" accessibilityLabel={`Play ${e.title}`}
        onPress={()=>void usePlayer.getState().playTrack(e,recent)} style={({pressed}:any)=>({opacity:pressed?0.7:1})}>
        <View style={{width:76,height:76,borderRadius:radii.sm,overflow:'hidden',backgroundColor:colors.surface,alignItems:'center',justifyContent:'center'}}>
          {e.artworkUrl?<Image source={{uri:capaParaLista(e.artworkUrl)!}} style={{width:76,height:76}}/>:<Ionicons name="musical-notes" color={colors.textSecondary} size={22}/>}
        </View>
      </Pressable>),10);

  const nome=profile?.profile.name||'';
  return <View style={s.body} onLayout={e=>setWidth(e.nativeEvent.layout.width)}>
    <Animated.ScrollView ref={scrollRef} refreshControl={puxar} onScroll={web?undefined:aoRolar} scrollEventThrottle={16}
      contentContainerStyle={{paddingBottom:bottomPadding}} keyboardShouldPersistTaps="handled">
      <ProfileHero profile={profile} own={own} cover={cover} unread={unread} botoesFora={!web}
        status={!own&&profile?.canView?(friend?.online?'● Online now':ultimaAtividade(friend?.lastSeenAt,now)):undefined}
        contagens={profile?.canView?{plays:profile.stats?.totalPlays??0,tracks:profile.stats?.uniqueTracks??0,friends:profile.friendCount??0}:null}
        onStats={profile?.canView?onStats:undefined}
        onVocesOsDois={onVocesOsDois&&profile?.canView&&friend?.status==='accepted'?()=>onVocesOsDois(profile.profile.name||profile.profile.username||undefined):undefined}
        aoMedirNome={setFimDoNome}
        onEdit={()=>setEditing(true)} onSocial={onSocial} onSettings={onSettings} onBack={onBack}
        onMessage={()=>onMessage(userId)} onRefresh={()=>void load()} pending={friend?.status==='pending'}
        onAddFriend={()=>{void sendFriendRequest(userId).then(()=>useSocial.getState().refresh()).catch(()=>setError('Could not send the friend request. Please try again.'));}}/>
      <View style={{paddingHorizontal:SOCIAL_GUTTER,paddingTop:28,gap:30}}>
      {loading&&!profile&&<SkeletonDoPerfil/>}
      {!!error&&sectionFailure(error)}
      {profile&&<>
        {friend?.currentlyPlaying&&profile.canView&&<Pressable accessibilityRole="button" accessibilityLabel={`Play ${friend.currentlyPlaying.title}`}
          onPress={()=>{const t=friend.currentlyPlaying;if(t)void usePlayer.getState().playTrack({...t,id:t.id??undefined,album:null});}}
          style={({pressed}:any)=>[estilos.cartao,pressed&&{opacity:0.75}]}>
          <Ionicons name="radio-outline" size={26} color={accent}/>
          <View style={{flex:1,minWidth:0}}><Text style={estilos.rotulo}>Listening now</Text><Text numberOfLines={1} style={[s.text,{fontWeight:'600'}]}>{friend.currentlyPlaying.title}</Text></View>
          <View style={estilos.play}><Ionicons name="play" size={20} color={colors.bg} style={{marginLeft:2}}/></View>
        </Pressable>}
        {!profile.canView?<Text style={s.muted}>Stats become available once you are friends.</Text>:<>
          {/* A música do momento num cartão, com o play à direita (4/10). O ✕
              saiu: tirá-la do perfil é no ⋯, como o resto das ações de uma
              faixa. */}
          {highlights.moment&&<View style={estilos.cartao}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Play ${highlights.moment.title}`} onPress={()=>void usePlayer.getState().playTrack(highlights.moment!,[highlights.moment!])}
              style={[s.row,{flex:1,minWidth:0,gap:14}]}>
              {highlights.moment.artworkUrl
                ? <Image source={{uri:capaParaLista(highlights.moment.artworkUrl)!}} style={{width:64,height:64,borderRadius:radii.sm}}/>
                : <View style={{width:64,height:64,borderRadius:radii.sm,backgroundColor:colors.surfaceHigh,alignItems:'center',justifyContent:'center'}}><Ionicons name="musical-notes" size={26} color={accent}/></View>}
              <View style={{flex:1,minWidth:0}}>
                <Text style={estilos.rotulo}>Song of the moment</Text>
                <Text numberOfLines={1} style={[s.text,{fontWeight:'600'}]}>{tituloDaFaixa(highlights.moment)}</Text>
                <Text numberOfLines={1} style={s.muted}>{displayArtist(highlights.moment)}</Text>
              </View>
              <View style={estilos.play}>{aTirarMoment?<ActivityIndicator size="small" color={colors.bg}/>:<Ionicons name="play" size={20} color={colors.bg} style={{marginLeft:2}}/>}</View>
            </Pressable>
            <SocialIconButton label={`Options for ${highlights.moment.title}`} icon="ellipsis-horizontal" onPress={()=>{setTrackDoMomento(true);setTrack(highlights.moment);}}/>
          </View>}
          {playlistsSection}
          {/* A escuta (4/10, opção C): os artistas primeiro, em círculos -- é o
              que mais diz sobre o gosto de alguém --, as cinco mais tocadas com
              a contagem, e as recentes numa fila de capas. Os três números
              grandes subiram para o cabeçalho. */}
          <View style={{gap:14}}>
            {titulo(own?'Your listening':'Listening',{rotulo:'Stats',onPress:onStats})}
            {artistas.length>1&&fila(artistas.map(a=><Pressable key={a.nome} accessibilityRole="button" accessibilityLabel={a.nome} onPress={()=>onArtist(a.nome)}
              style={({pressed}:any)=>({width:92,alignItems:'center',opacity:pressed?0.7:1})}>
              <View style={{width:92,height:92,borderRadius:46,overflow:'hidden',backgroundColor:colors.surface,alignItems:'center',justifyContent:'center'}}>
                {a.capa?<Image source={{uri:capaParaLista(a.capa)!}} style={{width:92,height:92}}/>:<Ionicons name="person" size={30} color={colors.textSecondary}/>}
              </View>
              <Text numberOfLines={1} style={[s.text,{fontSize:13.5,fontWeight:'600',marginTop:8,textAlign:'center'}]}>{a.nome}</Text>
            </Pressable>),16)}
          </View>
          <View style={{gap:4}}>
            {titulo('On repeat',most.length>5&&!tudoMais?{rotulo:'See all',onPress:()=>setTudoMais(true)}:undefined,true)}
            {!!sectionErrors.most&&sectionFailure(sectionErrors.most)}
            {most.length?(tudoMais?most:most.slice(0,5)).map((e,i)=>row(e,i)):loading?<ActivityIndicator color={accent}/>:!sectionErrors.most&&<Text style={s.muted}>Nothing played yet.</Text>}
            {tudoMais&&most.length>0&&most.length%20===0&&<Pressable accessibilityRole="button" onPress={()=>{void getSocialProfileTracks(userId,false,most.length).then(m=>setMost([...most,...m])).catch(e=>setError(e.message));}} style={{paddingVertical:12,alignItems:'center'}}>
              <Text style={{fontSize:14,fontWeight:'600',color:accent}}>Show more</Text></Pressable>}
          </View>
          <View style={{gap:tudoRecente?4:12}}>
            {titulo('Recently played',recent.length>0?{rotulo:tudoRecente?'Show less':'See all',onPress:()=>setTudoRecente(!tudoRecente)}:undefined,true)}
            {!!sectionErrors.recent&&sectionFailure(sectionErrors.recent)}
            {recent.length?vistaRecente:loading?<ActivityIndicator color={accent}/>:!sectionErrors.recent&&<Text style={s.muted}>Your listening history appears here.</Text>}
            {tudoRecente&&recent.length>0&&recent.length%20===0&&<Pressable accessibilityRole="button" onPress={()=>{void getSocialProfileTracks(userId,true,recent.length).then(r=>setRecent([...recent,...r])).catch(e=>setError(e.message));}} style={{paddingVertical:12,alignItems:'center'}}>
              <Text style={{fontSize:14,fontWeight:'600',color:accent}}>Show more</Text></Pressable>}
          </View>
        </>}
      </>}
      </View>
    </Animated.ScrollView>
    {/* iPhone: a barra com o nome aparece quando o nome passa por baixo dela, e
        os botões ficam no sítio por cima de tudo. Antes o conteúdo passava por
        baixo da ilha sem fundo nenhum. */}
    {!web&&<Animated.View pointerEvents="none" style={[estilos.barra,{height:safe.top+56,opacity:rolagem.interpolate({inputRange:[fimDoNome-40,fimDoNome-safe.top-20],outputRange:[0,1],extrapolate:'clamp'})}]}>
      <BlurView tint="dark" intensity={60} style={StyleSheet.absoluteFill}/>
      <View style={[StyleSheet.absoluteFill,{backgroundColor:'rgba(10,10,15,0.72)'}]}/>
      <Text numberOfLines={1} style={estilos.nomeNaBarra}>{nome}</Text>
    </Animated.View>}
    {!web&&<BotoesDoPerfil own={own} unread={unread} onBack={onBack} onSocial={onSocial} onSettings={onSettings}/>}
    {editing&&profile&&<ProfileEditor profile={profile} highlights={highlightsLoaded&&!sectionErrors.playlists?highlights:null} playlists={playlists} onClose={()=>setEditing(false)} onSaved={()=>{void load(true);void useSocial.getState().refresh();}}/>}
    <SocialTrackActions track={track} onClose={()=>{setTrack(null);setTrackDoMomento(false);}} onArtist={onArtist}
      extra={own&&trackDoMomento?[{rotulo:'Remove from profile',icone:'close-circle-outline',destrutiva:true,aoCarregar:()=>void tirarMoment()}]:undefined}/>
  </View>;
}

const estilos=StyleSheet.create({
  cartao:{flexDirection:'row',alignItems:'center',gap:12,padding:12,borderRadius:18,borderCurve:'continuous',backgroundColor:colors.surface},
  rotulo:{fontSize:11,fontWeight:'700',letterSpacing:0.6,textTransform:'uppercase',color:colors.textTertiary,marginBottom:2},
  play:{width:42,height:42,borderRadius:21,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},
  barra:{position:'absolute',top:0,left:0,right:0,justifyContent:'flex-end',alignItems:'center',paddingBottom:16,overflow:'hidden',
    borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  nomeNaBarra:{fontSize:17,fontWeight:'600',color:colors.text,maxWidth:'60%'},
});
