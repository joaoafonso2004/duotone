import React,{useState} from 'react';
import { ScrollView,Text,View } from 'react-native';
import { SocialButton,SocialModal,socialStyles as s } from './socialUI';
import { artistPreferenceKey,setRecommendationFeedback,useRecommendationFeedback } from '../state/recommendationFeedback';
import { displayArtist } from '../lib/artistName';
import type { Feedback } from '../lib/recommendationFeedback';
import type { Track } from '../types';

export function RecommendationPreferences({visible,track,reason,onClose}:{visible:boolean;track?:Track|null;reason?:string|null;onClose:()=>void}) {
  const items=useRecommendationFeedback(s=>s.items),busy=useRecommendationFeedback(s=>s.busy),ready=useRecommendationFeedback(s=>s.ready);
  const [error,setError]=useState('');
  const [manage,setManage]=useState(false);
  const change=async(item:Feedback,on:boolean)=>{setError('');try{await setRecommendationFeedback(item,on);}catch(e:any){setError(e.message);}};
  const temArtista=track&&artistPreferenceKey(track)&&displayArtist(track)!=='Unknown artist';
  const choices:Feedback[]=track?[
    {kind:'track',key:`${track.source}:${track.sourceId}`,label:track.title.slice(0,500)},
    // Mais E menos do mesmo artista, um a seguir ao outro. Ligar um apaga o
    // outro (ver `setRecommendationFeedback`): sao a mesma pergunta com
    // respostas opostas, e guardar as duas deixava o peso ao acaso de qual
    // fosse lida primeiro.
    ...(temArtista?[
      {kind:'artist_more' as const,key:artistPreferenceKey(track),label:displayArtist(track).slice(0,500)},
      {kind:'artist' as const,key:artistPreferenceKey(track),label:displayArtist(track).slice(0,500)},
    ]:[]),
  ]:[];
  const rotulo=(p:Feedback,on:boolean)=>p.kind==='track'
    ?(on?'Allow this song again':'Do not suggest this song again')
    :p.kind==='artist_more'
      ?(on?'Suggesting more of this artist':'Suggest more of this artist')
      :(on?'Suggest this artist normally':'Suggest less of this artist');
  const icone=(p:Feedback,on:boolean)=>on?'checkmark-circle'
    :p.kind==='artist_more'?'add-circle-outline':'remove-circle-outline';
  return <SocialModal visible={visible} title="Recommendations" onClose={onClose}>
    <ScrollView contentContainerStyle={{padding:24,gap:16}}>
      <Text style={s.muted}>Shape your suggestions, daily flow, radio and smart shuffle. Asking for more of an artist also brings in music around them, even if you have none of their songs saved. You can still search for and play these songs yourself.</Text>
      {track&&reason?<View style={s.listRow}><View style={{flex:1,minWidth:0}}><Text style={s.muted}>Why this track</Text><Text style={s.text}>{reason}</Text></View></View>:null}
      {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {choices.map(p=>{const selected=items.some(x=>x.kind===p.kind&&x.key===p.key);return <View key={p.kind} style={{gap:6}}>
        {p.kind!=='artist'&&<Text style={s.text}>{p.label}</Text>}
        <SocialButton icon={icone(p,selected)} disabled={busy||!ready} onPress={()=>void change(p,!selected)}>
          {rotulo(p,selected)}
        </SocialButton>
      </View>;})}
      {track&&<SocialButton quiet onPress={()=>setManage(!manage)}>{manage?'Hide preferences':'Manage all preferences'} ({items.length})</SocialButton>}
      {(!track||manage)&&<View style={{gap:12}}>
        {!items.length&&<Text style={s.muted}>{ready?'No preferences yet. Open a song’s menu to shape your recommendations.':'Loading preferences…'}</Text>}
        {items.map(p=><View key={`${p.kind}:${p.key}`} style={s.listRow}>
          <View style={{flex:1,minWidth:0}}><Text numberOfLines={2} style={s.text}>{p.label}</Text><Text style={s.muted}>{p.kind==='track'?'Not suggested':p.kind==='artist_more'?'Suggested more often':'Suggested less often'}</Text></View>
          <SocialButton quiet disabled={busy||!ready} onPress={()=>void change(p,false)}>Reset</SocialButton>
        </View>)}
      </View>}
    </ScrollView>
  </SocialModal>;
}
