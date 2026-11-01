import React,{memo,useMemo} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {COR} from '../desktop/tokens.web';
import {marcar} from '../desktop/ui.web';
import {usePontoNaBarra} from '../state/refrao';
import type {Track} from '../types';

/**
 * Uma linha da letra no PC. A que se canta acende inteira, as que passaram apagam-se e
 * a seguinte já está mais clara do que as outras. A linha onde o refrão começa leva à
 * esquerda a risca da barra.
 *
 * Não voltar a pôr a linha a acender da esquerda para a direita durante o tempo dela (a
 * gravação do C7): saiu no próprio dia, a 1/11, e o João não gostou de a ver a avançar.
 */
export type EstadoDaLinha='passada'|'ativa'|'seguinte'|'futura';
export type PropsDaLinha={
  visible:boolean;text:string;timeMs:number;index:number;estado:EstadoDaLinha;refrao:boolean;
  onPress:(timeMs:number)=>void;onLayout:(index:number,y:number)=>void;reduced:boolean;
  tamanho:{fontSize:number;lineHeight:number};
};

const COR_DA_LINHA:Record<EstadoDaLinha,{color:string;opacity:number}>={
  passada:{color:COR.textoFraco,opacity:0.55},
  ativa:{color:COR.metalClaro,opacity:1},
  seguinte:{color:COR.metalClaro,opacity:0.62},
  futura:{color:COR.textoFraco,opacity:1},
};

export const LinhaDaLetra=memo(function LinhaDaLetra({text,timeMs,index,estado,refrao,onPress,onLayout,visible,tamanho}:PropsDaLinha){
  const cor=COR_DA_LINHA[estado];
  return <Pressable disabled={!visible} onLayout={e=>onLayout(index,e.nativeEvent.layout.y)} accessibilityRole="button" accessibilityLabel={text?`Play from: ${text}`:'Instrumental break'} accessibilityState={{selected:estado==='ativa'}} onPress={()=>onPress(timeMs)} style={styles.line}>
    {refrao?<View style={styles.risca} />:null}
    <Text {...marcar('linha-da-letra')} style={[styles.words,tamanho,cor]}>{text||'♪'}</Text>
  </Pressable>;
});

/**
 * A linha onde o refrão começa, ou -1: a mesma risca da barra do leitor (com a
 * opção "Chorus on the progress bar" ligada), da mesma resposta guardada. Só se
 * sabe onde ele COMEÇA; esticá-la por mais linhas seria adivinhar onde acaba.
 */
export function useLinhaDoRefrao(track:Track,tempos:readonly number[]):number{
  const inicioS=usePontoNaBarra(track,true);
  return useMemo(()=>{
    if(inicioS===null||!tempos.length)return -1;
    let linha=-1;
    for(let i=0;i<tempos.length;i++)if(tempos[i]!<=inicioS*1000+250)linha=i;
    return linha;
  },[inicioS,tempos]);
}

const styles=StyleSheet.create({
  line:{paddingVertical:9},words:{fontSize:23,lineHeight:31,fontWeight:'700'},
  risca:{position:'absolute',left:-14,top:'30%',bottom:'30%',width:3,borderRadius:2,backgroundColor:COR.metalClaro,opacity:0.7},
});
