import React from 'react';
import {Image,Text,View} from 'react-native';
import {GlitchArtwork} from './src/desktop/glitch/GlitchArtwork.web';
/* Duas capas feitas aqui: mesma origem, logo sem CORS a estorvar a medicao. */
function pintar(largura:number,altura:number,barras:'nenhumas'|'cima-baixo'){
 const c=document.createElement('canvas');c.width=largura;c.height=altura;
 const g=c.getContext('2d')!;g.fillStyle='#000';g.fillRect(0,0,largura,altura);
 const alturaUtil=barras==='nenhumas'?altura:Math.round(altura*0.62);
 const topo=Math.round((altura-alturaUtil)/2);
 const grad=g.createLinearGradient(0,topo,largura,topo+alturaUtil);
 grad.addColorStop(0,'#ff4e45');grad.addColorStop(0.5,'#8b5cf6');grad.addColorStop(1,'#1db954');
 g.fillStyle=grad;g.fillRect(0,topo,largura,alturaUtil);
 g.fillStyle='#fff';
 for(let i=0;i<26;i++)g.fillRect(6+i*(largura/27),topo+6+((i*17)%Math.max(1,alturaUtil-30)),4,20);
 g.fillStyle='#0b0b12';g.font='bold 20px sans-serif';g.fillText('CAPA',12,topo+alturaUtil-12);
 return c.toDataURL('image/png');
}
const capa169=pintar(640,360,'nenhumas');
const capaBarras=pintar(640,360,'cima-baixo');
const lado=220;
const casos:[string,string,'off'|'reactive'][]=[
 ['16:9 · sem canvas (o que se ve a arrastar)',capa169,'off'],
 ['16:9 · com canvas (assente)',capa169,'reactive'],
 ['barras embutidas · sem canvas',capaBarras,'off'],
 ['barras embutidas · com canvas',capaBarras,'reactive'],
];
export default function App(){
 return <View style={{backgroundColor:'#0a0a0f',padding:20,gap:16,minHeight:'100vh' as any}}>
  <Text style={{color:'#fff',fontSize:18,fontWeight:'700'}}>Enquadramento da capa: com e sem canvas</Text>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:16}}>
   {casos.map(([nome,uri,modo])=><View key={nome} style={{gap:8}}>
    <GlitchArtwork uri={uri} lado={lado} modo={modo} intensidade="normal"/>
    <Text style={{color:'#9c9cab',fontSize:12,width:lado}}>{nome}</Text>
   </View>)}
   {/* O caminho ANTIGO sem canvas, tal e qual: <Image source style={moldura}>. */}
   {[['16:9 · ANTES',capa169],['barras embutidas · ANTES',capaBarras]].map(([nome,uri])=><View key={nome} style={{gap:8}}>
    <Image source={{uri}} style={{width:lado,height:lado,borderRadius:14,overflow:'hidden',backgroundColor:'#14141A'}}/>
    <Text style={{color:'#ff8f88',fontSize:12,width:lado}}>{nome}</Text>
   </View>)}
  </View>
 </View>;
}
