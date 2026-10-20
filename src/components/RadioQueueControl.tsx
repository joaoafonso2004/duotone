import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePlayer, type TipoDeRadio } from '../state/player';
import { MenuDoRadio, type AncoraDoMenuDoRadio } from './MenuDoRadio';
import { useCapasDoMix } from '../hooks/useCapasDoMix';
import { ROTULO_LIGADO } from '../lib/menuDoRadio';
import { pedirFluidez } from '../state/fluidez';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useConnectivity } from '../state/connectivity';
import { useAuth } from '../state/auth';
import { useSeguirAmigo } from '../state/seguirAmigo';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { avisarInfo } from '../lib/avisoDeRemocao';
import { colors, spacing, type } from '../theme';

/** Quanto tempo o "Undo" fica ao lado da pastilha depois de ligar o Radio. */
export const UNDO_DO_RADIO_MS = 8000;

/**
 * O Radio na fila (5/10, variante A de `docs/radio-na-fila.html`): uma
 * pastilha transparente no cabeçalho do Up next, ao lado do "Clear". Era uma
 * caixa opaca com um interruptor por cima da fila, sem o vidro do resto do
 * ecrã. A lógica é a mesma nos dois lados; o PC desenha a sua com a letra
 * dele (`NowPlayingPage.web.tsx`), o iPhone usa a `RadioQueueControl`.
 *
 * Num Jam é o Radio da SALA (6/10, `supabase/radio-no-jam.sql`): acende para
 * todos, liga-o quem pode mandar na sessão, e o anfitrião enche a fila
 * partilhada depois do que as pessoas puseram. Sem a migração não aparece. A
 * seguir um amigo aparece, e ligá-la deixa de o seguir (5/10).
 */
export function useRadioDaFila() {
  const current=usePlayer(s=>s.current), queue=usePlayer(s=>s.queue);
  const modoSozinho=usePlayer(s=>s.radioMode), erroSozinho=usePlayer(s=>s.radioError), tipo=usePlayer(s=>s.radioTipo);
  /** O menu "Songs like this one / Mix" (18/10): abre com o Radio desligado. */
  const [menuAberto,setMenuAberto]=useState(false);
  const offline=useConnectivity(s=>s.offline);
  const owner=useAuth(s=>s.session?.user.id??s.offlineUserId);
  const radioDoJam=useOuvirJuntos(s=>s.sessao?s.sessao.radio:undefined);
  const mandoNoJam=useOuvirJuntos(s=>s.possoControlar());
  const [aLigarNoJam,setALigarNoJam]=useState(false);
  const emJam=radioDoJam!==undefined;
  const [undo,setUndo]=useState<null|{ before:ReturnType<typeof usePlayer.getState>; after:typeof queue; owner:typeof owner }>(null);
  const mode:typeof modoSozinho=emJam?(aLigarNoJam?'preparing':radioDoJam?'on':'off'):modoSozinho;
  const error=emJam?null:erroSozinho;
  const reason=offline?'Connect to start Radio'
    :emJam?(mandoNoJam?undefined:'Only the host can change the Jam Radio')
    :!current?'Play a song to start Radio':undefined;
  useEffect(()=>{ if(undo&&(current!==undo.before.current||queue!==undo.after||owner!==undo.owner))setUndo(null); },[current,queue,owner,undo]);
  useEffect(()=>{
    if(!undo)return;
    const id=setTimeout(()=>setUndo(null),UNDO_DO_RADIO_MS);
    return ()=>clearTimeout(id);
  },[undo]);
  const start=async(qual:TipoDeRadio)=>{
    setUndo(null);
    const before=usePlayer.getState();
    const auth=useAuth.getState(), startedBy=auth.session?.user.id??auth.offlineUserId;
    if(await before.startRadio(false,qual)){
      const liveAuth=useAuth.getState();
      if((liveAuth.session?.user.id??liveAuth.offlineUserId)===startedBy)setUndo({before,after:usePlayer.getState().queue,owner:startedBy});
    }
  };
  /** Desligado liga; a preparar ou ligado, para. */
  const alternar=()=>{
    // Apagada, a pastilha diz PORQUÊ em vez de não fazer nada (20/10: um
    // convidado de uma Jam achava que o Radio não funcionava). No PC o motivo
    // é a legenda dela (FilaDoLeitor.web.tsx): lá estes avisos não aparecem.
    if(reason&&!(emJam&&aLigarNoJam)&&(emJam||usePlayer.getState().radioMode==='off')){
      avisarInfo(reason,emJam&&!offline?DETALHE_SEM_CONTROLO:undefined);
      return;
    }
    if(emJam){
      // Na sala é uma decisão sobre o que todos ouvem: só quem manda nela.
      if(aLigarNoJam)return;
      setALigarNoJam(true);
      void useOuvirJuntos.getState().ligarRadio(!radioDoJam).finally(()=>setALigarNoJam(false));
      return;
    }
    if(usePlayer.getState().radioMode!=='off'){setUndo(null);usePlayer.getState().stopRadio();return;}
    if(reason)return;
    // Desligado: abre o menu (18/10). A escolha liga-o (`escolher`).
    setMenuAberto(true);
  };
  /** Ligar o Radio escolhido no menu. Corre quando o menu já fechou. */
  const escolher=(qual:TipoDeRadio)=>{
    if(reason)return;
    // A seguir um amigo (5/10): ligar o Radio e deixar de o seguir, a partir
    // da musica dele -- como tocar noutra musica, que tambem deixa de seguir.
    if(useSeguirAmigo.getState().seguindo)useSeguirAmigo.getState().parar(null);
    void start(qual);
  };
  const desfazer=()=>{
    if(!undo)return;
    const live=usePlayer.getState(),before=undo.before;
    const auth=useAuth.getState();
    if(live.current!==before.current||live.queue!==undo.after||(auth.session?.user.id??auth.offlineUserId)!==undo.owner||reason){setUndo(null);return;}
    live.stopRadio();
    usePlayer.setState({queue:before.queue,queueIndex:before.queueIndex,shuffle:before.shuffle,
      shuffleOrder:before.shuffleOrder,shuffleInteligente:before.shuffleInteligente,repeatMode:before.repeatMode,
      radioMode:before.radioMode==='on'?'on':'off',radioTipo:before.radioTipo,radioContext:before.radioContext,radioOwner:before.radioOwner,
      radioStopped:before.radioStopped,radioActive:before.radioActive,doRadio:before.doRadio,
      sugeridas:before.sugeridas,origemDaFila:before.origemDaFila});
    setUndo(null);
  };
  return { mode, error, reason, podeDesfazer: !emJam && !!undo, alternar, desfazer,
    tipo, menuAberto, fecharMenu: () => setMenuAberto(false), escolher,
    /** O que a pastilha diz ligada: "Radio on" ou "Mix on" (num Jam, sempre "Radio on"). */
    rotuloLigado: emJam ? ROTULO_DO_RADIO.ligado : ROTULO_LIGADO[tipo],
    /** Carregar agora abre o menu (e não liga nem desliga logo). */
    abreMenu: !emJam && mode === 'off' && !reason,
    /** Num Jam sem a migração (a sessão não traz o Radio) não há pastilha. */
    visivel: emJam ? radioDoJam !== null : !!current,
    dica: emJam ? ROTULO_DO_RADIO.dicaNoJam : ROTULO_DO_RADIO.dica };
}

/** Quem não manda na Jam: como é que passa a poder (o interruptor da folha da Jam). */
export const DETALHE_SEM_CONTROLO = 'The host can turn on "Guests can control" in the Jam.';

export const ROTULO_DO_RADIO = {
  desligado: 'Radio', aPreparar: 'Starting…', ligado: 'Radio on',
  dica: 'Choose Songs like this one or Mix. Radio swaps Up next and stays on: a song you tap starts it again.',
  dicaNoJam: 'Keeps the Jam going with music like what everyone is hearing, after the songs people picked.',
};

/** A pastilha do iPhone, para o cabeçalho do Up next (QueueSheet). */
export function RadioQueueControl() {
  const radio=useRadioDaFila();
  const ligado=radio.mode==='on', aPreparar=radio.mode==='preparing';
  const capa=usePlayer(s=>s.current?.artworkUrl??null);
  const capasDoMix=useCapasDoMix(radio.menuAberto);
  const pastilha=useRef<View>(null);
  const [ancora,setAncora]=useState<AncoraDoMenuDoRadio|null>(null);
  const reduzido=useReducedMotion();
  // O enchimento (18/10): acende da esquerda para a direita quando liga.
  const enchido=useRef(new Animated.Value(ligado?1:0)).current;
  useEffect(()=>{
    if(reduzido){enchido.setValue(ligado?1:0);return;}
    pedirFluidez(500);
    const a=Animated.timing(enchido,{toValue:ligado?1:0,duration:ligado?380:240,easing:Easing.out(Easing.cubic),useNativeDriver:true});
    a.start();
    return ()=>a.stop();
  },[ligado,reduzido,enchido]);
  const carregar=()=>{
    if(!radio.abreMenu){radio.alternar();return;}
    // O menu nasce da pastilha: precisa de saber onde ela está no ecrã. Sem
    // ela (não devia acontecer), liga o Radio de sempre em vez de não fazer nada.
    if(!pastilha.current){radio.escolher('musica');return;}
    pastilha.current.measureInWindow((x,y,width,height)=>{ setAncora({x,y,width,height}); radio.alternar(); });
  };
  if(!radio.visivel)return null;
  return <View style={styles.linha}>
    {radio.podeDesfazer?<Pressable accessibilityRole="button" accessibilityLabel="Undo Radio and restore previous queue"
      onPress={radio.desfazer} hitSlop={10} style={styles.desfazer}><Text style={styles.desfazerTexto}>Undo</Text></Pressable>:null}
    <Pressable ref={pastilha} accessibilityRole="switch" accessibilityLabel="Radio" accessibilityHint={radio.reason ?? radio.dica}
      accessibilityState={{checked:ligado,busy:aPreparar,disabled:!!radio.reason&&!ligado&&!aPreparar,expanded:radio.abreMenu?radio.menuAberto:undefined}}
      onPress={carregar} hitSlop={8}
      style={({pressed})=>[styles.pastilha,ligado&&styles.pastilhaLigada,!!radio.reason&&radio.mode==='off'&&styles.apagada,pressed&&styles.premida]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill,styles.enchimento,{transform:[{scaleX:enchido}]}]}/>
      {aPreparar?<ActivityIndicator size="small" color={colors.text} style={styles.icone}/>
        :<Ionicons name={ligado?'radio':'radio-outline'} size={15} color={ligado?colors.text:colors.textSecondary}/>}
      <Text style={[styles.texto,(ligado||aPreparar)&&styles.textoLigado]}>
        {aPreparar?ROTULO_DO_RADIO.aPreparar:ligado?radio.rotuloLigado:ROTULO_DO_RADIO.desligado}
      </Text>
    </Pressable>
    <MenuDoRadio ancora={ancora} visivel={radio.menuAberto} capa={capa} capasDoMix={capasDoMix}
      aoEscolher={radio.escolher} aoFechar={radio.fecharMenu}/>
  </View>;
}

/** O que correu mal ao ligar, numa linha por baixo do cabeçalho. */
export function ErroDoRadio() {
  const error=usePlayer(s=>s.radioError);
  return error?<Text accessibilityRole="alert" style={styles.erro}>{error}</Text>:null;
}

const styles=StyleSheet.create({
  linha:{flexDirection:'row',alignItems:'center',gap:spacing.sm,marginRight:spacing.md},
  pastilha:{flexDirection:'row',alignItems:'center',gap:6,height:28,paddingLeft:9,paddingRight:11,borderRadius:14,overflow:'hidden',
    borderCurve:'continuous',borderWidth:StyleSheet.hairlineWidth,borderColor:'rgba(233,234,238,0.22)',backgroundColor:'transparent'},
  pastilhaLigada:{borderColor:'rgba(233,234,238,0.26)'},
  // O fundo de ligada, num enchimento que cresce da esquerda (18/10).
  enchimento:{backgroundColor:'rgba(233,234,238,0.12)',borderRadius:14,transformOrigin:'left center'},
  apagada:{opacity:0.45}, premida:{opacity:0.7},
  icone:{width:15,height:15,transform:[{scale:0.7}]},
  texto:{...type.caption,fontWeight:'600',color:colors.textSecondary},
  textoLigado:{color:colors.text},
  desfazer:{minHeight:28,justifyContent:'center'},
  desfazerTexto:{...type.caption,color:colors.text,textDecorationLine:'underline'},
  erro:{...type.caption,color:colors.textSecondary,marginTop:spacing.sm},
});
