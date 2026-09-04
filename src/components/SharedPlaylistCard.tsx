import React from 'react';
import {Pressable,Text,View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type {Playlist} from '../types';
import {ArtworkCollage} from './ArtworkCollage';
import {colors,radii} from './socialTokens';
import {socialStyles as s} from './socialUI';

/**
 * A playlist partilhada, com a mesma forma do cartão da música: capa à
 * esquerda, nome e contagem no meio, seta à direita.
 *
 * Sem `playlist` (ainda a carregar, ou já não partilhada) fica só o texto —
 * nunca um cartão vazio a fingir que há alguma coisa.
 */
export function SharedPlaylistCard({playlist,onPress}:{playlist?:Playlist;onPress:()=>void}) {
  return <Pressable accessibilityRole="button"
    accessibilityLabel={playlist?`Open playlist ${playlist.name}, ${playlist.trackCount} ${playlist.trackCount===1?'track':'tracks'}`:'Open playlist'}
    onPress={onPress} style={({pressed})=>[s.row,{padding:10,gap:10,minWidth:190,borderRadius:12,backgroundColor:colors.bg,opacity:pressed?0.7:1}]}>
    {playlist?.artworks?.length
      ? <View style={{borderRadius:radii.sm,overflow:'hidden'}}><ArtworkCollage artworks={playlist.artworks} size={48}/></View>
      : <View style={{width:48,height:48,borderRadius:radii.sm,backgroundColor:colors.surfaceHigh,alignItems:'center',justifyContent:'center'}}>
          <Ionicons name="albums-outline" size={22} color={colors.textSecondary}/>
        </View>}
    <View style={{flex:1,minWidth:0,gap:3}}>
      <Text numberOfLines={2} style={[s.text,{fontWeight:'600'}]}>{playlist?.name ?? 'Playlist'}</Text>
      <Text numberOfLines={1} style={s.muted}>
        {playlist ? `${playlist.trackCount} ${playlist.trackCount===1?'track':'tracks'}` : 'Open playlist'}
      </Text>
    </View>
    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary}/>
  </Pressable>;
}
