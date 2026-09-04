import React,{useState} from 'react';
import {ActivityIndicator,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type {Playlist} from '../types';
import {ArtworkCollage} from './ArtworkCollage';
import {SocialButton,SocialModal,socialStyles as s} from './socialUI';
import {colors,radii} from './socialTokens';
import {PROFILE_SHARING_UNAVAILABLE} from '../lib/profileSchema';

export function ProfilePlaylistPicker({playlists,loading,error,busy,onToggle,onClose,onRetry}:{playlists:Playlist[];loading:boolean;error:string;busy:string|null;onToggle:(p:Playlist)=>void;onClose:()=>void;onRetry:()=>void}) {
  const [query,setQuery]=useState('');
  const matches=playlists.filter(p=>p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  // A biblioteca antiga nao tem o interruptor: da para ver as playlists, nao
  // para as marcar. Sem o cinzento a lista parecia so nao responder ao toque.
  const unavailable=playlists.some(p=>p.visibleOnProfile===undefined);
  return <SocialModal visible title="Your playlists" onClose={()=>{if(!busy)onClose();}}>
    <ScrollView style={{flexShrink:1}} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:24,gap:12}}>
      <Text style={s.muted}>Choose the playlists to show to your friends. Removing one here keeps it in your library.</Text>
      <TextInput accessibilityLabel="Find a playlist" value={query} onChangeText={setQuery} placeholder="Search your playlists" placeholderTextColor={colors.textSecondary} style={s.input}/>
      {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {unavailable&&<Text accessibilityRole="alert" style={s.muted}>{PROFILE_SHARING_UNAVAILABLE}</Text>}
      {loading&&!playlists.length?<ActivityIndicator color={colors.text}/>:<>
        {matches.map(p=><Pressable key={p.id} accessibilityRole="checkbox" accessibilityLabel={p.name} aria-checked={!!p.visibleOnProfile} aria-busy={busy===p.id} aria-disabled={!!busy||loading||unavailable} accessibilityState={{checked:!!p.visibleOnProfile,disabled:!!busy||loading||unavailable,busy:busy===p.id}}
          disabled={!!busy||loading||unavailable} onPress={()=>onToggle(p)} style={({pressed,hovered}:any)=>[s.listRow,{minHeight:72,borderRadius:radii.sm,opacity:unavailable?0.4:1},!unavailable&&(pressed||hovered)&&{backgroundColor:colors.surfacePressed}]}>
          <View style={{borderRadius:radii.sm,overflow:'hidden'}}><ArtworkCollage artworks={p.artworks} size={48}/></View>
          <View style={{flex:1,minWidth:0}}><Text numberOfLines={2} style={s.text}>{p.name}</Text><Text style={s.muted}>{p.trackCount} {p.trackCount===1?'track':'tracks'}</Text></View>
          {busy===p.id?<ActivityIndicator color={colors.text}/>:<Ionicons name={p.visibleOnProfile?'checkmark-circle':'ellipse-outline'} size={25} color={p.visibleOnProfile?colors.text:colors.textSecondary}/>}
        </Pressable>)}
        {!matches.length&&!error&&<Text style={s.muted}>{playlists.length?'No matching playlists.':'Create a playlist in your library to share it here.'}</Text>}
      </>}
      {(!!error||unavailable)&&<SocialButton disabled={loading||!!busy} onPress={onRetry}>Try again</SocialButton>}
    </ScrollView>
    <View style={{padding:16,borderTopWidth:1,borderColor:colors.border}}><SocialButton disabled={!!busy} onPress={onClose}>Done</SocialButton></View>
  </SocialModal>;
}
