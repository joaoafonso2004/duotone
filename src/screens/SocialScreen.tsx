import React, { useState } from 'react';
import { View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Screen, useCabecalhoQueEncolhe } from '../components/Screen';
import { SocialHub } from '../components/SocialHub';
import { SocialIconButton } from '../components/socialUI';
import { useDestinos } from '../navigation/destinos';

export function SocialScreen() {
  const { irPara } = useDestinos();
  const focused=useIsFocused();
  const [novaConversa,setNovaConversa]=useState(false);
  const [procurar,setProcurar]=useState(false);
  // O título encolhe ao rolar a lista das conversas (3/10).
  const cab=useCabecalhoQueEncolhe();
  // O "voltar" e para o Perfil, que e de onde se vem -- a arrastar ou pelo
  // botao das mensagens. Uma seccao nao tem pilha para onde regressar. Uma
  // conversa, um perfil ou uma playlist abrem por cima, na pilha do Social
  // (o `irPara` do SocialHub, lib/destinos.ts).
  // A lupa e o lápis (9/10, docs/PLANO-SOCIAL-IOS.md): pesquisar as conversas,
  // e começar uma conversa nova -- é lá dentro que se adiciona um amigo.
  return <Screen title="Social" right={<View style={{flexDirection:'row',gap:4}}>
      <SocialIconButton label={procurar?'Close search':'Search friends and groups'} icon={procurar?'close':'search'} onPress={()=>setProcurar(p=>!p)}/>
      <SocialIconButton label="New chat" icon="create-outline" onPress={()=>setNovaConversa(true)}/>
    </View>}
    onBack={()=>irPara({tipo:'perfil'})} encolhe={cab}>
    <SocialHub cabecalho={cab} novaConversa={{aberta:novaConversa,definir:setNovaConversa}} procurar={procurar} visible={focused}/>
  </Screen>;
}
