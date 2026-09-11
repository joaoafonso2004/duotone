import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSmartCollectionsData } from '../../hooks/useSmartCollections';
import { displayArtist } from '../../lib/artistName';
import {
  activeSmartFilterCount, applySmartCollectionFilters, EMPTY_SMART_FILTERS,
  smartCollectionTemplates, type DurationRule, type ListeningRule,
  type SavedRule, type SmartCollectionFilters,
} from '../../lib/smartCollections';
import { usePlayer } from '../../state/player';
import { useTheme } from '../../state/theme';
import type { CommonPageProps } from '../rotas';
import { COR, ESP, RAIO, TIPO } from '../tokens.web';
import { Button, ContentScroll, Empty, Field, Loading, Page, TrackTable } from '../ui.web';

const P=Pressable as any;

function Chip({label,selected,onPress}:{label:string;selected:boolean;onPress:()=>void}){
  const theme=useTheme(s=>s.theme);
  return <P accessibilityRole="button" accessibilityState={{selected}} onPress={onPress} style={({hovered,focused}:any)=>[
    local.chip,(hovered||focused)&&local.chipHover,selected&&{borderColor:theme.color,backgroundColor:theme.soft},
  ]}><Text style={[local.chipText,selected&&{color:theme.color}]}>{label}</Text></P>;
}

function Choices<T extends string>({title,value,items,onChange}:{title:string;value:T;items:{value:T;label:string}[];onChange:(value:T)=>void}){
  return <View style={local.rule}><Text style={local.ruleTitle}>{title}</Text><View style={local.chipRow}>{items.map(item=><Chip key={item.value} label={item.label} selected={value===item.value} onPress={()=>onChange(item.value)}/>)}</View></View>;
}

export function SmartCollectionsPage({back,...props}:{back:()=>void}&CommonPageProps){
  const data=useSmartCollectionsData(false);
  const {tracks:likedTracks,history,loading,error,refresh}=data;
  const [filters,setFilters]=useState<SmartCollectionFilters>(EMPTY_SMART_FILTERS);
  const theme=useTheme(s=>s.theme);
  const shuffle=usePlayer(s=>s.shuffle);
  const smartShuffle=usePlayer(s=>s.shuffleInteligente);
  // Sem `isDownloaded` nem filtro de dispositivo: no PC não há downloads (o
  // player é o IFrame do YouTube) e um "Downloaded only" dava sempre zero.
  const tracks=useMemo(()=>applySmartCollectionFilters(likedTracks,history,filters,{
    artistOf:displayArtist,
  }),[likedTracks,history,filters]);
  const active=activeSmartFilterCount(filters);
  const set=<K extends keyof SmartCollectionFilters>(key:K,value:SmartCollectionFilters[K])=>setFilters(old=>({...old,[key]:value}));

  useEffect(()=>{
    void refresh();
    const onRefresh=()=>void refresh();
    window.addEventListener('duotone:refresh-library',onRefresh);
    return()=>window.removeEventListener('duotone:refresh-library',onRefresh);
  },[refresh]);

  const playAll=()=>{if(tracks.length)void usePlayer.getState().tocarLista(tracks,shuffle,smartShuffle);};
  return <Page title="Smart Collections" subtitle="Combine live rules. Results update with your library and listening history." action={<View style={local.actions}><Button secondary icon="arrow-back" onPress={back}>Back</Button><Button icon="play" disabled={!tracks.length} onPress={playAll}>Play all</Button></View>}>
    <ContentScroll scrollKey="smart-collections">
      {!!error&&<Text accessibilityRole="alert" style={local.notice}>{error}</Text>}
      <Text style={local.sectionTitle}>Start with a collection</Text>
      <View style={local.templates}>{smartCollectionTemplates(false).map(template=><P key={template.id} onPress={()=>setFilters(template.filters)} style={({hovered,focused}:any)=>[local.template,(hovered||focused)&&local.templateHover]}>
        <View style={[local.templateIcon,{backgroundColor:theme.soft}]}><Ionicons name={template.icon} size={21} color={theme.color}/></View>
        <Text style={local.templateName}>{template.name}</Text><Text style={local.templateDescription}>{template.description}</Text>
      </P>)}</View>

      <View style={local.builderTitle}><View><Text style={local.sectionTitle}>Build your own</Text><Text style={local.hint}>All active filters must match. Nothing is duplicated or moved.</Text></View>{active>0&&<Button secondary onPress={()=>setFilters(EMPTY_SMART_FILTERS)}>Clear {active}</Button>}</View>
      <View style={local.builder}>
        <Choices<SavedRule> title="Saved" value={filters.saved} onChange={value=>set('saved',value)} items={[{value:'any',label:'Any time'},{value:'7d',label:'Last 7 days'},{value:'30d',label:'Last 30 days'},{value:'older',label:'Older'}]}/>
        <Choices<ListeningRule> title="Listening" value={filters.listening} onChange={value=>set('listening',value)} items={[{value:'any',label:'Any'},{value:'never',label:'Never played'},{value:'forgotten',label:'Forgotten 60d'},{value:'frequent',label:'5+ plays'}]}/>
        <Choices<DurationRule> title="Duration" value={filters.duration} onChange={value=>set('duration',value)} items={[{value:'any',label:'Any'},{value:'short',label:'≤ 3 min'},{value:'medium',label:'3–5 min'},{value:'long',label:'5+ min'}]}/>
        <View style={local.rule}><Text style={local.ruleTitle}>Artist</Text><Field icon="search" placeholder="Filter by artist" value={filters.artist} onChangeText={value=>set('artist',value)} style={{minWidth:250}}/></View>
      </View>

      <View style={local.resultHeader}><View><Text style={local.resultTitle}>{tracks.length} {tracks.length===1?'song':'songs'}</Text><Text style={local.hint}>{active?`${active} active ${active===1?'filter':'filters'}`:'Your complete liked library'}</Text></View></View>
      {loading
        ? <View style={{height:260}}><Loading/></View>
        : <TrackTable plain listKey="smart-collections-results" tracks={tracks} onPlay={track=>props.play(track,tracks)} onMore={props.more} empty={<Empty icon="options-outline" title="No songs match" body="Remove a filter or choose another ready-made collection."/>}/>
      }
    </ContentScroll>
  </Page>;
}

const local=StyleSheet.create({
  actions:{flexDirection:'row',gap:ESP.sm},notice:{color:COR.textoMedio,marginBottom:ESP.lg},
  sectionTitle:{...TIPO.seccao,color:COR.texto,fontWeight:'800'},hint:{...TIPO.legenda,color:COR.textoMedio,marginTop:4},
  templates:{flexDirection:'row',flexWrap:'wrap',gap:ESP.md,marginTop:ESP.md,marginBottom:ESP.xl},
  template:{width:210,minHeight:130,padding:ESP.lg,borderRadius:RAIO.cartao,backgroundColor:COR.elevado,borderWidth:1,borderColor:COR.linha},
  templateHover:{borderColor:COR.textoFraco,transform:[{translateY:-2}]},templateIcon:{width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center',marginBottom:ESP.md},
  templateName:{...TIPO.corpo,color:COR.texto,fontWeight:'800'},templateDescription:{...TIPO.legenda,color:COR.textoMedio,lineHeight:19,marginTop:5},
  builderTitle:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:ESP.md},
  builder:{padding:ESP.lg,borderRadius:RAIO.superficie,backgroundColor:COR.elevado,borderWidth:1,borderColor:COR.linha,gap:ESP.lg,marginBottom:ESP.xl},
  rule:{gap:ESP.sm},ruleTitle:{...TIPO.micro,color:COR.textoMedio,fontWeight:'800'},chipRow:{flexDirection:'row',flexWrap:'wrap',gap:ESP.sm},
  chip:{paddingHorizontal:13,paddingVertical:8,borderRadius:RAIO.pilula,backgroundColor:COR.painel,borderWidth:1,borderColor:COR.linha},chipHover:{borderColor:COR.textoFraco},chipText:{...TIPO.legenda,color:COR.textoMedio,fontWeight:'700'},
  resultHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:ESP.md},resultTitle:{...TIPO.titulo,color:COR.texto,fontWeight:'800'},
});
