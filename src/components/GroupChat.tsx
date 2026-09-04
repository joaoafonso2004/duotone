import React from 'react';
import {ActivityIndicator,Image,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {LinearGradient} from 'expo-linear-gradient';
import type {ChatGroup,Reaction,SharedItem} from '../api/social';
import type {Playlist,Track} from '../types';
import {useTheme} from '../state/theme';
import {displayArtist} from '../lib/artistName';
import {FriendAvatar} from './FriendAvatar';
import {colors,radii} from './socialTokens';
import {SocialButton,SocialIconButton,socialStyles as s} from './socialUI';
import {SharedPlaylistCard} from './SharedPlaylistCard';
import {MessageBubble,ReactionRow} from './ReactionRow';

/** A identidade do grupo vem dos seus membros, incluindo os avatares de emoji. */
export function GroupAvatar({group,size=44}:{group:ChatGroup;size?:number}) {
  const members=group.membros.slice(0,2);
  return <View accessible={false} style={{width:size,height:size,flexShrink:0}}>
    {members.length>1?members.map((member,index)=><View key={member.id} style={{position:'absolute',
      left:index===0?0:undefined,right:index===1?0:undefined,top:index===0?0:undefined,bottom:index===1?0:undefined,
      padding:2,borderRadius:size,backgroundColor:colors.bg}}>
      <FriendAvatar avatarUrl={member.avatarUrl} name={member.name} size={size*0.64}/>
    </View>):<View style={{width:size,height:size,borderRadius:size/2,backgroundColor:colors.surfaceHigh,alignItems:'center',justifyContent:'center'}}>
      <Ionicons name="people-outline" size={size*0.5} color={colors.textSecondary}/>
    </View>}
  </View>;
}

export function GroupChatHeader({group,onBack,onDetails,split=false}:{group:ChatGroup;onBack:()=>void;onDetails:()=>void;split?:boolean}) {
  return <View style={[s.row,{paddingHorizontal:12,paddingVertical:10,gap:8,borderBottomWidth:1,borderColor:colors.border}]}>
    {!split&&<SocialIconButton label="Back to chats" icon="chevron-back" onPress={onBack}/>}
    <Pressable accessibilityRole="button" accessibilityLabel={`${group.name}, ${group.membros.length} members. View group details`}
      onPress={onDetails} style={({pressed})=>[s.row,{flex:1,minWidth:0,gap:12,opacity:pressed?0.7:1}]}>
      <GroupAvatar group={group}/>
      <View style={{flex:1,minWidth:0,gap:2}}>
        <Text numberOfLines={1} style={[s.title,{fontSize:18}]}>{group.name}</Text>
        <Text numberOfLines={1} style={s.muted}>{group.membros.length} {group.membros.length===1?'member':'members'} · View details</Text>
      </View>
    </Pressable>
    <SocialIconButton label="Group details" icon="ellipsis-horizontal" onPress={onDetails}/>
    {split&&<SocialIconButton label="Close conversation" icon="close" onPress={onBack}/>}
  </View>;
}

export function GroupDetails({group,myId,onProfile,onAdd,onLeave}:{group:ChatGroup;myId?:string;onProfile:(id:string)=>void;onAdd:()=>void;onLeave:()=>void}) {
  return <ScrollView style={{flexShrink:1}} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:24,gap:24}}>
    <View style={{alignItems:'center',gap:12}}>
      <GroupAvatar group={group} size={72}/>
      <Text style={[s.title,{textAlign:'center'}]}>{group.name}</Text>
      <Text style={s.muted}>{group.membros.length} {group.membros.length===1?'member':'members'}</Text>
    </View>
    <SocialButton icon="person-add-outline" onPress={onAdd}>Add people</SocialButton>
    <View>
      <Text style={[s.label,{marginBottom:8}]}>Members</Text>
      {group.membros.map(member=><Pressable key={member.id} accessibilityRole="button" accessibilityLabel={`View ${member.name}'s profile`}
        onPress={()=>onProfile(member.id)} style={({pressed,hovered}:any)=>[s.listRow,{gap:12},(pressed||hovered)&&{backgroundColor:colors.surfacePressed}]}>
        <FriendAvatar avatarUrl={member.avatarUrl} name={member.name} size={42}/>
        <View style={{flex:1,minWidth:0,gap:2}}>
          <Text numberOfLines={1} style={[s.text,{fontWeight:'600'}]}>{member.name}{member.id===myId?' · You':''}</Text>
          <Text numberOfLines={1} style={s.muted}>{member.username?`@${member.username}`:'Member'}{member.id===group.createdBy?' · Creator':''}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary}/>
      </Pressable>)}
    </View>
    <SocialButton quiet danger icon="exit-outline" onPress={onLeave}>Leave group</SocialButton>
  </ScrollView>;
}

export function GroupEmptyState({group}:{group:ChatGroup}) {
  return <View style={{alignItems:'center',paddingHorizontal:28,paddingVertical:40,gap:14}}>
    <GroupAvatar group={group} size={72}/>
    <Text style={[s.title,{fontSize:22,textAlign:'center'}]}>Start the conversation</Text>
    <Text style={[s.muted,{textAlign:'center',maxWidth:280}]}>Say hello or share a song with the group.</Text>
  </View>;
}

/**
 * O remetente aparece também nas mensagens próprias e nas partilhas sem texto,
 * mas desaparece quando a mesma pessoa fala de seguida: repetir o avatar e o
 * nome em cada linha era o que fazia o grupo parecer uma lista de recibos.
 */
export function GroupMessage({message:m,own,showSender=true,playlist,reactions=[],myId,aReagir=false,onReagir,onAbrirReacoes,onFecharReacoes,onProfile,onTrack,onPlaylist}:{message:SharedItem;own:boolean;showSender?:boolean;playlist?:Playlist;
  reactions?:Reaction[];myId?:string;aReagir?:boolean;
  onReagir?:(emoji:string|null)=>void;onAbrirReacoes?:()=>void;onFecharReacoes?:()=>void;
  onProfile:(id:string)=>void;onTrack:(track:Track)=>void;onPlaylist:(id:string)=>void}) {
  return <View style={{alignSelf:own?'flex-end':'flex-start',maxWidth:Platform.OS==='web'?'82%':'94%',minWidth:128,gap:6,marginTop:showSender?12:0}}>
    {showSender&&<Pressable accessibilityRole="button" accessibilityLabel={`View ${m.sender.name}'s profile`} onPress={()=>onProfile(m.sender.id)}
      style={({pressed})=>[s.row,{gap:7,alignSelf:own?'flex-end':'flex-start',maxWidth:'100%',minHeight:36,opacity:pressed?0.7:1}]}>
      <FriendAvatar avatarUrl={m.sender.avatarUrl} name={m.sender.name} size={26}/>
      <Text numberOfLines={1} style={[s.muted,{fontWeight:'600',color:colors.text,flexShrink:1}]}>{m.sender.name}</Text>
      {own&&<Text style={[s.muted,{fontSize:11}]}>You</Text>}
    </Pressable>}
    <MessageBubble own={own} aberto={aReagir} onAbrir={()=>onAbrirReacoes?.()}
      rotulo={`Message from ${m.sender.name}. Hold to react`}
      style={{padding:12,gap:10,borderRadius:18,borderTopLeftRadius:!own&&showSender?6:18,borderTopRightRadius:own&&showSender?6:18,
        backgroundColor:own?colors.surfaceHigh:colors.surface,borderWidth:1,borderColor:own?colors.borderStrong:colors.border}}>
      {!!m.message&&<Text selectable style={[s.text,{lineHeight:22}]}>{m.message}</Text>}
      {m.trackData&&<Pressable accessibilityRole="button" accessibilityLabel={`Open ${m.trackData.title}`}
        onPress={()=>onTrack(m.trackData!)} style={({pressed})=>[s.row,{padding:10,gap:10,minWidth:190,borderRadius:12,backgroundColor:colors.bg,opacity:pressed?0.7:1}]}>
        {m.trackData.artworkUrl?<Image source={{uri:m.trackData.artworkUrl}} style={{width:48,height:48,borderRadius:8}}/>:
          <View style={{width:48,height:48,borderRadius:8,backgroundColor:colors.surfaceHigh,alignItems:'center',justifyContent:'center'}}><Ionicons name="musical-notes-outline" size={22} color={colors.textSecondary}/></View>}
        <View style={{flex:1,minWidth:0,gap:3}}><Text numberOfLines={2} style={[s.text,{fontWeight:'600'}]}>{m.trackData.title}</Text><Text numberOfLines={1} style={s.muted}>{displayArtist(m.trackData)}</Text></View>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary}/>
      </Pressable>}
      {m.playlistId&&<SharedPlaylistCard playlist={playlist} onPress={()=>onPlaylist(m.playlistId!)}/>}
      <Text style={[s.muted,{fontSize:10,lineHeight:13,alignSelf:'flex-end'}]}>{new Date(m.createdAt).toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'})}</Text>
    </MessageBubble>
    <ReactionRow reactions={reactions} myId={myId} own={own} aberto={aReagir}
      onEscolher={emoji=>onReagir?.(emoji)} onFechar={()=>onFecharReacoes?.()}/>
  </View>;
}

export function GroupComposer({value,onChange,onSend,busy}:{value:string;onChange:(text:string)=>void;onSend:()=>void;busy:boolean}) {
  const theme=useTheme(s=>s.theme),web=Platform.OS==='web',disabled=busy||!value.trim();
  return <View style={[s.row,{alignItems:'flex-end',gap:8,padding:6,borderRadius:web?radii.lg:28,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.borderStrong}]}>
    <TextInput accessibilityLabel="Message" placeholder="Message the group…" placeholderTextColor={colors.textSecondary}
      value={value} onChangeText={onChange} multiline numberOfLines={1} maxLength={4000} editable={!busy}
      style={[s.text,{flex:1,minWidth:0,minHeight:44,maxHeight:110,paddingHorizontal:12,paddingVertical:12}]}/>
    <Pressable accessibilityRole="button" accessibilityLabel="Send message" accessibilityState={{disabled,busy}} disabled={disabled} onPress={onSend}
      style={({pressed})=>({width:44,height:44,borderRadius:22,overflow:'hidden',alignItems:'center',justifyContent:'center',
        backgroundColor:disabled?colors.surfaceHigh:web?colors.accent:theme.color,opacity:pressed?0.7:1})}>
      {!web&&!disabled&&<LinearGradient colors={theme.gradient} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill}/>}
      {busy?<ActivityIndicator size="small" color={colors.textSecondary}/>:<Ionicons name="arrow-up" size={23} color={disabled?colors.textSecondary:web?colors.bg:theme.textColorOnGradient}/>}
    </Pressable>
  </View>;
}
