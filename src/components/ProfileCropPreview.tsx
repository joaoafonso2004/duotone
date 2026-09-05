import React, { useEffect, useRef, useState } from 'react';
import { Image, PanResponder, Platform, Text, View } from 'react-native';
import type { SelectedProfileImage } from '../lib/profileImage';
import { arrastarFoco, imageCrop, ZOOM_MINIMO } from '../lib/profileImageCrop';
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
 *
 * **Dois dedos aproximam.** Sem zoom havia sempre um eixo sem folga nenhuma:
 * numa foto vertical o recorte máximo come a largura toda e só sobra ajuste
 * vertical. Não era o arrasto que estava mal — era não haver para onde ir.
 * Aproximar encolhe o recorte, e é isso que abre espaço para andar também
 * para os lados. No PC, onde não há dois dedos, quem faz o mesmo é o controlo
 * de `−`/`+` do editor.
 */
export function ProfileCropPreview({ image, ratio, x=0.5, y=0.5, zoom=1, zoomMaximo=1, vista, onChange, onZoomChange, onDraggingChange }: {
  image:SelectedProfileImage;
  ratio:number;
  x?:number;
  y?:number;
  /** 1 é o recorte de área máxima. Ver `lib/profileImageCrop`. */
  zoom?:number;
  /** O teto desta imagem, que depende da resolução dela. */
  zoomMaximo?:number;
  /** O que desenhar em vez da imagem nua. Não recebe toques: o gesto é daqui. */
  vista?:React.ReactNode;
  /** Recebe o ponto focal novo enquanto se arrasta. */
  onChange?:(x:number,y:number)=>void;
  /** Recebe o zoom novo enquanto se aproximam ou afastam dois dedos. */
  onZoomChange?:(zoom:number)=>void;
  /** Suspende o scroll do editor até terminar ou cancelar o gesto. */
  onDraggingChange?:(dragging:boolean)=>void;
}) {
  const [width,setWidth]=useState(0);
  const crop=imageCrop(image.width,image.height,ratio,x,y,zoom);
  const scale=width>0?width/crop.width:0;

  // Quanto espaco ha para andar em cada eixo, em pixeis da imagem original.
  // Com o zoom em 1 ha SEMPRE um eixo a zero, e e por isso que aproximar e o
  // que destrava o movimento lateral.
  const livreX=image.width-crop.width;
  const livreY=image.height-crop.height;
  const podeAproximar=!!onZoomChange&&zoomMaximo>ZOOM_MINIMO+0.001;
  const podeArrastar=!!onChange&&(livreX>0||livreY>0);
  const podeMexer=podeArrastar||podeAproximar;

  // O gesto e criado UMA vez, mas precisa dos valores mais recentes. Le-os
  // daqui em vez de os fechar dentro dele, senao ficava preso aos do primeiro
  // render e o arrasto saltava para o sitio errado.
  const inicio=useRef({x,y,zoom,distancia:0,dedos:0,dx:0,dy:0});
  const vivo=useRef({x,y,zoom,zoomMaximo,scale,livreX,livreY,onChange,onZoomChange,onDraggingChange});
  vivo.current={x,y,zoom,zoomMaximo,scale,livreX,livreY,onChange,onZoomChange,onDraggingChange};
  const aArrastar=useRef(false);
  const terminar=()=>{
    if(!aArrastar.current)return;
    aArrastar.current=false;
    vivo.current.onDraggingChange?.(false);
  };
  useEffect(()=>terminar,[]);

  /** Entre os dois dedos, em pixeis do ecra. */
  const distanciaEntre=(toques:readonly any[])=>{
    const a=toques[0],b=toques[1];
    return Math.hypot((a?.pageX??0)-(b?.pageX??0),(a?.pageY??0)-(b?.pageY??0));
  };

  /**
   * Recomeca a contar a partir do estado ATUAL.
   *
   * Chamado sempre que o numero de dedos muda. Sem isto, pousar o segundo dedo
   * -- ou levantar um deles a meio -- fazia a imagem dar um salto: o `dx` do
   * PanResponder conta desde o primeiro toque e nunca se repoe, e a distancia
   * entre dedos ainda era a de outro instante. Guarda-se tambem o `dx`/`dy` do
   * momento, para o arrasto passar a medir-se a partir daqui.
   */
  const recomecar=(toques:readonly any[],dx:number,dy:number)=>{
    const v=vivo.current;
    inicio.current={
      x:v.x,y:v.y,zoom:v.zoom,dedos:toques.length,
      distancia:toques.length>=2?distanciaEntre(toques):0,
      dx,dy,
    };
  };

  const gesto=useRef(PanResponder.create({
    onStartShouldSetPanResponder:()=>true,
    onStartShouldSetPanResponderCapture:()=>true,
    onMoveShouldSetPanResponder:(_e,g)=>Math.abs(g.dx)>2||Math.abs(g.dy)>2,
    onPanResponderGrant:(e,g)=>{
      recomecar(e?.nativeEvent?.touches??[],g?.dx??0,g?.dy??0);
      aArrastar.current=true;
      vivo.current.onDraggingChange?.(true);
    },
    // O ScrollView tentava tomar conta do gesto vertical já iniciado na foto.
    onPanResponderTerminationRequest:()=>false,
    onShouldBlockNativeResponder:()=>true,
    onPanResponderRelease:terminar,
    onPanResponderTerminate:terminar,
    onPanResponderMove:(e,g)=>{
      const v=vivo.current;
      const toques=e?.nativeEvent?.touches??[];
      if(toques.length!==inicio.current.dedos){ recomecar(toques,g.dx,g.dy); return; }

      // DOIS DEDOS APROXIMAM, e mais nada. Mexer no foco ao mesmo tempo que no
      // zoom faz a imagem fugir debaixo dos dedos; separados, cada gesto faz
      // uma coisa so e acerta-se num instante.
      if(toques.length>=2&&v.onZoomChange&&inicio.current.distancia>0){
        const agora=distanciaEntre(toques);
        const bruto=inicio.current.zoom*(agora/inicio.current.distancia);
        v.onZoomChange(Math.max(ZOOM_MINIMO,Math.min(v.zoomMaximo,bruto)));
        return;
      }

      if(!v.onChange) return;
      v.onChange(
        arrastarFoco(inicio.current.x,g.dx-inicio.current.dx,v.scale,v.livreX),
        arrastarFoco(inicio.current.y,g.dy-inicio.current.dy,v.scale,v.livreY),
      );
    },
  })).current;

  return <View
    onLayout={e=>setWidth(e.nativeEvent.layout.width)}
    {...(podeMexer?gesto.panHandlers:{})}
    accessibilityHint={podeMexer?(podeAproximar?'Drag to choose what shows, pinch to zoom':'Drag to choose what shows'):undefined}
    style={{width:'100%',overflow:'hidden',backgroundColor:colors.surfaceHigh,
      ...(vista?{}:{aspectRatio:ratio}),
      ...(Platform.OS==='web'&&podeMexer?{touchAction:'none',userSelect:'none'} as const:{})}}>
    {vista
      ? <View pointerEvents="none">{vista}</View>
      : width>0&&<View pointerEvents="none"><Image
          source={{uri:image.uri}}
          resizeMode="stretch"
          style={{position:'absolute',width:image.width*scale,height:image.height*scale,left:-crop.originX*scale,top:-crop.originY*scale}}/></View>}
    {podeMexer&&<View pointerEvents="none" style={{position:'absolute',left:0,right:0,bottom:0,alignItems:'center',paddingVertical:6,backgroundColor:colors.overlay}}>
      <Text style={type.micro}>{podeAproximar?'DRAG TO ADJUST · PINCH TO ZOOM':'DRAG TO ADJUST'}</Text>
    </View>}
  </View>;
}
