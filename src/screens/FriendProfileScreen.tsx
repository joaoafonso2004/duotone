import React from 'react';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { View } from 'react-native';
import { SocialProfileView } from '../components/SocialProfileView';

export function FriendProfileScreen({route,navigation}:NativeStackScreenProps<RootStackParamList,'FriendProfile'>) {
  const active=useIsFocused();
  return <View style={{flex:1}}><SocialProfileView userId={route.params.userId} active={active} onBack={()=>navigation.goBack()}/></View>;
}
