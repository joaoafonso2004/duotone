import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddToPlaylistSheet } from '../components/AddToPlaylistSheet';
import { EmptyState } from '../components/EmptyState';
import { Input } from '../components/Input';
import { OfflineNotice } from '../components/OfflineNotice';
import { Screen } from '../components/Screen';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { TrackRow } from '../components/TrackRow';
import { useOfflineMode } from '../hooks/useOfflineMode';
import { useSmartCollectionsData } from '../hooks/useSmartCollections';
import { displayArtist } from '../lib/artistName';
import {
  activeSmartFilterCount, applySmartCollectionFilters, EMPTY_SMART_FILTERS,
  smartCollectionTemplates, type DurationRule, type ListeningRule,
  type SavedRule, type SmartCollectionFilters,
} from '../lib/smartCollections';
import { isAudioCached, useAudioCache } from '../lib/youtubeCache';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';
import { colors, MINI_PLAYER_HEIGHT, radii, spacing, type } from '../theme';
import type { Track } from '../types';

function Chip({label,selected,onPress}:{label:string;selected:boolean;onPress:()=>void}){
  const theme=useTheme(s=>s.theme);
  return <Pressable accessibilityRole="button" accessibilityState={{selected}} onPress={onPress}
    style={[styles.chip,selected&&{borderColor:theme.color,backgroundColor:theme.soft}]}>
    <Text style={[styles.chipText,selected&&{color:theme.color}]}>{label}</Text>
  </Pressable>;
}

function Choices<T extends string>({title,value,items,onChange}:{title:string;value:T;items:{value:T;label:string}[];onChange:(value:T)=>void}){
  return <View style={styles.rule}><Text style={styles.ruleTitle}>{title}</Text><View style={styles.chipRow}>{items.map(item=><Chip key={item.value} label={item.label} selected={value===item.value} onPress={()=>onChange(item.value)}/>)}</View></View>;
}

export function SmartCollectionsScreen(){
  const navigation=useNavigation<any>();
  const insets=useSafeAreaInsets();
  const offline=useOfflineMode();
  const cacheVersion=useAudioCache(s=>s.revision);
  const data=useSmartCollectionsData(offline);
  const {tracks:likedTracks,history,loading,error,refresh}=data;
  const [filters,setFilters]=useState<SmartCollectionFilters>(EMPTY_SMART_FILTERS);
  const [actionTrack,setActionTrack]=useState<Track|null>(null);
  const [playlistTrack,setPlaylistTrack]=useState<Track|null>(null);
  const current=usePlayer(s=>s.current);
  const playTrack=usePlayer(s=>s.playTrack);
  const tocarLista=usePlayer(s=>s.tocarLista);
  const playNext=usePlayer(s=>s.playNext);
  const addToQueue=usePlayer(s=>s.addToQueue);
  const shuffle=usePlayer(s=>s.shuffle);
  const smartShuffle=usePlayer(s=>s.shuffleInteligente);
  const theme=useTheme(s=>s.theme);

  useFocusEffect(useCallback(()=>{void refresh();},[refresh]));
  const effectiveFilters=useMemo(()=>offline?{...filters,downloadedOnly:true}:filters,[filters,offline]);
  const tracks=useMemo(()=>applySmartCollectionFilters(likedTracks,history,effectiveFilters,{
    isDownloaded:track=>cacheVersion>=0&&track.source==='youtube'&&isAudioCached(track.sourceId),
    artistOf:displayArtist,
  }),[likedTracks,history,effectiveFilters,cacheVersion]);
  const active=activeSmartFilterCount(effectiveFilters);
  const set=<K extends keyof SmartCollectionFilters>(key:K,value:SmartCollectionFilters[K])=>setFilters(old=>({...old,[key]:value}));

  const header=<View>
    {offline&&<OfflineNotice compact/>}
    {!!error&&<Text accessibilityRole="alert" style={styles.notice}>{error}</Text>}
    <Text style={styles.sectionTitle}>Start with a collection</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templates}>
      {smartCollectionTemplates(true).map(template=><Pressable key={template.id} onPress={()=>setFilters(template.filters)} style={styles.template}>
        <View style={[styles.templateIcon,{backgroundColor:theme.soft}]}><Ionicons name={template.icon} size={20} color={theme.color}/></View>
        <Text style={styles.templateName}>{template.name}</Text>
        <Text style={styles.templateDescription}>{template.description}</Text>
      </Pressable>)}
    </ScrollView>

    <View style={styles.builderHeader}><View><Text style={styles.sectionTitle}>Build your own</Text><Text style={styles.builderHint}>Every active filter must match.</Text></View>{active>0&&<Pressable onPress={()=>setFilters(EMPTY_SMART_FILTERS)} hitSlop={8}><Text style={[styles.clear,{color:theme.color}]}>Clear {active}</Text></Pressable>}</View>
    <View style={styles.builder}>
      <Choices<SavedRule> title="Saved" value={filters.saved} onChange={value=>set('saved',value)} items={[{value:'any',label:'Any time'},{value:'7d',label:'Last 7 days'},{value:'30d',label:'Last 30 days'},{value:'older',label:'Older'}]}/>
      <Choices<ListeningRule> title="Listening" value={filters.listening} onChange={value=>set('listening',value)} items={[{value:'any',label:'Any'},{value:'never',label:'Never played'},{value:'forgotten',label:'Forgotten'},{value:'frequent',label:'5+ plays'}]}/>
      <Choices<DurationRule> title="Duration" value={filters.duration} onChange={value=>set('duration',value)} items={[{value:'any',label:'Any'},{value:'short',label:'≤ 3 min'},{value:'medium',label:'3–5 min'},{value:'long',label:'5+ min'}]}/>
      <View style={styles.rule}><Text style={styles.ruleTitle}>Device</Text><View style={styles.chipRow}><Chip label="Downloaded only" selected={effectiveFilters.downloadedOnly} onPress={()=>!offline&&set('downloadedOnly',!filters.downloadedOnly)}/></View></View>
      <View style={styles.rule}><Text style={styles.ruleTitle}>Artist</Text><Input icon="search" placeholder="Filter by artist" value={filters.artist} onChangeText={value=>set('artist',value)} onClear={()=>set('artist','')}/></View>
    </View>

    <View style={styles.resultsHeader}><View><Text style={styles.resultsTitle}>{tracks.length} {tracks.length===1?'song':'songs'}</Text><Text style={styles.resultsHint}>{active?`${active} active ${active===1?'filter':'filters'}`:'Your complete liked library'}</Text></View>{tracks.length>0&&<Pressable onPress={()=>void tocarLista(tracks,shuffle,smartShuffle)} style={styles.playButton}><LinearGradient colors={theme.gradient} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.playGradient}><Ionicons name="play" size={17} color={theme.textColorOnGradient}/><Text style={[styles.playText,{color:theme.textColorOnGradient}]}>Play all</Text></LinearGradient></Pressable>}</View>
  </View>;

  return <Screen title="Smart Collections" subtitle="Your library, organised live" onBack={()=>navigation.goBack()}>
    {loading?<ActivityIndicator size="large" color={theme.color} style={{marginTop:80}}/>:<FlatList
      data={tracks} keyExtractor={track=>`${track.source}:${track.sourceId}`} ListHeaderComponent={header}
      ListEmptyComponent={<EmptyState icon="options-outline" title="No songs match" subtitle="Remove a filter or try another ready-made collection."/>}
      contentContainerStyle={{paddingBottom:insets.bottom+MINI_PLAYER_HEIGHT+40}}
      renderItem={({item})=><TrackRow track={item} active={current?.source===item.source&&current.sourceId===item.sourceId}
        onPress={()=>playTrack(item,tracks,true)} onAction={()=>setActionTrack(item)}/>}/>
    }
    <TrackActionsSheet visible={!!actionTrack} track={actionTrack} onClose={()=>setActionTrack(null)} actions={[
      {icon:'play-outline',label:'Play next',requiresInternet:false,onPress:()=>{if(actionTrack)playNext(actionTrack);setActionTrack(null);}},
      {icon:'add-circle-outline',label:'Add to queue',requiresInternet:false,onPress:()=>{if(actionTrack)addToQueue(actionTrack);setActionTrack(null);}},
      {icon:'list-outline',label:'Add to playlist…',onPress:()=>{setPlaylistTrack(actionTrack);setActionTrack(null);}},
    ]}/>
    <AddToPlaylistSheet visible={!!playlistTrack} track={playlistTrack} onClose={()=>setPlaylistTrack(null)}/>
  </Screen>;
}

const styles=StyleSheet.create({
  notice:{color:colors.textSecondary,paddingHorizontal:spacing.xl,paddingBottom:spacing.md},
  sectionTitle:{...type.headline,paddingHorizontal:spacing.xl},
  templates:{paddingHorizontal:spacing.xl,paddingTop:spacing.md,paddingBottom:spacing.xl,gap:spacing.md},
  template:{width:190,minHeight:132,padding:spacing.lg,borderRadius:radii.lg,backgroundColor:colors.surface,borderWidth:StyleSheet.hairlineWidth,borderColor:colors.border},
  templateIcon:{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center',marginBottom:spacing.md},
  templateName:{color:colors.text,fontSize:15,fontWeight:'700',marginBottom:4},
  templateDescription:{color:colors.textSecondary,fontSize:12,lineHeight:17},
  builderHeader:{flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',paddingRight:spacing.xl},
  builderHint:{...type.caption,paddingHorizontal:spacing.xl,marginTop:3},
  clear:{fontSize:13,fontWeight:'700'},
  builder:{margin:spacing.xl,padding:spacing.lg,borderRadius:radii.lg,backgroundColor:colors.surface,borderWidth:StyleSheet.hairlineWidth,borderColor:colors.border,gap:spacing.lg},
  rule:{gap:spacing.sm},ruleTitle:{...type.micro},chipRow:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm},
  chip:{borderRadius:radii.pill,paddingHorizontal:12,paddingVertical:7,backgroundColor:colors.surfaceHigh,borderWidth:StyleSheet.hairlineWidth,borderColor:colors.borderStrong},
  chipText:{color:colors.textSecondary,fontSize:12,fontWeight:'600'},
  resultsHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:spacing.xl,paddingBottom:spacing.md},
  resultsTitle:{color:colors.text,fontSize:18,fontWeight:'700'},resultsHint:{...type.caption,marginTop:2},
  playButton:{borderRadius:radii.pill,overflow:'hidden'},playGradient:{height:40,paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:7},playText:{fontSize:13,fontWeight:'800'},
});
