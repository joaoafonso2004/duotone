import React,{useEffect,useState} from 'react';
import {Image,Platform,Pressable,StyleSheet,Text,View} from 'react-native';
import {Ionicons,MaterialCommunityIcons} from '@expo/vector-icons';
import {LinearGradient} from 'expo-linear-gradient';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {SocialProfile} from '../api/profiles';
import {FriendAvatar} from './FriendAvatar';
import {SocialButton,socialStyles as s} from './socialUI';
import {enquadrarPreVisualizacao,RACIO_DA_CAPA} from '../lib/profileImageCrop';
import {lerCelulasDaCapa} from '../lib/celulasDaCapa';
import {veuDaCapa} from '../lib/corDaCapa';
import {colors,SOCIAL_GUTTER,type} from './socialTokens';

type Props={profile:SocialProfile|null;own:boolean;cover:string|null;unread:number;status?:string;
  /**
   * Uma imagem escolhida mas ainda por recortar, para o editor mostrar o
   * cabeçalho a sério em vez de uma moldura à parte. Sem isto o preview era
   * outro componente, com outro enquadramento e sem vinheta -- e por isso
   * nunca podia corresponder ao que ficava.
   */
  recorte?:{largura:number;altura:number;x:number;y:number};
  onEdit:()=>void;onMessage:()=>void;onBack?:()=>void;
  onSocial?:()=>void;onSettings?:()=>void;onRefresh:()=>void;onAddFriend:()=>void;pending:boolean};

/** Quem fez a app. O perfil dele leva uma marca que não se pode tirar. */
const CRIADOR='joao';

/** Uma só zona de identidade, com ações utilitárias alinhadas no topo. */
export function ProfileHero({profile,own,cover,unread,status,recorte,onEdit,onMessage,onBack,onSocial,onSettings,onRefresh,onAddFriend,pending}:Props) {
  const web=Platform.OS==='web',safe=useSafeAreaInsets();
  // A caixa da capa medida, para posicionar uma imagem por recortar. Só o
  // editor precisa disto; com a capa já gravada o `cover` normal chega.
  const [caixa,setCaixa]=useState({largura:0,altura:0});

  /**
   * O perfil tinge-se pela SUA capa, e não pela música a tocar.
   *
   * São duas coisas separadas de propósito: o acento da app segue o que está a
   * tocar, mas um perfil é de uma pessoa e tem de ter sempre o mesmo ar --
   * mudar de cor conforme a música de quem o visita não dizia nada sobre
   * ninguém.
   *
   * É um véu, não uma pintura: a opacidade é baixa e o cabeçalho continua
   * escuro. Sem capa, ou com uma capa sem cor, fica simplesmente sem véu.
   */
  const [veu,setVeu]=useState<string|null>(null);
  useEffect(()=>{
    let vivo=true;
    if(!cover){setVeu(null);return;}
    void lerCelulasDaCapa(cover).then(celulas=>{if(vivo)setVeu(veuDaCapa(celulas));});
    return ()=>{vivo=false;};
  },[cover]);
  const capa=(estilo:any)=>{
    if(!recorte||!caixa.largura||!caixa.altura)
      return <Image source={{uri:cover!}} resizeMode="cover" style={estilo}/>;
    const p=enquadrarPreVisualizacao(recorte.largura,recorte.altura,RACIO_DA_CAPA,recorte.x,recorte.y,caixa.largura,caixa.altura);
    return <View style={[estilo,{overflow:'hidden'}]}>
      <Image source={{uri:cover!}} resizeMode="stretch" style={{position:'absolute',width:p.width,height:p.height,left:p.left,top:p.top}}/>
    </View>;
  };
  const action=(label:string,icon:keyof typeof Ionicons.glyphMap,onPress:()=>void,badge=0)=><Pressable key={label}
    accessibilityRole="button" accessibilityLabel={badge?`${label}, ${badge} unread`:label} onPress={onPress}
    style={({pressed,hovered,focused}:any)=>({width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:pressed||hovered||focused?colors.surfacePressed:'rgba(10,10,15,0.46)',borderWidth:1,borderColor:colors.border})}>
    <Ionicons name={icon} size={20} color={colors.text}/>
    {badge>0&&<View style={{position:'absolute',right:0,top:0,minWidth:16,height:16,borderRadius:8,paddingHorizontal:3,backgroundColor:colors.danger,justifyContent:'center'}}><Text style={{fontSize:10,fontWeight:'700',color:'#fff',textAlign:'center'}}>{badge>99?'99+':badge}</Text></View>}
  </Pressable>;
  return <View style={{paddingHorizontal:SOCIAL_GUTTER,paddingTop:web?20:safe.top+8,paddingBottom:24,gap:16,minHeight:web?320:360,overflow:'hidden',backgroundColor:colors.bg}}>
    {!!cover&&<View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* No telemóvel a caixa tem o rácio do recorte, por isso a capa cabe lá
          inteira. No PC não há caixa — a capa preenche o cabeçalho de ponta a
          ponta, e uma faixa larga corta-lhe em cima e em baixo. Um cabeçalho
          não tem margens: já aqui esteve um `aspectRatio` com `maxHeight` que
          num ecrã largo deixava a capa a flutuar a meio do painel. */}
      <Image source={{uri:cover}} resizeMode="cover" blurRadius={32} style={[StyleSheet.absoluteFill,{opacity:0.1}]}/>
      {web?<View onLayout={e=>setCaixa({largura:e.nativeEvent.layout.width,altura:e.nativeEvent.layout.height})} style={StyleSheet.absoluteFill}>
        {capa([StyleSheet.absoluteFill,{opacity:0.78}])}
      </View>:
      <View style={[StyleSheet.absoluteFill,{justifyContent:'flex-start',alignItems:'center'}]}>
        {/* Encostada ao topo, não centrada: assim começa por trás do título em
            vez de flutuar a meio, e a vinheta é que a acaba por baixo.
            O rácio é O MESMO do recorte, e tem de continuar a ser: com uma
            forma diferente aqui, o cabeçalho corta a imagem uma segunda vez
            por cima do recorte e uma foto vertical acaba ampliada até só se
            ver um ombro. */}
        <View onLayout={e=>setCaixa({largura:e.nativeEvent.layout.width,altura:e.nativeEvent.layout.height})} style={{width:'100%',aspectRatio:RACIO_DA_CAPA}}>
          {capa([StyleSheet.absoluteFill,{opacity:0.78}])}
          <LinearGradient colors={['transparent','transparent',colors.bg]} locations={[0,0.55,1]} style={StyleSheet.absoluteFill}/>
        </View>
      </View>}
      <LinearGradient colors={['rgba(10,10,15,0.2)','rgba(10,10,15,0.08)','rgba(10,10,15,0.65)',colors.bg]} locations={[0,0.32,0.8,1]} style={StyleSheet.absoluteFill}/>
      <LinearGradient colors={['rgba(10,10,15,0.45)','transparent','rgba(10,10,15,0.45)']} start={{x:0,y:0}} end={{x:1,y:0}} style={StyleSheet.absoluteFill}/>
      {/* Por cima das vinhetas e não por baixo: elas escurecem para o texto se
          ler, e o véu é o que devolve ao cabeçalho o tom da capa depois disso.
          Ficando por baixo, o cinzento delas comia-o. */}
      {!!veu&&<View style={[StyleSheet.absoluteFill,{backgroundColor:veu}]}/>}
    </View>}
    {/* A coroa marca quem fez a app. Fica fora do bloco da capa de propósito:
        assim continua lá com capa nova, com capa apagada, ou sem capa nenhuma.
        `pointerEvents none` para não roubar toques ao que está por baixo. */}
    {profile?.profile.username===CRIADOR&&<View pointerEvents="none" style={{position:'absolute',right:SOCIAL_GUTTER,bottom:16,
      width:26,height:26,borderRadius:13,alignItems:'center',justifyContent:'center',
      backgroundColor:'rgba(10,10,15,0.55)',borderWidth:1,borderColor:'rgba(240,200,90,0.45)'}}>
      <MaterialCommunityIcons name="crown" size={15} color="#F0C85A"/>
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
      {/* O "Listening stats" esteve aqui e ficava órfão: um link solto entre a
          bio e as playlists, longe dos números que ele abre. Passou para o
          título do "Listening overview", que é o resumo de que ele é o
          detalhe. Ver SocialProfileView. */}
      {!own&&<View style={[s.row,{flexWrap:'wrap',gap:8}]}>
        {profile.canView?<SocialButton icon="chatbubble-outline" onPress={onMessage}>Message</SocialButton>:<SocialButton disabled={pending} onPress={onAddFriend}>{pending?'Request pending':'Add friend'}</SocialButton>}
      </View>}
    </>}
  </View>;
}
