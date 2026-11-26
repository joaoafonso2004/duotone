import React,{memo,useEffect,useMemo,useRef,useState} from 'react';
import {Animated,Pressable,StyleSheet} from 'react-native';
import {atrasoDaLinha,MOLA_DA_LETRA,ouvirSaltoDaLetra} from '../lib/molaDaLetra';
import {pedirFluidez} from '../state/fluidez';
import {useAparencia} from '../state/aparencia';
import type {Track} from '../types';
import type {PalavraDaLetra} from '../lib/lyricsParser';
import {PalavrasDaLetra} from './PalavrasDaLetra';

/**
 * Uma linha da letra sincronizada, no iPhone (o verso da capa, 🔒): a ativa
 * acende e as outras ficam a 40 %, como sempre. Os tons e a risca do refrão são
 * só do PC, no par `LinhaDaLetra.web.tsx`.
 */
export type EstadoDaLinha='passada'|'ativa'|'seguinte'|'futura';
export type PropsDaLinha={
  visible:boolean;text:string;timeMs:number;
  index:number;estado:EstadoDaLinha;
  /** A linha onde o refrão começa (a risca do PC). */
  refrao:boolean;
  onPress:(timeMs:number)=>void;onLayout:(index:number,y:number)=>void;reduced:boolean;
  tamanho:{fontSize:number;lineHeight:number};
  /** O tempo de cada palavra, quando a letra o traz (26/11, item 23): a cantada acende palavra a palavra. */
  palavras?:readonly PalavraDaLetra[];
};

export const LinhaDaLetra=memo(function LinhaDaLetra({text,timeMs,index,estado,onPress,onLayout,reduced,visible,tamanho,palavras}:PropsDaLinha){
  const active=estado==='ativa';
  const opacity=useRef(new Animated.Value(active?1:0.4)).current;
  useEffect(()=>{const animation=Animated.timing(opacity,{toValue:active?1:0.4,duration:reduced?0:220,useNativeDriver:true});animation.start();return()=>animation.stop();},[active,reduced]);
  // A letra com mola (25/11, item 4 do plano, `lib/molaDaLetra.ts`): quando o
  // scroll salta, esta linha põe-se onde estava e volta com uma mola, mais tarde
  // quanto mais abaixo da linha nova; e a linha cantada cresce, presa à esquerda.
  const comMola=useAparencia(s=>s.letraComMola)&&!reduced;
  const desvio=useRef(new Animated.Value(0)).current;
  const escala=useRef(new Animated.Value(1)).current;
  const [largura,setLargura]=useState(0);
  useEffect(()=>{
    if(!comMola)return undefined;
    return ouvirSaltoDaLetra(({delta,ativa})=>{
      const atraso=atrasoDaLinha(index,ativa);
      desvio.stopAnimation();
      if(atraso===null){desvio.setValue(0);return;}
      if(index===ativa)pedirFluidez(900+MOLA_DA_LETRA.linhasAbaixo*MOLA_DA_LETRA.atrasoPorLinhaMs);
      desvio.setValue(delta);
      Animated.spring(desvio,{toValue:0,stiffness:MOLA_DA_LETRA.rigidez,damping:MOLA_DA_LETRA.amortecimento,mass:1,delay:atraso,useNativeDriver:true}).start();
    });
  },[comMola,index,desvio]);
  useEffect(()=>{
    if(!comMola){escala.setValue(1);return undefined;}
    const a=Animated.spring(escala,{toValue:active?MOLA_DA_LETRA.escalaAtiva:1,stiffness:MOLA_DA_LETRA.rigidez,damping:MOLA_DA_LETRA.amortecimento,mass:1,useNativeDriver:true});
    a.start();return()=>a.stop();
  },[active,comMola,escala]);
  // A escala é ao centro: o translateX segura a borda esquerda no sítio. Uma
  // interpolação por linha, depois de ela se medir, e não uma por desenho
  // (`test-leitor-alocacoes-ui.cjs`: avançar um verso não pode alocar por linha).
  const transform=useMemo(()=>comMola?[
    {translateY:desvio},
    ...(largura>0?[{translateX:escala.interpolate({inputRange:[1,MOLA_DA_LETRA.escalaAtiva],outputRange:[0,largura*(MOLA_DA_LETRA.escalaAtiva-1)/2]})}]:[]),
    {scale:escala},
  ]:undefined,[comMola,largura,desvio,escala]);
  return <Pressable disabled={!visible} onLayout={e=>{onLayout(index,e.nativeEvent.layout.y);const w=e.nativeEvent.layout.width;if(Math.abs(w-largura)>0.5)setLargura(w);}} accessibilityRole="button" accessibilityLabel={text?`Play from: ${text}`:'Instrumental break'} accessibilityState={{selected:active}} onPress={()=>onPress(timeMs)} style={styles.line}>
    {/* Palavra a palavra só na cantada e só com os tempos das palavras; senão, a linha de sempre. */}
    <Animated.Text style={[styles.words,tamanho,{opacity,transform}]}>{active&&palavras&&palavras.length>1?<PalavrasDaLetra palavras={palavras} />:(text||'♪')}</Animated.Text>
  </Pressable>;
});

/** No iPhone não há risca do refrão na letra: nunca nenhuma linha. */
export function useLinhaDoRefrao(_track:Track,_tempos:readonly number[]):number{return -1;}

const styles=StyleSheet.create({
  line:{paddingVertical:9},words:{color:'#fff',fontSize:23,lineHeight:31,fontWeight:'700'},
});
