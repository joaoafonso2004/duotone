import type { ProfileMediaKind } from './profileMedia';
import { imageCrop, LARGURA_DA_CAPA, RACIO_DA_CAPA, RACIO_DO_AVATAR } from './profileImageCrop';

export interface SelectedProfileImage { uri:string; width:number; height:number }
export async function pickProfileImage():Promise<SelectedProfileImage|null> {
  const file=await new Promise<File|null>((resolve)=>{
    const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp,image/heic,image/heif';
    input.onchange=()=>resolve(input.files?.[0] ?? null); input.oncancel=()=>resolve(null); input.click();
  });
  if(!file) return null;
  if(file.size>15*1024*1024) throw new Error('Pick an image up to 15 MB.');
  if(!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) throw new Error('Pick a JPEG, PNG or WebP photo.');
  const uri=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Could not read the image.'));reader.readAsDataURL(file);});
  const img=await loadImage(uri);
  if(img.naturalWidth*img.naturalHeight>50000000)throw new Error('Pick a photo up to 50 megapixels.');
  return {uri,width:img.naturalWidth,height:img.naturalHeight};
}
function loadImage(uri:string):Promise<HTMLImageElement> {
  return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Unsupported format on this computer. Convert the image to JPEG or PNG.'));image.src=uri;});
}
export async function prepareProfileImage(image:SelectedProfileImage,kind:ProfileMediaKind,y=0.5,x=0.5):Promise<ArrayBuffer> {
  const img=await loadImage(image.uri);
  const crop=imageCrop(image.width,image.height,kind==='avatar'?RACIO_DO_AVATAR:RACIO_DA_CAPA,x,y);
  const canvas=document.createElement('canvas');canvas.width=kind==='avatar'?512:LARGURA_DA_CAPA;canvas.height=kind==='avatar'?512:Math.round(LARGURA_DA_CAPA/RACIO_DA_CAPA);
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Could not prepare the image.');
  ctx.fillStyle='#191920';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img,crop.originX,crop.originY,crop.width,crop.height,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Invalid image.')),'image/jpeg',0.85));
  if(blob.size>2097152)throw new Error('The image is still too large. Pick a smaller one.');
  return blob.arrayBuffer();
}
