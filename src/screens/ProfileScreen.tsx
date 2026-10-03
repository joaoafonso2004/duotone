import React, { useRef } from 'react';
import { useNavigation,useIsFocused,useScrollToTop } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { View } from 'react-native';
import { SocialProfileView } from '../components/SocialProfileView';
import { useAuth } from '../state/auth';

export function ProfileScreen() {
  const navigation=useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const userId=useAuth(s=>s.session?.user.id);
  const active=useIsFocused();
  // Tocar no separador onde ja se esta volta ao topo (3/10, como no iOS).
  const topo=useRef<any>(null);
  useScrollToTop(topo);
  return <View style={{flex:1}}>{userId&&<SocialProfileView userId={userId} active={active} scrollRef={topo}
    onMessage={id=>navigation.navigate('Tabs',{screen:'Social',params:{openChatWithFriendId:id}})}
    onSocial={()=>navigation.navigate('Tabs',{screen:'Social'})}
    onSettings={()=>navigation.navigate('Settings')}
    onPlaylist={id=>navigation.navigate('PlaylistDetail',{id,name:'Playlist'})}
    onArtist={name=>navigation.navigate('LibraryGroup',{type:'artist',name})}
    onStats={()=>navigation.navigate('ListeningStats')}/>}</View>;
}
