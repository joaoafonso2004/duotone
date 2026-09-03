import React from 'react';
import {Pressable,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useAdjustmentSync,retryAdjustmentSync} from '../state/trackAdjustments';
import {useConnectivity} from '../state/connectivity';
import {colors} from '../theme';

export function AdjustmentSyncStatus(){
  const status=useAdjustmentSync(s=>s.status),offline=useConnectivity(s=>s.offline);
  const message=offline?'Saved on this device · sync when online':status==='error'?'Sync failed · tap to retry':status==='saved'?'Synced between your devices':status==='syncing'?'Syncing adjustments…':status==='pending'?'Saved on this device · sync pending':status==='local'?'Saved on this device':'Loading adjustments…';
  return <Pressable accessibilityRole={status==='error'?'button':undefined} disabled={status!=='error'||offline} onPress={retryAdjustmentSync} style={{minHeight:32,justifyContent:'center'}}>
    <View style={{flexDirection:'row',alignItems:'center',gap:6}}><Ionicons name={offline||status==='error'?'cloud-offline-outline':status==='saved'?'cloud-done-outline':'cloud-upload-outline'} size={14} color={colors.textTertiary} /><Text style={{fontSize:11,color:colors.textTertiary,flexShrink:1}}>{message}</Text></View>
  </Pressable>;
}
