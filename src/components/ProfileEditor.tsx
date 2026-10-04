import React,{useEffect,useRef,useState} from 'react';
import { ActivityIndicator,Image,Platform,Pressable,ScrollView,StyleSheet,Switch,Text,TextInput,View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Crypto from 'expo-crypto';
import { appearanceOf,saveProfileEdits,type SocialProfile,type ProfileHighlights } from '../api/profiles';
import { setPlaylistVisibility } from '../api/playlists';
import { getLibrary } from '../api/library';
import { lerFaixas } from '../lib/cacheDaBiblioteca';
import { pickProfileImage,prepareProfileImage,type SelectedProfileImage } from '../lib/profileImage';
import { LARGURA_DA_CAPA,LARGURA_DO_AVATAR,RACIO_DA_CAPA,RACIO_DO_AVATAR,zoomMaximo,ZOOM_MINIMO } from '../lib/profileImageCrop';
import { mediaBucket,removeProfileMedia,useProfileMedia,type ProfileMediaKind } from '../lib/profileMedia';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { supabase } from '../lib/supabase';
import { FriendAvatar } from './FriendAvatar';
import { ProfileCropPreview } from './ProfileCropPreview';
import { ArtworkCollage } from './ArtworkCollage';
import { MenuFlutuante, type Ancora } from './MenuFlutuante';
import type { PlayerAction } from './PlayerActionsSheet';
import { useSocial } from '../state/social';
import { useTheme } from '../state/theme';
import { SocialModal,socialStyles as s } from './socialUI';
import type { Playlist,Track } from '../types';
import { colors,radii } from './socialTokens';

/** O zoom para quem não tem dois dedos (o PC monta este mesmo editor). */
function Zoom({valor,teto,disabled,onChange}:{valor:number;teto:number;disabled:boolean;onChange:(v:number)=>void}) {
  if(teto<=ZOOM_MINIMO+0.001)return null;
  const passo=(d:number)=>onChange(Math.max(ZOOM_MINIMO,Math.min(teto,Math.round((valor+d)*20)/20)));
  const botao=(rotulo:string,d:number,desligado:boolean)=><Pressable accessibilityRole="button" accessibilityLabel={d<0?'Zoom out':'Zoom in'}
    disabled={disabled||desligado} onPress={()=>passo(d)} style={[e.zoom,(disabled||desligado)&&{opacity:0.4}]}><Text style={s.text}>{rotulo}</Text></Pressable>;
  return <View style={[s.row,{alignItems:'center',gap:10,justifyContent:'center'}]}>
    {botao('−',-0.2,valor<=ZOOM_MINIMO+0.001)}
    <Text style={s.muted}>{`Zoom ${valor.toFixed(1)}×`}</Text>
    {botao('+',0.2,valor>=teto-0.001)}
  </View>;
}

/** Um grupo da lista ao estilo do iOS (como as Definições): cabeçalho, linhas, rodapé. */
function Grupo({cabecalho,direita,rodape,children}:{cabecalho?:string;direita?:string;rodape?:string|null;children:React.ReactNode}) {
  return <View style={{marginTop:26}}>
    {!!cabecalho&&<View style={[s.row,{justifyContent:'space-between',paddingHorizontal:20,paddingBottom:7}]}>
      <Text style={e.cabecalho}>{cabecalho}</Text>{!!direita&&<Text style={e.cabecalho}>{direita}</Text>}
    </View>}
    <View style={e.grupo}>{React.Children.toArray(children).filter(Boolean).map((filho,i)=><React.Fragment key={i}>
      {i>0&&<View style={e.separador}/>}{filho}
    </React.Fragment>)}</View>
    {!!rodape&&<Text style={e.rodape}>{rodape}</Text>}
  </View>;
}

/**
 * Editar o perfil (4/10, `docs/perfil-e-editar.html`): Cancel · Edit profile ·
 * Save em cima (o Save só acende com uma mudança), a capa e a foto como no
 * perfil, e a lista agrupada das Definições para o resto.
 *
 * Os destaques e o que aparece no perfil vivem aqui, juntos: eram o ⊕/⊖ do
 * perfil e os botões grandes do editor, dois sítios para a mesma coisa. A
 * visibilidade grava-se no Save, com o resto (era imediata no ⊖).
 *
 * Fica num `Modal` do React Native e não numa folha nativa: o recorte da capa
 * e da foto arrasta-se com um PanResponder, e a folha do iOS roubava o gesto.
 *
 * O recorte escolhe-se a arrastar e aproximar, e o que se vê é o que fica.
 * Saíram daqui a cor de destaque e os avatares de emoji (os antigos continuam
 * a aparecer -- o `FriendAvatar` sabe lê-los).
 */
export function ProfileEditor({profile,highlights,playlists,onClose,onSaved}:{profile:SocialProfile;highlights:ProfileHighlights|null;playlists:Playlist[];onClose:()=>void;onSaved:()=>void}) {
  const acento=useTheme(t=>t.theme.color);
  const [featured,setFeatured]=useState(highlights);
  const [value,setValue]=useState(()=>appearanceOf(profile));
  const [name,setName]=useState(profile.profile.name);
  const username=profile.profile.username || '';
  const [avatar,setAvatar]=useState<SelectedProfileImage|null>(null);
  const [cover,setCover]=useState<SelectedProfileImage|null>(null);
  const [adjustingImage,setAdjustingImage]=useState(false);
  const [avatarX,setAvatarX]=useState(0.5),[avatarY,setAvatarY]=useState(0.5);
  const [coverX,setCoverX]=useState(0.5),[coverY,setCoverY]=useState(0.5);
  const [avatarZoom,setAvatarZoom]=useState(ZOOM_MINIMO),[coverZoom,setCoverZoom]=useState(ZOOM_MINIMO);
  const [visiveis,setVisiveis]=useState<Record<string,boolean>>(()=>Object.fromEntries(playlists.map(p=>[p.id,!!p.visibleOnProfile])));
  const [mudou,setMudou]=useState(false);
  const [stage,setStage]=useState(''),[error,setError]=useState('');
  const [aAdicionar,setAAdicionar]=useState(false);
  const coverUrl=useProfileMedia(value.cover_path ? `storage:${value.cover_path}` : null,'cover');
  const avatarUrl=value.avatar_path ? `storage:${value.avatar_path}` : value.legacy_avatar_url || `emoji:${value.emoji}:${value.gradient_index}`;
  const marcar=()=>setMudou(true);

  // O menu da capa e da foto. A ação corre quando ele saiu MESMO do ecrã
  // (`aoFechado`): abrir o seletor de imagens com o menu a sair deixava o iOS
  // a apresentar uma coisa por cima de outra.
  const [menu,setMenu]=useState<{qual:ProfileMediaKind;ancora:Ancora}|null>(null);
  const depois=useRef<(()=>void)|null>(null);
  const caixaDaCapa=useRef<View>(null),caixaDaFoto=useRef<View>(null);
  const abrirMenu=(qual:ProfileMediaKind)=>{
    if(stage)return;
    const ref=qual==='cover'?caixaDaCapa:caixaDaFoto;
    ref.current?.measureInWindow((x,y,width,height)=>setMenu({qual,ancora:{x,y,width,height}}));
  };

  const select=async(kind:ProfileMediaKind)=>{
    try {
      setError('');
      const image=await pickProfileImage();
      if(!image)return;
      if(kind==='avatar'){setAvatar(image);setAvatarX(0.5);setAvatarY(0.5);setAvatarZoom(ZOOM_MINIMO);}
      else {setCover(image);setCoverX(0.5);setCoverY(0.5);setCoverZoom(ZOOM_MINIMO);}
      marcar();
    }
    catch(err:any){setError(err.message || 'Could not open that image.');}
  };
  const remover=(kind:ProfileMediaKind)=>{
    if(kind==='cover'){setCover(null);setValue(v=>({...v,cover_path:null}));}
    else {setAvatar(null);setValue(v=>({...v,avatar_path:null,legacy_avatar_url:null}));}
    marcar();
  };
  const temCapa=!!cover||!!value.cover_path, temFoto=!!avatar||!!value.avatar_path;
  const accoesDoMenu:PlayerAction[]=menu?[
    {label:menu.qual==='cover'?(temCapa?'Choose another cover':'Choose a cover'):(temFoto?'Choose another photo':'Choose a photo'),icon:'images-outline',
      onPress:()=>{const q=menu.qual;depois.current=()=>void select(q);setMenu(null);}},
    ...((menu.qual==='cover'?temCapa:temFoto)?[{label:menu.qual==='cover'?'Remove cover':'Remove photo',icon:'trash-outline' as const,destructive:true,
      onPress:()=>{const q=menu.qual;setMenu(null);remover(q);}}]:[]),
  ]:[];

  const tetoDaCapa=cover?zoomMaximo(cover.width,cover.height,RACIO_DA_CAPA,LARGURA_DA_CAPA):ZOOM_MINIMO;
  const tetoDoAvatar=avatar?zoomMaximo(avatar.width,avatar.height,RACIO_DO_AVATAR,LARGURA_DO_AVATAR):ZOOM_MINIMO;

  // --- a música do momento: escolhida entre as guardadas
  const [aEscolher,setAEscolher]=useState(false),[query,setQuery]=useState('');
  const [tracks,setTracks]=useState<Track[]>([]),[aCarregar,setACarregar]=useState(false),[erroDasMusicas,setErroDasMusicas]=useState('');
  useEffect(()=>{
    if(!aEscolher)return;
    let ativo=true;setACarregar(true);setErroDasMusicas('');
    lerFaixas(getLibrary).then(t=>{if(ativo)setTracks(t);}).catch(()=>{if(ativo)setErroDasMusicas('Could not load your songs. Close and try again.');}).finally(()=>{if(ativo)setACarregar(false);});
    return()=>{ativo=false;};
  },[aEscolher]);
  const encontradas=tracks.filter(t=>t.id&&`${t.title} ${displayArtist(t)}`.toLowerCase().includes(query.trim().toLowerCase()));

  // --- os destaques e o que aparece no perfil
  const porId=new Map(playlists.map(p=>[p.id,p]));
  const destacadas=(featured?.playlistIds??[]).filter(id=>porId.has(id)&&visiveis[id]);
  const candidatas=playlists.filter(p=>visiveis[p.id]&&!destacadas.includes(p.id));
  const mudarDestaques=(ids:string[])=>{if(featured){setFeatured({...featured,playlistIds:ids});marcar();}};
  const alternarVisivel=(id:string,v:boolean)=>{
    setVisiveis(x=>({...x,[id]:v}));
    // Uma que deixa de aparecer deixa também de estar em destaque.
    if(!v&&featured?.playlistIds.includes(id))setFeatured({...featured,playlistIds:featured.playlistIds.filter(x=>x!==id)});
    marcar();
  };

  const save=async()=>{
    if(stage)return;
    const uploaded:{kind:ProfileMediaKind;path:string}[]=[];
    let saving=false;
    try {
      setError('');setStage('Preparing images…');
      const next={...value};
      for(const kind of ['avatar','cover'] as const){
        const image=kind==='avatar'?avatar:cover;if(!image)continue;
        const bytes=await prepareProfileImage(
          image,kind,
          kind==='avatar'?avatarY:coverY,
          kind==='avatar'?avatarX:coverX,
          kind==='avatar'?avatarZoom:coverZoom,
        );
        const path=`${profile.profile.id}/${kind}/${Crypto.randomUUID()}.jpg`;
        setStage(kind==='avatar'?'Uploading photo…':'Uploading cover…');
        const {error:failure}=await supabase.storage.from(mediaBucket(kind)).upload(path,bytes,{contentType:'image/jpeg',upsert:false});
        if(failure)throw failure;
        uploaded.push({kind,path});
        if(kind==='avatar'){next.avatar_path=path;next.legacy_avatar_url=null;}else {next.cover_path=path;next.cover_position=0.5;}
      }
      setStage('Saving…');
      // O que aparece no perfil primeiro: um destaque só pode ser de uma
      // playlist visível, e o servidor confere.
      for(const p of playlists){
        const v=!!visiveis[p.id];
        if(v!==!!p.visibleOnProfile)await setPlaylistVisibility(p.id,v);
      }
      saving=true;
      // Destaques desconhecidos (não carregaram) não se substituem por uma
      // lista vazia: a RPC antiga altera só a aparência.
      await saveProfileEdits(next,name,username,featured?{...featured,playlistIds:destacadas}:null);
      useSocial.setState(st=>({profileVersion:st.profileVersion+1}));
      const previous=appearanceOf(profile);
      // Só se apagam os ficheiros antigos depois de a referência nova estar gravada.
      for(const kind of ['avatar','cover'] as const){
        const old=kind==='avatar'?previous.avatar_path:previous.cover_path;
        const current=kind==='avatar'?next.avatar_path:next.cover_path;
        if(old && old!==current) void removeProfileMedia(kind,[old]).catch(err=>console.warn('Limpeza de imagem antiga:',err));
      }
      onSaved();onClose();
    } catch(err:any){
      // Uma resposta perdida pode esconder uma gravação concluída: aí os
      // uploads ficam, para não se apagar a imagem que o perfil já usa.
      if(!saving)for(const file of uploaded) await removeProfileMedia(file.kind,[file.path]).catch(()=>{});
      setError(err.message || 'Could not save. You can try again.');
    } finally {setStage('');}
  };

  const podeGuardar=mudou&&!stage&&name.trim().length>=2;
  const cabecalho=<View style={e.nav}>
    <Pressable accessibilityRole="button" disabled={!!stage} onPress={onClose} hitSlop={10}><Text style={[e.navBotao,stage&&{opacity:0.4}]}>Cancel</Text></Pressable>
    <Text style={e.navTitulo}>Edit profile</Text>
    <Pressable accessibilityRole="button" accessibilityState={{disabled:!podeGuardar}} disabled={!podeGuardar} onPress={()=>void save()} hitSlop={10}>
      {stage?<ActivityIndicator size="small" color={colors.text}/>:<Text style={[e.navBotao,{fontWeight:'700',color:podeGuardar?colors.text:colors.textTertiary}]}>Save</Text>}
    </Pressable>
  </View>;

  const linhaDePlaylist=(p:Playlist,direita:React.ReactNode,esquerda?:React.ReactNode)=><View key={p.id} style={e.linha}>
    {esquerda}
    <View style={{borderRadius:6,overflow:'hidden'}}><ArtworkCollage artworks={p.artworks} size={40}/></View>
    <View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={e.nome}>{p.name}</Text><Text style={e.sub}>{p.trackCount} {p.trackCount===1?'track':'tracks'}</Text></View>
    {direita}
  </View>;

  return <SocialModal visible wide title="Edit profile" header={cabecalho} onClose={()=>{if(!stage)onClose();}}>
    <ScrollView style={{flexShrink:1}} scrollEnabled={!adjustingImage} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom:40,paddingTop:12}}>
      {/* A capa e a foto como no perfil: a foto sobreposta à capa. Tocar numa
          abre o menu; uma imagem acabada de escolher arrasta-se e aproxima-se
          ali mesmo. */}
      <View style={{paddingHorizontal:16}}>
        <View ref={caixaDaCapa} collapsable={false} style={{borderRadius:18,overflow:'hidden',backgroundColor:colors.surfaceHigh}}>
          {cover
            ? <ProfileCropPreview image={cover} ratio={RACIO_DA_CAPA} x={coverX} y={coverY}
                zoom={coverZoom} zoomMaximo={tetoDaCapa} onDraggingChange={setAdjustingImage}
                onChange={(x,y)=>{setCoverX(x);setCoverY(y);}} onZoomChange={setCoverZoom}/>
            : <Pressable accessibilityRole="button" accessibilityLabel="Edit cover" onPress={()=>abrirMenu('cover')} style={{width:'100%',aspectRatio:RACIO_DA_CAPA,alignItems:'center',justifyContent:'center'}}>
                {coverUrl?<Image source={{uri:coverUrl}} style={StyleSheet.absoluteFill} resizeMode="cover"/>:<Text style={s.muted}>No cover yet</Text>}
              </Pressable>}
          <Pressable accessibilityRole="button" accessibilityLabel="Edit cover" onPress={()=>abrirMenu('cover')} style={e.chipDaCapa}>
            <Ionicons name="camera" size={15} color={colors.text}/><Text style={{fontSize:13,fontWeight:'600',color:colors.text}}>Edit cover</Text>
          </Pressable>
        </View>
        <View ref={caixaDaFoto} collapsable={false} style={e.foto}>
          <View style={{width:96,height:96,borderRadius:48,overflow:'hidden'}}>
            {avatar
              ? <ProfileCropPreview image={avatar} ratio={RACIO_DO_AVATAR} x={avatarX} y={avatarY}
                  zoom={avatarZoom} zoomMaximo={tetoDoAvatar} onDraggingChange={setAdjustingImage}
                  onChange={(x,y)=>{setAvatarX(x);setAvatarY(y);}} onZoomChange={setAvatarZoom}/>
              : <Pressable accessibilityRole="button" accessibilityLabel="Edit photo" onPress={()=>abrirMenu('avatar')}><FriendAvatar avatarUrl={avatarUrl} name={name} size={96}/></Pressable>}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Edit photo" onPress={()=>abrirMenu('avatar')} style={e.cameraDaFoto}>
            <Ionicons name="camera" size={15} color={colors.bg}/>
          </Pressable>
        </View>
        {(cover||avatar)&&<Text style={[s.muted,{textAlign:'center',marginTop:2}]}>{Platform.OS==='web'?'Drag to reposition.':'Drag to reposition · pinch to zoom'}</Text>}
        {cover&&<Zoom valor={coverZoom} teto={tetoDaCapa} disabled={!!stage} onChange={setCoverZoom}/>}
        {avatar&&<Zoom valor={avatarZoom} teto={tetoDoAvatar} disabled={!!stage} onChange={setAvatarZoom}/>}
      </View>

      <Grupo rodape="Your username identifies your account and can't be changed.">
        <View style={e.linha}><Text style={e.rotulo}>Name</Text>
          <TextInput accessibilityLabel="Display name" editable={!stage} value={name} onChangeText={v=>{setName(v);marcar();}} maxLength={40} style={e.campo} placeholderTextColor={colors.textTertiary}/>
        </View>
        {/* O username identifica a conta, como o email: mostra-se, não se
            edita -- e o servidor também o recusa. */}
        <View style={e.linha}><Text style={e.rotulo}>Username</Text>
          <Text numberOfLines={1} style={[e.campo,{color:colors.textTertiary}]}>@{username}</Text>
          <Ionicons name="lock-closed" size={14} color={colors.textTertiary}/>
        </View>
        <View style={[e.linha,{alignItems:'flex-start',paddingVertical:12}]}><Text style={[e.rotulo,{paddingTop:2}]}>Bio</Text>
          <TextInput accessibilityLabel="Bio" editable={!stage} value={value.bio} onChangeText={bio=>{setValue(v=>({...v,bio}));marcar();}} maxLength={180} multiline
            placeholder="A line about you or your music." placeholderTextColor={colors.textTertiary} style={[e.campo,{minHeight:66,textAlignVertical:'top',paddingTop:0}]}/>
          <Text style={e.contador}>{(value.bio??'').length}/180</Text>
        </View>
      </Grupo>

      {featured?<>
        <Grupo cabecalho="Song of the moment" rodape="A song for your friends to discover on your profile.">
          {featured.moment
            ? <Pressable accessibilityRole="button" accessibilityLabel="Change song" disabled={!!stage} onPress={()=>setAEscolher(!aEscolher)} style={e.linha}>
                {featured.moment.artworkUrl?<Image source={{uri:capaParaLista(featured.moment.artworkUrl)!}} style={{width:40,height:40,borderRadius:6}}/>:<View style={{width:40,height:40,borderRadius:6,backgroundColor:colors.surfaceHigh}}/>}
                <View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={e.nome}>{tituloDaFaixa(featured.moment)}</Text><Text numberOfLines={1} style={e.sub}>{displayArtist(featured.moment)}</Text></View>
                <Text style={e.valor}>{aEscolher?'Close':'Change'}</Text><Ionicons name={aEscolher?'chevron-up':'chevron-forward'} size={15} color={colors.textTertiary}/>
              </Pressable>
            : <Pressable accessibilityRole="button" disabled={!!stage} onPress={()=>setAEscolher(!aEscolher)} style={e.linha}>
                <View style={[e.circulo,{backgroundColor:acento}]}><Ionicons name="add" size={15} color={colors.bg}/></View>
                <Text style={[e.nome,{flex:1}]}>{aEscolher?'Close':'Choose a song'}</Text>
              </Pressable>}
          {aEscolher&&<View style={e.linha}>
            <Ionicons name="search" size={16} color={colors.textTertiary}/>
            <TextInput accessibilityLabel="Find a song for your profile" editable={!stage} value={query} onChangeText={setQuery} autoFocus
              placeholder="Search your songs" placeholderTextColor={colors.textTertiary} style={e.campo}/>
          </View>}
          {aEscolher&&(aCarregar?<View style={e.linha}><ActivityIndicator color={colors.text}/></View>
            : erroDasMusicas?<View style={e.linha}><Text style={s.error}>{erroDasMusicas}</Text></View>
            : encontradas.length?encontradas.slice(0,8).map(t=><Pressable key={t.id} accessibilityRole="button" disabled={!!stage}
                onPress={()=>{setFeatured({...featured,moment:t});setAEscolher(false);setQuery('');marcar();}} style={e.linha}>
                <Text numberOfLines={1} style={[e.nome,{flex:1}]}>{tituloDaFaixa(t)} <Text style={e.sub}>· {displayArtist(t)}</Text></Text>
              </Pressable>)
            : <View style={e.linha}><Text style={e.sub}>No matching songs in your library.</Text></View>)}
          {featured.moment&&!aEscolher&&<Pressable accessibilityRole="button" disabled={!!stage} onPress={()=>{setFeatured({...featured,moment:null});marcar();}} style={e.linha}>
            <Text style={[e.nome,{color:colors.danger,paddingLeft:52}]}>Remove song</Text>
          </Pressable>}
        </Grupo>

        <Grupo cabecalho="Featured playlists" direita={`${destacadas.length} of 3`} rodape="They appear first on your profile, in this order.">
          {destacadas.map((id,i)=>linhaDePlaylist(porId.get(id)!,<>
            {i>0&&<Pressable accessibilityRole="button" accessibilityLabel={`Move ${porId.get(id)!.name} up`} disabled={!!stage} hitSlop={8}
              onPress={()=>{const ids=[...destacadas];[ids[i-1],ids[i]]=[ids[i],ids[i-1]];mudarDestaques(ids);}}>
              <Ionicons name="arrow-up" size={18} color={colors.textSecondary}/>
            </Pressable>}
            <View style={e.numero}><Text style={{fontSize:12,fontWeight:'800',color:colors.bg}}>{i+1}</Text></View>
          </>,<Pressable accessibilityRole="button" accessibilityLabel={`Remove ${porId.get(id)!.name} from featured`} disabled={!!stage} hitSlop={8}
            onPress={()=>mudarDestaques(destacadas.filter(x=>x!==id))} style={[e.circulo,{backgroundColor:colors.danger}]}>
            <View style={{width:10,height:2,borderRadius:1,backgroundColor:'#fff'}}/>
          </Pressable>))}
          {destacadas.length<3&&<Pressable accessibilityRole="button" disabled={!!stage||!candidatas.length} onPress={()=>setAAdicionar(!aAdicionar)} style={e.linha}>
            <View style={[e.circulo,{backgroundColor:candidatas.length?'#30D158':colors.surfaceHigh}]}><Ionicons name="add" size={15} color="#fff"/></View>
            <Text style={[e.nome,{flex:1,color:candidatas.length?colors.text:colors.textTertiary}]}>{candidatas.length?(aAdicionar?'Close':'Add a playlist'):'Turn on a playlist below first'}</Text>
          </Pressable>}
          {aAdicionar&&destacadas.length<3&&candidatas.map(p=>linhaDePlaylist(p,<Pressable accessibilityRole="button" accessibilityLabel={`Feature ${p.name}`} disabled={!!stage} hitSlop={8}
            onPress={()=>{mudarDestaques([...destacadas,p.id]);setAAdicionar(false);}}>
            <Ionicons name="add-circle" size={24} color={acento}/>
          </Pressable>))}
        </Grupo>
      </>:<Text style={[e.rodape,{marginTop:20}]}>Highlights could not load. You can still edit your photo, cover and details.</Text>}

      {playlists.length>0&&<Grupo cabecalho="Shown on your profile" rodape="Your friends see these. Only playlists shown here can be featured.">
        {playlists.map(p=>linhaDePlaylist(p,<Switch value={!!visiveis[p.id]} disabled={!!stage} onValueChange={v=>alternarVisivel(p.id,v)}
          trackColor={{false:colors.surfacePressed,true:colors.text}} thumbColor="#fff"/>))}
      </Grupo>}

      {!!error && <Text accessibilityRole="alert" style={[s.error,{paddingHorizontal:20,marginTop:16}]}>{error}</Text>}
    </ScrollView>
    <MenuFlutuante visivel={!!menu} ancora={menu?.ancora??null} accoes={accoesDoMenu}
      aoFechar={()=>setMenu(null)} aoFechado={()=>{const fn=depois.current;depois.current=null;fn?.();}}/>
  </SocialModal>;
}

const e=StyleSheet.create({
  nav:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingVertical:12,borderBottomWidth:StyleSheet.hairlineWidth,borderColor:colors.border},
  navTitulo:{fontSize:17,fontWeight:'600',color:colors.text},
  navBotao:{fontSize:17,color:colors.text},
  // Um pouco mais claro do que a folha (que é o `surfaceHigh` do SocialModal).
  grupo:{marginHorizontal:16,borderRadius:20,borderCurve:'continuous',backgroundColor:'rgba(255,255,255,0.05)',overflow:'hidden'},
  separador:{height:StyleSheet.hairlineWidth,backgroundColor:'rgba(255,255,255,0.1)',marginLeft:16},
  cabecalho:{fontSize:13,fontWeight:'600',color:colors.textTertiary,textTransform:'uppercase',letterSpacing:0.3},
  rodape:{fontSize:13,color:colors.textSecondary,lineHeight:18,paddingHorizontal:20,paddingTop:7},
  linha:{flexDirection:'row',alignItems:'center',gap:12,minHeight:50,paddingHorizontal:16,paddingVertical:6},
  rotulo:{width:84,fontSize:16,color:colors.text},
  campo:{flex:1,fontSize:16,color:colors.text,padding:0},
  contador:{position:'absolute',right:14,bottom:8,fontSize:12,color:colors.textTertiary},
  nome:{fontSize:16,color:colors.text},
  sub:{fontSize:13,color:colors.textSecondary},
  valor:{fontSize:16,color:colors.textSecondary},
  circulo:{width:22,height:22,borderRadius:11,alignItems:'center',justifyContent:'center'},
  numero:{width:22,height:22,borderRadius:11,backgroundColor:colors.text,alignItems:'center',justifyContent:'center'},
  chipDaCapa:{position:'absolute',right:10,bottom:10,flexDirection:'row',alignItems:'center',gap:6,height:32,paddingHorizontal:12,borderRadius:16,backgroundColor:'rgba(10,10,15,0.62)'},
  // Sobreposta ao fundo da capa, com um anel da cor da folha.
  foto:{marginTop:-56,marginLeft:18,width:104,height:104,borderRadius:52,padding:4,backgroundColor:colors.surfaceHigh},
  cameraDaFoto:{position:'absolute',right:0,bottom:4,width:30,height:30,borderRadius:15,backgroundColor:'#fff',alignItems:'center',justifyContent:'center',borderWidth:3,borderColor:colors.surfaceHigh},
  zoom:{minWidth:44,minHeight:36,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:colors.surfaceHigh},
});
