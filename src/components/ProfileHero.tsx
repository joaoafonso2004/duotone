import React,{useEffect,useState} from 'react';
import {Animated,Platform,Pressable,StyleSheet,Text,useWindowDimensions,View} from 'react-native';
import {Image} from 'expo-image';
import {profileImageCacheKey} from '../lib/profileMedia';
import Ionicons from '@expo/vector-icons/Ionicons';
import {LinearGradient} from 'expo-linear-gradient';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {SocialProfile} from '../api/profiles';
import {FriendAvatar} from './FriendAvatar';
import {socialStyles as s} from './socialUI';
import {alturaDaCapaNoTelemovel,alturaDoCabecalhoNoPc,degradeDaCorDaCapa,DISSOLVE_DESDE,EXTENSAO_DO_AMBIENTE,enquadrarCapa,enquadrarPreVisualizacao,RACIO_DA_CAPA,veuDoTopo} from '../lib/profileImageCrop';
import {lerCelulasDaCapa} from '../lib/celulasDaCapa';
import {corDoAmbiente} from '../lib/corDaCapa';
import {DissolverEmBaixo} from './DissolverEmBaixo';
import {colors,SOCIAL_GUTTER} from './socialTokens';
import {useTheme} from '../state/theme';

/**
 * A identidade (a cara, o nome) sobe por cima da capa esta fração dela (11/10,
 * variante A de `docs/perfil-topo.html`): assenta na parte que já se está a
 * dissolver, e a capa e o perfil ficam uma peça só.
 */
const SOBREPOSICAO_DA_CAPA=0.4;
const AVATAR=76;
/** O anel branco da cara. */
const ANEL=3;

/** Uma imagem ainda por recortar, para o editor ver o cabeçalho a sério. */
export type RecorteDaCapa={largura:number;altura:number;x:number;y:number;zoom?:number};

/**
 * A capa de um perfil: a fotografia a cobrir a caixa, alinhada ao topo.
 *
 * **A fotografia como ela é** (5/10, variante A de `docs/perfil-capa.html`):
 * a 100%, sem as vinhetas dos lados nem o véu da cor dela por cima.
 *
 * **E não acaba: dissolve-se** (7/10): a partir de `DISSOLVE_DESDE` fica
 * transparente e deixa ver a `CorDaCapaDoPerfil` -- a cor da própria fotografia
 * --, que continua por trás do nome e desce pela página (11/10). Em baixo, um
 * escurecer leve para o nome e a bio se lerem por cima.
 *
 * `rolagem` (o scroll da página, só no iPhone): a fotografia sobe a metade da
 * velocidade do texto. Puxar para baixo no topo não a mexe.
 */
export function CapaDoPerfil({cover,recorte,rolagem}:{cover:string|null;recorte?:RecorteDaCapa;rolagem?:Animated.Value}) {
  const [caixa,setCaixa]=useState({largura:0,altura:0});
  const parallax=React.useMemo(()=>rolagem?[{translateY:rolagem.interpolate({inputRange:[0,1],outputRange:[0,0.5],extrapolateLeft:'clamp'})}]:undefined,[rolagem]);
  if(!cover)return null;
  const topo=veuDoTopo();
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
    <DissolverEmBaixo desde={DISSOLVE_DESDE}>
      <View onLayout={e=>setCaixa({largura:e.nativeEvent.layout.width,altura:e.nativeEvent.layout.height})}
        style={[StyleSheet.absoluteFill,{overflow:'hidden'}]}>
        <Animated.View style={[StyleSheet.absoluteFill,parallax&&{transform:parallax}]}>{imagem()}</Animated.View>
        <LinearGradient colors={['rgba(10,10,15,0)','rgba(10,10,15,0.32)']} locations={[0.45,1]} style={StyleSheet.absoluteFill}/>
      </View>
    </DissolverEmBaixo>
    <LinearGradient colors={topo.cores} locations={topo.paragens} style={StyleSheet.absoluteFill}/>
  </View>;
}

/**
 * Por trás de tudo, da capa até à "Song of the moment" e mais abaixo: a COR da
 * própria fotografia (`corDoAmbiente`), cheia por trás da capa e a apagar-se
 * devagar no fundo da página (11/10, variante A de `docs/perfil-topo.html`).
 * Era a fotografia desfocada e escurecida até ao preto, e o João: "a capa não
 * pertence", "aquela parte preta de baixo da capa". A cor lê-se uma vez por
 * capa (em cache, `lerCelulasDaCapa`); sem ela, fica o fundo da app.
 */
function CorDaCapaDoPerfil({cover,alturaDaCapa}:{cover:string|null;alturaDaCapa:number}) {
  const [cor,setCor]=useState<string|null>(null);
  useEffect(()=>{
    let vivo=true;
    if(!cover){setCor(null);return;}
    void lerCelulasDaCapa(cover).then(c=>{if(vivo)setCor(corDoAmbiente(c));});
    return()=>{vivo=false;};
  },[cover]);
  if(!cor||!(alturaDaCapa>0))return null;
  const d=degradeDaCorDaCapa(alturaDaCapa,cor);
  return <LinearGradient pointerEvents="none" colors={d.cores} locations={d.paragens}
    style={{position:'absolute',left:0,right:0,top:0,height:alturaDaCapa+EXTENSAO_DO_AMBIENTE}}/>;
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

/**
 * As estatísticas, à vista (7/10): eram a única opção de um "⋯", e um menu com
 * uma linha só é um toque a mais.
 */
function BotaoDasEstatisticas({onPress}:{onPress:()=>void}) {
  return <BotaoDeVidro label="Listening stats" icon="stats-chart-outline" onPress={onPress}/>;
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
  onSocial?:()=>void;onStats?:()=>void;onRefresh:()=>void;onAddFriend:()=>void;pending:boolean;
  /** "You two", ao lado do Message, só com amizade aceite. */
  onVocesOsDois?:()=>void;
  /** Onde acaba o nome, para a barra de cima aparecer quando ele passa por baixo dela. */
  aoMedirNome?:(fimY:number)=>void;
  /** O scroll da página (iPhone), para a fotografia da capa subir mais devagar. */
  rolagem?:Animated.Value;
};

/**
 * O cabeçalho do perfil (11/10, variante A de `docs/perfil-topo.html`): a capa
 * é o cabeçalho. A fotografia dissolve-se na cor dela, que desce pela página, e
 * a identidade assenta por cima, à esquerda: a cara, o nome grande, o @, a bio
 * e os botões. Era o Editorial de 4/10, centrado e com o preto debaixo da capa.
 */
export function ProfileHero({profile,own,cover,unread,status,recorte,botoesFora,onEdit,onMessage,onBack,onSocial,onStats,onRefresh,onAddFriend,pending,onVocesOsDois,aoMedirNome,rolagem}:Props) {
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
    {onStats&&<BotaoDasEstatisticas onPress={onStats}/>}
    {web&&<BotaoDeVidro label="Refresh profile" icon="refresh-outline" onPress={onRefresh}/>}
  </View>;
  const pilula=(rotulo:string,onPress:()=>void,{icone,branca=false,cor}:{icone?:keyof typeof Ionicons.glyphMap;branca?:boolean;cor?:string}={})=>
    <Pressable key={rotulo} accessibilityRole="button" accessibilityLabel={rotulo} onPress={onPress}
      style={({pressed,hovered}:any)=>[estilos.pilula,{backgroundColor:branca?'#fff':pressed||hovered?colors.surfacePressed:'transparent',borderColor:branca?'transparent':colors.borderStrong,opacity:pressed&&branca?0.85:1}]}>
      {icone&&<Ionicons name={icone} size={17} color={cor??(branca?colors.bg:colors.text)}/>}
      <Text numberOfLines={1} style={[estilos.pilulaTexto,{color:branca?colors.bg:colors.text}]}>{rotulo}</Text>
    </Pressable>;

  // Sem capa não há onde assentar: a identidade fica logo por baixo dos botões.
  const sobreposicao=cover?Math.round(alturaDaCapa*SOBREPOSICAO_DA_CAPA):0;
  return <View onLayout={web?(e=>setLargura(e.nativeEvent.layout.width)):undefined} style={{backgroundColor:colors.bg}}>
    {/* Primeiro, para ficar por baixo da capa e do nome; transborda para a secção seguinte e apaga-se lá. */}
    <CorDaCapaDoPerfil cover={cover} alturaDaCapa={alturaDaCapa}/>
    <View style={{height:alturaDaCapa,overflow:'hidden'}}>
      <CapaDoPerfil cover={cover} recorte={recorte} rolagem={rolagem}/>
      {!botoesFora&&botoes}
    </View>
    {profile&&<View style={{alignItems:'flex-start',paddingHorizontal:SOCIAL_GUTTER,marginTop:-sobreposicao}}>
      <View style={{borderRadius:(AVATAR+ANEL*2)/2,borderWidth:ANEL,borderColor:'rgba(255,255,255,0.92)',
        shadowColor:'#000',shadowOpacity:0.35,shadowRadius:12,shadowOffset:{width:0,height:6}}}>
        <FriendAvatar avatarUrl={profile.profile.avatar_url} name={profile.profile.name} size={AVATAR}/>
      </View>
      <View style={[s.row,{gap:8,marginTop:12,maxWidth:'100%'}]}
        onLayout={aoMedirNome?(e=>aoMedirNome(alturaDaCapa-sobreposicao+AVATAR+ANEL*2+12+e.nativeEvent.layout.height)):undefined}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} accessibilityRole="header"
          style={{fontSize:42,lineHeight:46,fontWeight:'800',letterSpacing:-1.2,color:colors.text,flexShrink:1}}>{profile.profile.name}</Text>
      </View>
      <Text style={[s.muted,{fontSize:14,lineHeight:19,marginTop:2}]}>@{profile.profile.username}</Text>
      {!!status&&<Text style={[s.muted,{color:status.startsWith('●')?colors.online:colors.textSecondary,fontWeight:'600',marginTop:4}]}>{status}</Text>}
      {!!bio&&<Text style={{fontSize:15,lineHeight:21,color:colors.text,marginTop:10,maxWidth:web?520:undefined}}>{bio}</Text>}
      <View style={[s.row,{gap:10,marginTop:16,justifyContent:'flex-start',flexWrap:'wrap',maxWidth:'100%'}]}>
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
export function BotoesDoPerfil({own,unread,onBack,onSocial,onSettings,onStats}:{own:boolean;unread:number;onBack?:()=>void;onSocial?:()=>void;onSettings?:()=>void;onStats?:()=>void}) {
  const safe=useSafeAreaInsets();
  return <View pointerEvents="box-none" style={[s.row,{gap:10,position:'absolute',top:safe.top+8,left:SOCIAL_GUTTER,right:SOCIAL_GUTTER,zIndex:5}]}>
    {onBack&&<BotaoDeVidro label="Back" icon="chevron-back" onPress={onBack}/>}
    <View style={{flex:1}} pointerEvents="none"/>
    {own&&onSocial&&<BotaoDeVidro label="Friends and chats" icon="chatbubbles-outline" onPress={onSocial} badge={unread}/>}
    {/* À vista, como pede a HIG (5/10, auditoria N5): estava dentro do "⋯". */}
    {own&&onSettings&&<BotaoDeVidro label="Settings" icon="settings-outline" onPress={onSettings}/>}
    {onStats&&<BotaoDasEstatisticas onPress={onStats}/>}
  </View>;
}

const estilos=StyleSheet.create({
  pilula:{minHeight:44,borderRadius:22,borderWidth:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,paddingHorizontal:18,maxWidth:'100%'},
  pilulaTexto:{fontSize:13,fontWeight:'600',flexShrink:1},
});
