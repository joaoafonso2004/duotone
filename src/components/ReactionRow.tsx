import React,{useRef,useState} from 'react';
import {Platform,Pressable,Text,TextInput,View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type {Reaction} from '../api/social';
import {colors,radii} from './socialTokens';
import {socialStyles as s} from './socialUI';

/** As primeiras da fila. As restantes vêm do teclado do sistema, pelo `+`. */
const RAPIDAS=['❤️','😂','🔥','😮','😢','👍'];

/**
 * O balão de uma mensagem, com as duas formas de chegar às reações.
 *
 * No telemóvel premir sem largar; no PC um botão que aparece ao passar o
 * rato, porque segurar o botão do rato numa mensagem não é gesto que alguém
 * faça. O estado do rato vive aqui e não no `style` do Pressable: o
 * React Native Web só passa `hovered` ao `style`, nunca à função dos filhos.
 *
 * O balão NÃO leva `accessibilityRole="button"`. Uma mensagem não é um
 * controlo -- e com esse papel o React Native Web escreve um `<button>`, o
 * que punha o botão das reações dentro de outro botão: HTML inválido, e um
 * leitor de ecrã a anunciar um controlo dentro de outro. O que se opera aqui
 * é o botão das reações; o balão só reconhece um gesto longo.
 */
export function MessageBubble({own,aberto,onAbrir,style,children,rotulo}:{
  own:boolean; aberto:boolean; onAbrir:()=>void; style:any; rotulo:string; children:React.ReactNode;
}) {
  const [sobre,setSobre]=useState(false);
  const web=Platform.OS==='web';
  return <Pressable delayLongPress={280} onLongPress={onAbrir}
    onHoverIn={()=>setSobre(true)} onHoverOut={()=>setSobre(false)}
    accessibilityLabel={rotulo} style={style}>
    {web&&(sobre||aberto)&&<Pressable accessibilityRole="button" accessibilityLabel="React to this message"
      onPress={onAbrir} style={({pressed}:any)=>[{position:'absolute',top:-10,zIndex:2,
        right:own?undefined:-10,left:own?-10:undefined,
        width:26,height:26,borderRadius:13,alignItems:'center',justifyContent:'center',
        backgroundColor:colors.surfaceHigh,borderWidth:1,borderColor:colors.borderStrong},pressed&&{opacity:0.7}]}>
      <Ionicons name="happy-outline" size={14} color={colors.textSecondary}/>
    </Pressable>}
    {children}
  </Pressable>;
}

/**
 * As reações de uma mensagem, e o painel para escolher a tua.
 *
 * Uma por pessoa: tocar noutro emoji troca, tocar no mesmo tira. É a regra
 * que a chave primária da tabela já impõe, repetida aqui para o toque fazer
 * o que parece.
 */
export function ReactionRow({reactions,myId,own,aberto,onEscolher,onFechar}:{
  reactions:Reaction[];
  myId?:string;
  /** Alinha com o balão: as minhas mensagens estão encostadas à direita. */
  own:boolean;
  aberto:boolean;
  onEscolher:(emoji:string|null)=>void;
  onFechar:()=>void;
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
