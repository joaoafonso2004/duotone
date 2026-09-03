import React,{useEffect,useState} from 'react';
import { ActivityIndicator,Text,TextInput,View } from 'react-native';
import { getLibrary } from '../api/library';
import type { ProfileHighlights } from '../api/profiles';
import type { Playlist,Track } from '../types';
import { displayArtist } from '../lib/artistName';
import { SocialButton,socialStyles as s } from './socialUI';
import { colors } from './socialTokens';

export function ProfileHighlightsEditor({value,onChange,playlists,disabled}:{value:ProfileHighlights;onChange:(v:ProfileHighlights)=>void;playlists:Playlist[];disabled:boolean}) {
  const [tracks,setTracks]=useState<Track[]>([]),[query,setQuery]=useState('');
  const [choosing,setChoosing]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    if(!choosing)return;
    let active=true;setLoading(true);setError('');
    getLibrary().then(t=>{if(active)setTracks(t);}).catch(()=>{if(active)setError('Could not load your songs. Close and try again.');}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[choosing]);
  const visible=playlists.filter(p=>p.visibleOnProfile);
  const matches=tracks.filter(t=>t.id&&`${t.title} ${displayArtist(t)}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <View style={{gap:12}}>
    <Text style={s.title}>Your highlights</Text>
    <Text style={s.muted}>Choose up to three playlists, in the order you want them to appear. Only playlists visible to friends can be featured.</Text>
    {visible.length===0&&<Text style={s.muted}>Show a playlist on your profile first to feature it here.</Text>}
    {visible.map(p=>{const index=value.playlistIds.indexOf(p.id);return <SocialButton key={p.id} icon={index>=0?'checkmark-circle':'add-circle-outline'}
      disabled={disabled||(index<0&&value.playlistIds.length>=3)} onPress={()=>onChange({...value,playlistIds:index>=0?value.playlistIds.filter(id=>id!==p.id):[...value.playlistIds,p.id]})}>
      {index>=0?`${index+1}. `:''}{p.name}
    </SocialButton>;})}
    <Text style={s.label}>Song of the moment</Text>
    <Text style={s.muted}>A song you choose for your friends to discover on your profile.</Text>
    {value.moment&&<Text style={s.text}>{value.moment.title} · {displayArtist(value.moment)}</Text>}
    <View style={[s.row,{flexWrap:'wrap'}]}>
      <SocialButton disabled={disabled} onPress={()=>setChoosing(!choosing)}>{choosing?'Close song picker':value.moment?'Change song':'Choose from your library'}</SocialButton>
      {value.moment&&<SocialButton quiet disabled={disabled} onPress={()=>onChange({...value,moment:null})}>Remove song</SocialButton>}
    </View>
    {choosing&&<View style={{gap:8}}>
      <TextInput accessibilityLabel="Find a song for your profile" editable={!disabled} style={s.input} value={query} onChangeText={setQuery} placeholder="Search your songs" placeholderTextColor={colors.textSecondary}/>
      {loading?<ActivityIndicator color={colors.text}/>:error?<Text style={s.error}>{error}</Text>:<>
        {matches.slice(0,8).map(t=><SocialButton quiet key={t.id} disabled={disabled} onPress={()=>{onChange({...value,moment:t});setChoosing(false);}}>{t.title} · {displayArtist(t)}</SocialButton>)}
        {!matches.length&&<Text style={s.muted}>No matching songs in your library.</Text>}
        {matches.length>8&&<Text style={s.muted}>Type a name to narrow down your songs.</Text>}
      </>}
    </View>}
  </View>;
}
