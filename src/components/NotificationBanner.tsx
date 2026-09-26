import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotifications } from '../state/notifications';
import { useTheme } from '../state/theme';
import type { NotificationTarget } from '../lib/inAppNotifications';
import { FriendAvatar } from './FriendAvatar';

export function NotificationBanner({onOpen}: {onOpen: (target: NotificationTarget) => void}) {
  const item = useNotifications(s => s.banners[0]);
  const insets = useSafeAreaInsets();
  const accent = useTheme(s => s.theme.color);
  useEffect(() => {
    if (!item) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    // VoiceOver users get time to explore the two separate buttons.
    void AccessibilityInfo.isScreenReaderEnabled().then(reader => {
      if (!alive) return;
      if (reader) AccessibilityInfo.announceForAccessibility(`${item.title}. ${item.body}`);
      timer = setTimeout(() => useNotifications.getState().dismiss(item.id), reader ? 15000 : 6000);
    }).catch(() => { if (alive) timer=setTimeout(() => useNotifications.getState().dismiss(item.id),6000); });
    return () => { alive=false; clearTimeout(timer); };
  }, [item]);
  if (!item) return null;
  const open = () => { useNotifications.getState().dismiss(item.id); onOpen(item.target); };
  const banner = <View pointerEvents="box-none" style={[styles.host,{top:insets.top+8},Platform.OS === 'web' && styles.desktopHost]}>
    <View style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}. ${item.body}. Open Social`}
        onPress={open}
        style={({pressed}) => [styles.content,pressed && {opacity:0.7}]}>
        <FriendAvatar avatarUrl={item.avatarUrl ?? null} name={item.title} size={40}/>
        <View style={styles.text}><Text style={styles.brand}>DUOTONE</Text>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.body} numberOfLines={2}>{item.body}</Text></View>
      </Pressable>
      {Platform.OS === 'web' && <Pressable accessibilityRole="button" onPress={open} style={styles.reply}>
        <Text style={{color:accent,fontWeight:'700',fontSize:13}}>{item.kind === 'message' ? 'Reply' : 'View'}</Text>
      </Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification"
        onPress={() => useNotifications.getState().dismiss(item.id)} style={styles.close}>
        <Ionicons name="close" size={20} color="#AAAAB4"/>
      </Pressable>
    </View>
  </View>;
  // Above the player and native sheets, without opening a modal or pausing audio.
  return Platform.OS === 'ios' ? <FullWindowOverlay>{banner}</FullWindowOverlay> : banner;
}
const styles = StyleSheet.create({
  host:{position:'absolute',left:12,right:12,zIndex:10000,elevation:30,alignItems:'center'},
  desktopHost:{left:'auto',right:20,top:48,width:420,maxWidth:'94%',alignItems:'flex-end'},
  reply:{paddingHorizontal:12,minHeight:44,justifyContent:'center'},
  card:{width:'100%',maxWidth:520,flexDirection:'row',alignItems:'center',backgroundColor:'#1C1C23',
    borderWidth:1,borderColor:'#36363F',borderRadius:20,shadowColor:'#000',shadowOpacity:0.3,shadowRadius:16,shadowOffset:{width:0,height:6}},
  content:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:12,padding:14},
  icon:{width:36,height:36,borderRadius:12,backgroundColor:'#292931',alignItems:'center',justifyContent:'center'},
  text:{flex:1,minWidth:0,gap:3},brand:{color:'#AAAAB4',fontSize:9,fontWeight:'700',letterSpacing:2},
  title:{color:'#F5F5F7',fontSize:14,fontWeight:'700'},body:{color:'#CDCDD4',fontSize:13,lineHeight:18},
  close:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center',alignSelf:'stretch'},
});
