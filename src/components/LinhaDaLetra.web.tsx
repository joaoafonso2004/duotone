import React,{memo,useEffect,useMemo,useRef} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {COR} from '../desktop/tokens.web';
import {marcar} from '../desktop/ui.web';
import {usePontoNaBarra} from '../state/refrao';
import {usePlayer} from '../state/player';
import type {Track} from '../types';

/**
 * Uma linha da letra no PC, com a gravação (C7, 1/11, `docs/elevacao-maquete.html`):
 * a linha que se canta "grava-se". Por cima da base (metal claro a 42 %) há uma
 * cópia em `metalClaro` que se descobre da esquerda para a direita durante o
 * tempo da linha (do tempo dela até ao da seguinte), com `clip-path: inset()`
 * em `@keyframes` (regras na casca). A duração e o atraso vão no estilo, e o
 * `animation-play-state` segue o play: a pausa da música pausa a luz sem JS. Um
 * seek ou uma velocidade nova voltam a acertar a luz com o tempo que falta.
 *
 * As que passaram apagam-se, a seguinte já está mais clara do que as outras,
 * como na maquete. A linha onde o refrão começa leva à esquerda a risca da barra.
 * Com menos movimento, a linha acende inteira de uma vez.
 */
export type EstadoDaLinha='passada'|'ativa'|'seguinte'|'futura';
export type PropsDaLinha={
  visible:boolean;text:string;timeMs:number;fimMs:number;index:number;estado:EstadoDaLinha;refrao:boolean;
  onPress:(timeMs:number)=>void;onLayout:(index:number,y:number)=>void;reduced:boolean;
  tamanho:{fontSize:number;lineHeight:number};
};

/** Um salto da posição maior do que isto entre dois avisos do motor é um seek. */
const SALTO_MS=1500;

// Os da maquete. A base da ativa é escura para a luz se ver a correr por cima, e
// a seguinte fica mais clara do que as que já passaram (a 1/11 estavam ao contrário).
const COR_DA_LINHA:Record<EstadoDaLinha,{color:string;opacity:number}>={
  passada:{color:COR.textoFraco,opacity:0.55},
  ativa:{color:COR.metalClaro,opacity:0.42},
  seguinte:{color:COR.metalClaro,opacity:0.62},
  futura:{color:COR.textoFraco,opacity:1},
};

export const LinhaDaLetra=memo(function LinhaDaLetra({text,timeMs,fimMs,index,estado,refrao,onPress,onLayout,reduced,visible,tamanho}:PropsDaLinha){
  const ativa=estado==='ativa';
  const luz=useRef<any>(null);
  useEffect(()=>{
    const el:HTMLElement|null=luz.current;
    if(!ativa||reduced||!el)return;
    const acertar=()=>{
      const p=usePlayer.getState();
      const ritmo=p.playbackRate||1;
      el.style.animation='none';
      void el.offsetWidth;
      el.style.animation='';
      el.style.animationDuration=`${Math.max(200,(fimMs-timeMs)/ritmo)}ms`;
      el.style.animationDelay=`${-Math.max(0,(p.positionMs-timeMs)/ritmo)}ms`;
      el.style.animationPlayState=p.isPlaying?'running':'paused';
    };
    acertar();
    return usePlayer.subscribe((s,a)=>{
      if(s.isPlaying!==a.isPlaying)el.style.animationPlayState=s.isPlaying?'running':'paused';
      if(Math.abs(s.positionMs-a.positionMs)>SALTO_MS||s.playbackRate!==a.playbackRate)acertar();
    });
  },[ativa,reduced,timeMs,fimMs]);
  const cor=COR_DA_LINHA[estado];
  const palavras=text||'♪';
  return <Pressable disabled={!visible} onLayout={e=>onLayout(index,e.nativeEvent.layout.y)} accessibilityRole="button" accessibilityLabel={text?`Play from: ${text}`:'Instrumental break'} accessibilityState={{selected:ativa}} onPress={()=>onPress(timeMs)} style={styles.line}>
    {refrao?<View style={styles.risca} />:null}
    {/* À medida do texto e não da coluna: numa linha curta a luz acabava cedo e ficava a andar no vazio. */}
    <View style={{alignSelf:'flex-start'}}>
      <Text style={[styles.words,tamanho,{color:cor.color,opacity:ativa&&reduced?1:cor.opacity}]}>{palavras}</Text>
      {ativa&&!reduced?<Text ref={luz} aria-hidden {...marcar('gravacao')} style={[styles.words,tamanho,styles.luz]}>{palavras}</Text>:null}
    </View>
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
  luz:{position:'absolute',left:0,top:0,right:0,color:COR.metalClaro},
  risca:{position:'absolute',left:-14,top:'30%',bottom:'30%',width:3,borderRadius:2,backgroundColor:COR.metalClaro,opacity:0.7},
});
