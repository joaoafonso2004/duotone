import React,{useCallback,useEffect,useRef,useState} from 'react';
import { ActivityIndicator,FlatList,Image,Platform,Pressable,ScrollView,Text,TextInput,View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { acceptFriendRequest,acrescentarAoGrupo,criarGrupo,declineOrRemoveFriendship,getChatMessages,getGroupMessages,apagarConversa, sairDoGrupo,searchProfiles,sendFriendRequest,getReactions,setReaction,shareComGrupo,shareItem,type Reaction,type SharedItem } from '../api/social';
import type { PublicProfile } from '../api/profiles';
import { useSocial } from '../state/social';
import { useAuth } from '../state/auth';
import { usePlayer } from '../state/player';
import { naoLidasPorAmigo } from '../lib/social';
import { ultimaAtividade } from '../lib/socialPresence';
import { supabase } from '../lib/supabase';
import { FriendAvatar } from './FriendAvatar';
import { colors, SOCIAL_GUTTER } from './socialTokens';
import { useSocialBottomPadding } from './useSocialBottomPadding';
import { useTheme } from '../state/theme';
import { SocialButton,SocialModal,SocialIconButton,SocialTabs,socialStyles as s } from './socialUI';
import { SocialTrackActions } from './SocialTrackActions';
import { SharedPlaylistCard } from './SharedPlaylistCard';
import { MessageBubble,ReactionRow } from './ReactionRow';
import { getPlaylistPreviews } from '../api/playlists';
import { GroupAvatar,GroupChatHeader,GroupComposer,GroupDetails,GroupEmptyState,GroupMessage } from './GroupChat';
import type { Playlist,Track } from '../types';

export function SocialHub({onProfile,onPlaylist,onArtist,visible=true,initialFriend,initialGroup}:{onProfile:(id:string)=>void;onPlaylist:(id:string)=>void;onArtist:(name:string)=>void;visible?:boolean;initialFriend?:string;initialGroup?:string}) {
  const web=Platform.OS==='web';
  const [width,setWidth]=useState(0);
  const split=web&&width>=850;
  const bottomPadding=useSocialBottomPadding();
  const accent=useTheme(s=>s.theme.color);
  const closeChat=()=>useSocial.setState({conversation:null});
  const social=useSocial(),myId=useAuth(x=>x.session?.user.id);
  const [tab,setTab]=useState<'friends'|'add'>('friends'),[query,setQuery]=useState(''),[results,setResults]=useState<PublicProfile[]>([]);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[messages,setMessages]=useState<SharedItem[]>([]),[chatLoading,setChatLoading]=useState(false);
  const [older,setOlder]=useState(false),[hasOlder,setHasOlder]=useState(false);
  const [track,setTrack]=useState<Track|null>(null),[confirm,setConfirm]=useState<{id:string;group:boolean;conversa?:boolean}|null>(null);
  const [groupEditor,setGroupEditor]=useState<string|null>(null),[groupName,setGroupName]=useState(''),[members,setMembers]=useState<string[]>([]);
  const [groupDetails,setGroupDetails]=useState<string|null>(null);
  const conversation=social.conversation;
  const contact=conversation?.kind==='friend'?social.contacts.find(c=>c.id===conversation.id):null;
  const friend=conversation?.kind==='friend'?social.friends.find(f=>f.friendId===conversation.id) || (contact?{friendId:contact.id,name:contact.name,avatarUrl:contact.avatar_url,online:false,lastSeenAt:null,currentlyPlaying:null}:null):null;
  const group=conversation?.kind==='group'?social.groups.find(g=>g.id===conversation.id):null;
  const detailedGroup=social.groups.find(g=>g.id===groupDetails);
  const key=conversation?(conversation.kind==='group'?`group:${conversation.id}`:conversation.id):'';
  const draft=social.drafts[key] || '';
  const unread=naoLidasPorAmigo(social.received,social.seen);
  const ordered=[...messages].reverse();
  // As mensagens só guardam o id da playlist. O nome e as capas vêm daqui, uma
  // vez por conjunto de ids: sem isto o chat só sabia dizer "Open playlist".
  const [playlistsDoChat,setPlaylistsDoChat]=useState<Map<string,Playlist>>(new Map());
  const [reacoes,setReacoes]=useState<Map<string,Reaction[]>>(new Map());
  const [aReagir,setAReagir]=useState<string|null>(null);
  const idsDasMensagens=messages.map(m=>m.id).join(',');
  const recarregarReacoes=useCallback(async()=>{
    if(!idsDasMensagens){setReacoes(new Map());return;}
    setReacoes(await getReactions(idsDasMensagens.split(',')));
  },[idsDasMensagens]);
  useEffect(()=>{void recarregarReacoes();},[recarregarReacoes]);
  // O canal de tempo real nasce uma vez por conversa; a ref dá-lhe sempre a
  // versão actual da função em vez da que existia quando ele foi criado.
  const recarregarReacoesRef=useRef(recarregarReacoes);recarregarReacoesRef.current=recarregarReacoes;
  /**
   * A reação aparece no toque e só depois vai ao servidor: esperar pela ida e
   * volta faz um botão que parece partido. Se falhar, a releitura repõe o
   * estado certo.
   */
  const reagir=async(itemId:string,emoji:string|null)=>{
    setAReagir(null);
    if(!myId)return;
    setReacoes(anterior=>{
      const copia=new Map(anterior);
      const semAMinha=(copia.get(itemId)??[]).filter(r=>r.userId!==myId);
      copia.set(itemId,emoji?[...semAMinha,{itemId,userId:myId,emoji}]:semAMinha);
      return copia;
    });
    try{await setReaction(itemId,emoji);}catch{/* a releitura repõe */}
    void recarregarReacoes();
  };
  const idsDePlaylist=Array.from(new Set(messages.map(m=>m.playlistId).filter(Boolean) as string[])).sort().join(',');
  useEffect(()=>{
    if(!idsDePlaylist){setPlaylistsDoChat(new Map());return;}
    let vivo=true;
    void getPlaylistPreviews(idsDePlaylist.split(',')).then(m=>{if(vivo)setPlaylistsDoChat(m);});
    return()=>{vivo=false;};
  },[idsDePlaylist]);
  /** Mensagens seguidas da mesma pessoa, dentro de cinco minutos, ficam sem o cabeçalho repetido. */
  const seguida=(m:SharedItem,index:number)=>{const antes=ordered[index+1];return !!antes&&antes.sender.id===m.sender.id&&new Date(m.createdAt).getTime()-new Date(antes.createdAt).getTime()<300000;};
  const setDraft=(text:string)=>useSocial.setState(x=>({drafts:{...x.drafts,[key]:text}}));
  const open=(kind:'friend'|'group',id:string)=>useSocial.setState({conversation:{kind,id}});
  const run=async(action:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);setError('');try{await action();await social.refresh();}catch(e:any){setError(e.message || 'That did not go through.');}finally{setBusy(false);}};
  useEffect(()=>{if(initialFriend)open('friend',initialFriend);else if(initialGroup)open('group',initialGroup);},[initialFriend,initialGroup]);
  useEffect(()=>{setGroupDetails(null);},[key]);
  useEffect(()=>{
    let active=true;
    if(query.trim().length<2){setResults([]);return;}
    const timer=setTimeout(()=>{void searchProfiles(query).then(rows=>{if(active)setResults(rows);}).catch(e=>{if(active)setError(e.message);});},400);
    return()=>{active=false;clearTimeout(timer);};
  },[query]);
  useEffect(()=>{
    if(!conversation || !visible)return;
    let active=true,loading=false,firstLoad=true;
    setMessages([]);setHasOlder(false);setChatLoading(true);
    const load=async()=>{
      if(loading)return;loading=true;
      try{const rows=conversation.kind==='group'?await getGroupMessages(conversation.id):await getChatMessages(conversation.id);
        if(active){if(firstLoad){setHasOlder(rows.length===100);firstLoad=false;}setMessages(previous=>mergeMessages(previous,rows));const last=rows.filter(m=>m.sender.id!==myId).at(-1);if(last)await useSocial.getState().markRead(key,last.createdAt);}}
      catch(e:any){if(active)setError(e.message || 'Could not refresh this conversation.');}
      finally{loading=false;if(active)setChatLoading(false);}
    };
    // Realtime entrega mensagens novas imediatamente. Esta consulta é apenas
    // recuperação para uma ligação silenciosamente caída; seis segundos
    // mantinham o chat a pedir a mesma página dez vezes por minuto.
    void load();const timer=setInterval(()=>void load(),60000);
    const channel=supabase.channel(`chat:${key}`)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'shared_items'},()=>void load())
      // As reações chegam pelo seu próprio evento, sem esperar pelo polling.
      .on('postgres_changes',{event:'*',schema:'public',table:'item_reactions'},()=>void recarregarReacoesRef.current())
      .subscribe();
    return()=>{active=false;clearInterval(timer);void supabase.removeChannel(channel);};
  },[key,visible]);
  const loadOlder=async()=>{
    if(!conversation||older||!messages.length)return;setOlder(true);
    try{const rows=conversation.kind==='group'?await getGroupMessages(conversation.id,messages[0]):await getChatMessages(conversation.id,messages[0]);
      const c=useSocial.getState().conversation;if(c?.id!==conversation.id||c.kind!==conversation.kind)return;
      setMessages(previous=>mergeMessages(previous,rows));setHasOlder(rows.length===100);
    }catch(e:any){setError(e.message);}finally{setOlder(false);}
  };
  const send=async()=>{
    const text=draft.trim();if(!conversation||!text||busy)return;
    await run(async()=>{
      if(conversation.kind==='group')await shareComGrupo(conversation.id,'track',null,text);else await shareItem(conversation.id,'track',null,text);
      useSocial.setState(s=>({drafts:{...s.drafts,[key]:s.drafts[key]===draft?'':s.drafts[key]}}));
      const rows=conversation.kind==='group'?await getGroupMessages(conversation.id):await getChatMessages(conversation.id);
      const current=useSocial.getState().conversation;
      if(current?.id===conversation.id&&current.kind===conversation.kind){setMessages(previous=>mergeMessages(previous,rows));const last=rows.filter(m=>m.sender.id!==myId).at(-1);if(last)await social.markRead(key,last.createdAt);}
    });
  };
  // Uma lista de conversas ordena-se por quem falou por último, não pela ordem
  // em que a amizade foi aceite. Quem ainda nunca trocou nada fica por baixo,
  // por nome, para a secção não parecer baralhada ao acaso.
  const accepted=social.friends.filter(f=>f.status==='accepted').slice().sort((a,b)=>{
    const x=social.activity[a.friendId]??0,y=social.activity[b.friendId]??0;
    return x||y?y-x:a.name.localeCompare(b.name);
  });
  const pending=social.friends.filter(f=>f.status==='pending');
  const title=friend?.name || group?.name || 'Chat';
  const list=<View style={s.body}>
    <View style={[s.row,{paddingBottom:16}]}><SocialTabs value={tab} onChange={setTab}/><SocialIconButton label="Refresh" icon="refresh" onPress={()=>void social.refresh()}/></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:16,paddingBottom:bottomPadding}}>
      {(error||social.error)&&<Text accessibilityRole="alert" style={s.error}>{error||social.error}</Text>}
      {social.loading&&<ActivityIndicator color={accent}/>}
      {tab==='add'?<>
        <Text style={s.title}>Find your music people</Text><Text style={s.muted}>Search by name or username.</Text>
        <TextInput accessibilityLabel="Search people" value={query} onChangeText={setQuery} style={s.input} placeholder="Name or username" placeholderTextColor={colors.textSecondary} autoCapitalize="none"/>
        {results.map(p=><View key={p.id} style={[s.listRow]}><Pressable onPress={()=>onProfile(p.id)}><FriendAvatar avatarUrl={p.avatar_url} name={p.name} size={44}/></Pressable><View style={{flex:1}}><Text style={s.text}>{p.name}</Text><Text style={s.muted}>@{p.username}</Text></View><SocialButton disabled={busy||social.friends.some(f=>f.friendId===p.id)} onPress={()=>void run(()=>sendFriendRequest(p.id))}>{social.friends.some(f=>f.friendId===p.id)?'Added':'Add'}</SocialButton></View>)}
      </>:<>
        {pending.length>0&&<Text style={s.label}>Friend requests</Text>}
        {pending.map(f=><View key={f.friendId} style={s.card}><View style={s.row}><FriendAvatar avatarUrl={f.avatarUrl} name={f.name} size={40}/><View style={{flex:1}}><Text style={s.text}>{f.name}</Text><Text style={s.muted}>{f.isSender?'Request sent':'Wants to be your friend'}</Text></View></View><View style={s.row}>{!f.isSender&&<SocialButton primary disabled={busy} onPress={()=>void run(()=>acceptFriendRequest(f.friendId))}>Accept</SocialButton>}<SocialButton quiet disabled={busy} onPress={()=>void run(()=>declineOrRemoveFriendship(f.friendId))}>{f.isSender?'Cancel request':'Decline'}</SocialButton></View></View>)}
        <View style={[s.row,{justifyContent:'space-between'}]}><Text style={s.label}>Groups</Text><SocialButton quiet onPress={()=>{setGroupEditor('new');setMembers([]);setGroupName('');}}>+ New group</SocialButton></View>
        {social.groups.map(g=><Pressable key={g.id} accessibilityRole="button" accessibilityState={{selected:conversation?.kind==='group'&&conversation.id===g.id}} style={({pressed,hovered}:any)=>[s.listRow,{borderRadius:8,paddingHorizontal:8},(pressed||hovered||conversation?.id===g.id)&&{backgroundColor:colors.surface}]} onPress={()=>open('group',g.id)}><GroupAvatar group={g}/><View style={{flex:1,minWidth:0,gap:3}}><Text numberOfLines={1} style={[s.text,{fontWeight:'600'}]}>{g.name}</Text><Text numberOfLines={1} style={s.muted}>{g.membros.length} members · {g.membros.map(m=>m.id===myId?'You':m.name).join(', ')}</Text></View>{!!unread.get(`group:${g.id}`)&&<View style={{minWidth:22,padding:4,borderRadius:12,backgroundColor:colors.surfaceHigh}}><Text style={[s.badge,{textAlign:'center'}]}>{unread.get(`group:${g.id}`)}</Text></View>}</Pressable>)}
        <Text style={s.label}>Friends · {accepted.length}</Text>
        {!accepted.length&&!social.loading&&<View style={s.card}><Text style={s.title}>Music is better with company</Text><Text style={s.muted}>Add a friend to share music and start a conversation.</Text><SocialButton onPress={()=>setTab('add')}>Add friend</SocialButton></View>}
        {accepted.map(f=><View key={f.friendId} style={[s.listRow,{borderRadius:8,paddingHorizontal:8},conversation?.kind==='friend'&&conversation.id===f.friendId&&{backgroundColor:colors.surface}]}>
          <Pressable accessibilityLabel={`View ${f.name}`} onPress={()=>onProfile(f.friendId)}><FriendAvatar avatarUrl={f.avatarUrl} name={f.name} size={46}/></Pressable>
          <Pressable accessibilityRole="button" accessibilityState={{selected:conversation?.kind==='friend'&&conversation.id===f.friendId}} style={({pressed,hovered}:any)=>[{flex:1,minWidth:0,gap:3},(pressed||hovered)&&{backgroundColor:colors.surfacePressed}]} onPress={()=>open('friend',f.friendId)}><View style={s.row}><Text numberOfLines={1} style={[s.text,{fontWeight:'700',flex:1}]}>{f.name}</Text>{!!unread.get(f.friendId)&&<Text style={s.badge}>{unread.get(f.friendId)}</Text>}</View><Text numberOfLines={2} style={[s.muted,f.online&&{color:colors.online}]}>{f.online?'● Online now':ultimaAtividade(f.lastSeenAt,social.now)}</Text>{f.currentlyPlaying&&<Text numberOfLines={1} style={s.muted}>♫ {f.currentlyPlaying.title}</Text>}</Pressable>
          <Pressable accessibilityLabel={`Remove ${f.name} from friends`} style={s.iconButton} onPress={()=>setConfirm({id:f.friendId,group:false})}><Ionicons name="person-remove-outline" size={18} color={colors.textSecondary}/></Pressable>
        </View>)}
        {/* Conversas de quem ja nao e amigo. O historico fica de proposito -- uma
          mensagem nao desaparece porque deixaram de ser amigos -- mas tem de
          haver maneira de a arrumar, dai o caixote. */}
        {social.contacts.filter(p=>!accepted.some(f=>f.friendId===p.id)).map(p=><Pressable key={p.id} onPress={()=>open('friend',p.id)} style={[s.listRow]}><FriendAvatar avatarUrl={p.avatar_url} name={p.name} size={42}/><View style={{flex:1}}><Text style={s.text}>{p.name}</Text><Text style={s.muted}>Older messages</Text></View>{!!unread.get(p.id)&&<Text style={s.badge}>{unread.get(p.id)}</Text>}<Pressable accessibilityRole="button" accessibilityLabel={`Delete conversation with ${p.name}`} style={s.iconButton} onPress={()=>setConfirm({id:p.id,group:false,conversa:true})}><Ionicons name="trash-outline" size={18} color={colors.textSecondary}/></Pressable></Pressable>)}
      </>}
    </ScrollView>
  </View>;
  const groupHeader=group?<GroupChatHeader group={group} split={split} onBack={closeChat} onDetails={()=>setGroupDetails(group.id)}/>:undefined;
  const chat=<View style={{flex:1,minHeight:0}}>
      {web&&groupHeader}
      <View style={{flex:1,minHeight:0,padding:web?24:16,gap:12}}>
        {web&&!group&&<View style={s.row}><Text numberOfLines={1} style={[s.title,{flex:1}]}>{title}</Text><SocialIconButton label="Back to chats" icon={split?'close':'chevron-back'} onPress={closeChat}/></View>}
        {friend&&<Pressable accessibilityLabel={`View ${friend.name}`} style={s.row} onPress={()=>onProfile(friend.friendId)}><FriendAvatar avatarUrl={friend.avatarUrl} name={friend.name} size={40}/><View style={{flex:1}}><Text numberOfLines={1} style={s.text}>{friend.name} · View profile</Text><Text style={s.muted}>{friend.online?'● Online now':ultimaAtividade(friend.lastSeenAt,social.now)}</Text>{friend.currentlyPlaying&&<Text numberOfLines={1} style={s.muted}>♫ {friend.currentlyPlaying.title}</Text>}</View></Pressable>}
        {!!error&&<Text style={s.error}>{error}</Text>}{chatLoading&&<ActivityIndicator color={accent}/>}
        {group&&!chatLoading&&!messages.length&&!error?<View style={{flex:1,justifyContent:'center'}}><GroupEmptyState group={group}/></View>:
        <FlatList inverted ListFooterComponent={hasOlder?<SocialButton disabled={older} onPress={()=>void loadOlder()}>{older?'Loading…':'Older messages'}</SocialButton>:null} data={ordered} keyExtractor={m=>m.id} contentContainerStyle={{gap:group?6:12,paddingVertical:10,paddingHorizontal:web?10:0}} style={{flex:1}} keyboardShouldPersistTaps="handled" renderItem={({item:m,index})=>group?<GroupMessage message={m} own={m.sender.id===myId} showSender={!seguida(m,index)} playlist={m.playlistId?playlistsDoChat.get(m.playlistId):undefined}
          reactions={reacoes.get(m.id)??[]} myId={myId} aReagir={aReagir===m.id} onReagir={emoji=>void reagir(m.id,emoji)} onAbrirReacoes={()=>setAReagir(a=>a===m.id?null:m.id)} onFecharReacoes={()=>setAReagir(null)} onProfile={onProfile} onTrack={setTrack} onPlaylist={onPlaylist}/>:<View style={{alignSelf:m.sender.id===myId?'flex-end':'flex-start',maxWidth:'92%',gap:5}}>
          <MessageBubble own={m.sender.id===myId} aberto={aReagir===m.id} onAbrir={()=>setAReagir(a=>a===m.id?null:m.id)}
            rotulo={`Message from ${m.sender.name}. Hold to react`}
            style={{backgroundColor:m.sender.id===myId?colors.surfaceHigh:colors.bg,padding:12,borderRadius:15,gap:8}}>
          {m.sender.id!==myId&&<Pressable onPress={()=>onProfile(m.sender.id)} style={s.row}><FriendAvatar avatarUrl={m.sender.avatarUrl} name={m.sender.name} size={22}/><Text style={s.muted}>{m.sender.name}</Text></Pressable>}
          {!!m.message&&<Text selectable style={s.text}>{m.message}</Text>}
          {m.trackData&&<Pressable style={s.row} onPress={()=>setTrack(m.trackData)}>{m.trackData.artworkUrl&&<Image source={{uri:m.trackData.artworkUrl}} style={{width:44,height:44,borderRadius:8}}/>}<Text numberOfLines={2} style={[s.text,{flexShrink:1}]}>♫ {m.trackData.title}</Text></Pressable>}
          {m.playlistId&&<SharedPlaylistCard playlist={playlistsDoChat.get(m.playlistId)} onPress={()=>onPlaylist(m.playlistId!)}/>}
          <Text style={[s.muted,{fontSize:11}]}>{new Date(m.createdAt).toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'})}</Text>
          </MessageBubble>
          <ReactionRow reactions={reacoes.get(m.id)??[]} myId={myId} own={m.sender.id===myId}
            aberto={aReagir===m.id} onEscolher={emoji=>void reagir(m.id,emoji)} onFechar={()=>setAReagir(null)}/>
        </View>}/>}
        {group?<GroupComposer value={draft} onChange={setDraft} busy={busy} onSend={()=>void send()}/>:
          <View style={s.row}><TextInput accessibilityLabel="Message" placeholder="Write a message…" placeholderTextColor={colors.textSecondary} value={draft} onChangeText={setDraft} multiline maxLength={4000} style={[s.input,{flex:1,maxHeight:90}]} editable={!busy}
            {...({onKeyDown:(e:any)=>{const evento=e?.nativeEvent??e;if(!web||evento?.key!=='Enter'||evento?.shiftKey||evento?.isComposing)return;e.preventDefault?.();evento.preventDefault?.();if(!busy&&draft.trim())void send();}} as any)}/><SocialButton primary disabled={busy||!draft.trim()} onPress={()=>void send()}>Send</SocialButton></View>}
      </View></View>;

  return <View style={s.body} onLayout={e=>setWidth(e.nativeEvent.layout.width)}>
    <View style={{flex:1,minHeight:0,flexDirection:split?'row':'column',paddingHorizontal:web?SOCIAL_GUTTER:24,gap:split?24:0,paddingBottom:web?24:0}}>
      {(!web||split||!conversation)&&<View style={{flex:split?undefined:1,width:split?300:undefined,minHeight:0}}>{list}</View>}
      {web&&(split||!!conversation)&&<View style={{flex:1,minWidth:0,minHeight:0,borderWidth:1,borderColor:colors.borderStrong,borderRadius:14,overflow:'hidden'}}>
        {conversation?chat:<View style={{flex:1,alignItems:'center',justifyContent:'center',padding:24,gap:12}}><Ionicons name="chatbubbles-outline" size={36} color={colors.textSecondary}/><Text style={s.title}>Your conversations</Text><Text style={[s.muted,{textAlign:'center'}]}>Choose a friend or group to open a conversation.</Text></View>}
      </View>}
    </View>
    {!web&&<SocialModal fullScreen visible={!!conversation&&visible&&!track&&!groupEditor&&!confirm&&!detailedGroup} title={title} header={groupHeader} onClose={closeChat}>{chat}</SocialModal>}

    <SocialModal visible={!!detailedGroup&&visible} title="Group details" onClose={()=>setGroupDetails(null)}>
      {detailedGroup&&<GroupDetails group={detailedGroup} myId={myId} onProfile={id=>{setGroupDetails(null);onProfile(id);}}
        onAdd={()=>{setMembers([]);setError('');setGroupEditor(detailedGroup.id);setGroupDetails(null);}}
        onLeave={()=>{setError('');setConfirm({id:detailedGroup.id,group:true});setGroupDetails(null);}}/>}
    </SocialModal>

    <SocialModal visible={!!confirm} title={confirm?.conversa?'Delete conversation?':confirm?.group?'Leave group?':'Remove friend?'} onClose={()=>setConfirm(null)}><View style={{padding:20,gap:12}}><Text style={s.muted}>{confirm?.conversa?'The messages are deleted for good, on both sides. This cannot be undone.':'Earlier messages stay saved.'}</Text><SocialButton danger disabled={busy} onPress={()=>void run(async()=>{if(!confirm)return;if(confirm.conversa)await apagarConversa(confirm.id);else if(confirm.group)await sairDoGrupo(confirm.id);else await declineOrRemoveFriendship(confirm.id);setConfirm(null);useSocial.setState({conversation:null});})}>{confirm?.conversa?'Delete':'Confirm'}</SocialButton><SocialButton quiet onPress={()=>setConfirm(null)}>Cancel</SocialButton></View></SocialModal>
    {/* O mesmo cartao com avatar, nome e @username que a lista de amigos usa.
        Estava aqui uma coluna de botoes centrados com um visto colado ao nome
        -- que nao mostrava quem era a pessoa, nao dizia quantos iam escolhidos,
        e nao se parecia com nada no resto da app. */}
    <SocialModal visible={!!groupEditor} title={groupEditor==='new'?'New group':'Add people'} onClose={()=>setGroupEditor(null)}>
      <ScrollView style={{flexShrink:1}} contentContainerStyle={{padding:20,gap:12}} keyboardShouldPersistTaps="handled">
        {groupEditor==='new'&&<TextInput accessibilityLabel="Group name" value={groupName} onChangeText={setGroupName} maxLength={60} placeholder="Group name" placeholderTextColor={colors.textSecondary} style={s.input}/>}
        {(() => {
          const escolhiveis=accepted.filter(f=>groupEditor==='new'||!social.groups.find(g=>g.id===groupEditor)?.membros.some(m=>m.id===f.friendId));
          if(!escolhiveis.length)return <Text style={s.muted}>{groupEditor==='new'?'Add a friend before you can start a group.':'Everyone you know is already in this group.'}</Text>;
          return <>
            <Text style={s.label}>{members.length?`Selected · ${members.length}`:'Choose who goes in'}</Text>
            {escolhiveis.map(f=>{
              const escolhido=members.includes(f.friendId);
              return <Pressable key={f.friendId} accessibilityRole="checkbox" accessibilityState={{checked:escolhido}} style={[s.card,s.row]} onPress={()=>setMembers(m=>m.includes(f.friendId)?m.filter(id=>id!==f.friendId):[...m,f.friendId])}>
                <FriendAvatar avatarUrl={f.avatarUrl} name={f.name} size={40}/>
                <View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={s.text}>{f.name}</Text><Text numberOfLines={1} style={s.muted}>@{f.username}</Text></View>
                <Ionicons name={escolhido?'checkmark-circle':'ellipse-outline'} size={24} color={escolhido?accent:colors.textSecondary}/>
              </Pressable>;
            })}
          </>;
        })()}
        <SocialButton primary disabled={busy||!members.length||(groupEditor==='new'&&!groupName.trim())} onPress={()=>void run(async()=>{if(groupEditor==='new')await criarGrupo(groupName,members);else if(groupEditor)await acrescentarAoGrupo(groupEditor,members);setGroupEditor(null);})}>{groupEditor==='new'?'Create group':'Add to group'}</SocialButton>
        {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      </ScrollView>
    </SocialModal>
    <SocialTrackActions track={track} onClose={()=>setTrack(null)} onArtist={onArtist}/>
  </View>;
}

function mergeMessages(previous:SharedItem[],incoming:SharedItem[]):SharedItem[]{
  const map=new Map(previous.map(m=>[m.id,m]));incoming.forEach(m=>map.set(m.id,m));
  return [...map.values()].sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)||a.id.localeCompare(b.id));
}
