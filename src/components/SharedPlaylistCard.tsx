import React from 'react';
import {Pressable,Text,View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type {Playlist} from '../types';
import {legendaDoAlbumPartilhado,type AlbumPartilhado} from '../lib/albumPartilhado';
import {legendaDoPreset,type PresetPartilhado} from '../lib/presetPartilhado';
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
export function SharedPlaylistCard({playlist,onPress,semFundo=false}:{playlist?:Playlist;onPress:()=>void;
  /** Dentro de um balão (9/10): o balão já é o cartão, sem caixa dentro de caixa. */
  semFundo?:boolean}) {
  return <Pressable accessibilityRole="button"
    accessibilityLabel={playlist?`Open playlist ${playlist.name}, ${playlist.trackCount} ${playlist.trackCount===1?'track':'tracks'}`:'Open playlist'}
    onPress={onPress} style={({pressed})=>[s.row,{padding:semFundo?0:10,gap:10,minWidth:semFundo?230:190,borderRadius:12,backgroundColor:semFundo?'transparent':colors.bg,opacity:pressed?0.7:1}]}>
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

/**
 * Um álbum partilhado (16/11, supabase/partilhar-albuns.sql), com a mesma forma:
 * a capa, o nome e "Artista · ano". Abre o álbum, como na página do artista.
 */
export function SharedAlbumCard({album,onPress,semFundo=false}:{album:AlbumPartilhado;onPress:()=>void;semFundo?:boolean}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${album.titulo}, ${legendaDoAlbumPartilhado(album)}`}
    onPress={onPress} style={({pressed})=>[s.row,{padding:semFundo?0:10,gap:10,minWidth:semFundo?230:190,borderRadius:12,backgroundColor:semFundo?'transparent':colors.bg,opacity:pressed?0.7:1}]}>
    {album.capa
      ? <View style={{borderRadius:radii.sm,overflow:'hidden'}}><ArtworkCollage artworks={[album.capa]} size={48}/></View>
      : <View style={{width:48,height:48,borderRadius:radii.sm,backgroundColor:colors.surfaceHigh,alignItems:'center',justifyContent:'center'}}>
          <Ionicons name="disc-outline" size={22} color={colors.textSecondary}/>
        </View>}
    <View style={{flex:1,minWidth:0,gap:3}}>
      <Text numberOfLines={2} style={[s.text,{fontWeight:'600'}]}>{album.titulo}</Text>
      <Text numberOfLines={1} style={s.muted}>{legendaDoAlbumPartilhado(album)}</Text>
    </View>
    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary}/>
  </Pressable>;
}

/**
 * Um preset da Customise mandado por um amigo (28/11, supabase/partilhar-presets.sql),
 * com a forma dos outros cartões: o quadrado (a varinha, nas duas cores da app), o
 * nome e o que ele muda numa linha. Abre a folha com a prévia, o "Use" e o "Save".
 */
export function SharedPresetCard({preset,onPress,semFundo=false}:{preset:PresetPartilhado;onPress:()=>void;semFundo?:boolean}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${preset.nome} preset, ${legendaDoPreset(preset)}`}
    onPress={onPress} style={({pressed})=>[s.row,{padding:semFundo?0:10,gap:10,minWidth:semFundo?230:190,borderRadius:12,backgroundColor:semFundo?'transparent':colors.bg,opacity:pressed?0.7:1}]}>
    <View style={{width:48,height:48,borderRadius:radii.sm,borderCurve:'continuous',backgroundColor:colors.surfaceHigh,alignItems:'center',justifyContent:'center'}}>
      <Ionicons name="color-wand-outline" size={22} color={colors.text}/>
    </View>
    <View style={{flex:1,minWidth:0,gap:3}}>
      <Text numberOfLines={1} style={[s.text,{fontWeight:'600'}]}>{preset.nome}</Text>
      <Text numberOfLines={2} style={s.muted}>{legendaDoPreset(preset)}</Text>
    </View>
    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary}/>
  </Pressable>;
}
