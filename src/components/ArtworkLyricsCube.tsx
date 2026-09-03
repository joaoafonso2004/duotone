import {acceptsCubeSwipe,cubeDirection,cubeProgress,cubeDestination} from '../lib/lyricsCubeGesture';
import React, {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Animated,Image,PanResponder,Platform,StyleSheet,View} from 'react-native';
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
  const cubeRef=useRef<any>(null);
  const latest=useRef({showLyrics,onChange,size,reduced});latest.current={showLyrics,onChange,size,reduced};
  const gesture=useRef({start:0,direction:1});
  const webGesture=useRef({pointer:-1,x:0,y:0,time:0,active:false,start:0,direction:1});
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;progress.stopAnimation();};},[progress]);
  const settle=useCallback((value:number)=>{
    progress.stopAnimation();
    if(latest.current.reduced){progress.setValue(value);setMoving(false);return;}
    setMoving(true);
    Animated.spring(progress,{toValue:value,stiffness:230,damping:27,mass:1,useNativeDriver:true}).start(({finished})=>{if(finished&&alive.current)setMoving(false);});
  },[progress]);
  useEffect(()=>{settle(showLyrics?1:0);},[showLyrics,reduced]);
  const querGesto=(_:unknown,g:{dx:number;dy:number})=>{
      if(!acceptsCubeSwipe(g.dx,g.dy))return false;
      // O PanResponder repõe dx a zero ANTES de chamar Grant.
      gesture.current={start:latest.current.showLyrics?1:0,direction:cubeDirection(latest.current.showLyrics,g.dx)};
      return true;
  };
  const responder=useMemo(()=>PanResponder.create({
    onMoveShouldSetPanResponderCapture:querGesto,
    // No browser, o ScrollView das letras pode responder antes da fase de
    // captura. A fase normal dá ao cubo a mesma decisão para arrastos laterais.
    onMoveShouldSetPanResponder:querGesto,
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
  // No Windows, um Pressable das letras pode tornar-se responder logo no
  // pointer-down. Um listener DOM em captura observa primeiro a direção:
  // vertical continua no ScrollView; horizontal passa para o cubo. O ref é
  // usado porque React Native Web não encaminha consistentemente as props
  // onPointer*Capture de View para o elemento DOM.
  useEffect(()=>{
    if(Platform.OS!=='web')return;
    const element=cubeRef.current as HTMLElement|null;
    if(!element?.addEventListener)return;
    const down=(event:PointerEvent)=>{
      if(event.button!==0)return;
      webGesture.current={pointer:event.pointerId,x:event.clientX,y:event.clientY,time:Date.now(),active:false,start:latest.current.showLyrics?1:0,direction:1};
    };
    const move=(event:PointerEvent)=>{
      const g=webGesture.current;if(g.pointer<0||g.pointer!==event.pointerId)return;
      const dx=event.clientX-g.x,dy=event.clientY-g.y;
      if(!g.active){
        if(!acceptsCubeSwipe(dx,dy))return;
        g.active=true;g.direction=cubeDirection(latest.current.showLyrics,dx);
        progress.stopAnimation();setDirection(g.direction);setMoving(true);
        element.setPointerCapture?.(g.pointer);
      }
      event.preventDefault();event.stopPropagation();
      if(!latest.current.reduced)progress.setValue(cubeProgress(g.start,dx,latest.current.size,g.direction));
    };
    const finish=(event:PointerEvent)=>{
      const g=webGesture.current;if(g.pointer<0||g.pointer!==event.pointerId)return;
      const dx=event.clientX-g.x;webGesture.current.pointer=-1;
      if(!g.active)return;
      event.preventDefault();event.stopPropagation();
      const go=cubeDestination(g.start,dx,dx/Math.max(1,Date.now()-g.time),latest.current.size,g.direction);
      latest.current.onChange(go);settle(go?1:0);
    };
    const cancel=()=>{const active=webGesture.current.active;webGesture.current.pointer=-1;if(active)settle(latest.current.showLyrics?1:0);};
    element.addEventListener('pointerdown',down,true);element.addEventListener('pointermove',move,true);
    element.addEventListener('pointerup',finish,true);element.addEventListener('pointercancel',cancel,true);
    return()=>{element.removeEventListener('pointerdown',down,true);element.removeEventListener('pointermove',move,true);
      element.removeEventListener('pointerup',finish,true);element.removeEventListener('pointercancel',cancel,true);};
  },[progress,settle]);
  const radius=size/2;
  const rotation=progress.interpolate({inputRange:[0,1],outputRange:['0deg',`${-direction*90}deg`]});
  const base=[{perspective:size*3},...depth(-radius),{rotateY:rotation}];
  const frontStyle=reduced?{opacity:showLyrics?0:1}:{transform:[...base,...depth(radius)]};
  const lyricsStyle=reduced?{opacity:showLyrics?1:0}:{transform:[...base,{rotateY:`${direction*90}deg`},...depth(radius)]};
  return <View ref={cubeRef} {...(Platform.OS==='web'?{}:responder.panHandlers)} testID="artwork-lyrics-cube"
    accessible={!showLyrics} accessibilityLabel={showLyrics?'Lyrics':'Album artwork'}
    role={Platform.OS==='web'?'group':undefined} accessibilityRole={Platform.OS==='web'?undefined:'adjustable'}
    accessibilityValue={{text:showLyrics?'Lyrics':'Artwork'}}
    accessibilityActions={[{name:'activate',label:showLyrics?'Show artwork':'Show lyrics'},{name:'increment',label:'Turn artwork'},{name:'decrement',label:'Turn artwork'}]}
    onAccessibilityAction={()=>onChange(!showLyrics)} onAccessibilityEscape={()=>onChange(false)}
    {...(Platform.OS==='web'?{tabIndex:0,onKeyDown:(event:any)=>{
      if(event.target!==event.currentTarget)return;
      if(['ArrowLeft','ArrowRight','Enter',' '].includes(event.key)){event.preventDefault();onChange(!showLyrics);}
      else if(event.key==='Escape'&&showLyrics){event.preventDefault();onChange(false);}
    }}:{})} style={[{width:size,height:size},Platform.OS==='web'&&({touchAction:'pan-y',userSelect:'none'} as any)]}>
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
  </View>;
}
const styles=StyleSheet.create({
  face:{position:'absolute',top:0,bottom:0,left:0,right:0,backgroundColor:'#16161d',borderRadius:20,overflow:'hidden',backfaceVisibility:'hidden'},
});
