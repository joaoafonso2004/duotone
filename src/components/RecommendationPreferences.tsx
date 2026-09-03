import React,{useState} from 'react';
import { ScrollView,Text,View } from 'react-native';
import { SocialButton,SocialModal,socialStyles as s } from './socialUI';
import { artistPreferenceKey,setRecommendationFeedback,useRecommendationFeedback } from '../state/recommendationFeedback';
import { displayArtist } from '../lib/artistName';
import type { Feedback } from '../lib/recommendationFeedback';
import type { Track } from '../types';

export function RecommendationPreferences({visible,track,onClose}:{visible:boolean;track?:Track|null;onClose:()=>void}) {
  const items=useRecommendationFeedback(s=>s.items),busy=useRecommendationFeedback(s=>s.busy),ready=useRecommendationFeedback(s=>s.ready);
  const [error,setError]=useState('');
  const [manage,setManage]=useState(false);
  const change=async(item:Feedback,on:boolean)=>{setError('');try{await setRecommendationFeedback(item,on);}catch(e:any){setError(e.message);}};
  const choices:Feedback[]=track?[
    {kind:'track',key:`${track.source}:${track.sourceId}`,label:track.title.slice(0,500)},
    ...(artistPreferenceKey(track)&&displayArtist(track)!=='Unknown artist'?[{kind:'artist' as const,key:artistPreferenceKey(track),label:displayArtist(track).slice(0,500)}]:[]),
  ]:[];
  return <SocialModal visible={visible} title="Recommendations" onClose={onClose}>
    <ScrollView contentContainerStyle={{padding:24,gap:16}}>
      <Text style={s.muted}>Shape your suggestions, daily flow, radio and smart shuffle. You can still search for and play these songs yourself.</Text>
      {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {choices.map(p=>{const selected=items.some(x=>x.kind===p.kind&&x.key===p.key);return <View key={p.kind} style={{gap:6}}>
        <Text style={s.text}>{p.label}</Text>
        <SocialButton icon={selected?'checkmark-circle':'remove-circle-outline'} disabled={busy||!ready} onPress={()=>void change(p,!selected)}>
          {p.kind==='track'?(selected?'Allow this song again':'Do not suggest this song again'):(selected?'Suggest this artist normally':'Suggest less of this artist')}
        </SocialButton>
      </View>;})}
      {track&&<SocialButton quiet onPress={()=>setManage(!manage)}>{manage?'Hide preferences':'Manage all preferences'} ({items.length})</SocialButton>}
      {(!track||manage)&&<View style={{gap:12}}>
        {!items.length&&<Text style={s.muted}>{ready?'No preferences yet. Open a song’s menu to shape your recommendations.':'Loading preferences…'}</Text>}
        {items.map(p=><View key={`${p.kind}:${p.key}`} style={s.listRow}>
          <View style={{flex:1,minWidth:0}}><Text numberOfLines={2} style={s.text}>{p.label}</Text><Text style={s.muted}>{p.kind==='track'?'Not suggested':'Suggested less often'}</Text></View>
          <SocialButton quiet disabled={busy||!ready} onPress={()=>void change(p,false)}>Reset</SocialButton>
        </View>)}
      </View>}
    </ScrollView>
  </SocialModal>;
}
