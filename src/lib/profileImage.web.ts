import type { ProfileMediaKind } from './profileMedia';
import { imageCrop } from './profileImageCrop';

export interface SelectedProfileImage { uri:string; width:number; height:number }
export async function pickProfileImage():Promise<SelectedProfileImage|null> {
  const file=await new Promise<File|null>((resolve)=>{
    const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp,image/heic,image/heif';
    input.onchange=()=>resolve(input.files?.[0] ?? null); input.oncancel=()=>resolve(null); input.click();
  });
  if(!file) return null;
  if(file.size>15*1024*1024) throw new Error('Escolhe uma imagem até 15 MB.');
  if(!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) throw new Error('Escolhe uma fotografia JPEG, PNG ou WebP.');
  const uri=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Não foi possível ler a imagem.'));reader.readAsDataURL(file);});
  const img=await loadImage(uri);
  if(img.naturalWidth*img.naturalHeight>50000000)throw new Error('Escolhe uma fotografia até 50 megapíxeis.');
  return {uri,width:img.naturalWidth,height:img.naturalHeight};
}
function loadImage(uri:string):Promise<HTMLImageElement> {
  return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Formato não suportado neste computador. Converte a imagem para JPEG ou PNG.'));image.src=uri;});
}
export async function prepareProfileImage(image:SelectedProfileImage,kind:ProfileMediaKind,y=0.5,x=0.5):Promise<ArrayBuffer> {
  const img=await loadImage(image.uri);
  const crop=imageCrop(image.width,image.height,kind==='avatar'?1:8/3,x,y);
  const canvas=document.createElement('canvas');canvas.width=kind==='avatar'?512:1600;canvas.height=kind==='avatar'?512:600;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Não foi possível preparar a imagem.');
  ctx.fillStyle='#191920';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img,crop.originX,crop.originY,crop.width,crop.height,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Imagem inválida.')),'image/jpeg',0.85));
  if(blob.size>2097152)throw new Error('A imagem continua demasiado grande. Escolhe uma imagem mais pequena.');
  return blob.arrayBuffer();
}
