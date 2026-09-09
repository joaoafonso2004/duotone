import React, { useEffect } from 'react';
import { useNavigation,useRoute,useIsFocused,type RouteProp } from '@react-navigation/native';
import type { MaterialTopTabNavigationProp } from '@react-navigation/material-top-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, TabsParamList } from '../navigation/RootNavigator';
import { Screen } from '../components/Screen';
import { SocialHub } from '../components/SocialHub';

export function SocialScreen() {
  const navigation=useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const separadores=useNavigation<MaterialTopTabNavigationProp<TabsParamList>>();
  const route=useRoute<RouteProp<TabsParamList,'Social'>>();
  const focused=useIsFocused();
  /**
   * A conversa pedida abre UMA vez, e depois o pedido apaga-se.
   *
   * Os parametros de uma seccao ficam la ate alguem os mudar -- ao contrario
   * de um ecra empilhado, que morre ao sair. Sem isto, abrir uma conversa por
   * notificacao deixava-a colada a seccao: uma semana depois, arrastar do
   * Perfil para o Social reabria a mesma conversa sem ninguem a pedir.
   *
   * O `SocialHub` abre no seu efeito de `[initialFriend,initialGroup]`; este
   * corre a seguir, poe os dois a `undefined`, e o efeito de la volta a correr
   * sem nada para abrir. A conversa que ja abriu fica aberta.
   */
  const {openChatWithFriendId,openGroupId}=route.params ?? {};
  useEffect(()=>{
    if(openChatWithFriendId||openGroupId)separadores.setParams({openChatWithFriendId:undefined,openGroupId:undefined});
  },[openChatWithFriendId,openGroupId,separadores]);
  // O "voltar" e para o Perfil, que e de onde se vem -- a arrastar ou pelo
  // botao das mensagens. Uma seccao nao tem pilha para onde regressar.
  return <Screen title="Social" subtitle="Friends, music and conversations." onBack={()=>separadores.navigate('Profile')}>
    <SocialHub visible={focused} initialFriend={openChatWithFriendId} initialGroup={openGroupId}
      onProfile={id=>navigation.navigate('FriendProfile',{userId:id})}
      onArtist={name=>navigation.navigate('LibraryGroup',{type:'artist',name})}
      onPlaylist={id=>navigation.navigate('PlaylistDetail',{id,name:'Playlist partilhada'})}/>
  </Screen>;
}
