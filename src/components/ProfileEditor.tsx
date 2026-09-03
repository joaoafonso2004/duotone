import React,{useState} from 'react';
import { Image,Platform,ScrollView,Text,TextInput,View,useWindowDimensions } from 'react-native';
import * as Crypto from 'expo-crypto';
import { appearanceOf,saveProfileEdits,type SocialProfile,type ProfileHighlights } from '../api/profiles';
import { pickProfileImage,prepareProfileImage,type SelectedProfileImage } from '../lib/profileImage';
import { RACIO_DA_CAPA,RACIO_DO_AVATAR } from '../lib/profileImageCrop';
import { mediaBucket,removeProfileMedia,useProfileMedia,type ProfileMediaKind } from '../lib/profileMedia';
import { supabase } from '../lib/supabase';
import { FriendAvatar } from './FriendAvatar';
import { ProfileCropPreview } from './ProfileCropPreview';
import { useSocial } from '../state/social';
import { SocialButton,SocialModal,socialStyles as s } from './socialUI';
import type { Playlist } from '../types';
import { ProfileHighlightsEditor } from './ProfileHighlightsEditor';
import { spacing } from '../theme';
import { colors,radii } from './socialTokens';

/**
 * Editar o perfil: as duas imagens, o nome e a bio.
 *
 * **O recorte escolhe-se a arrastar, e o que se vê é o que fica.** Havia
 * quatro botões de setas para a fotografia e um "↑ Up / ↓ Down" com uma
 * percentagem para a capa — ninguém pensa na sua fotografia em percentagens.
 * As molduras mostram o rácio do ficheiro gravado. No perfil, a capa conserva
 * esse enquadramento e o fundo desfocado preenche o espaço restante.
 *
 * Saíram daqui a cor de destaque e os avatares de emoji. Avatares de emoji
 * antigos continuam a aparecer — o `FriendAvatar` sabe lê-los —, só deixou de
 * se poder escolher um novo.
 */
export function ProfileEditor({profile,highlights,playlists,onClose,onSaved}:{profile:SocialProfile;highlights:ProfileHighlights|null;playlists:Playlist[];onClose:()=>void;onSaved:()=>void}) {
  const {width}=useWindowDimensions();
  const wide=Platform.OS==='web'&&width>=850;
  const [featured,setFeatured]=useState(highlights);
  const [value,setValue]=useState(()=>appearanceOf(profile));
  const [name,setName]=useState(profile.profile.name);
  const username=profile.profile.username || '';
  const [avatar,setAvatar]=useState<SelectedProfileImage|null>(null);
  const [cover,setCover]=useState<SelectedProfileImage|null>(null);
  const [adjustingImage,setAdjustingImage]=useState(false);
  // O ponto focal de cada imagem enquanto se escolhe. Nao vai para a base de
  // dados: fica assado no ficheiro no momento do envio.
  const [avatarX,setAvatarX]=useState(0.5),[avatarY,setAvatarY]=useState(0.5);
  const [coverX,setCoverX]=useState(0.5),[coverY,setCoverY]=useState(0.5);
  const [stage,setStage]=useState(''),[error,setError]=useState('');
  const coverUrl=useProfileMedia(value.cover_path ? `storage:${value.cover_path}` : null,'cover');
  const avatarUrl=value.avatar_path ? `storage:${value.avatar_path}` : value.legacy_avatar_url || `emoji:${value.emoji}:${value.gradient_index}`;

  const select=async(kind:ProfileMediaKind)=>{
    try {
      setError('');
      const image=await pickProfileImage();
      if(!image)return;
      if(kind==='avatar'){setAvatar(image);setAvatarX(0.5);setAvatarY(0.5);}
      else {setCover(image);setCoverX(0.5);setCoverY(0.5);}
    }
    catch(e:any){setError(e.message || 'Could not open that image.');}
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
        );
        const path=`${profile.profile.id}/${kind}/${Crypto.randomUUID()}.jpg`;
        setStage(kind==='avatar'?'Uploading photo…':'Uploading cover…');
        const {error:failure}=await supabase.storage.from(mediaBucket(kind)).upload(path,bytes,{contentType:'image/jpeg',upsert:false});
        if(failure)throw failure;
        uploaded.push({kind,path});
        if(kind==='avatar'){next.avatar_path=path;next.legacy_avatar_url=null;}else {next.cover_path=path;next.cover_position=0.5;}
      }
      setStage('Saving profile…');
      saving=true;
      // Não substituir destaques desconhecidos por uma lista vazia. A RPC
      // anterior altera só a aparência e conserva os destaques no servidor.
      await saveProfileEdits(next,name,username,featured);
      useSocial.setState(s=>({profileVersion:s.profileVersion+1}));
      const previous=appearanceOf(profile);
      // Só remover ficheiros antigos depois da referência nova estar confirmada.
      for(const kind of ['avatar','cover'] as const){
        const old=kind==='avatar'?previous.avatar_path:previous.cover_path;
        const current=kind==='avatar'?next.avatar_path:next.cover_path;
        if(old && old!==current) void removeProfileMedia(kind,[old]).catch(e=>console.warn('Limpeza de imagem antiga:',e));
      }
      onSaved();onClose();
    } catch(e:any){
      // Uma resposta perdida pode esconder uma gravação concluída; conservar
      // os uploads nesse caso evita apagar a imagem que o perfil já referencia.
      if(!saving)for(const file of uploaded) await removeProfileMedia(file.kind,[file.path]).catch(()=>{});
      setError(e.message || 'Could not save. You can try again.');
    } finally {setStage('');}
  };

  return <SocialModal visible wide title="Edit profile" onClose={()=>{if(!stage)onClose();}}>
    <ScrollView style={{flexShrink:1}} scrollEnabled={!adjustingImage} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:24}}>
      <View style={{flexDirection:wide?'row':'column',gap:32}}>
      <View style={{flex:wide?1:undefined,minWidth:0,gap:16}}>

      <Text style={s.label}>Cover image</Text>
      {/* A moldura preserva o formato do ficheiro; a vinheta só aparece no perfil. */}
      <View style={{borderRadius:radii.lg,overflow:'hidden'}}>
        {cover
          ? <ProfileCropPreview image={cover} ratio={RACIO_DA_CAPA} x={coverX} y={coverY}
              onDraggingChange={setAdjustingImage}
              onChange={(x,y)=>{setCoverX(x);setCoverY(y);}}/>
          : <View style={{width:'100%',aspectRatio:RACIO_DA_CAPA,backgroundColor:colors.surfaceHigh,alignItems:'center',justifyContent:'center'}}>
              {coverUrl
                ? <Image source={{uri:coverUrl}} style={{width:'100%',height:'100%'}} resizeMode="cover"/>
                : <Text style={s.muted}>No cover yet</Text>}
            </View>}
      </View>
      <View style={[s.row,{flexWrap:'wrap'}]}>
        <SocialButton disabled={!!stage} onPress={()=>void select('cover')}>{cover||value.cover_path?'Change cover':'Upload cover'}</SocialButton>
        {(cover||value.cover_path)&&<SocialButton quiet disabled={!!stage} onPress={()=>{setCover(null);setValue({...value,cover_path:null});}}>Remove cover</SocialButton>}
      </View>

      <Text style={s.label}>Photo</Text>
      <View style={[s.row,{gap:spacing.lg}]}>
        {/* Redonda, porque e assim que ela aparece em todo o lado. Ajustar
            dentro de um quadrado e depois ve-la cortada num circulo era outra
            maneira de o que se ve nao ser o que fica. */}
        <View style={{width:110,borderRadius:55,overflow:'hidden'}}>
          {avatar
            ? <ProfileCropPreview image={avatar} ratio={RACIO_DO_AVATAR} x={avatarX} y={avatarY}
                onDraggingChange={setAdjustingImage}
                onChange={(x,y)=>{setAvatarX(x);setAvatarY(y);}}/>
            : <FriendAvatar avatarUrl={avatarUrl} name={name} size={110}/>}
        </View>
        <View style={{flex:1,gap:spacing.sm}}>
          <SocialButton disabled={!!stage} onPress={()=>void select('avatar')}>{avatar||value.avatar_path?'Change photo':'Upload photo'}</SocialButton>
          {(avatar||value.avatar_path)&&<SocialButton quiet disabled={!!stage} onPress={()=>{setAvatar(null);setValue({...value,avatar_path:null,legacy_avatar_url:null});}}>Remove photo</SocialButton>}
        </View>
      </View>

      </View>
      <View style={{flex:wide?1:undefined,minWidth:0,gap:12}}>
      <Text style={s.label}>Name</Text><TextInput accessibilityLabel="Display name" editable={!stage} value={name} onChangeText={setName} maxLength={40} style={s.input}/>
      {/* O username identifica a conta, como o email: e por ele que os amigos
          te encontram e e com ele que se faz login. Deixar mudar partia as duas
          coisas para quem ja te tinha. Mostra-se, nao se edita -- e o servidor
          tambem o recusa, para nao depender so deste ecra. */}
      <Text style={s.label}>Username</Text>
      <View style={[s.input,{justifyContent:'center',opacity:0.6}]}><Text style={s.text}>@{username}</Text></View>
      <Text style={s.muted}>Your username identifies your account and cannot be changed.</Text>
      <Text style={s.label}>About you</Text><TextInput accessibilityLabel="Bio" editable={!stage} value={value.bio} onChangeText={bio=>setValue({...value,bio})} maxLength={180} multiline placeholder="A line about you or your music." placeholderTextColor={colors.textSecondary} style={[s.input,{minHeight:80}]}/>
      {featured?<ProfileHighlightsEditor value={featured} onChange={setFeatured} playlists={playlists} disabled={!!stage}/>:<Text style={s.muted}>Highlights could not load. You can still edit your photo, cover and details.</Text>}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      </View></View>
    </ScrollView>
    <View style={[s.row,{padding:16,borderTopWidth:1,borderColor:colors.border,justifyContent:'flex-end'}]}><SocialButton quiet disabled={!!stage} onPress={onClose}>Cancel</SocialButton><SocialButton primary disabled={!!stage||name.trim().length<2} onPress={()=>void save()}>{stage || 'Save changes'}</SocialButton></View>
  </SocialModal>;
}
