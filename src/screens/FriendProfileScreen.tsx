import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { Screen } from '../components/Screen';
import { SocialProfileView } from '../components/SocialProfileView';

export function FriendProfileScreen({route,navigation}:NativeStackScreenProps<RootStackParamList,'FriendProfile'>) {
  return <Screen title="Profile" onBack={()=>navigation.goBack()}><SocialProfileView userId={route.params.userId}
    onMessage={id=>navigation.navigate('Social',{openChatWithFriendId:id})}
    onArtist={name=>navigation.navigate('LibraryGroup',{type:'artist',name})}
    onStats={()=>navigation.navigate('ListeningStats',{userId:route.params.userId})}/></Screen>;
}
