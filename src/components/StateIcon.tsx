import React,{useEffect,useRef,useState} from 'react';
import {Animated,StyleSheet,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useReducedMotion} from '../hooks/useReducedMotion';

type Props=React.ComponentProps<typeof Ionicons>;
/** Dissolver entre os estados sem mudar a dimensão ou o alvo do botão. */
export function StateIcon(props:Props){
  const reduced=useReducedMotion(),progress=useRef(new Animated.Value(1)).current;
  const previous=useRef(props),[outgoing,setOutgoing]=useState<Props|null>(null);
  useEffect(()=>{
    if(previous.current.name===props.name&&previous.current.color===props.color)return;
    const old=previous.current;previous.current=props;
    if(reduced){setOutgoing(null);progress.setValue(1);return;}
    setOutgoing(old);progress.setValue(0);
    const animation=Animated.timing(progress,{toValue:1,duration:160,useNativeDriver:true});
    animation.start(({finished})=>{if(finished)setOutgoing(null);});return()=>animation.stop();
  },[props.name,props.color,reduced]);
  return <View style={{width:props.size??24,height:props.size??24,alignItems:'center',justifyContent:'center'}} pointerEvents="none">
    {outgoing&&<Animated.View accessible={false} style={[StyleSheet.absoluteFill,{alignItems:'center',justifyContent:'center',opacity:progress.interpolate({inputRange:[0,1],outputRange:[1,0]})}]}><Ionicons {...outgoing} /></Animated.View>}
    <Animated.View style={{opacity:progress}}><Ionicons {...props} /></Animated.View>
  </View>;
}
