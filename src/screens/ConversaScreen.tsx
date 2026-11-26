import { abrirAlbum } from '../navigation/abrirAlbum';
import React from 'react';
import { Platform, View } from 'react-native';
import { EvitarTeclado } from '../components/Teclado';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { SocialHub } from '../components/SocialHub';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { YtPlaylistRecommendationSheet } from '../components/YtPlaylistRecommendationSheet';
import type { AlbumPartilhado } from '../lib/albumPartilhado';
import type { Track } from '../types';
import type { OrigemDaFila } from '../lib/origemDaFila';
import { colors } from '../components/socialTokens';
import { useSocial } from '../state/social';

/** A mesma pilha nativa das páginas: o gesto revela o Social por baixo. */
export function ConversaScreen({route,navigation}:NativeStackScreenProps<RootStackParamList,'Conversa'>) {
  const safe=useSafeAreaInsets(), focused=useIsFocused();
  const target=route.params;
  // O menu de uma música da conversa é o das listas (10/11): era a folha antiga "Track actions".
  const [menu,setMenu]=React.useState<{track:Track;de?:OrigemDaFila}|null>(null);
  // `de`: a conversa ou o amigo de onde é a música, para o "Play now" o dizer no topo do leitor (25/11).
  // Um álbum mandado numa mensagem (16/11): a folha dos álbuns da página do artista, com o coração.
  const [album,setAlbum]=React.useState<AlbumPartilhado|null>(null);
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
  // O teclado anda com a conversa fotograma a fotograma (16/11, components/Teclado.tsx).
  return <EvitarTeclado behavior={Platform.OS==='ios'?'padding':undefined} keyboardVerticalOffset={-safe.bottom}
    style={{flex:1,backgroundColor:colors.bg,paddingTop:safe.top}}>
    <View style={{flex:1,minHeight:0,paddingBottom:safe.bottom}}>
      {/* Um perfil, um artista ou uma playlist abrem por cima, na mesma pilha:
          voltar regressa à conversa (o `irPara` do SocialHub). */}
      <SocialHub conversationTarget={target} visible={focused} onCloseConversation={()=>navigation.goBack()} aoMenuDaFaixa={(track,o)=>setMenu({track,de:o?.de})} aoAbrirAlbum={(a)=>abrirAlbum(navigation,{id:a.id,titulo:a.titulo,capa:a.capa,artista:a.artista,ano:a.ano,tipo:a.tipo})}/>
    </View>
    <TrackActionsSheet visible={!!menu} track={menu?.track??null} origem={menu?.de??null} onClose={()=>setMenu(null)}/>
  </EvitarTeclado>;
}
