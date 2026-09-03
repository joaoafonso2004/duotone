import React,{useEffect,useRef,useState} from 'react';
import { ActivityIndicator,FlatList,Image,Pressable,ScrollView,Text,TextInput,View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { acceptFriendRequest,acrescentarAoGrupo,criarGrupo,declineOrRemoveFriendship,getChatMessages,getGroupMessages,sairDoGrupo,searchProfiles,sendFriendRequest,shareComGrupo,shareItem,type SharedItem } from '../api/social';
import type { PublicProfile } from '../api/profiles';
import { useSocial } from '../state/social';
import { useAuth } from '../state/auth';
import { usePlayer } from '../state/player';
import { naoLidasPorAmigo } from '../lib/social';
import { ultimaAtividade } from '../lib/socialPresence';
import { supabase } from '../lib/supabase';
import { FriendAvatar } from './FriendAvatar';
import { colors } from '../theme';
import { SocialButton,SocialModal,socialStyles as s } from './socialUI';
import { SocialTrackActions } from './SocialTrackActions';
import type { Track } from '../types';

export function SocialHub({onProfile,onPlaylist,onArtist,visible=true,initialFriend,initialGroup}:{onProfile:(id:string)=>void;onPlaylist:(id:string)=>void;onArtist:(name:string)=>void;visible?:boolean;initialFriend?:string;initialGroup?:string}) {
  const social=useSocial(),myId=useAuth(x=>x.session?.user.id);
  const [tab,setTab]=useState<'friends'|'add'>('friends'),[query,setQuery]=useState(''),[results,setResults]=useState<PublicProfile[]>([]);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[messages,setMessages]=useState<SharedItem[]>([]),[chatLoading,setChatLoading]=useState(false);
  const [older,setOlder]=useState(false),[hasOlder,setHasOlder]=useState(false);
  const [track,setTrack]=useState<Track|null>(null),[confirm,setConfirm]=useState<{id:string;group:boolean}|null>(null);
  const [groupEditor,setGroupEditor]=useState<string|null>(null),[groupName,setGroupName]=useState(''),[members,setMembers]=useState<string[]>([]);
  const conversation=social.conversation;
  const contact=conversation?.kind==='friend'?social.contacts.find(c=>c.id===conversation.id):null;
  const friend=conversation?.kind==='friend'?social.friends.find(f=>f.friendId===conversation.id) || (contact?{friendId:contact.id,name:contact.name,avatarUrl:contact.avatar_url,online:false,lastSeenAt:null,currentlyPlaying:null}:null):null;
  const group=conversation?.kind==='group'?social.groups.find(g=>g.id===conversation.id):null;
  const key=conversation?(conversation.kind==='group'?`group:${conversation.id}`:conversation.id):'';
  const draft=social.drafts[key] || '';
  const unread=naoLidasPorAmigo(social.received,social.seen);
  const setDraft=(text:string)=>useSocial.setState(x=>({drafts:{...x.drafts,[key]:text}}));
  const open=(kind:'friend'|'group',id:string)=>useSocial.setState({conversation:{kind,id}});
  const run=async(action:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);setError('');try{await action();await social.refresh();}catch(e:any){setError(e.message || 'That did not go through.');}finally{setBusy(false);}};
  useEffect(()=>{if(initialFriend)open('friend',initialFriend);else if(initialGroup)open('group',initialGroup);},[initialFriend,initialGroup]);
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
    void load();const timer=setInterval(()=>void load(),6000);
    const channel=supabase.channel(`chat:${key}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'shared_items'},()=>void load()).subscribe();
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
  const accepted=social.friends.filter(f=>f.status==='accepted');
  const pending=social.friends.filter(f=>f.status==='pending');
  const title=friend?.name || group?.name || 'Chat';
  return <View style={s.body}>
    <View style={[s.row,{paddingHorizontal:24,paddingBottom:8}]}><SocialButton onPress={()=>setTab('friends')}>Chats</SocialButton><SocialButton quiet onPress={()=>setTab('add')}>Find people</SocialButton><Pressable accessibilityLabel="Refresh" onPress={()=>void social.refresh()}><Ionicons name="refresh" size={20} color={colors.textSecondary}/></Pressable></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      {(error||social.error)&&<Text accessibilityRole="alert" style={s.error}>{error||social.error}</Text>}
      {social.loading&&<ActivityIndicator color={colors.accent}/>}
      {tab==='add'?<>
        <Text style={s.title}>Encontra a tua companhia musical</Text><Text style={s.muted}>Pesquisa pelo nome ou username.</Text>
        <TextInput accessibilityLabel="Search people" value={query} onChangeText={setQuery} style={s.input} placeholder="Name or username" placeholderTextColor={colors.textSecondary} autoCapitalize="none"/>
        {results.map(p=><View key={p.id} style={[s.card,s.row]}><Pressable onPress={()=>onProfile(p.id)}><FriendAvatar avatarUrl={p.avatar_url} name={p.name} size={44}/></Pressable><View style={{flex:1}}><Text style={s.text}>{p.name}</Text><Text style={s.muted}>@{p.username}</Text></View><SocialButton disabled={busy||social.friends.some(f=>f.friendId===p.id)} onPress={()=>void run(()=>sendFriendRequest(p.id))}>{social.friends.some(f=>f.friendId===p.id)?'Adicionado':'Add'}</SocialButton></View>)}
      </>:<>
        {pending.length>0&&<Text style={s.label}>Pedidos de amizade</Text>}
        {pending.map(f=><View key={f.friendId} style={s.card}><View style={s.row}><FriendAvatar avatarUrl={f.avatarUrl} name={f.name} size={40}/><View style={{flex:1}}><Text style={s.text}>{f.name}</Text><Text style={s.muted}>{f.isSender?'Request sent':'Wants to be your friend'}</Text></View></View><View style={s.row}>{!f.isSender&&<SocialButton disabled={busy} onPress={()=>void run(()=>acceptFriendRequest(f.friendId))}>Accept</SocialButton>}<SocialButton quiet disabled={busy} onPress={()=>void run(()=>declineOrRemoveFriendship(f.friendId))}>{f.isSender?'Cancel request':'Decline'}</SocialButton></View></View>)}
        <View style={[s.row,{justifyContent:'space-between'}]}><Text style={s.label}>Groups</Text><SocialButton quiet onPress={()=>{setGroupEditor('new');setMembers([]);setGroupName('');}}>+ New group</SocialButton></View>
        {social.groups.map(g=><Pressable key={g.id} style={[s.card,s.row]} onPress={()=>open('group',g.id)}><Ionicons name="people" size={28} color={colors.accent}/><View style={{flex:1}}><Text style={s.text}>{g.name}</Text><Text numberOfLines={1} style={s.muted}>{g.membros.map(m=>m.name).join(', ')}</Text></View>{!!unread.get(`group:${g.id}`)&&<Text style={s.badge}>{unread.get(`group:${g.id}`)}</Text>}</Pressable>)}
        <Text style={s.label}>Friends · {accepted.length}</Text>
        {!accepted.length&&!social.loading&&<View style={s.card}><Text style={s.title}>Music is better with company</Text><Text style={s.muted}>Add a friend to share music and start a conversation.</Text><SocialButton onPress={()=>setTab('add')}>Add friend</SocialButton></View>}
        {accepted.map(f=><View key={f.friendId} style={[s.card,s.row]}>
          <Pressable accessibilityLabel={`View ${f.name}`} onPress={()=>onProfile(f.friendId)}><FriendAvatar avatarUrl={f.avatarUrl} name={f.name} size={46}/></Pressable>
          <Pressable style={{flex:1,gap:3}} onPress={()=>open('friend',f.friendId)}><View style={s.row}><Text style={[s.text,{fontWeight:'700',flex:1}]}>{f.name}</Text>{!!unread.get(f.friendId)&&<Text style={s.badge}>{unread.get(f.friendId)}</Text>}</View><Text numberOfLines={2} style={[s.muted,f.online&&{color:colors.online}]}>{f.online?'● Online now':ultimaAtividade(f.lastSeenAt,social.now)}</Text>{f.currentlyPlaying&&<Text numberOfLines={1} style={s.muted}>♫ {f.currentlyPlaying.title}</Text>}</Pressable>
          <Pressable accessibilityLabel={`Remove ${f.name} from friends`} hitSlop={12} onPress={()=>setConfirm({id:f.friendId,group:false})}><Ionicons name="person-remove-outline" size={18} color={colors.textSecondary}/></Pressable>
        </View>)}
        {social.contacts.filter(p=>!accepted.some(f=>f.friendId===p.id)).map(p=><Pressable key={p.id} onPress={()=>open('friend',p.id)} style={[s.card,s.row]}><FriendAvatar avatarUrl={p.avatar_url} name={p.name} size={42}/><View style={{flex:1}}><Text style={s.text}>{p.name}</Text><Text style={s.muted}>Older messages</Text></View>{!!unread.get(p.id)&&<Text style={s.badge}>{unread.get(p.id)}</Text>}</Pressable>)}
      </>}
    </ScrollView>
    <SocialModal visible={!!conversation&&visible&&!track&&!groupEditor&&!confirm} title={title} onClose={()=>useSocial.setState({conversation:null})}>
      <View style={{height:480,flexShrink:1,padding:16,gap:12}}>
        {friend&&<Pressable accessibilityLabel={`View ${friend.name}`} style={s.row} onPress={()=>onProfile(friend.friendId)}><FriendAvatar avatarUrl={friend.avatarUrl} name={friend.name} size={40}/><View style={{flex:1}}><Text style={s.text}>{friend.name} · Ver perfil</Text><Text style={s.muted}>{friend.online?'● Online now':ultimaAtividade(friend.lastSeenAt,social.now)}</Text>{friend.currentlyPlaying&&<Text numberOfLines={1} style={s.muted}>♫ {friend.currentlyPlaying.title}</Text>}</View></Pressable>}
        {group&&<View style={s.row}><SocialButton quiet onPress={()=>{setMembers([]);setGroupEditor(group.id);}}>Add people</SocialButton><SocialButton quiet onPress={()=>setConfirm({id:group.id,group:true})}>Leave group</SocialButton></View>}
        {!!error&&<Text style={s.error}>{error}</Text>}{chatLoading&&<ActivityIndicator color={colors.accent}/>}
        <FlatList inverted ListFooterComponent={hasOlder?<SocialButton disabled={older} onPress={()=>void loadOlder()}>{older?'Loading…':'Mensagens anteriores'}</SocialButton>:null} data={[...messages].reverse()} keyExtractor={m=>m.id} contentContainerStyle={{gap:12,paddingVertical:10}} style={{flex:1}} keyboardShouldPersistTaps="handled" renderItem={({item:m})=><View style={{alignSelf:m.sender.id===myId?'flex-end':'flex-start',maxWidth:'92%',backgroundColor:m.sender.id===myId?colors.surfaceHigh:colors.surface,padding:12,borderRadius:15,gap:8}}>
          {m.sender.id!==myId&&<Pressable onPress={()=>onProfile(m.sender.id)} style={s.row}><FriendAvatar avatarUrl={m.sender.avatarUrl} name={m.sender.name} size={22}/><Text style={s.muted}>{m.sender.name}</Text></Pressable>}
          {!!m.message&&<Text selectable style={s.text}>{m.message}</Text>}
          {m.trackData&&<Pressable style={s.row} onPress={()=>setTrack(m.trackData)}>{m.trackData.artworkUrl&&<Image source={{uri:m.trackData.artworkUrl}} style={{width:44,height:44,borderRadius:8}}/>}<Text numberOfLines={2} style={[s.text,{flexShrink:1}]}>♫ {m.trackData.title}</Text></Pressable>}
          {m.playlistId&&<SocialButton quiet onPress={()=>onPlaylist(m.playlistId!)}>Open playlist</SocialButton>}
          <Text style={[s.muted,{fontSize:10}]}>{new Date(m.createdAt).toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'})}</Text>
        </View>}/>
        <View style={s.row}><TextInput accessibilityLabel="Mensagem" placeholder="Write a message…" placeholderTextColor={colors.textSecondary} value={draft} onChangeText={setDraft} multiline maxLength={4000} style={[s.input,{flex:1,maxHeight:90}]} editable={!busy}/><SocialButton disabled={busy||!draft.trim()} onPress={()=>void send()}>Send</SocialButton></View>
      </View>
    </SocialModal>
    <SocialModal visible={!!confirm} title={confirm?.group?'Sair do grupo?':'Remove friend?'} onClose={()=>setConfirm(null)}><View style={{padding:20,gap:12}}><Text style={s.muted}>As mensagens anteriores continuam guardadas.</Text><SocialButton disabled={busy} onPress={()=>void run(async()=>{if(!confirm)return;if(confirm.group)await sairDoGrupo(confirm.id);else await declineOrRemoveFriendship(confirm.id);setConfirm(null);useSocial.setState({conversation:null});})}>Confirmar</SocialButton><SocialButton quiet onPress={()=>setConfirm(null)}>Cancel</SocialButton></View></SocialModal>
    <SocialModal visible={!!groupEditor} title={groupEditor==='new'?'New group':'Add people'} onClose={()=>setGroupEditor(null)}><ScrollView contentContainerStyle={{padding:20,gap:12}}>{groupEditor==='new'&&<TextInput accessibilityLabel="Nome do grupo" value={groupName} onChangeText={setGroupName} placeholder="Nome do grupo" placeholderTextColor={colors.textSecondary} style={s.input}/>}{accepted.filter(f=>groupEditor==='new'||!social.groups.find(g=>g.id===groupEditor)?.membros.some(m=>m.id===f.friendId)).map(f=><SocialButton key={f.friendId} onPress={()=>setMembers(m=>m.includes(f.friendId)?m.filter(id=>id!==f.friendId):[...m,f.friendId])}>{members.includes(f.friendId)?'✓ ':''}{f.name}</SocialButton>)}<SocialButton disabled={busy||!members.length||(groupEditor==='new'&&!groupName.trim())} onPress={()=>void run(async()=>{if(groupEditor==='new')await criarGrupo(groupName,members);else if(groupEditor)await acrescentarAoGrupo(groupEditor,members);setGroupEditor(null);})}>Save</SocialButton>{!!error&&<Text style={s.error}>{error}</Text>}</ScrollView></SocialModal>
    <SocialTrackActions track={track} onClose={()=>setTrack(null)} onArtist={onArtist}/>
  </View>;
}

function mergeMessages(previous:SharedItem[],incoming:SharedItem[]):SharedItem[]{
  const map=new Map(previous.map(m=>[m.id,m]));incoming.forEach(m=>map.set(m.id,m));
  return [...map.values()].sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)||a.id.localeCompare(b.id));
}
