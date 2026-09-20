import React,{useEffect,useRef} from 'react';
import {Animated,Easing} from 'react-native';
import {useReducedMotion} from '../hooks/useReducedMotion';

/**
 * A shell e o áudio ficam montados; só o conteúdo da secção entra.
 *
 * Os números vêm da preview de 20/9: 260 ms e 10 px, em vez dos 180 ms e 5 px
 * que quase não se viam -- "está muito cru", e estava. A curva é a mesma de
 * todo o resto do PC (ver o bloco do movimento na `casca.web.tsx`); aqui
 * escreve-se à mão porque o `Animated` não lê CSS.
 */
export function TransitionView({transitionKey,children}:{transitionKey:string;children:React.ReactNode}){
  const progress=useRef(new Animated.Value(1)).current,reduced=useReducedMotion();
  useEffect(()=>{
    progress.setValue(reduced?1:0);
    const animation=Animated.timing(progress,{
      toValue:1,duration:260,easing:Easing.bezier(.22,1,.36,1),useNativeDriver:true,
    });animation.start();
    return()=>animation.stop();
  },[transitionKey,reduced]);
  return <Animated.View style={{flex:1,minHeight:0,opacity:progress,transform:[{translateY:progress.interpolate({inputRange:[0,1],outputRange:[10,0]})}]}}>{children}</Animated.View>;
}
