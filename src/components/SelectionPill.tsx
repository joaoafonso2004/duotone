import React,{useEffect,useRef} from 'react';
import {Animated,Pressable,StyleSheet,Text} from 'react-native';
import {useReducedMotion} from '../hooks/useReducedMotion';
import {colors} from '../theme';

const defaultPalette={fill:colors.surfaceHigh,text:colors.text,muted:colors.textSecondary,border:colors.border};
export function SelectionPill({selected,label,onPress,palette=defaultPalette}:{selected:boolean;label:string;onPress:()=>void;palette?:typeof defaultPalette}){
  const reduced=useReducedMotion(),progress=useRef(new Animated.Value(selected?1:0)).current;
  useEffect(()=>{const animation=Animated.timing(progress,{toValue:selected?1:0,duration:reduced?0:160,useNativeDriver:true});animation.start();return()=>animation.stop();},[selected,reduced]);
  return <Pressable accessibilityRole="button" accessibilityState={{selected}} aria-pressed={selected} onPress={onPress} style={({pressed})=>({minHeight:36,paddingHorizontal:14,justifyContent:'center',borderRadius:24,borderWidth:1,borderColor:palette.border,overflow:'hidden',opacity:pressed?0.7:1})}>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:palette.fill,opacity:progress}]} />
    <Text style={{fontSize:12,fontWeight:'600',color:selected?palette.text:palette.muted}}>{label}</Text>
  </Pressable>;
}
