import React,{useRef,useState} from 'react';
import {Animated,Platform,Pressable,StyleSheet,Text,useWindowDimensions,View} from 'react-native';
import {Image} from 'expo-image';
import {profileImageCacheKey} from '../lib/profileMedia';
import Ionicons from '@expo/vector-icons/Ionicons';
import {LinearGradient} from 'expo-linear-gradient';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {SocialProfile} from '../api/profiles';
import {FriendAvatar} from './FriendAvatar';
import {socialStyles as s} from './socialUI';
import {alturaDaCapaNoTelemovel,alturaDoCabecalhoNoPc,degradeDaCapa,enquadrarCapa,enquadrarPreVisualizacao,RACIO_DA_CAPA} from '../lib/profileImageCrop';
import {colors,SOCIAL_GUTTER} from './socialTokens';
import {useTheme} from '../state/theme';
import type {Ancora} from './MenuFlutuante';

/** O avatar sobe esta parte por cima da capa. */
const SOBREPOSICAO=44;
const AVATAR=80;

/** Uma imagem ainda por recortar, para o editor ver o cabeçalho a sério. */
export type RecorteDaCapa={largura:number;altura:number;x:number;y:number;zoom?:number};

/**
 * A capa de um perfil: a fotografia a cobrir a caixa, alinhada ao topo, e o
 * degradê que a acaba no fundo da página.
 *
 * **A fotografia como ela é** (5/10, variante A de `docs/perfil-capa.html`):
 * a 100%, sem as vinhetas dos lados nem o véu da cor dela por cima. Com a
 * caixa a mostrar a fotografia inteira, eram só camadas a apagá-la.
 *
 * `rolagem` (o scroll da página, só no iPhone): a fotografia sobe a metade da
 * velocidade do texto. Puxar para baixo no topo não a mexe.
 */
export function CapaDoPerfil({cover,recorte,rolagem}:{cover:string|null;recorte?:RecorteDaCapa;rolagem?:Animated.Value}) {
  const [caixa,setCaixa]=useState({largura:0,altura:0});
  const parallax=React.useMemo(()=>rolagem?[{translateY:rolagem.interpolate({inputRange:[0,1],outputRange:[0,0.5],extrapolateLeft:'clamp'})}]:undefined,[rolagem]);
  if(!cover)return null;
  const degrade=degradeDaCapa(colors.bg);
  const imagem=()=>{
    if(!caixa.largura||!caixa.altura)return null;
    // No editor a imagem ainda é a original: quem manda é o gesto em curso.
    if(recorte){
      const p=enquadrarPreVisualizacao(recorte.largura,recorte.altura,RACIO_DA_CAPA,recorte.x,recorte.y,caixa.largura,caixa.altura,recorte.zoom??1);
      return <Image source={{uri:cover,cacheKey:profileImageCacheKey(cover)}} contentFit="fill" cachePolicy="memory-disk"
        style={{position:'absolute',width:p.width,height:p.height,left:p.left,top:p.top}}/>;
    }
    const e=enquadrarCapa(caixa.largura,caixa.altura);
    return <Image source={{uri:cover,cacheKey:profileImageCacheKey(cover)}} contentFit="cover" cachePolicy="memory-disk"
      style={{position:'absolute',width:e.largura,height:e.altura,left:e.left,top:e.top}}/>;
  };
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {/* O desfoque por baixo preenche o que a capa não tape em proporções extremas. */}
    <Image source={{uri:cover,cacheKey:profileImageCacheKey(cover)}} contentFit="cover" cachePolicy="memory-disk" blurRadius={32} style={[StyleSheet.absoluteFill,{opacity:0.1}]}/>
    <View onLayout={e=>setCaixa({largura:e.nativeEvent.layout.width,altura:e.nativeEvent.layout.height})}
      style={[StyleSheet.absoluteFill,{overflow:'hidden'}]}>
      <Animated.View style={[StyleSheet.absoluteFill,parallax&&{transform:parallax}]}>{imagem()}</Animated.View>
    </View>
    <LinearGradient colors={degrade.cores} locations={degrade.paragens} style={StyleSheet.absoluteFill}/>
  </View>;
}

/** Um botão redondo de vidro (as conversas, as definições, voltar). */
export function BotaoDeVidro({label,icon,onPress,badge=0}:{label:string;icon:keyof typeof Ionicons.glyphMap;onPress:()=>void;badge?:number}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={badge?`${label}, ${badge} unread`:label} onPress={onPress} hitSlop={6}
    style={({pressed,hovered,focused}:any)=>({width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',
      backgroundColor:pressed||hovered||focused?colors.surfacePressed:'rgba(10,10,15,0.5)',borderWidth:StyleSheet.hairlineWidth,borderColor:'rgba(255,255,255,0.16)'})}>
    <Ionicons name={icon} size={19} color={colors.text}/>
    {badge>0&&<View style={{position:'absolute',right:-3,top:-3,minWidth:18,height:18,borderRadius:9,paddingHorizontal:4,backgroundColor:colors.danger,justifyContent:'center',borderWidth:2,borderColor:colors.bg}}>
      <Text style={{fontSize:10,fontWeight:'800',color:'#fff',textAlign:'center'}}>{badge>99?'99+':badge}</Text>
    </View>}
  </Pressable>;
}

/** O menu de ações nasce junto ao botão que o abriu. */
function BotaoDeOpcoes({onPress}:{onPress:(ancora:Ancora)=>void}) {
  const caixa=useRef<View>(null);
  return <View ref={caixa} collapsable={false}>
    <BotaoDeVidro label="Profile options" icon="ellipsis-horizontal" onPress={()=>{
      caixa.current?.measureInWindow((x,y,width,height)=>onPress({x,y,width,height}));
    }}/>
  </View>;
}

type Props={profile:SocialProfile|null;own:boolean;cover:string|null;unread:number;status?:string;
  /** Uma imagem por recortar (o editor do PC mostra o cabeçalho a sério). */
  recorte?:RecorteDaCapa;
  /**
   * No iPhone os botões de cima vivem FORA do scroll (`SocialProfileView`):
   * ficam no sítio enquanto a página rola, por cima da barra com o nome.
   */
  botoesFora?:boolean;
  onEdit:()=>void;onMessage:()=>void;onBack?:()=>void;
  onSocial?:()=>void;onOptions?:(ancora:Ancora)=>void;onRefresh:()=>void;onAddFriend:()=>void;pending:boolean;
  /** "You two", ao lado do Message, só com amizade aceite. */
  onVocesOsDois?:()=>void;
  /** Onde acaba o nome, para a barra de cima aparecer quando ele passa por baixo dela. */
  aoMedirNome?:(fimY:number)=>void;
  /** O scroll da página (iPhone), para a fotografia da capa subir mais devagar. */
  rolagem?:Animated.Value;
};

/**
 * Perfil Editorial (4/10): identidade centrada e compacta, com biografia
 * opcional. As estatísticas abrem pelo menu do perfil, fora do cabeçalho.
 */
export function ProfileHero({profile,own,cover,unread,status,recorte,botoesFora,onEdit,onMessage,onBack,onSocial,onOptions,onRefresh,onAddFriend,pending,onVocesOsDois,aoMedirNome,rolagem}:Props) {
  const web=Platform.OS==='web',safe=useSafeAreaInsets();
  const acento=useTheme(t=>t.theme.color);
  const {width:larguraDaJanela,height:alturaDaJanela}=useWindowDimensions();
  const [largura,setLargura]=useState(0);
  // No PC a altura acompanha a largura, para a fração da fotografia que se vê
  // não depender do tamanho da janela (`alturaDoCabecalhoNoPc`).
  // No iPhone a caixa tem a fotografia inteira (5/10, alturaDaCapaNoTelemovel).
  const alturaDaCapa=web?Math.max(220,alturaDoCabecalhoNoPc(largura,alturaDaJanela)*0.62):alturaDaCapaNoTelemovel(larguraDaJanela);
  const bio=profile?.appearance?.bio?.trim();
  const botoes=<View style={[s.row,{gap:10,position:'absolute',top:web?16:safe.top+8,left:SOCIAL_GUTTER,right:SOCIAL_GUTTER}]}>
    {onBack&&<BotaoDeVidro label="Back" icon="chevron-back" onPress={onBack}/>}
    <View style={{flex:1}}/>
    {own&&onSocial&&<BotaoDeVidro label="Friends and chats" icon="chatbubbles-outline" onPress={onSocial} badge={unread}/>}
    {onOptions&&<BotaoDeOpcoes onPress={onOptions}/>}
    {web&&<BotaoDeVidro label="Refresh profile" icon="refresh-outline" onPress={onRefresh}/>}
  </View>;
  const pilula=(rotulo:string,onPress:()=>void,{icone,branca=false,cor}:{icone?:keyof typeof Ionicons.glyphMap;branca?:boolean;cor?:string}={})=>
    <Pressable key={rotulo} accessibilityRole="button" accessibilityLabel={rotulo} onPress={onPress}
      style={({pressed,hovered}:any)=>[estilos.pilula,{backgroundColor:branca?'#fff':pressed||hovered?colors.surfacePressed:'transparent',borderColor:branca?'transparent':colors.borderStrong,opacity:pressed&&branca?0.85:1}]}>
      {icone&&<Ionicons name={icone} size={17} color={cor??(branca?colors.bg:colors.text)}/>}
      <Text numberOfLines={1} style={[estilos.pilulaTexto,{color:branca?colors.bg:colors.text}]}>{rotulo}</Text>
    </Pressable>;

  return <View onLayout={web?(e=>setLargura(e.nativeEvent.layout.width)):undefined} style={{backgroundColor:colors.bg}}>
    <View style={{height:alturaDaCapa,overflow:'hidden'}}>
      <CapaDoPerfil cover={cover} recorte={recorte} rolagem={rolagem}/>
      {!botoesFora&&botoes}
    </View>
    {profile&&<View style={{alignItems:'center',paddingHorizontal:SOCIAL_GUTTER,marginTop:-SOBREPOSICAO}}>
      <View style={{padding:4,borderRadius:(AVATAR+8)/2,backgroundColor:colors.bg}}>
        <FriendAvatar avatarUrl={profile.profile.avatar_url} name={profile.profile.name} size={AVATAR}/>
      </View>
      <View style={[s.row,{gap:8,marginTop:10,justifyContent:'center',maxWidth:'100%'}]}
        onLayout={aoMedirNome?(e=>aoMedirNome(alturaDaCapa-SOBREPOSICAO+AVATAR+8+10+e.nativeEvent.layout.height)):undefined}>
        <Text numberOfLines={1} accessibilityRole="header" style={{fontSize:32,lineHeight:38,fontWeight:'700',letterSpacing:-0.8,color:colors.text,flexShrink:1}}>{profile.profile.name}</Text>
      </View>
      <Text style={[s.muted,{fontSize:13,lineHeight:18,marginTop:1}]}>@{profile.profile.username}</Text>
      {!!status&&<Text style={[s.muted,{color:status.startsWith('●')?colors.online:colors.textSecondary,fontWeight:'600',marginTop:4}]}>{status}</Text>}
      {!!bio&&<Text style={{textAlign:'center',fontSize:14,lineHeight:21,color:colors.text,marginTop:10,maxWidth:web?520:290,alignSelf:'center'}}>{bio}</Text>}
      <View style={[s.row,{gap:10,marginTop:17,justifyContent:'center',flexWrap:'wrap',maxWidth:'100%'}]}>
        {own
          ? pilula('Edit profile',onEdit)
          : profile.canView
            ? <>{pilula('Message',onMessage,{icone:'chatbubble-outline',branca:true})}
                {onVocesOsDois&&pilula('You two',onVocesOsDois,{icone:'sparkles-outline',cor:acento})}</>
            : pilula(pending?'Request pending':'Add friend',pending?()=>{}:onAddFriend,{icone:pending?'time-outline':'person-add-outline',branca:!pending})}
      </View>
    </View>}
  </View>;
}

/** Os botões de cima, para quem os põe fora do scroll (o iPhone). */
export function BotoesDoPerfil({own,unread,onBack,onSocial,onSettings,onOptions}:{own:boolean;unread:number;onBack?:()=>void;onSocial?:()=>void;onSettings?:()=>void;onOptions?:(ancora:Ancora)=>void}) {
  const safe=useSafeAreaInsets();
  return <View pointerEvents="box-none" style={[s.row,{gap:10,position:'absolute',top:safe.top+8,left:SOCIAL_GUTTER,right:SOCIAL_GUTTER,zIndex:5}]}>
    {onBack&&<BotaoDeVidro label="Back" icon="chevron-back" onPress={onBack}/>}
    <View style={{flex:1}} pointerEvents="none"/>
    {own&&onSocial&&<BotaoDeVidro label="Friends and chats" icon="chatbubbles-outline" onPress={onSocial} badge={unread}/>}
    {/* À vista, como pede a HIG (5/10, auditoria N5): estava dentro do "⋯". */}
    {own&&onSettings&&<BotaoDeVidro label="Settings" icon="settings-outline" onPress={onSettings}/>}
    {onOptions&&<BotaoDeOpcoes onPress={onOptions}/>}
  </View>;
}

const estilos=StyleSheet.create({
  pilula:{minHeight:44,borderRadius:22,borderWidth:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,paddingHorizontal:18,maxWidth:'100%'},
  pilulaTexto:{fontSize:13,fontWeight:'600',flexShrink:1},
});
