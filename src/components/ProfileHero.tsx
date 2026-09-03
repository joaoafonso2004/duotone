import React from 'react';
import {Image,Platform,Pressable,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {LinearGradient} from 'expo-linear-gradient';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {SocialProfile} from '../api/profiles';
import {FriendAvatar} from './FriendAvatar';
import {SocialButton,socialStyles as s} from './socialUI';
import {colors,SOCIAL_GUTTER,type} from './socialTokens';

type Props={profile:SocialProfile|null;own:boolean;cover:string|null;unread:number;status?:string;
  onEdit:()=>void;onMessage:()=>void;onStats:()=>void;onBack?:()=>void;
  onSocial?:()=>void;onSettings?:()=>void;onRefresh:()=>void;onAddFriend:()=>void;pending:boolean};

/** Uma só zona de identidade, com ações utilitárias alinhadas no topo. */
export function ProfileHero({profile,own,cover,unread,status,onEdit,onMessage,onStats,onBack,onSocial,onSettings,onRefresh,onAddFriend,pending}:Props) {
  const web=Platform.OS==='web',safe=useSafeAreaInsets();
  const action=(label:string,icon:keyof typeof Ionicons.glyphMap,onPress:()=>void,badge=0)=><Pressable key={label}
    accessibilityRole="button" accessibilityLabel={badge?`${label}, ${badge} unread`:label} onPress={onPress}
    style={({pressed,hovered,focused}:any)=>({width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:pressed||hovered||focused?colors.surfacePressed:'rgba(10,10,15,0.46)',borderWidth:1,borderColor:colors.border})}>
    <Ionicons name={icon} size={20} color={colors.text}/>
    {badge>0&&<View style={{position:'absolute',right:0,top:0,minWidth:16,height:16,borderRadius:8,paddingHorizontal:3,backgroundColor:colors.danger,justifyContent:'center'}}><Text style={{fontSize:10,fontWeight:'700',color:'#fff',textAlign:'center'}}>{badge>99?'99+':badge}</Text></View>}
  </Pressable>;
  return <View style={{paddingHorizontal:SOCIAL_GUTTER,paddingTop:web?20:safe.top+8,paddingBottom:24,gap:16,minHeight:web?320:430,overflow:'hidden',backgroundColor:colors.bg}}>
    {!!cover&&<View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* O recorte é 8:3, muito panorâmico.
          No telemóvel a caixa é 2:1 e a capa preenche-a: perde-se cerca de um
          quarto dos lados, que é o preço de ela se ver.
          No PC não há caixa nenhuma — a capa preenche o cabeçalho de ponta a
          ponta. Havia aqui um `aspectRatio` com `maxHeight`, e num ecrã largo
          isso limitava a altura aos 320 do cabeçalho e a largura a 320×2,67:
          a capa ficava uma faixa de 853px solta ao meio do painel, com
          arestas duras dos dois lados. Um cabeçalho não tem margens. */}
      <Image source={{uri:cover}} resizeMode="cover" blurRadius={32} style={[StyleSheet.absoluteFill,{opacity:0.1}]}/>
      {web?<Image source={{uri:cover}} resizeMode="cover" style={[StyleSheet.absoluteFill,{opacity:0.78}]}/>:
      <View style={[StyleSheet.absoluteFill,{justifyContent:'center',alignItems:'center'}]}>
        <View style={{width:'100%',aspectRatio:2,maxHeight:'100%'}}>
          <Image source={{uri:cover}} resizeMode="cover" style={[StyleSheet.absoluteFill,{opacity:0.78}]}/>
          <LinearGradient colors={[colors.bg,'transparent','transparent',colors.bg]} locations={[0,0.24,0.7,1]} style={StyleSheet.absoluteFill}/>
        </View>
      </View>}
      <LinearGradient colors={['rgba(10,10,15,0.2)','rgba(10,10,15,0.08)','rgba(10,10,15,0.65)',colors.bg]} locations={[0,0.32,0.8,1]} style={StyleSheet.absoluteFill}/>
      <LinearGradient colors={['rgba(10,10,15,0.45)','transparent','rgba(10,10,15,0.45)']} start={{x:0,y:0}} end={{x:1,y:0}} style={StyleSheet.absoluteFill}/>
    </View>}
    <View style={[s.row,{gap:8}]}>
      {onBack&&action('Back','chevron-back',onBack)}
      {/* A mesma regra do `Screen`: a raiz de um separador leva `largeTitle`, uma
          sub-pagina com seta para tras leva `title`. Estava aqui um tamanho
          escrito a mao, e o perfil era a unica raiz com o titulo menor que as
          outras. Os tokens resolvem-se por plataforma, logo isto serve os dois. */}
      <Text numberOfLines={1} style={[onBack?s.title:type.largeTitle,{flex:1}]}>{own?'Your profile':'Profile'}</Text>
      <View style={{flexDirection:'row',gap:8}}>
        {own&&profile&&action('Edit profile','pencil-outline',onEdit)}
        {own&&onSocial&&action('Friends and chats','chatbubbles-outline',onSocial,unread)}
        {own&&onSettings&&action('Settings','settings-outline',onSettings)}
        {web&&action('Refresh profile','refresh-outline',onRefresh)}
      </View>
    </View>
    <View style={{height:web?28:32}}/>
    {profile&&<>
      <View style={[s.row,{alignItems:'center',gap:16}]}>
        <View style={{padding:3,borderRadius:64,backgroundColor:'rgba(10,10,15,0.7)',borderWidth:1,borderColor:colors.borderStrong}}>
          <FriendAvatar avatarUrl={profile.profile.avatar_url} name={profile.profile.name} size={web?96:80}/>
        </View>
        <View style={{flex:1,minWidth:0,gap:4}}>
          <Text style={[s.title,{fontSize:web?36:30}]}>{profile.profile.name}</Text>
          <Text style={[s.muted,{color:'rgba(245,245,247,0.8)'}]}>@{profile.profile.username}</Text>
          {!!status&&<Text style={s.muted}>{status}</Text>}
        </View>
      </View>
      {!!profile.appearance?.bio&&<Text style={[s.text,{maxWidth:640}]}>{profile.appearance.bio}</Text>}
      <View style={[s.row,{flexWrap:'wrap',gap:8}]}>
        {!own&&(profile.canView?<SocialButton icon="chatbubble-outline" onPress={onMessage}>Message</SocialButton>:<SocialButton disabled={pending} onPress={onAddFriend}>{pending?'Request pending':'Add friend'}</SocialButton>)}
        {profile.canView&&<Pressable accessibilityRole="button" accessibilityLabel="Listening stats" onPress={onStats}
          style={({pressed,hovered}:any)=>[s.row,{minHeight:44,gap:8,paddingRight:12},(pressed||hovered)&&{opacity:0.7}]}>
          <Ionicons name="stats-chart-outline" color={colors.textSecondary} size={18}/><Text style={s.text}>Listening stats</Text><Ionicons name="chevron-forward" color={colors.textSecondary} size={15}/>
        </Pressable>}
      </View>
    </>}
  </View>;
}
