import React,{useEffect,useRef,useState} from 'react';
import {Animated,StyleSheet} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {useReducedMotion} from '../hooks/useReducedMotion';
import {ESTADO,PULO,TROCA_ESCALA,TROCA_MS} from '../lib/movimento';

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
  /**
   * O ícone que sai encolhe e o que entra cresce, no mesmo sítio e mais
   * depressa do que a dissolução normal (`TROCA_MS`).
   *
   * Só para DUAS CARAS DA MESMA COISA: play/pause é o caso exemplar. Rodava
   * (até 4/10), e o botão mais usado da app andava à roda a cada toque.
   */
  trocar?:boolean;
};
/** Dissolver entre os estados sem mudar a dimensão ou o alvo do botão. */
export function StateIcon({pulsar=false,trocar=false,...props}:Props){
  const reduced=useReducedMotion(),progress=useRef(new Animated.Value(1)).current;
  const salto=useRef(new Animated.Value(1)).current;
  const previous=useRef(props),[outgoing,setOutgoing]=useState<Props|null>(null);
  // Só a mudança de ÍCONE dissolve (e salta). A cor muda sozinha e muitas
  // vezes: o tema segue a capa em dez passos a cada música, e dissolver a cada
  // passo punha o coração e o shuffle ativos a piscar (João, 3/10). A cor
  // também NÃO está nas dependências do efeito: mudá-la corria a limpeza, que
  // parava uma passagem a meio e deixava o ícone que saía meio transparente.
  if(previous.current.name===props.name)previous.current=props;
  useEffect(()=>{
    if(previous.current.name===props.name)return;
    const old=previous.current;previous.current=props;
    if(reduced){setOutgoing(null);progress.setValue(1);return;}
    setOutgoing(old);progress.setValue(0);
    const animation=Animated.timing(progress,{toValue:1,duration:trocar?TROCA_MS:160,useNativeDriver:true});
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[props.name,reduced]);

  // Com `trocar`, o que entra cresce até ao tamanho e o que sai encolhe para
  // onde o outro começou: os dois no mesmo sítio, a cruzarem-se. Sem ele as
  // listas ficam vazias e o transform nem se cria.
  const trocaEntra=trocar&&!reduced
    ?[{scale:progress.interpolate({inputRange:[0,1],outputRange:[TROCA_ESCALA,1]})}]
    :[];
  const trocaSai=trocar&&!reduced
    ?[{scale:progress.interpolate({inputRange:[0,1],outputRange:[1,TROCA_ESCALA]})}]
    :[];

  return <Animated.View style={{width:props.size??24,height:props.size??24,alignItems:'center',justifyContent:'center',transform:[{scale:salto}]}} pointerEvents="none">
    {outgoing&&<Animated.View accessible={false} style={[StyleSheet.absoluteFill,{alignItems:'center',justifyContent:'center',opacity:progress.interpolate({inputRange:[0,1],outputRange:[1,0]}),transform:trocaSai}]}><Ionicons {...outgoing} /></Animated.View>}
    <Animated.View style={{opacity:progress,transform:trocaEntra}}><Ionicons {...props} /></Animated.View>
  </Animated.View>;
}
