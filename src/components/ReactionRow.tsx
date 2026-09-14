import React,{useRef,useState} from 'react';
import {Animated,PanResponder,Platform,Pressable,Text,TextInput,View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type {Reaction} from '../api/social';
import {hapticSelection} from '../lib/haptics';
import {colors,radii} from './socialTokens';
import {socialStyles as s} from './socialUI';

/** As primeiras da fila. As restantes vêm do teclado do sistema, pelo `+`. */
const RAPIDAS=['❤️','😂','🔥','😮','😢','👍'];

/** Quanto se arrasta para a esquerda até a resposta ficar armada, e o máximo. */
const LIMIAR_DA_RESPOSTA=56;
const ARRASTO_MAXIMO=72;

/**
 * O balão de uma mensagem, com as maneiras de chegar às reações e à resposta.
 *
 * No telemóvel premir sem largar abre as reações (e o "Reply"); deslizar para a
 * ESQUERDA responde. Para a esquerda e não para a direita como no Instagram: a
 * direita é o gesto de voltar do chat (`SocialModal`, na fase de captura), e os
 * dois no mesmo sentido disputavam o dedo. No PC, dois botões que aparecem ao
 * passar o rato, porque segurar o botão do rato numa mensagem não é gesto que
 * alguém faça. O estado do rato vive aqui e não no `style` do Pressable: o
 * React Native Web só passa `hovered` ao `style`, nunca à função dos filhos.
 *
 * O balão NÃO leva `accessibilityRole="button"`. Uma mensagem não é um
 * controlo -- e com esse papel o React Native Web escreve um `<button>`, o
 * que punha o botão das reações dentro de outro botão: HTML inválido, e um
 * leitor de ecrã a anunciar um controlo dentro de outro. O que se opera aqui
 * são os botões; o balão só reconhece gestos.
 *
 * O arrasto vive num `Animated.View` à VOLTA do Pressable, e não no Pressable:
 * espalhar os `panHandlers` no próprio Pressable substituía os dele e matava o
 * toque longo.
 */
export function MessageBubble({own,aberto,onAbrir,onResponder,style,children,rotulo}:{
  own:boolean; aberto:boolean; onAbrir:()=>void; onResponder?:()=>void; style:any; rotulo:string; children:React.ReactNode;
}) {
  const [sobre,setSobre]=useState(false);
  const web=Platform.OS==='web';
  const arrasto=useRef(new Animated.Value(0)).current;
  const responder=useRef(onResponder);responder.current=onResponder;
  const armada=useRef(false);
  const voltar=()=>{armada.current=false;Animated.spring(arrasto,{toValue:0,useNativeDriver:true,bounciness:6}).start();};
  const gesto=useRef(PanResponder.create({
    // Só claramente horizontal e para a esquerda: um scroll da conversa nunca
    // passa neste crivo, e a direita fica para o gesto de voltar.
    onMoveShouldSetPanResponder:(_e,g)=>!!responder.current&&g.dx<-12&&Math.abs(g.dx)>Math.abs(g.dy)*2,
    onPanResponderMove:(_e,g)=>{
      const x=Math.max(-ARRASTO_MAXIMO,Math.min(0,g.dx));
      arrasto.setValue(x);
      const agora=x<=-LIMIAR_DA_RESPOSTA;
      // O toque diz que largar agora responde, como no Instagram.
      if(agora!==armada.current){armada.current=agora;if(agora)hapticSelection();}
    },
    onPanResponderRelease:()=>{if(armada.current)responder.current?.();voltar();},
    onPanResponderTerminate:voltar,
  })).current;
  const icone=arrasto.interpolate({inputRange:[-LIMIAR_DA_RESPOSTA,0],outputRange:[1,0],extrapolate:'clamp'});
  const botao=({pressed}:any)=>[{width:26,height:26,borderRadius:13,alignItems:'center',justifyContent:'center',
    backgroundColor:colors.surfaceHigh,borderWidth:1,borderColor:colors.borderStrong},pressed&&{opacity:0.7}];
  return <Animated.View {...(web?{}:gesto.panHandlers)} style={{transform:[{translateX:arrasto}],maxWidth:'100%'}}>
    {!web&&onResponder?<Animated.View pointerEvents="none" style={{position:'absolute',right:-34,top:0,bottom:0,justifyContent:'center',opacity:icone}}>
      <Ionicons name="arrow-undo" size={18} color={colors.textSecondary}/>
    </Animated.View>:null}
    <Pressable delayLongPress={280} onLongPress={onAbrir}
      onHoverIn={()=>setSobre(true)} onHoverOut={()=>setSobre(false)}
      accessibilityLabel={rotulo}
      accessibilityActions={onResponder?[{name:'reply',label:'Reply'}]:undefined}
      onAccessibilityAction={e=>{if(e.nativeEvent.actionName==='reply')onResponder?.();}}
      style={style}>
      {web&&(sobre||aberto)&&<View style={{position:'absolute',top:-10,zIndex:2,flexDirection:'row',gap:4,
        right:own?undefined:-10,left:own?-10:undefined}}>
        {onResponder&&<Pressable accessibilityRole="button" accessibilityLabel="Reply to this message" onPress={onResponder} style={botao}>
          <Ionicons name="arrow-undo-outline" size={14} color={colors.textSecondary}/>
        </Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel="React to this message" onPress={onAbrir} style={botao}>
          <Ionicons name="happy-outline" size={14} color={colors.textSecondary}/>
        </Pressable>
      </View>}
      {children}
    </Pressable>
  </Animated.View>;
}

/**
 * As reações de uma mensagem, e o painel para escolher a tua.
 *
 * Uma por pessoa: tocar noutro emoji troca, tocar no mesmo tira. É a regra
 * que a chave primária da tabela já impõe, repetida aqui para o toque fazer
 * o que parece. O painel leva também o "Reply": premir sem largar é o gesto que
 * toda a gente tenta primeiro, e tem de chegar à resposta.
 */
export function ReactionRow({reactions,myId,own,aberto,onEscolher,onFechar,onResponder}:{
  reactions:Reaction[];
  myId?:string;
  /** Alinha com o balão: as minhas mensagens estão encostadas à direita. */
  own:boolean;
  aberto:boolean;
  onEscolher:(emoji:string|null)=>void;
  onFechar:()=>void;
  onResponder?:()=>void;
}) {
  const [outro,setOutro]=useState('');
  const campo=useRef<TextInput>(null);
  const minha=reactions.find(r=>r.userId===myId)?.emoji;

  // Agrupadas por emoji, pela ordem em que apareceram: a lista não salta de
  // sítio quando alguém reage.
  const contagem:{emoji:string;n:number;euTambem:boolean}[]=[];
  for(const r of reactions){
    const ja=contagem.find(c=>c.emoji===r.emoji);
    if(ja){ja.n++;ja.euTambem=ja.euTambem||r.userId===myId;}
    else contagem.push({emoji:r.emoji,n:1,euTambem:r.userId===myId});
  }

  if(!aberto&&!contagem.length) return null;

  return <View style={{alignSelf:own?'flex-end':'flex-start',gap:6,maxWidth:'100%'}}>
    {aberto&&<View style={[s.row,{gap:2,padding:4,borderRadius:radii.pill,backgroundColor:colors.surfaceHigh,
      borderWidth:1,borderColor:colors.borderStrong,flexWrap:'wrap'}]}>
      {onResponder&&<Pressable accessibilityRole="button" accessibilityLabel="Reply to this message"
        onPress={()=>{onFechar();onResponder();}}
        style={({pressed,hovered}:any)=>[s.row,{height:36,gap:5,paddingHorizontal:10,borderRadius:18,alignItems:'center'},
          (pressed||hovered)&&{backgroundColor:colors.surfacePressed}]}>
        <Ionicons name="arrow-undo-outline" size={17} color={colors.text}/>
        <Text style={[s.text,{fontSize:14}]}>Reply</Text>
      </Pressable>}
      {RAPIDAS.map(e=><Pressable key={e} accessibilityRole="button" accessibilityLabel={`React with ${e}`}
        onPress={()=>onEscolher(minha===e?null:e)}
        style={({pressed,hovered}:any)=>[{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center'},
          (pressed||hovered)&&{backgroundColor:colors.surfacePressed},minha===e&&{backgroundColor:colors.surfacePressed}]}>
        <Text style={{fontSize:20}}>{e}</Text>
      </Pressable>)}
      {/* O teclado de emoji do sistema. O React Native não expõe um selector,
          por isso abre-se um campo invisível e fica-se com o primeiro emoji
          escrito — é o que as outras apps fazem por baixo. */}
      <Pressable accessibilityRole="button" accessibilityLabel="More emoji" onPress={()=>campo.current?.focus()}
        style={({pressed,hovered}:any)=>[{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center'},
          (pressed||hovered)&&{backgroundColor:colors.surfacePressed}]}>
        <Ionicons name="add" size={19} color={colors.textSecondary}/>
      </Pressable>
      <TextInput ref={campo} value={outro} onChangeText={texto=>{
          setOutro('');
          const primeiro=Array.from(texto)[0];
          // Só emoji: letras e números não são reação.
          if(primeiro&&!/[a-zA-Z0-9]/.test(primeiro)){campo.current?.blur();onEscolher(primeiro);}
        }}
        onBlur={onFechar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={{position:'absolute',width:1,height:1,opacity:0}}
        {...(Platform.OS==='web'?{}:{keyboardType:'default' as const})}/>
    </View>}

    {!!contagem.length&&<View style={[s.row,{gap:4,flexWrap:'wrap'}]}>
      {contagem.map(c=><Pressable key={c.emoji} accessibilityRole="button"
        accessibilityLabel={c.euTambem?`Remove your ${c.emoji}`:`React with ${c.emoji}`}
        onPress={()=>onEscolher(c.euTambem?null:c.emoji)}
        style={({pressed,hovered}:any)=>[s.row,{gap:4,paddingHorizontal:8,paddingVertical:3,borderRadius:radii.pill,
          backgroundColor:colors.surface,borderWidth:1,borderColor:c.euTambem?colors.borderStrong:colors.border},
          (pressed||hovered)&&{backgroundColor:colors.surfacePressed}]}>
        <Text style={{fontSize:13}}>{c.emoji}</Text>
        {c.n>1&&<Text style={[s.muted,{fontSize:11,lineHeight:14}]}>{c.n}</Text>}
      </Pressable>)}
    </View>}
  </View>;
}
