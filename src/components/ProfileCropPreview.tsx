import React, { useEffect, useRef, useState } from 'react';
import { Image, PanResponder, Platform, Text, View } from 'react-native';
import type { SelectedProfileImage } from '../lib/profileImage';
import { arrastarFoco, imageCrop } from '../lib/profileImageCrop';
import { colors, type } from './socialTokens';

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
 *
 * Com `vista`, mostra ISSO em vez da imagem nua — é assim que a capa passa a
 * ser ajustada dentro do próprio cabeçalho do perfil, com a vinheta e o avatar
 * por cima. O gesto e as contas são os mesmos; muda só o que se desenha.
 */
export function ProfileCropPreview({ image, ratio, x=0.5, y=0.5, vista, onChange, onDraggingChange }: {
  image:SelectedProfileImage;
  ratio:number;
  x?:number;
  y?:number;
  /** O que desenhar em vez da imagem nua. Não recebe toques: o gesto é daqui. */
  vista?:React.ReactNode;
  /** Recebe o ponto focal novo enquanto se arrasta. */
  onChange?:(x:number,y:number)=>void;
  /** Suspende o scroll do editor até terminar ou cancelar o gesto. */
  onDraggingChange?:(dragging:boolean)=>void;
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
  const vivo=useRef({x,y,scale,livreX,livreY,onChange,onDraggingChange});
  vivo.current={x,y,scale,livreX,livreY,onChange,onDraggingChange};
  const aArrastar=useRef(false);
  const terminar=()=>{
    if(!aArrastar.current)return;
    aArrastar.current=false;
    vivo.current.onDraggingChange?.(false);
  };
  useEffect(()=>terminar,[]);

  const gesto=useRef(PanResponder.create({
    onStartShouldSetPanResponder:()=>true,
    onStartShouldSetPanResponderCapture:()=>true,
    onMoveShouldSetPanResponder:(_e,g)=>Math.abs(g.dx)>2||Math.abs(g.dy)>2,
    onPanResponderGrant:()=>{
      inicio.current={x:vivo.current.x,y:vivo.current.y};
      aArrastar.current=true;
      vivo.current.onDraggingChange?.(true);
    },
    // O ScrollView tentava tomar conta do gesto vertical já iniciado na foto.
    onPanResponderTerminationRequest:()=>false,
    onShouldBlockNativeResponder:()=>true,
    onPanResponderRelease:terminar,
    onPanResponderTerminate:terminar,
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
    style={{width:'100%',overflow:'hidden',backgroundColor:colors.surfaceHigh,
      ...(vista?{}:{aspectRatio:ratio}),
      ...(Platform.OS==='web'&&podeArrastar?{touchAction:'none',userSelect:'none'} as const:{})}}>
    {vista
      ? <View pointerEvents="none">{vista}</View>
      : width>0&&<View pointerEvents="none"><Image
          source={{uri:image.uri}}
          resizeMode="stretch"
          style={{position:'absolute',width:image.width*scale,height:image.height*scale,left:-crop.originX*scale,top:-crop.originY*scale}}/></View>}
    {podeArrastar&&<View pointerEvents="none" style={{position:'absolute',left:0,right:0,bottom:0,alignItems:'center',paddingVertical:6,backgroundColor:colors.overlay}}>
      <Text style={type.micro}>DRAG TO ADJUST</Text>
    </View>}
  </View>;
}
