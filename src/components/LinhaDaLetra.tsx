import React,{memo,useEffect,useRef} from 'react';
import {Animated,Pressable,StyleSheet} from 'react-native';
import type {Track} from '../types';

/**
 * Uma linha da letra sincronizada, no iPhone (o verso da capa, 🔒): a ativa
 * acende e as outras ficam a 40 %, como sempre. A gravação da linha (C7) é só
 * do PC, no par `LinhaDaLetra.web.tsx`.
 */
export type EstadoDaLinha='passada'|'ativa'|'seguinte'|'futura';
export type PropsDaLinha={
  visible:boolean;text:string;timeMs:number;
  /** Quando a linha seguinte começa (a gravação do PC usa-o). */
  fimMs:number;
  index:number;estado:EstadoDaLinha;
  /** A linha onde o refrão começa (a risca do PC). */
  refrao:boolean;
  onPress:(timeMs:number)=>void;onLayout:(index:number,y:number)=>void;reduced:boolean;
  tamanho:{fontSize:number;lineHeight:number};
};

export const LinhaDaLetra=memo(function LinhaDaLetra({text,timeMs,index,estado,onPress,onLayout,reduced,visible,tamanho}:PropsDaLinha){
  const active=estado==='ativa';
  const opacity=useRef(new Animated.Value(active?1:0.4)).current;
  useEffect(()=>{const animation=Animated.timing(opacity,{toValue:active?1:0.4,duration:reduced?0:220,useNativeDriver:true});animation.start();return()=>animation.stop();},[active,reduced]);
  return <Pressable disabled={!visible} onLayout={e=>onLayout(index,e.nativeEvent.layout.y)} accessibilityRole="button" accessibilityLabel={text?`Play from: ${text}`:'Instrumental break'} accessibilityState={{selected:active}} onPress={()=>onPress(timeMs)} style={styles.line}>
    <Animated.Text style={[styles.words,tamanho,{opacity}]}>{text||'♪'}</Animated.Text>
  </Pressable>;
});

/** No iPhone não há risca do refrão na letra: nunca nenhuma linha. */
export function useLinhaDoRefrao(_track:Track,_tempos:readonly number[]):number{return -1;}

const styles=StyleSheet.create({
  line:{paddingVertical:9},words:{color:'#fff',fontSize:23,lineHeight:31,fontWeight:'700'},
});
