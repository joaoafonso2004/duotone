import React from 'react';
import { Text,View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { refreshConnectivity,useConnectivity } from '../state/connectivity';
import { colors,spacing,type } from '../theme';
import { PillButton } from './PillButton';
import { Screen } from './Screen';
import { useOfflineMode } from '../hooks/useOfflineMode';

export function OfflineNotice({compact=false,signIn=false}:{compact?:boolean;signIn?:boolean}) {
  const checking=useConnectivity(s=>s.checking);
  if(compact)return <View style={{paddingHorizontal:spacing.xl,paddingBottom:16,gap:4}}>
    <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Ionicons name="cloud-offline-outline" size={18} color={colors.textSecondary}/><Text style={type.caption}>{checking?'Checking connection…':signIn?'Offline · connect to sign in':'Offline · downloaded liked songs only'}</Text></View>
    <Text style={type.caption}>{signIn?'An internet connection is needed for your first sign-in.':'Your full library returns when you reconnect.'}</Text>
  </View>;
  return <View style={{padding:spacing.xl,gap:12,alignItems:compact?'flex-start':'center'}}>
    <Ionicons name="cloud-offline-outline" size={compact?24:40} color={colors.textSecondary}/>
    <Text style={type.headline}>{checking?'Checking connection…':'You’re offline'}</Text>
    <Text style={[type.caption,{textAlign:compact?'left':'center'}]}>{compact?'Only downloaded liked songs are shown.':'This section needs an internet connection. You can listen to downloaded liked songs in Songs.'} Everything returns automatically when you reconnect.</Text>
    {!compact&&<PillButton label="Try again" onPress={()=>void refreshConnectivity()}/>}
  </View>;
}
/** Desmonta só os ecrãs que precisam da rede; a biblioteca e o leitor ficam. */
export function withInternet<P extends object>(Component:React.ComponentType<P>,title:string):React.ComponentType<P> {
  return function InternetScreen(props:P){
    const offline=useOfflineMode();
    const navigation=useNavigation<any>();
    if(!offline)return <Component {...props}/>;
    return <Screen title={title} onBack={navigation.canGoBack()?()=>navigation.goBack():undefined}>
      <OfflineNotice/>
      {title==='Profile'&&<View style={{paddingHorizontal:spacing.xl}}><PillButton label="Settings" onPress={()=>navigation.navigate('Settings')}/></View>}
    </Screen>;
  };
}
