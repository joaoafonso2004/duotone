import * as Picker from 'expo-image-picker';
import * as Manipulator from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import type { ProfileMediaKind } from './profileMedia';
import { imageCrop } from './profileImageCrop';

export interface SelectedProfileImage { uri:string; width:number; height:number }
export async function pickProfileImage():Promise<SelectedProfileImage|null> {
  const result=await Picker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:false,quality:1});
  if(result.canceled) return null;
  const image=result.assets[0];
  if(image.mimeType&&!/^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(image.mimeType))throw new Error('Escolhe uma fotografia JPEG, PNG, WebP ou HEIC.');
  if((image.fileSize ?? 0)>15*1024*1024) throw new Error('Pick an image up to 15 MB.');
  if(image.width*image.height>50000000)throw new Error('Pick a photo up to 50 megapixels.');
  return {uri:image.uri,width:image.width,height:image.height};
}
export async function prepareProfileImage(image:SelectedProfileImage,kind:ProfileMediaKind,y=0.5,x=0.5):Promise<ArrayBuffer> {
  const crop=imageCrop(image.width,image.height,kind==='avatar'?1:8/3,x,y);
  const result=await Manipulator.manipulateAsync(image.uri,[{crop},{resize:{width:kind==='avatar'?512:1600}}],
    {compress:0.82,format:Manipulator.SaveFormat.JPEG});
  const file=new File(result.uri);
  try {
    const bytes=await file.arrayBuffer();
    if(bytes.byteLength>2097152) throw new Error('A imagem continua demasiado grande. Escolhe uma imagem mais pequena.');
    return bytes;
  } finally { if(file.exists) file.delete(); }
}
