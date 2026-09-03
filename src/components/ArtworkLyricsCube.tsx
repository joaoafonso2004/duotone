import {acceptsCubeSwipe,cubeDirection,cubeProgress,cubeDestination} from '../lib/lyricsCubeGesture';
import React, {useEffect,useMemo,useRef,useState} from 'react';
import {Animated,Image,PanResponder,Platform,Pressable,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useReducedMotion} from '../hooks/useReducedMotion';
import type {Track} from '../types';
import {LyricsView} from './LyricsView';

type Props={track:Track;size:number;artwork?:string|null;front:React.ReactNode;showLyrics:boolean;onChange:(open:boolean)=>void};
// Translação Z equivalente, também nos motores nativos que só expõem X e Y.
const depth=(z:number)=>[{rotateY:'90deg'},{translateX:-z},{rotateY:'-90deg'}];

/** Duas faces do mesmo cubo. O motor de áudio vive fora destas transformações. */
export function ArtworkLyricsCube({track,size,artwork,front,showLyrics,onChange}:Props){
  const reduced=useReducedMotion();
  const progress=useRef(new Animated.Value(showLyrics?1:0)).current;
  const [direction,setDirection]=useState(1);
  const [moving,setMoving]=useState(false);
  const latest=useRef({showLyrics,onChange,size,reduced});latest.current={showLyrics,onChange,size,reduced};
  const gesture=useRef({start:0,direction:1});
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;progress.stopAnimation();};},[progress]);
  const settle=(value:number)=>{
    progress.stopAnimation();
    if(latest.current.reduced){progress.setValue(value);setMoving(false);return;}
    setMoving(true);
    Animated.spring(progress,{toValue:value,stiffness:230,damping:27,mass:1,useNativeDriver:true}).start(({finished})=>{if(finished&&alive.current)setMoving(false);});
  };
  useEffect(()=>{settle(showLyrics?1:0);},[showLyrics,reduced]);
  const responder=useMemo(()=>PanResponder.create({
    onMoveShouldSetPanResponderCapture:(_,g)=>{
      if(!acceptsCubeSwipe(g.dx,g.dy))return false;
      // O PanResponder repõe dx a zero ANTES de chamar Grant.
      gesture.current={start:latest.current.showLyrics?1:0,direction:cubeDirection(latest.current.showLyrics,g.dx)};
      return true;
    },
    onPanResponderGrant:()=>{
      progress.stopAnimation();setDirection(gesture.current.direction);setMoving(true);
    },
    onPanResponderMove:(_,g)=>{
      const {start,direction:dir}=gesture.current;
      if(!latest.current.reduced)progress.setValue(cubeProgress(start,g.dx,latest.current.size,dir));
    },
    onPanResponderRelease:(_,g)=>{
      const {start,direction:dir}=gesture.current;
      const go=cubeDestination(start,g.dx,g.vx,latest.current.size,dir);
      latest.current.onChange(go);settle(go?1:0);
    },
    onPanResponderTerminationRequest:()=>false,
    onPanResponderTerminate:()=>settle(latest.current.showLyrics?1:0),
  }),[progress]);
  const radius=size/2;
  const rotation=progress.interpolate({inputRange:[0,1],outputRange:['0deg',`${-direction*90}deg`]});
  const base=[{perspective:size*3},...depth(-radius),{rotateY:rotation}];
  const frontStyle=reduced?{opacity:showLyrics?0:1}:{transform:[...base,...depth(radius)]};
  const lyricsStyle=reduced?{opacity:showLyrics?1:0}:{transform:[...base,{rotateY:`${direction*90}deg`},...depth(radius)]};
  return <View {...responder.panHandlers} testID="artwork-lyrics-cube" style={[{width:size,height:size},Platform.OS==='web'&&({touchAction:'pan-y',userSelect:'none'} as any)]}>
    <Animated.View pointerEvents="none" aria-hidden={showLyrics} accessibilityElementsHidden={showLyrics} importantForAccessibility={showLyrics?'no-hide-descendants':'auto'} style={[styles.face,frontStyle]}>
      {front}
      <Animated.View style={[StyleSheet.absoluteFill,{backgroundColor:'#000',opacity:progress.interpolate({inputRange:[0,1],outputRange:[0,0.35]})}]} />
    </Animated.View>
    <Animated.View pointerEvents={showLyrics&&!moving?'auto':'none'} aria-hidden={!showLyrics} accessibilityElementsHidden={!showLyrics} importantForAccessibility={showLyrics?'auto':'no-hide-descendants'} style={[styles.face,lyricsStyle]}>
      {artwork?<Image source={{uri:artwork}} blurRadius={28} style={[StyleSheet.absoluteFill,{opacity:0.6,transform:[{scale:1.12}]}]} />:null}
      <View style={[StyleSheet.absoluteFill,{backgroundColor:'rgba(8,8,15,0.5)'}]} />
      <LyricsView track={track} visible={showLyrics&&!moving} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:'#000',opacity:progress.interpolate({inputRange:[0,1],outputRange:[0.4,0]})}]} />
    </Animated.View>
    <Pressable accessibilityRole="button" accessibilityLabel={showLyrics?'Show artwork':'Show lyrics'} accessibilityHint="You can also swipe the artwork left or right." onPress={()=>onChange(!showLyrics)} style={({pressed})=>[styles.switcher,{opacity:pressed?0.65:1}]}>
      <Ionicons name={showLyrics?'image-outline':'musical-notes-outline'} size={15} color="#fff" />
      <Text style={styles.label}>{showLyrics?'Artwork':'Lyrics'}</Text>
    </Pressable>
    <View pointerEvents="none" style={styles.dots}>{[0,1].map(i=><View key={i} style={[styles.dot,{opacity:(showLyrics?1:0)===i?0.9:0.3}]} />)}</View>
  </View>;
}
const styles=StyleSheet.create({
  face:{position:'absolute',top:0,bottom:0,left:0,right:0,backgroundColor:'#16161d',borderRadius:20,overflow:'hidden',backfaceVisibility:'hidden'},
  switcher:{position:'absolute',right:10,top:10,minHeight:44,paddingHorizontal:12,borderRadius:20,backgroundColor:'rgba(10,10,16,0.66)',zIndex:2,flexDirection:'row',gap:6,alignItems:'center'},
  label:{fontSize:12,fontWeight:'600',color:'#fff'},
  dots:{position:'absolute',bottom:10,left:0,right:0,flexDirection:'row',gap:5,justifyContent:'center'},
  dot:{height:4,width:4,borderRadius:2,backgroundColor:'#fff'},
});
