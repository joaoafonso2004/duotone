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
import { colors } from '../components/socialTokens';
import { useSocial } from '../state/social';

/** A mesma pilha nativa das páginas: o gesto revela o Social por baixo. */
export function ConversaScreen({route,navigation}:NativeStackScreenProps<RootStackParamList,'Conversa'>) {
  const safe=useSafeAreaInsets(), focused=useIsFocused();
  const target=route.params;
  // O menu de uma música da conversa é o das listas (10/11): era a folha antiga "Track actions".
  const [menu,setMenu]=React.useState<Track|null>(null);
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
      <SocialHub conversationTarget={target} visible={focused} onCloseConversation={()=>navigation.goBack()} aoMenuDaFaixa={setMenu} aoAbrirAlbum={setAlbum}/>
    </View>
    <TrackActionsSheet visible={!!menu} track={menu} onClose={()=>setMenu(null)}/>
    <YtPlaylistRecommendationSheet visible={!!album} playlistId={album?.id??null} playlistTitle={album?.titulo??null} playlistArtwork={album?.capa??null}
      album={album?{artista:album.artista,ano:album.ano,tipo:album.tipo}:undefined} onClose={()=>setAlbum(null)}/>
  </EvitarTeclado>;
}
