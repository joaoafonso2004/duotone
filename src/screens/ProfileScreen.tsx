import React, { useRef } from 'react';
import { useIsFocused,useScrollToTop } from '@react-navigation/native';
import { View } from 'react-native';
import { SocialProfileView } from '../components/SocialProfileView';
import { useAuth } from '../state/auth';

/** O perfil próprio. Para onde ele leva (Social, Definições, playlists...) é o
 *  `irPara` da app (lib/destinos.ts): o ecrã já não escolhe o que o perfil mostra. */
export function ProfileScreen() {
  const userId=useAuth(s=>s.session?.user.id);
  const active=useIsFocused();
  // Tocar no separador onde ja se esta volta ao topo (3/10, como no iOS).
  const topo=useRef<any>(null);
  useScrollToTop(topo);
  return <View style={{flex:1}}>{userId&&<SocialProfileView userId={userId} active={active} scrollRef={topo}/>}</View>;
}
