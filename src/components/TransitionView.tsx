import React,{useEffect,useRef} from 'react';
import {Animated} from 'react-native';
import {useReducedMotion} from '../hooks/useReducedMotion';

/** A shell e o áudio ficam montados; só o conteúdo da secção entra suavemente. */
export function TransitionView({transitionKey,children}:{transitionKey:string;children:React.ReactNode}){
  const progress=useRef(new Animated.Value(1)).current,reduced=useReducedMotion();
  useEffect(()=>{
    progress.setValue(reduced?1:0);
    const animation=Animated.timing(progress,{toValue:1,duration:180,useNativeDriver:true});animation.start();
    return()=>animation.stop();
  },[transitionKey,reduced]);
  return <Animated.View style={{flex:1,minHeight:0,opacity:progress,transform:[{translateY:progress.interpolate({inputRange:[0,1],outputRange:[5,0]})}]}}>{children}</Animated.View>;
}
