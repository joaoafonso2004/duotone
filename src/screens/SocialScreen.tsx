import React, { useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { Screen, useCabecalhoQueEncolhe } from '../components/Screen';
import { SocialHub } from '../components/SocialHub';
import { SocialIconButton } from '../components/socialUI';
import { useDestinos } from '../navigation/destinos';

export function SocialScreen() {
  const { irPara } = useDestinos();
  const focused=useIsFocused();
  const [novaConversa,setNovaConversa]=useState(false);
  // O título encolhe ao rolar a lista das conversas (3/10).
  const cab=useCabecalhoQueEncolhe();
  // O "voltar" e para o Perfil, que e de onde se vem -- a arrastar ou pelo
  // botao das mensagens. Uma seccao nao tem pilha para onde regressar. Uma
  // conversa, um perfil ou uma playlist abrem por cima, na pilha do Social
  // (o `irPara` do SocialHub, lib/destinos.ts).
  return <Screen title="Social" right={<SocialIconButton label="Start a conversation" icon="person-add-outline" onPress={()=>setNovaConversa(true)}/>}
    onBack={()=>irPara({tipo:'perfil'})} encolhe={cab}>
    <SocialHub cabecalho={cab} novaConversa={{aberta:novaConversa,definir:setNovaConversa}} visible={focused}/>
  </Screen>;
}
