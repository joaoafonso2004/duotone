import React from 'react';
import { useNavigation,useRoute,useIsFocused,type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { Screen } from '../components/Screen';
import { SocialHub } from '../components/SocialHub';

export function SocialScreen() {
  const navigation=useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route=useRoute<RouteProp<RootStackParamList,'Social'>>();
  const focused=useIsFocused();
  return <Screen title="Social" subtitle="Friends, music and conversations." onBack={()=>navigation.goBack()}>
    <SocialHub visible={focused} initialFriend={route.params?.openChatWithFriendId} initialGroup={route.params?.openGroupId}
      onProfile={id=>navigation.navigate('FriendProfile',{userId:id})}
      onArtist={name=>navigation.navigate('LibraryGroup',{type:'artist',name})}
      onPlaylist={id=>navigation.navigate('PlaylistDetail',{id,name:'Playlist partilhada'})}/>
  </Screen>;
}
