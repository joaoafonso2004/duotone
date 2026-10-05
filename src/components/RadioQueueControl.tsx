import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePlayer } from '../state/player';
import { useConnectivity } from '../state/connectivity';
import { useAuth } from '../state/auth';
import { colors, radii, spacing, type } from '../theme';

/** O mesmo controlo na fila iOS e no painel Up next do Windows. */
export function RadioQueueControl({ disabledReason }: { disabledReason?: string }) {
  const current=usePlayer(s=>s.current), queue=usePlayer(s=>s.queue);
  const mode=usePlayer(s=>s.radioMode), error=usePlayer(s=>s.radioError);
  const offline=useConnectivity(s=>s.offline);
  const owner=useAuth(s=>s.session?.user.id??s.offlineUserId);
  const [undo,setUndo]=useState<null|{ before:ReturnType<typeof usePlayer.getState>; after:typeof queue; owner:typeof owner }>(null);
  const reason=disabledReason || (offline?'Connect to start Radio':!current?'Play a song to start Radio':undefined);
  useEffect(()=>{ if(undo&&(current!==undo.before.current||queue!==undo.after||owner!==undo.owner))setUndo(null); },[current,queue,owner,undo]);
  const start=async()=>{
    setUndo(null);
    const before=usePlayer.getState();
    const auth=useAuth.getState(), startedBy=auth.session?.user.id??auth.offlineUserId;
    if(await before.startRadio()){
      const liveAuth=useAuth.getState();
      if((liveAuth.session?.user.id??liveAuth.offlineUserId)===startedBy)setUndo({before,after:usePlayer.getState().queue,owner:startedBy});
    }
  };
  const change=(on:boolean)=>{
    if(!on){usePlayer.getState().stopRadio();return;}
    void start();
  };
  const restore=()=>{
    if(!undo)return;
    const live=usePlayer.getState(),before=undo.before;
    const auth=useAuth.getState();
    if(live.current!==before.current||live.queue!==undo.after||(auth.session?.user.id??auth.offlineUserId)!==undo.owner||reason){setUndo(null);return;}
    live.stopRadio();
    usePlayer.setState({queue:before.queue,queueIndex:before.queueIndex,shuffle:before.shuffle,
      shuffleOrder:before.shuffleOrder,shuffleInteligente:before.shuffleInteligente,repeatMode:before.repeatMode,
      radioMode:before.radioMode==='on'?'on':'off',radioContext:before.radioContext,radioOwner:before.radioOwner,
      radioStopped:before.radioStopped,radioActive:before.radioActive,doRadio:before.doRadio,
      sugeridas:before.sugeridas,origemDaFila:before.origemDaFila});
    setUndo(null);
  };
  return <View style={styles.box}>
    <View style={styles.row}>
      {mode==='preparing'?<ActivityIndicator size="small" color={colors.textSecondary}/>:<Ionicons name="radio-outline" size={22} color={colors.textSecondary}/>}
      <View style={styles.copy}><Text style={styles.title}>Radio</Text></View>
      {undo?<Pressable accessibilityRole="button" accessibilityLabel="Undo Radio and restore previous queue" onPress={restore} style={styles.button}><Text style={styles.undo}>Undo</Text></Pressable>:null}
      <Switch value={mode!=='off'} onValueChange={change} disabled={!!reason}
        accessibilityLabel="Radio" accessibilityState={{busy:mode==='preparing'}} accessibilityHint="Replaces Up next with music based on songs heard in this session. Your current song keeps playing."
        trackColor={{false:colors.border,true:colors.text}} thumbColor={mode==='off'?colors.text:colors.bg}/>
    </View>
    {reason?<Text style={[styles.description,styles.detail]}>{reason}</Text>:null}
    {error?<Text accessibilityRole="alert" style={[styles.description,styles.detail]}>{error}</Text>:null}
  </View>;
}
const styles=StyleSheet.create({
  box:{backgroundColor:colors.surface,borderRadius:radii.lg,borderWidth:1,borderColor:colors.border,padding:spacing.md,marginVertical:spacing.md},
  row:{flexDirection:'row',alignItems:'center',gap:spacing.sm},copy:{flex:1,minWidth:0},
  title:{...type.body,fontWeight:'600',color:colors.text},description:{...type.caption,color:colors.textSecondary},
  detail:{marginTop:spacing.sm},button:{minHeight:44,justifyContent:'center',paddingHorizontal:spacing.sm},undo:{...type.caption,color:colors.text,textDecorationLine:'underline'},
});
