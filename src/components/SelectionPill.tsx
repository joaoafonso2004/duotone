import React,{useEffect,useRef} from 'react';
import {Animated,Pressable,StyleSheet,Text} from 'react-native';
import {useReducedMotion} from '../hooks/useReducedMotion';
import {colors} from '../theme';

/** `selectedBorder`: a borda de quem está escolhido, quando o `fill` é forte
 * de mais para a borda de sempre não se ver como um anel escuro à volta. */
type Palette={fill:string;text:string;muted:string;border:string;selectedBorder?:string};
const defaultPalette:Palette={fill:colors.surfaceHigh,text:colors.text,muted:colors.textSecondary,border:colors.border};
export function SelectionPill({selected,label,onPress,palette=defaultPalette}:{selected:boolean;label:string;onPress:()=>void;palette?:Palette}){
  const reduced=useReducedMotion(),progress=useRef(new Animated.Value(selected?1:0)).current;
  useEffect(()=>{const animation=Animated.timing(progress,{toValue:selected?1:0,duration:reduced?0:160,useNativeDriver:true});animation.start();return()=>animation.stop();},[selected,reduced]);
  return <Pressable accessibilityRole="button" accessibilityState={{selected}} aria-pressed={selected} onPress={onPress} style={({pressed})=>({minHeight:36,paddingHorizontal:14,justifyContent:'center',borderRadius:24,borderWidth:1,borderColor:selected&&palette.selectedBorder?palette.selectedBorder:palette.border,overflow:'hidden',opacity:pressed?0.7:1})}>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:palette.fill,opacity:progress}]} />
    <Text style={{fontSize:12,fontWeight:'600',color:selected?palette.text:palette.muted}}>{label}</Text>
  </Pressable>;
}
