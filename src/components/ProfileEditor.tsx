import React,{useState} from 'react';
import { Image,Pressable,ScrollView,Text,TextInput,View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { appearanceOf,saveProfileAppearance,type SocialProfile } from '../api/profiles';
import { AVATAR_EMOJIS,AVATAR_GRADIENTS } from '../lib/avatarPrefs';
import { pickProfileImage,prepareProfileImage,type SelectedProfileImage } from '../lib/profileImage';
import { mediaBucket,removeProfileMedia,useProfileMedia,type ProfileMediaKind } from '../lib/profileMedia';
import { supabase } from '../lib/supabase';
import { FriendAvatar } from './FriendAvatar';
import { ProfileCropPreview } from './ProfileCropPreview';
import { useSocial } from '../state/social';
import { SocialButton,SocialModal,socialStyles as s } from './socialUI';
import { colors } from '../theme';

/**
 * As cores que se podem escolher para o perfil.
 *
 * Sao DADOS e nao cromagem da app: nao vao para os tokens porque nao descrevem
 * um papel ("texto", "fundo"), sao opcoes que a pessoa escolhe. Ficam com
 * nome para nao andarem soltas pelo meio do JSX.
 */
const PALETA_DE_DESTAQUE = [
  colors.accent, colors.accentAlt,
  '#A78BFA', '#60A5FA', '#34D399', '#FBBF24',
] as const;

export function ProfileEditor({profile,onClose,onSaved}:{profile:SocialProfile;onClose:()=>void;onSaved:()=>void}) {
  const [value,setValue]=useState(()=>appearanceOf(profile));
  const [name,setName]=useState(profile.profile.name);
  const [username,setUsername]=useState(profile.profile.username || '');
  const [avatar,setAvatar]=useState<SelectedProfileImage|null>(null);
  const [cover,setCover]=useState<SelectedProfileImage|null>(null);
  const [avatarX,setAvatarX]=useState(0.5),[avatarY,setAvatarY]=useState(0.5);
  const [stage,setStage]=useState(''),[error,setError]=useState('');
  const coverUrl=useProfileMedia(value.cover_path ? `storage:${value.cover_path}` : null,'cover');
  const avatarUrl=value.avatar_path ? `storage:${value.avatar_path}` : value.legacy_avatar_url || `emoji:${value.emoji}:${value.gradient_index}`;
  const select=async(kind:ProfileMediaKind)=>{
    try { setError('');const image=await pickProfileImage();if(!image)return;if(kind==='avatar'){setAvatar(image);setAvatarX(0.5);setAvatarY(0.5);}else setCover(image); }
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
        const bytes=await prepareProfileImage(image,kind,kind==='avatar'?avatarY:value.cover_position,kind==='avatar'?avatarX:0.5);
        const path=`${profile.profile.id}/${kind}/${Crypto.randomUUID()}.jpg`;
        setStage(kind==='avatar'?'Uploading photo…':'Uploading cover…');
        const {error:failure}=await supabase.storage.from(mediaBucket(kind)).upload(path,bytes,{contentType:'image/jpeg',upsert:false});
        if(failure)throw failure;
        uploaded.push({kind,path});
        if(kind==='avatar'){next.avatar_path=path;next.legacy_avatar_url=null;}else {next.cover_path=path;next.cover_position=0.5;}
      }
      setStage('Saving profile…');
      saving=true;
      await saveProfileAppearance(next,name,username);
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
  return <SocialModal visible title="Edit profile" onClose={()=>{if(!stage)onClose();}}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,gap:20}}>
      <View style={{aspectRatio:8/3,borderRadius:18,overflow:'hidden',backgroundColor:value.accent+'33'}}>
        {cover ? <ProfileCropPreview image={cover} ratio={8/3} y={value.cover_position}/> : coverUrl ? <Image source={{uri:coverUrl}} style={{width:'100%',height:'100%'}} resizeMode="cover"/> : null}
        <View style={[s.row,{position:'absolute',bottom:12,left:12,right:12,backgroundColor:colors.overlay,borderRadius:14,padding:10}]}>
          {avatar ? <View style={{width:58,borderRadius:29,overflow:'hidden'}}><ProfileCropPreview image={avatar} ratio={1} x={avatarX} y={avatarY}/></View> : <FriendAvatar avatarUrl={avatarUrl} name={name} size={58}/>}
          <View style={{flex:1}}><Text style={[s.title,{fontSize:21}]}>{name || 'Your name'}</Text><Text style={s.muted}>@{profile.profile.username}</Text></View>
        </View>
      </View>
      <Text style={s.label}>Photo</Text>
      <View style={[s.row,{flexWrap:'wrap'}]}><SocialButton disabled={!!stage} onPress={()=>void select('avatar')}>Upload photo</SocialButton><SocialButton quiet disabled={!!stage} onPress={()=>{setAvatar(null);setValue({...value,avatar_path:null,legacy_avatar_url:null});}}>Use an emoji</SocialButton></View>
      {avatar && <View style={[s.row,{flexWrap:'wrap'}]}><Text style={s.muted}>Adjust crop</Text><SocialButton disabled={!!stage} onPress={()=>setAvatarX(Math.max(0,avatarX-0.1))}>←</SocialButton><SocialButton disabled={!!stage} onPress={()=>setAvatarX(Math.min(1,avatarX+0.1))}>→</SocialButton><SocialButton disabled={!!stage} onPress={()=>setAvatarY(Math.max(0,avatarY-0.1))}>↑</SocialButton><SocialButton disabled={!!stage} onPress={()=>setAvatarY(Math.min(1,avatarY+0.1))}>↓</SocialButton></View>}
      {!avatar && !value.avatar_path && !value.legacy_avatar_url && <><View style={[s.row,{flexWrap:'wrap'}]}>{AVATAR_EMOJIS.map(emoji=><SocialButton disabled={!!stage} key={emoji} onPress={()=>setValue({...value,emoji})}>{emoji}</SocialButton>)}</View><View style={[s.row,{flexWrap:'wrap'}]}>{AVATAR_GRADIENTS.map((_,i)=><Pressable disabled={!!stage} accessibilityRole="button" accessibilityLabel={`Gradient ${i+1}`} accessibilityState={{selected:value.gradient_index===i}} key={i} onPress={()=>setValue({...value,gradient_index:i})} style={{padding:3,borderWidth:2,borderRadius:26,borderColor:value.gradient_index===i?colors.text:'transparent'}}><FriendAvatar avatarUrl={`emoji:${value.emoji}:${i}`} name={name} size={34}/></Pressable>)}</View></>}
      <Text style={s.label}>Cover image</Text>
      <View style={[s.row,{flexWrap:'wrap'}]}><SocialButton disabled={!!stage} onPress={()=>void select('cover')}>Upload cover</SocialButton><SocialButton quiet disabled={!!stage} onPress={()=>{setCover(null);setValue({...value,cover_path:null});}}>Remove cover</SocialButton></View>
      {cover && <View style={s.row}><SocialButton disabled={!!stage} onPress={()=>setValue({...value,cover_position:Math.max(0,value.cover_position-0.1)})}>↑ Up</SocialButton><SocialButton disabled={!!stage} onPress={()=>setValue({...value,cover_position:Math.min(1,value.cover_position+0.1)})}>↓ Down</SocialButton><Text style={s.muted}>{Math.round(value.cover_position*100)}%</Text></View>}
      <Text style={s.label}>Name</Text><TextInput accessibilityLabel="Display name" editable={!stage} value={name} onChangeText={setName} maxLength={40} style={s.input}/>
      <Text style={s.label}>Username</Text><TextInput accessibilityLabel="Username" autoComplete="off" textContentType="none" editable={!stage} autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername} maxLength={30} style={s.input}/>
      <Text style={s.label}>About you</Text><TextInput accessibilityLabel="Bio" editable={!stage} value={value.bio} onChangeText={bio=>setValue({...value,bio})} maxLength={180} multiline placeholder="A line about you or your music." placeholderTextColor={colors.textSecondary} style={[s.input,{minHeight:80}]}/>
      <Text style={s.label}>Accent colour</Text><View style={[s.row,{flexWrap:'wrap'}]}>{PALETA_DE_DESTAQUE.map(accent=><SocialButton key={accent} onPress={()=>setValue({...value,accent})}><Text style={{color:accent}}>● {value.accent===accent?'✓':''}</Text></SocialButton>)}</View>
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    </ScrollView>
    <View style={[s.row,{padding:16,borderTopWidth:1,borderColor:colors.border,justifyContent:'flex-end'}]}><SocialButton quiet disabled={!!stage} onPress={onClose}>Cancel</SocialButton><SocialButton disabled={!!stage||name.trim().length<2} onPress={()=>void save()}>{stage || 'Save changes'}</SocialButton></View>
  </SocialModal>;
}
