import React,{useState} from 'react';
import { View,Text } from 'react-native';
import type { Track } from '../types';
import { usePlayer } from '../state/player';
import { useSaved } from '../state/saved';
import { checkIsSaved,saveToLibrary,removeFromLibrary } from '../api/library';
import { ShareFriendSheet } from './ShareFriendSheet';
import { AddToPlaylistSheet } from './AddToPlaylistSheet';
import { SocialButton,SocialModal,socialStyles as s } from './socialUI';
import { displayArtist } from '../lib/artistName';

export function SocialTrackActions({track,onClose,onArtist}:{track:Track|null;onClose:()=>void;onArtist:(name:string)=>void}) {
  const [share,setShare]=useState(false),[playlist,setPlaylist]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const save=async()=>{
    if(!track||busy)return;setBusy(true);setError('');
    try {const saved=await checkIsSaved(track.source,track.sourceId);if(saved.saved&&saved.trackId)await removeFromLibrary(saved.trackId);else await saveToLibrary(track);useSaved.getState().markSaved(track,!saved.saved);onClose();}catch(e:any){setError(e.message);}finally{setBusy(false);}
  };
  return <><SocialModal visible={!!track&&!share&&!playlist} title={track?.title || 'Música'} onClose={onClose}><View style={{padding:20,gap:8}}>
    <SocialButton onPress={()=>{if(track)usePlayer.getState().playTrack(track);onClose();}}>Tocar agora</SocialButton>
    <SocialButton onPress={()=>{if(track)usePlayer.getState().playNext(track);onClose();}}>Tocar a seguir</SocialButton>
    <SocialButton onPress={()=>{if(track)usePlayer.getState().addToQueue(track);onClose();}}>Adicionar à fila</SocialButton>
    <SocialButton disabled={busy} onPress={()=>void save()}>Guardar / retirar da minha biblioteca</SocialButton>
    <SocialButton onPress={()=>setPlaylist(true)}>Adicionar à minha playlist</SocialButton>
    <SocialButton onPress={()=>setShare(true)}>Partilhar</SocialButton>
    <SocialButton onPress={()=>{if(track)onArtist(displayArtist(track));onClose();}}>Ver artista</SocialButton>
    {!!error&&<Text style={s.error}>{error}</Text>}
  </View></SocialModal><ShareFriendSheet visible={share} itemType="track" item={track} onClose={()=>{setShare(false);onClose();}}/><AddToPlaylistSheet visible={playlist} track={track} onClose={()=>{setPlaylist(false);onClose();}}/></>;
}
