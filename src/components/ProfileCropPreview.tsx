import React, { useRef, useState } from 'react';
import { Image, PanResponder, Text, View } from 'react-native';
import type { SelectedProfileImage } from '../lib/profileImage';
import { arrastarFoco, imageCrop } from '../lib/profileImageCrop';
import { colors, type } from '../theme';

/**
 * Mostra exatamente o recorte que vai ser gravado — e deixa arrastá-lo.
 *
 * **O que se vê aqui é o que fica.** A moldura tem o mesmo rácio com que a
 * imagem é gravada, por isso não há surpresa entre escolher e ver depois no
 * perfil.
 *
 * O ajuste era feito com quatro botões de setas que mexiam 10% de cada vez, e
 * um "↑ Up / ↓ Down" com uma percentagem ao lado. Ninguém pensa na sua
 * fotografia em percentagens: arrasta-se até ficar bem. Com `onChange` a
 * moldura passa a aceitar o arrasto; sem ele fica só a mostrar.
 */
export function ProfileCropPreview({ image, ratio, x=0.5, y=0.5, onChange }: {
  image:SelectedProfileImage;
  ratio:number;
  x?:number;
  y?:number;
  /** Recebe o ponto focal novo enquanto se arrasta. */
  onChange?:(x:number,y:number)=>void;
}) {
  const [width,setWidth]=useState(0);
  const crop=imageCrop(image.width,image.height,ratio,x,y);
  const scale=width>0?width/crop.width:0;

  // Quanto espaco ha para andar em cada eixo, em pixeis da imagem original.
  // Numa imagem que ja tem o racio certo isto e zero e nao ha nada a ajustar.
  const livreX=image.width-crop.width;
  const livreY=image.height-crop.height;
  const podeArrastar=!!onChange&&(livreX>0||livreY>0);

  // O gesto e criado UMA vez, mas precisa dos valores mais recentes. Le-os
  // daqui em vez de os fechar dentro dele, senao ficava preso aos do primeiro
  // render e o arrasto saltava para o sitio errado.
  const inicio=useRef({x,y});
  const vivo=useRef({x,y,scale,livreX,livreY,onChange});
  vivo.current={x,y,scale,livreX,livreY,onChange};

  const gesto=useRef(PanResponder.create({
    onStartShouldSetPanResponder:()=>true,
    onMoveShouldSetPanResponder:(_e,g)=>Math.abs(g.dx)>2||Math.abs(g.dy)>2,
    onPanResponderGrant:()=>{ inicio.current={x:vivo.current.x,y:vivo.current.y}; },
    onPanResponderMove:(_e,g)=>{
      const v=vivo.current;
      if(!v.onChange) return;
      v.onChange(
        arrastarFoco(inicio.current.x,g.dx,v.scale,v.livreX),
        arrastarFoco(inicio.current.y,g.dy,v.scale,v.livreY),
      );
    },
  })).current;

  return <View
    onLayout={e=>setWidth(e.nativeEvent.layout.width)}
    {...(podeArrastar?gesto.panHandlers:{})}
    accessibilityHint={podeArrastar?'Drag to choose what shows':undefined}
    style={{width:'100%',aspectRatio:ratio,overflow:'hidden',backgroundColor:colors.surfaceHigh}}>
    {width>0&&<Image
      source={{uri:image.uri}}
      resizeMode="stretch"
      style={{position:'absolute',width:image.width*scale,height:image.height*scale,left:-crop.originX*scale,top:-crop.originY*scale}}/>}
    {podeArrastar&&<View style={{position:'absolute',left:0,right:0,bottom:0,alignItems:'center',paddingVertical:6,backgroundColor:colors.overlay}}>
      <Text style={type.micro}>DRAG TO ADJUST</Text>
    </View>}
  </View>;
}
