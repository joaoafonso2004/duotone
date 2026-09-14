import React from 'react';
import {Pressable,Text,View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {colors,radii} from './socialTokens';
import {socialStyles as s} from './socialUI';

/**
 * A citação dentro do balão de uma resposta: de quem era a original e o começo
 * do que dizia. Tocar leva até ela, quando está carregada. Ver lib/respostas.ts.
 *
 * Uma original que o servidor já não devolve (apagada entretanto, ou de uma
 * conversa a que se deixou de ter acesso) diz isso mesmo, em vez de sumir: a
 * resposta sem contexto leria-se como uma mensagem solta.
 */
export function CitacaoDaResposta({autor,excerto,accent,onPress}:{
  autor:string|null; excerto:string|null; accent:string; onPress?:()=>void;
}) {
  const perdida=!excerto;
  return <Pressable disabled={!onPress} onPress={onPress}
    accessibilityRole={onPress?'button':undefined}
    accessibilityLabel={perdida?'Reply to a message that is no longer available':`Reply to ${autor}: ${excerto}. Show message`}
    style={({pressed}:any)=>[{alignSelf:'stretch',gap:2,paddingHorizontal:9,paddingVertical:6,borderRadius:8,
      borderLeftWidth:3,borderLeftColor:accent,backgroundColor:colors.surfacePressed},pressed&&{opacity:0.7}]}>
    {perdida
      ?<Text style={[s.muted,{fontSize:12,fontStyle:'italic'}]}>Original message unavailable</Text>
      :<>
        <Text numberOfLines={1} style={{color:accent,fontSize:12,fontWeight:'600'}}>{autor}</Text>
        <Text numberOfLines={2} style={[s.muted,{fontSize:12.5}]}>{excerto}</Text>
      </>}
  </Pressable>;
}

/** Por cima da caixa de escrita, enquanto se responde. O X larga a resposta. */
export function BarraDeResposta({titulo,excerto,accent,onCancelar}:{
  titulo:string; excerto:string; accent:string; onCancelar:()=>void;
}) {
  return <View style={[s.row,{gap:10,paddingHorizontal:12,paddingVertical:8,borderRadius:radii.lg,
    backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border}]}>
    <Ionicons name="arrow-undo" size={16} color={accent}/>
    <View style={{flex:1,minWidth:0}}>
      <Text numberOfLines={1} style={{color:accent,fontSize:12,fontWeight:'600'}}>{titulo}</Text>
      <Text numberOfLines={1} style={[s.muted,{fontSize:12.5}]}>{excerto}</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Cancel reply" hitSlop={10} onPress={onCancelar}
      style={({pressed}:any)=>({padding:4,opacity:pressed?0.6:1})}>
      <Ionicons name="close" size={18} color={colors.textSecondary}/>
    </Pressable>
  </View>;
}
