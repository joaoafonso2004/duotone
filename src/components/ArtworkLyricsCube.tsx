import {acceptsCubeSwipe,cubeDirection,cubeProgress,cubeDestination} from '../lib/lyricsCubeGesture';
import React, {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Animated,Image,PanResponder,Platform,StyleSheet,View} from 'react-native';
import { Image as ImagemDaCapa } from 'expo-image';
import {useReducedMotion} from '../hooks/useReducedMotion';
import type {Track} from '../types';
import {LyricsView} from './LyricsView';
import {LinearGradient} from 'expo-linear-gradient';
import {CAPA_FLUTUANTE,geometriaDaLateral,LATERAIS,mosaicoDoGrao,type Lateral} from '../lib/capaFlutuante3D';
import type {PoseDaCapa3D} from './CapaFlutuante3D';
import type {MontagemDaCapa} from '../hooks/useMontagemDaCapa';
import {desfoqueLeve} from '../lib/capaGrande';

type Props={track:Track;size:number;artwork?:string|null;front:React.ReactNode;showLyrics:boolean;onChange:(open:boolean)=>void;
  /**
   * Avisa quem monta o cubo de que ele esta a virar -- durante o arrasto do
   * dedo E durante a mola que o assenta.
   *
   * Existe por causa da sombra da capa no leitor. Ela vive numa placa POR TRAS
   * do cubo, e uma placa nao roda: a meio da volta a perspectiva encolhe a
   * face que se ve, e um canto da placa espreitava por tras dela. Com este
   * aviso, quem a desenha apaga-a enquanto o cubo se mexe.
   *
   * Opcional: quem nao a passar nao paga nada, e e por isso que a pagina do PC
   * fica exactamente como estava.
   */
  aoRodar?:(aRodar:boolean)=>void;
  /**
   * O raio das faces. A capa 3D do iPhone usa cantos quase retos
   * (lib/capaFlutuante3D.ts): num objeto com espessura, um canto largo lê-se
   * como plástico. Sem ele fica o de sempre.
   */
  raio?:number;
  /**
   * A pose da capa 3D do iPhone (CapaFlutuante3D). Com ela, o cubo desenha-se
   * como uma CAIXA de seis faces -- a capa, as letras no verso e quatro laterais
   * com a própria capa -- e o gesto vira a caixa inteira 180° em vez de rodar um
   * cubo de 90°. Sem ela (o PC, o modo Simple) fica exatamente como era.
   */
  pose3D?:PoseDaCapa3D|null};
// Translação Z equivalente, também nos motores nativos que só expõem X e Y.
const depth=(z:number)=>[{rotateY:'90deg'},{translateX:-z},{rotateY:'-90deg'}];

/** Onde está uma peça da montagem (0 longe, 1 no sítio), com o recuo se for a que está presa. */
const posicaoDaPeca=(m:MontagemDaCapa,i:number)=>m.proxima===i?Animated.subtract(m.pecas[i],m.recuo):m.pecas[i];
/** A peça a chegar ao sítio ao longo da sua normal: a `distancia` quando está longe, 0 no sítio. */
const chegar=(m:MontagemDaCapa|null,i:number,distancia:number)=>m
  ?[{rotateY:'90deg'},{translateX:posicaoDaPeca(m,i).interpolate({inputRange:[0,1],outputRange:[-distancia,0]})},{rotateY:'-90deg'}]
  :[];

/**
 * Uma lateral da caixa 3D: a faixa da capa junto àquela borda, espelhada para a
 * borda continuar pela aresta, com um véu que escurece para trás. Vira com a
 * face: começa pela mesma pose e o mesmo pivô.
 *
 * SEM grão, de propósito: vista de lado, a lateral espreme o mosaico de 60 pt em
 * poucos píxeis, e o grão só se lia como uma névoa clara -- metade das arestas
 * esbranquiçadas (14/9). A outra metade era a emenda com a face: por isso fica
 * `recuoDasLaterais` para dentro.
 *
 * É rasterizada: o conteúdo não muda, e assim a GPU compõe um bitmap por
 * fotograma da flutuação em vez de recorte, degradê e mosaicos. A transformação
 * 3D continua a animar por cima dele.
 */
function LateralDaCaixa({lado,size,pose3D,virar,artwork}:{lado:Lateral;size:number;pose3D:PoseDaCapa3D;
  virar:Animated.AnimatedInterpolation<string>|string;artwork?:string|null}){
  const t=pose3D.espessura;
  const g=geometriaDaLateral(lado,size,t);
  const meio=size/2-CAPA_FLUTUANTE.recuoDasLaterais;
  const colocar=lado==='esquerda'?[{translateX:-meio},{rotateY:'-90deg'}]
    :lado==='direita'?[{translateX:meio},{rotateY:'90deg'}]
    :lado==='cima'?[{translateY:-meio},{rotateX:'90deg'}]
    :[{translateY:meio},{rotateX:'-90deg'}];
  const veu:[string,string]=[`rgba(0,0,0,${g.veu.frente})`,`rgba(0,0,0,${g.veu.tras})`];
  const m=pose3D.montagem;
  // A esquerda (e a direita, escondida) encaixa com o 1.º bocado; a de baixo (e a de cima) com o 2.º.
  const grupo=lado==='esquerda'||lado==='direita'?0:1;
  return <Animated.View pointerEvents="none" shouldRasterizeIOS style={{position:'absolute',left:g.left,top:g.top,width:g.largura,height:g.altura,
    overflow:'hidden',backfaceVisibility:'hidden',opacity:m?Animated.multiply(pose3D.pose,m.opacidades[grupo]):pose3D.pose,
    transform:[...pose3D.postura,...depth(-t/2),{rotateY:virar},...colocar,...chegar(m,grupo,0.26*size)]}}>
    <View style={{width:g.largura,height:g.altura,overflow:'hidden',transform:[g.espelho==='x'?{scaleX:-1}:{scaleY:-1}]}}>
      {artwork?<ImagemDaCapa source={{uri:artwork}} cachePolicy="memory-disk" contentFit="cover" style={{position:'absolute',left:g.imagem.x,top:g.imagem.y,width:size,height:size}} />:null}
    </View>
    <LinearGradient colors={veu} start={g.degrade.start} end={g.degrade.end} style={StyleSheet.absoluteFill} />
  </Animated.View>;
}

/**
 * O grão de pedra por cima de uma face, repetido À MÃO: uma imagem de 60 pt por
 * mosaico (`mosaicoDoGrao`). O modo `repeat` da Image não repetia no iPhone --
 * a 2.9.2 mostrava um mosaico só, no canto de cima à esquerda (13/9). Não apanha
 * toques: as letras continuam a deslizar.
 *
 * A opacidade (42%) já vem no PNG, e o conjunto é rasterizado: é estático, e a
 * GPU compõe UMA imagem por face em vez de dezenas de mosaicos com opacidade de
 * grupo -- que obrigava a desenhar à parte a cada fotograma da flutuação.
 */
function GraoDaFace({pose3D,largura,altura}:{pose3D:PoseDaCapa3D;largura:number;altura:number}){
  const lado=CAPA_FLUTUANTE.grao.ladoPt;
  const mosaicos=useMemo(()=>mosaicoDoGrao(largura,altura,lado),[largura,altura,lado]);
  return <View pointerEvents="none" shouldRasterizeIOS style={[StyleSheet.absoluteFill,{overflow:'hidden'}]}>
    {mosaicos.map(({x,y})=><Image key={`${x}:${y}`} source={pose3D.grao.fonte} style={{position:'absolute',left:x,top:y,width:lado,height:lado}} />)}
  </View>;
}

/** Duas faces do mesmo cubo. O motor de áudio vive fora destas transformações. */
export function ArtworkLyricsCube({track,size,artwork,front,showLyrics,onChange,aoRodar,raio=20,pose3D}:Props){
  const reduced=useReducedMotion();
  const progress=useRef(new Animated.Value(showLyrics?1:0)).current;
  const [direction,setDirection]=useState(1);
  const [moving,setMoving]=useState(false);
  // O `moving` ja existia para calar as letras a meio da volta; agora tambem
  // sai para fora. Num efeito e nao nas chamadas ao `setMoving`, para o aviso
  // sair uma vez por MUDANCA e nao uma vez por chamada.
  const aoRodarRef=useRef(aoRodar);aoRodarRef.current=aoRodar;
  useEffect(()=>{aoRodarRef.current?.(moving);},[moving]);
  const cubeRef=useRef<any>(null);
  const latest=useRef({showLyrics,onChange,size,reduced});latest.current={showLyrics,onChange,size,reduced};
  const gesture=useRef({start:0,direction:1});
  const webGesture=useRef({pointer:-1,x:0,y:0,time:0,active:false,start:0,direction:1});
  const alive=useRef(true);
  // Ao sair, diz que ja nao esta a rodar. Sem isto, fechar o leitor a meio de
  // uma volta deixava o aviso presa em `true` -- e a sombra da capa nao voltava
  // a aparecer da proxima vez que se abrisse.
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;progress.stopAnimation();aoRodarRef.current?.(false);};},[progress]);
  const settle=useCallback((value:number)=>{
    progress.stopAnimation();
    if(latest.current.reduced){progress.setValue(value);setMoving(false);return;}
    setMoving(true);
    Animated.spring(progress,{toValue:value,stiffness:230,damping:27,mass:1,useNativeDriver:true}).start(({finished})=>{if(finished&&alive.current)setMoving(false);});
  },[progress]);
  useEffect(()=>{settle(showLyrics?1:0);},[showLyrics,reduced,settle]);
  const querGesto=(_:unknown,g:{dx:number;dy:number})=>{
      if(!acceptsCubeSwipe(g.dx,g.dy))return false;
      // O PanResponder repõe dx a zero ANTES de chamar Grant.
      gesture.current={start:latest.current.showLyrics?1:0,direction:cubeDirection(latest.current.showLyrics,g.dx)};
      return true;
  };
  const responder=useMemo(()=>PanResponder.create({
    onMoveShouldSetPanResponderCapture:querGesto,
    // No browser, o ScrollView das letras pode responder antes da fase de
    // captura. A fase normal dá ao cubo a mesma decisão para arrastos laterais.
    onMoveShouldSetPanResponder:querGesto,
    onPanResponderGrant:()=>{
      progress.stopAnimation();setDirection(gesture.current.direction);setMoving(true);
    },
    onPanResponderMove:(_,g)=>{
      const {start,direction:dir}=gesture.current;
      if(!latest.current.reduced)progress.setValue(cubeProgress(start,g.dx,latest.current.size,dir));
    },
    onPanResponderRelease:(_,g)=>{
      const {start,direction:dir}=gesture.current;
      const go=cubeDestination(start,g.dx,g.vx,latest.current.size,dir);
      latest.current.onChange(go);settle(go?1:0);
    },
    onPanResponderTerminationRequest:()=>false,
    onPanResponderTerminate:()=>settle(latest.current.showLyrics?1:0),
  }),[progress,settle]);
  // No Windows, um Pressable das letras pode tornar-se responder logo no
  // pointer-down. Um listener DOM em captura observa primeiro a direção:
  // vertical continua no ScrollView; horizontal passa para o cubo. O ref é
  // usado porque React Native Web não encaminha consistentemente as props
  // onPointer*Capture de View para o elemento DOM.
  useEffect(()=>{
    if(Platform.OS!=='web')return;
    const element=cubeRef.current as HTMLElement|null;
    if(!element?.addEventListener)return;
    const down=(event:PointerEvent)=>{
      if(event.button!==0)return;
      webGesture.current={pointer:event.pointerId,x:event.clientX,y:event.clientY,time:Date.now(),active:false,start:latest.current.showLyrics?1:0,direction:1};
    };
    const move=(event:PointerEvent)=>{
      const g=webGesture.current;if(g.pointer<0||g.pointer!==event.pointerId)return;
      const dx=event.clientX-g.x,dy=event.clientY-g.y;
      if(!g.active){
        if(!acceptsCubeSwipe(dx,dy))return;
        g.active=true;g.direction=cubeDirection(latest.current.showLyrics,dx);
        progress.stopAnimation();setDirection(g.direction);setMoving(true);
        element.setPointerCapture?.(g.pointer);
      }
      event.preventDefault();event.stopPropagation();
      if(!latest.current.reduced)progress.setValue(cubeProgress(g.start,dx,latest.current.size,g.direction));
    };
    const finish=(event:PointerEvent)=>{
      const g=webGesture.current;if(g.pointer<0||g.pointer!==event.pointerId)return;
      const dx=event.clientX-g.x;webGesture.current.pointer=-1;
      if(!g.active)return;
      event.preventDefault();event.stopPropagation();
      const go=cubeDestination(g.start,dx,dx/Math.max(1,Date.now()-g.time),latest.current.size,g.direction);
      latest.current.onChange(go);settle(go?1:0);
    };
    const cancel=()=>{const active=webGesture.current.active;webGesture.current.pointer=-1;if(active)settle(latest.current.showLyrics?1:0);};
    element.addEventListener('pointerdown',down,true);element.addEventListener('pointermove',move,true);
    element.addEventListener('pointerup',finish,true);element.addEventListener('pointercancel',cancel,true);
    return()=>{element.removeEventListener('pointerdown',down,true);element.removeEventListener('pointermove',move,true);
      element.removeEventListener('pointerup',finish,true);element.removeEventListener('pointercancel',cancel,true);};
  },[progress,settle]);
  const radius=size/2;
  const rotation=progress.interpolate({inputRange:[0,1],outputRange:['0deg',`${-direction*90}deg`]});
  const base=[{perspective:size*3},...depth(-radius),{rotateY:rotation}];
  const frontStyle=reduced?{opacity:showLyrics?0:1}:{transform:[...base,...depth(radius)]};
  const lyricsStyle=reduced?{opacity:showLyrics?1:0}:{transform:[...base,{rotateY:`${direction*90}deg`},...depth(radius)]};
  // A caixa 3D VIRA inteira: 180° à volta do plano médio da espessura, com as
  // letras no verso, e pousa na mesma pose. O pivô é o meio da espessura --
  // senão a caixa avançava para quem vê a meio da volta.
  const espessura=pose3D?.espessura??0;
  const virar=progress.interpolate({inputRange:[0,1],outputRange:['0deg',`${-direction*180}deg`]});
  const pivo=pose3D?[...pose3D.postura,...depth(-espessura/2),{rotateY:virar}]:[];
  // A montagem com o download (useMontagemDaCapa): a face chega ao sítio ao longo
  // da normal e só pousa com a faixa pronta. O verso não se monta: quem está a
  // ler as letras não pode perdê-las a cada música.
  const m=pose3D?.montagem??null;
  // O verso desfoca a miniatura pequena, não a capa grande (ver desfoqueLeve).
  const verso=desfoqueLeve(artwork,28);
  const transformDaFace=pose3D?(reduced?[...pose3D.postura]:[...pivo,...depth(espessura/2)]):[];
  const frontStyle3D=pose3D?(reduced?{opacity:showLyrics?0:(m?m.opacidades[2]:1),transform:[...pose3D.postura]}:{opacity:m?m.opacidades[2]:1,transform:[...transformDaFace,...chegar(m,2,0.5*size)]}):null;
  const lyricsStyle3D=pose3D?(reduced?{opacity:showLyrics?1:0,transform:[...pose3D.postura]}:{transform:[...pivo,...depth(-espessura/2),{rotateY:'180deg'}]}):null;
  return <View ref={cubeRef} {...(Platform.OS==='web'?{}:responder.panHandlers)} testID="artwork-lyrics-cube"
    accessible={!showLyrics} accessibilityLabel={showLyrics?'Lyrics':'Album artwork'}
    role={Platform.OS==='web'?'group':undefined} accessibilityRole={Platform.OS==='web'?undefined:'adjustable'}
    accessibilityValue={{text:showLyrics?'Lyrics':'Artwork'}}
    accessibilityActions={[{name:'activate',label:showLyrics?'Show artwork':'Show lyrics'},{name:'increment',label:'Turn artwork'},{name:'decrement',label:'Turn artwork'}]}
    onAccessibilityAction={()=>onChange(!showLyrics)} onAccessibilityEscape={()=>onChange(false)}
    {...(Platform.OS==='web'?{tabIndex:0,onKeyDown:(event:any)=>{
      if(event.target!==event.currentTarget)return;
      if(['ArrowLeft','ArrowRight','Enter',' '].includes(event.key)){event.preventDefault();onChange(!showLyrics);}
      else if(event.key==='Escape'&&showLyrics){event.preventDefault();onChange(false);}
    }}:{})} style={[{width:size,height:size},Platform.OS==='web'&&({touchAction:'pan-y',userSelect:'none'} as any)]}>
    {pose3D?LATERAIS.map((l)=><LateralDaCaixa key={l.lado} lado={l.lado} size={size} pose3D={pose3D} virar={reduced?'0deg':virar} artwork={artwork} />):null}
    {/* O lugar da face antes de ela pousar, e a luz que lhe dá a volta enquanto
        ainda não há download. Ver lib/montagemDaCapa.ts. */}
    {m?<Animated.View pointerEvents="none" style={[styles.fantasma,{borderRadius:raio,opacity:m.contorno,transform:transformDaFace}]} />:null}
    {m?<Animated.View pointerEvents="none" style={[styles.espera,{transform:transformDaFace}]}>
      <Animated.View style={[styles.luz,{opacity:m.luz.opacidade,transform:[
        {translateX:m.luz.fase.interpolate({inputRange:[0,0.25,0.5,0.75,1],outputRange:[0,size,size,0,0]})},
        {translateY:m.luz.fase.interpolate({inputRange:[0,0.25,0.5,0.75,1],outputRange:[0,0,size,size,0]})},
      ]}]} />
    </Animated.View>:null}
    <Animated.View pointerEvents="none" aria-hidden={showLyrics} accessibilityElementsHidden={showLyrics} importantForAccessibility={showLyrics?'no-hide-descendants':'auto'} style={[styles.face,{borderRadius:raio},frontStyle3D??frontStyle]}>
      {front}
      {pose3D?<GraoDaFace pose3D={pose3D} largura={size} altura={size} />:null}
      <Animated.View style={[StyleSheet.absoluteFill,{backgroundColor:'#000',opacity:progress.interpolate({inputRange:[0,1],outputRange:[0,0.35]})}]} />
    </Animated.View>
    <Animated.View pointerEvents={showLyrics&&!moving?'auto':'none'} aria-hidden={!showLyrics} accessibilityElementsHidden={!showLyrics} importantForAccessibility={showLyrics?'auto':'no-hide-descendants'} style={[styles.face,{borderRadius:raio},lyricsStyle3D??lyricsStyle]}>
      {verso?<ImagemDaCapa source={{uri:verso.uri}} cachePolicy="memory-disk" contentFit="cover" blurRadius={verso.raio} style={[StyleSheet.absoluteFill,{opacity:0.6,transform:[{scale:1.12}]}]} />:null}
      <View style={[StyleSheet.absoluteFill,{backgroundColor:'rgba(8,8,15,0.5)'}]} />
      {/* As letras recomeçam por faixa; o cubo à volta delas fica montado. */}
      <LyricsView key={`${track.source}:${track.sourceId}`} track={track} visible={showLyrics&&!moving} />
      {pose3D?<GraoDaFace pose3D={pose3D} largura={size} altura={size} />:null}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:'#000',opacity:progress.interpolate({inputRange:[0,1],outputRange:[0.4,0]})}]} />
    </Animated.View>
  </View>;
}
const styles=StyleSheet.create({
  face:{position:'absolute',top:0,bottom:0,left:0,right:0,backgroundColor:'#16161d',borderRadius:20,overflow:'hidden',backfaceVisibility:'hidden'},
  fantasma:{position:'absolute',top:0,bottom:0,left:0,right:0,borderWidth:1,borderColor:'rgba(255,255,255,0.9)',backgroundColor:'rgba(255,255,255,0.05)',backfaceVisibility:'hidden'},
  espera:{position:'absolute',top:0,bottom:0,left:0,right:0,backfaceVisibility:'hidden'},
  luz:{position:'absolute',left:-3.5,top:-3.5,width:7,height:7,borderRadius:3.5,backgroundColor:'#fff',shadowColor:'#fff',shadowOpacity:0.8,shadowRadius:6,shadowOffset:{width:0,height:0}},
});
