import React,{useEffect,useRef,useState} from 'react';
import {Animated,StyleSheet} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {useReducedMotion} from '../hooks/useReducedMotion';
import {ESTADO,GIRO_GRAUS,PULO} from '../lib/movimento';

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
   * O ícone que sai roda para um lado e o que entra vem do outro.
   *
   * Só faz sentido quando os dois estados são DUAS CARAS DA MESMA COISA, e não
   * dois itens de uma lista: play/pause é o caso exemplar -- é o mesmo botão
   * visto dos dois lados, e rodar diz exactamente isso. Um coração a encher-se
   * não roda, porque não tem dois lados; e um separador da barra de baixo muito
   * menos, que ficava a andar à roda a cada mudança de página.
   */
  rodar?:boolean;
};
/** Dissolver entre os estados sem mudar a dimensão ou o alvo do botão. */
export function StateIcon({pulsar=false,rodar=false,...props}:Props){
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[props.name,reduced]);

  // O que entra vem de tras e o que sai continua para a frente: o MESMO sentido
  // de rotacao nos dois, para se ler como uma peca a virar e nao como duas a
  // cruzarem-se. Sem `rodar` as listas ficam vazias e o transform nem se cria.
  const giroEntra=rodar&&!reduced
    ?[{rotate:progress.interpolate({inputRange:[0,1],outputRange:[`-${GIRO_GRAUS}deg`,'0deg']})}]
    :[];
  const giroSai=rodar&&!reduced
    ?[{rotate:progress.interpolate({inputRange:[0,1],outputRange:['0deg',`${GIRO_GRAUS}deg`]})}]
    :[];

  return <Animated.View style={{width:props.size??24,height:props.size??24,alignItems:'center',justifyContent:'center',transform:[{scale:salto}]}} pointerEvents="none">
    {outgoing&&<Animated.View accessible={false} style={[StyleSheet.absoluteFill,{alignItems:'center',justifyContent:'center',opacity:progress.interpolate({inputRange:[0,1],outputRange:[1,0]}),transform:giroSai}]}><Ionicons {...outgoing} /></Animated.View>}
    <Animated.View style={{opacity:progress,transform:giroEntra}}><Ionicons {...props} /></Animated.View>
  </Animated.View>;
}
