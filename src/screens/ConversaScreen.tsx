import React from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { SocialHub } from '../components/SocialHub';
import { colors } from '../components/socialTokens';
import { useSocial } from '../state/social';

/** A mesma pilha nativa das páginas: o gesto revela o Social por baixo. */
export function ConversaScreen({route,navigation}:NativeStackScreenProps<RootStackParamList,'Conversa'>) {
  const safe=useSafeAreaInsets(), focused=useIsFocused();
  const target=route.params;
  useFocusEffect(React.useCallback(()=>{
    useSocial.setState({conversation:target});
    return ()=>{
      const current=useSocial.getState().conversation;
      if(current?.kind===target.kind&&current.id===target.id)useSocial.setState({conversation:null});
    };
  },[target]));
  // A margem de baixo vive por dentro: o `padding` do KeyboardAvoidingView
  // substitui o paddingBottom do próprio estilo, e com o teclado fechado a
  // caixa de escrever ficava por baixo da barra do iPhone. O desvio negativo
  // desconta essa margem quando o teclado abre.
  return <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} keyboardVerticalOffset={-safe.bottom}
    style={{flex:1,backgroundColor:colors.bg,paddingTop:safe.top}}>
    <View style={{flex:1,minHeight:0,paddingBottom:safe.bottom}}>
      {/* Um perfil, um artista ou uma playlist abrem por cima, na mesma pilha:
          voltar regressa à conversa (o `irPara` do SocialHub). */}
      <SocialHub conversationTarget={target} visible={focused} onCloseConversation={()=>navigation.goBack()}/>
    </View>
  </KeyboardAvoidingView>;
}
