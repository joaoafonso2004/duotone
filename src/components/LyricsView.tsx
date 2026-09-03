import React,{memo,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Animated,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {usePlayer} from '../state/player';
import {ensureLyrics,lyricsCacheKey,useLyrics} from '../state/lyrics';
import {activeLyricIndex} from '../lib/lyricsParser';
import {useReducedMotion} from '../hooks/useReducedMotion';
import type {Track} from '../types';

const Line=memo(function Line({text,active,onPress,onLayout,reduced,visible}:{visible:boolean;text:string;active:boolean;onPress:()=>void;onLayout:(y:number)=>void;reduced:boolean}){
  const opacity=useRef(new Animated.Value(active?1:0.4)).current;
  useEffect(()=>{const animation=Animated.timing(opacity,{toValue:active?1:0.4,duration:reduced?0:220,useNativeDriver:true});animation.start();return()=>animation.stop();},[active,reduced]);
  return <Pressable disabled={!visible} onLayout={e=>onLayout(e.nativeEvent.layout.y)} accessibilityRole="button" accessibilityLabel={text?`Play from: ${text}`:'Instrumental break'} accessibilityState={{selected:active}} onPress={onPress} style={styles.line}>
    <Animated.Text style={[styles.words,{opacity}]}>{text||'♪'}</Animated.Text>
  </Pressable>;
});

/** O relógio é o da faixa, incluindo seek e speed; nunca um temporizador próprio. */
export function LyricsView({track,visible}:{track:Track;visible:boolean}){
  const key=lyricsCacheKey(track),entry=useLyrics(s=>s.entries[key]);
  const position=usePlayer(s=>s.positionMs),seek=usePlayer(s=>s.seekTo);
  const reduced=useReducedMotion(),scroll=useRef<ScrollView>(null),offsets=useRef<Record<number,number>>({});
  const [height,setHeight]=useState(220),[revision,setRevision]=useState(0),[manual,setManual]=useState(false);
  const resume=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),previous=useRef(-1);
  const data=entry?.data,lines=data?.parsedLines??[],synced=!!data?.timingAvailable;
  const index=synced?activeLyricIndex(lines,position):-1;
  useEffect(()=>{offsets.current={};previous.current=-1;setManual(false);void ensureLyrics(track);},[key]);
  useEffect(()=>()=>{if(resume.current)clearTimeout(resume.current);},[]);
  useEffect(()=>{
    // A face escondida continua a acompanhar a música. `visible` só controla
    // interação; parar aqui fazia as letras saltarem no fim da rotação.
    if(manual||!synced)return;
    const y=offsets.current[index];
    if(index>=0&&y===undefined)return;
    scroll.current?.scrollTo({y:Math.max(0,(y??0)-height*0.28),animated:!reduced&&previous.current>=0&&Math.abs(index-previous.current)<5});
    previous.current=index;
  },[index,manual,height,revision,synced,reduced]);
  const pauseFollowing=()=>{setManual(true);if(resume.current)clearTimeout(resume.current);resume.current=setTimeout(()=>setManual(false),5000);};
  const retry=()=>void ensureLyrics(track,true);
  return <View style={styles.root}>
    {!entry||entry.status==='loading'?<View style={styles.center}><ActivityIndicator color="#fff" /><Text style={styles.note}>Loading lyrics…</Text></View>:
      entry.status==='error'||entry.status==='missing'||data?.instrumental?<View style={styles.center}>
        <Text style={styles.message}>{data?.instrumental?'Instrumental':entry.status==='missing'?'No lyrics found for this recording':entry.message||'Could not load lyrics.'}</Text>
        {!data?.instrumental&&<Pressable disabled={!visible} accessibilityRole="button" onPress={retry} style={styles.retry}><Text style={styles.note}>Try again</Text></Pressable>}
      </View>:
      <>
        <View style={{flex:1,overflow:'hidden'}}><ScrollView ref={scroll} onLayout={e=>setHeight(e.nativeEvent.layout.height)} onContentSizeChange={()=>setRevision(v=>v+1)} {...({onWheel:pauseFollowing,style:{touchAction:'pan-y'}} as any)} onScrollBeginDrag={pauseFollowing} onTouchStart={pauseFollowing} showsVerticalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:24,paddingTop:height*0.28,paddingBottom:height*0.65}}>
          {synced?lines.map((line,i)=><Line key={`${key}:${i}`} text={line.text} active={i===index} reduced={reduced} visible={visible} onLayout={y=>{offsets.current[i]=y;}} onPress={()=>{seek(line.timeMs);setManual(false);}} />):<Text style={[styles.words,{fontSize:20,lineHeight:30}]}>{data?.plainLyrics}</Text>}
        </ScrollView>
        </View>
        {/* Só aparece rodapé quando há mesmo o que dizer. O "LYRICS" em cima e
            o "LRCLIB" em baixo emolduravam a letra sem acrescentar nada, e os
            dois degradês sobre o scroll liam-se como barras em vez de desvanecer. */}
        {manual&&synced&&<View style={styles.footer}>
          <Pressable disabled={!visible} accessibilityRole="button" onPress={()=>setManual(false)} hitSlop={8}><Text style={styles.follow}>Follow lyrics</Text></Pressable>
        </View>}
      </>}
  </View>;
}
const styles=StyleSheet.create({
  root:{flex:1,paddingTop:22,paddingBottom:16},
  center:{flex:1,alignItems:'center',justifyContent:'center',paddingHorizontal:28,gap:12},
  message:{color:'#fff',fontSize:17,fontWeight:'600',lineHeight:24,textAlign:'center'},note:{color:'rgba(255,255,255,0.7)',fontSize:13},
  retry:{minHeight:44,paddingHorizontal:18,justifyContent:'center',borderRadius:24,backgroundColor:'rgba(255,255,255,0.1)'},
  line:{paddingVertical:9},words:{color:'#fff',fontSize:23,lineHeight:31,fontWeight:'700'},
  footer:{paddingHorizontal:24,paddingTop:6,flexDirection:'row',alignItems:'center',justifyContent:'flex-end'},follow:{color:'#fff',fontSize:11,fontWeight:'600'},
});
