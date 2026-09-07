import React,{useEffect,useRef,useState} from 'react';
import {Animated,StyleSheet,View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {useReducedMotion} from '../hooks/useReducedMotion';
import {ESTADO,PULO} from '../lib/movimento';

type Props=React.ComponentProps<typeof Ionicons>&{
  /**
   * Dá um salto ao mudar, além de dissolver.
   *
   * Nem toda a mudança de estado merece o mesmo. Passar de "repetir tudo" para
   * "repetir uma" e um coração a encher-se são acontecimentos de pesos
   * diferentes -- o segundo é uma pequena celebração e merece ser sentido, o
   * primeiro é informação. Quem chama é que sabe qual é qual, por isso a
   * decisão vive lá e não aqui.
   */
  pulsar?:boolean;
};
/** Dissolver entre os estados sem mudar a dimensão ou o alvo do botão. */
export function StateIcon({pulsar=false,...props}:Props){
  const reduced=useReducedMotion(),progress=useRef(new Animated.Value(1)).current;
  const salto=useRef(new Animated.Value(1)).current;
  const previous=useRef(props),[outgoing,setOutgoing]=useState<Props|null>(null);
  useEffect(()=>{
    if(previous.current.name===props.name&&previous.current.color===props.color)return;
    const old=previous.current;previous.current=props;
    if(reduced){setOutgoing(null);progress.setValue(1);return;}
    setOutgoing(old);progress.setValue(0);
    const animation=Animated.timing(progress,{toValue:1,duration:160,useNativeDriver:true});
    animation.start(({finished})=>{if(finished)setOutgoing(null);});
    // O salto parte do tamanho cheio e volta com mola: o pico acontece no
    // instante em que o icone novo aparece, nao depois dele.
    let pulo:Animated.CompositeAnimation|undefined;
    if(pulsar){
      salto.setValue(PULO);
      pulo=Animated.spring(salto,{toValue:1,...ESTADO,useNativeDriver:true});
      pulo.start();
    }
    return()=>{animation.stop();pulo?.stop();};
  },[props.name,props.color,reduced,pulsar]);
  return <Animated.View style={{width:props.size??24,height:props.size??24,alignItems:'center',justifyContent:'center',transform:[{scale:salto}]}} pointerEvents="none">
    {outgoing&&<Animated.View accessible={false} style={[StyleSheet.absoluteFill,{alignItems:'center',justifyContent:'center',opacity:progress.interpolate({inputRange:[0,1],outputRange:[1,0]})}]}><Ionicons {...outgoing} /></Animated.View>}
    <Animated.View style={{opacity:progress}}><Ionicons {...props} /></Animated.View>
  </Animated.View>;
}
