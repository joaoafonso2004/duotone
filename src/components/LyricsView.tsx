import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {usePlayer} from '../state/player';
import {ensureLyrics,lyricsCacheKey,useLyrics} from '../state/lyrics';
import {activeLyricIndex} from '../lib/lyricsParser';
import {useReducedMotion} from '../hooks/useReducedMotion';
import type {Track} from '../types';
import {tamanhoDasLetras} from '../lib/aparencia';
import {useAparencia} from '../state/aparencia';
import Ionicons from '@expo/vector-icons/Ionicons';
import {FRASES_DOS_ESTADOS} from '../lib/frasesDosEstados';
// A linha é um par de plataforma (1/11): no PC com os tons e a risca do refrão, no iPhone como era (🔒).
import {LinhaDaLetra,useLinhaDoRefrao,type EstadoDaLinha} from './LinhaDaLetra';

const estadoDaLinha=(i:number,ativa:number):EstadoDaLinha=>i<ativa?'passada':i===ativa?'ativa':i===ativa+1?'seguinte':'futura';

const SEM_LINHAS:never[]=[];

/**
 * Sem letra, instrumental ou a falhar (1/11): um selo, o título e uma frase das
 * `FRASES_DOS_ESTADOS`; só a falha tem "Try again". Era uma linha solta com o
 * erro cru ("Failed to fetch" no PC) e um botão sem ícone.
 */
function SemLetra({tipo,mensagem,visible,aoRepetir}:{tipo:'semLetra'|'instrumental'|'letraFalhou';mensagem?:string;visible:boolean;aoRepetir:()=>void}){
  const frase=FRASES_DOS_ESTADOS[tipo],falhou=tipo==='letraFalhou';
  return <View style={styles.center}>
    <View style={styles.selo}><Ionicons name={falhou?'cloud-offline-outline':tipo==='instrumental'?'musical-notes':'musical-notes-outline'} size={26} color="rgba(255,255,255,0.92)" /></View>
    <Text style={styles.message}>{frase.titulo}</Text>
    <Text style={styles.corpo}>{falhou&&mensagem?mensagem:frase.corpo}</Text>
    {falhou&&<Pressable disabled={!visible} accessibilityRole="button" onPress={aoRepetir} style={({pressed}:any)=>[styles.retry,pressed&&{opacity:0.7}]}>
      <Ionicons name="refresh" size={15} color="#fff" /><Text style={styles.retryTexto}>Try again</Text>
    </Pressable>}
  </View>;
}

/** O relógio é o da faixa, incluindo seek e speed; nunca um temporizador próprio. */
export function LyricsView({track,visible,escala=1}:{track:Track;visible:boolean;
  /** Só a letra grande do PC (31/10) a muda: multiplica o tamanho das linhas. As outras ficam a 1. */
  escala?:number}){
  const key=lyricsCacheKey(track),entry=useLyrics(s=>s.entries[key]);
  const seek=usePlayer(s=>s.seekTo);
  const reduced=useReducedMotion(),scroll=useRef<ScrollView>(null),offsets=useRef<Record<number,number>>({});
  // O tamanho escolhido (10/10, personalização: S, M -- o de sempre -- ou L).
  const tamanhoEscolhido=useAparencia(s=>s.tamanhoDasLetras);
  const tamanho=useMemo(()=>{
    const t=tamanhoDasLetras(tamanhoEscolhido);
    if(escala===1)return t;
    const maior=(x:{fontSize:number;lineHeight:number})=>({fontSize:Math.round(x.fontSize*escala),lineHeight:Math.round(x.lineHeight*escala)});
    return {linha:maior(t.linha),texto:maior(t.texto)};
  },[tamanhoEscolhido,escala]);
  const [height,setHeight]=useState(220),[revision,setRevision]=useState(0),[manual,setManual]=useState(false);
  const resume=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),previous=useRef(-1);
  // As mesmas funções para todas as linhas. Funções novas dentro do map e
  // um tamanho novo desfaziam o memo: toda a letra redesenhava a cada verso.
  const guardarAltura=useCallback((i:number,y:number)=>{offsets.current[i]=y;},[]);
  const tocarDaLinha=useCallback((timeMs:number)=>{seek(timeMs);setManual(false);},[seek]);
  const data=entry?.data,lines=data?.parsedLines??SEM_LINHAS,synced=!!data?.timingAvailable;
  // A LINHA, não a posição (1/10): lida a posição, as letras redesenhavam-se a
  // cada aviso do motor -- também com o leitor fechado e o ecrã desligado, que
  // elas ficam montadas no verso da capa. Assim só quando a linha muda.
  const index=usePlayer(useCallback((s:{positionMs:number})=>synced?activeLyricIndex(lines,s.positionMs):-1,[synced,lines]));
  // Os tempos das linhas: onde o refrão começa (a risca do PC).
  const tempos=useMemo(()=>lines.map(l=>l.timeMs),[lines]);
  const linhaDoRefrao=useLinhaDoRefrao(track,synced?tempos:SEM_LINHAS);
  useEffect(()=>{offsets.current={};previous.current=-1;setManual(false);void ensureLyrics(track);},[key]);
  useEffect(()=>()=>{if(resume.current)clearTimeout(resume.current);},[]);
  useEffect(()=>{
    // A face escondida continua a acompanhar a música. `visible` só controla
    // interação; parar aqui fazia as letras saltarem no fim da rotação.
    if(manual||!synced)return;
    const y=offsets.current[index];
    if(index>=0&&y===undefined)return;
    scroll.current?.scrollTo({y:Math.max(0,(y??0)-height*0.28),animated:!reduced&&previous.current>=0&&Math.abs(index-previous.current)<5});
    previous.current=index;
  },[index,manual,height,revision,synced,reduced]);
  const pauseFollowing=()=>{setManual(true);if(resume.current)clearTimeout(resume.current);resume.current=setTimeout(()=>setManual(false),5000);};
  const retry=()=>void ensureLyrics(track,true);
  return <View style={styles.root}>
    {!entry||entry.status==='loading'?<View style={styles.center}><ActivityIndicator color="#fff" /><Text style={styles.note}>Loading lyrics…</Text></View>:
      entry.status==='error'||entry.status==='missing'||data?.instrumental?
        <SemLetra tipo={data?.instrumental?'instrumental':entry.status==='missing'?'semLetra':'letraFalhou'} mensagem={entry.message} visible={visible} aoRepetir={retry} />:
      <>
        <View style={{flex:1,overflow:'hidden'}}><ScrollView ref={scroll} onLayout={e=>setHeight(e.nativeEvent.layout.height)} onContentSizeChange={()=>setRevision(v=>v+1)} {...({onWheel:pauseFollowing,style:{touchAction:'pan-y'}} as any)} onScrollBeginDrag={pauseFollowing} onTouchStart={pauseFollowing} showsVerticalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:24,paddingTop:height*0.28,paddingBottom:height*0.65}}>
          {synced?lines.map((line,i)=><LinhaDaLetra key={`${key}:${i}`} text={line.text} timeMs={line.timeMs} index={i} estado={estadoDaLinha(i,index)} refrao={i===linhaDoRefrao} reduced={reduced} visible={visible} tamanho={tamanho.linha} onLayout={guardarAltura} onPress={tocarDaLinha} />):<Text style={[styles.words,tamanho.texto]}>{data?.plainLyrics}</Text>}
        </ScrollView>
        </View>
        {/* Só aparece rodapé quando há mesmo o que dizer. O "LYRICS" em cima e
            o "LRCLIB" em baixo emolduravam a letra sem acrescentar nada, e os
            dois degradês sobre o scroll liam-se como barras em vez de desvanecer. */}
        {manual&&synced&&<View style={styles.footer}>
          <Pressable disabled={!visible} accessibilityRole="button" onPress={()=>setManual(false)} hitSlop={8}><Text style={styles.follow}>Follow lyrics</Text></Pressable>
        </View>}
      </>}
  </View>;
}
const styles=StyleSheet.create({
  root:{flex:1,paddingTop:22,paddingBottom:16},
  center:{flex:1,alignItems:'center',justifyContent:'center',paddingHorizontal:28,gap:8},
  selo:{width:60,height:60,borderRadius:30,alignItems:'center',justifyContent:'center',marginBottom:8,
    backgroundColor:'rgba(255,255,255,0.08)',borderWidth:StyleSheet.hairlineWidth,borderColor:'rgba(255,255,255,0.16)'},
  message:{color:'#fff',fontSize:19,fontWeight:'700',lineHeight:25,letterSpacing:-0.2,textAlign:'center'},note:{color:'rgba(255,255,255,0.7)',fontSize:13},
  corpo:{color:'rgba(255,255,255,0.62)',fontSize:14,lineHeight:20,textAlign:'center',maxWidth:280},
  retry:{minHeight:40,marginTop:12,paddingHorizontal:18,flexDirection:'row',alignItems:'center',gap:7,borderRadius:20,
    backgroundColor:'rgba(255,255,255,0.12)',borderWidth:StyleSheet.hairlineWidth,borderColor:'rgba(255,255,255,0.18)'},
  retryTexto:{color:'#fff',fontSize:14,fontWeight:'600'},
  line:{paddingVertical:9},words:{color:'#fff',fontSize:23,lineHeight:31,fontWeight:'700'},
  footer:{paddingHorizontal:24,paddingTop:6,flexDirection:'row',alignItems:'center',justifyContent:'flex-end'},follow:{color:'#fff',fontSize:11,fontWeight:'600'},
});
