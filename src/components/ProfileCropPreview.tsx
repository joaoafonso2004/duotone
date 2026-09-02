import React, { useState } from 'react';
import { Image, View } from 'react-native';
import type { SelectedProfileImage } from '../lib/profileImage';
import { imageCrop } from '../lib/profileImageCrop';

/** Mostra exatamente o recorte que será enviado, incluindo o ponto focal. */
export function ProfileCropPreview({ image, ratio, x=0.5, y=0.5 }: {image:SelectedProfileImage;ratio:number;x?:number;y?:number}) {
  const [width,setWidth]=useState(0);
  const crop=imageCrop(image.width,image.height,ratio,x,y);
  const scale=width/crop.width;
  return <View onLayout={e=>setWidth(e.nativeEvent.layout.width)} style={{width:'100%',aspectRatio:ratio,overflow:'hidden'}}>
    {width>0&&<Image source={{uri:image.uri}} resizeMode="stretch" style={{position:'absolute',width:image.width*scale,height:image.height*scale,left:-crop.originX*scale,top:-crop.originY*scale}}/>}
  </View>;
}
