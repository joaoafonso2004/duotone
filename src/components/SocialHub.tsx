import React,{useCallback,useEffect,useRef,useState} from 'react';
import { ActivityIndicator,Animated,AppState,FlatList,Platform,Pressable,ScrollView,Text,TextInput,View } from 'react-native';
import type { CabecalhoQueEncolhe } from './Screen';
import { appEstaVisivel, intervaloComAppVisivel } from '../lib/appVisibility';
import Ionicons from '@expo/vector-icons/Ionicons';
import { acceptFriendRequest,acrescentarAoGrupo,criarGrupo,declineOrRemoveFriendship,getChatMessages,getGroupMessages,apagarConversa, sairDoGrupo,searchProfiles,sendFriendRequest,getReactions,getMensagensCitadas,setReaction,shareComGrupo,shareItem,type Reaction,type SharedItem } from '../api/social';
import type { PublicProfile } from '../api/profiles';
import { useSocial } from '../state/social';
import { useAuth } from '../state/auth';
import { usePlayer } from '../state/player';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { abrirFolhaDoAmigo } from '../state/folhaDoAmigo';
import { mesmoGrupo, separadorPorCima } from '../lib/gruposDeMensagens';
import { MENSAGEM_DO_CONVITE } from '../lib/playlistColaborativa';
import { avisarErro, avisarFeito, avisarInfo } from '../lib/avisoDeRemocao';
import { mensagemDeErro } from '../lib/mensagemDeErro';
import { textoSobre } from '../lib/corDaCapa';
import { EnviarMusica } from './EnviarMusica';
import { naoLidasPorAmigo } from '../lib/social';
import { ultimaAtividade } from '../lib/socialPresence';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { supabase } from '../lib/supabase';
import { FriendAvatar } from './FriendAvatar';
import { colors, SOCIAL_GUTTER } from './socialTokens';
import { useSocialBottomPadding } from './useSocialBottomPadding';
import { useTheme } from '../state/theme';
import { SocialButton,SocialModal,SocialIconButton,socialStyles as s } from './socialUI';
import { SocialTrackActions } from './SocialTrackActions';
import { SharedPlaylistCard } from './SharedPlaylistCard';
import { MessageBubble,ReactionRow } from './ReactionRow';
import { BarraDeResposta,CitacaoDaResposta } from './RespostaNaConversa';
import { acharOriginal,citadasPorCarregar,excertoDaMensagem,quemECitado } from '../lib/respostas';
import { getPlaylistPreviews } from '../api/playlists';
import { GroupAvatar,GroupChatHeader,GroupComposer,GroupDetails,GroupEmptyState,GroupMessage } from './GroupChat';
import { ConviteDeSessao } from './ConviteDeSessao';
import { SkeletonDeConversas } from './Skeleton';
import { usePuxarParaAtualizar } from './PuxarParaAtualizar';
import { CabecalhoDoAmigo, FaixaPartilhada, FundoDaApp } from './ChatAmigo';
import { SocialOverview } from './SocialOverview';
import { OpcoesDoAmigo } from './OpcoesDoAmigo';
import { useDestinos } from '../navigation/destinos';
import type { Playlist,Track } from '../types';

/**
 * A lista das conversas e a conversa. Para onde leva (um perfil, uma playlist,
 * um artista, a conversa no iPhone) é o `irPara` da app (5/10, lib/destinos.ts):
 * os ecrãs que o montam já não escolhem ligar uma função e esquecer outra.
 */
export function SocialHub({visible=true,initialFriend,initialGroup,cabecalho,novaConversa,procurar,conversationTarget,onCloseConversation}:{visible?:boolean;initialFriend?:string;initialGroup?:string;
  /** A lupa do cabeçalho do Social no iPhone (9/10). */
  procurar?: boolean;
  conversationTarget?: {kind:'friend'|'group';id:string};
  onCloseConversation?: ()=>void;
  novaConversa?: { aberta: boolean; definir: (aberta: boolean) => void };
  /** No iPhone (3/10): o título do Social encolhe ao rolar a lista, e ela começa por baixo dele. */
  cabecalho?:CabecalhoQueEncolhe}) {
  const web=Platform.OS==='web';
  const { irPara }=useDestinos();
  const onProfile=(userId:string)=>irPara({tipo:'perfil',userId});
  const onArtist=(nome:string)=>irPara({tipo:'artista',nome});
  const onPlaylist=(id:string)=>irPara({tipo:'playlist',id,nome:'Shared playlist'});
  const canRead = () => appEstaVisivel() && (!web || document.hasFocus());
  const [width,setWidth]=useState(0);
  const split=web&&width>=850;
  const bottomPadding=useSocialBottomPadding();
  const accent=useTheme(s=>s.theme.color);
  const tema=useTheme(s=>s.theme);
  const closeChat=()=>onCloseConversation ? onCloseConversation() : useSocial.setState({conversation:null});
  const social=useSocial(),myId=useAuth(x=>x.session?.user.id);
  const [tab,setTab]=useState<'friends'|'add'>('friends'),[query,setQuery]=useState(''),[results,setResults]=useState<PublicProfile[]>([]);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[messages,setMessages]=useState<SharedItem[]>([]),[chatLoading,setChatLoading]=useState(false);
  const [older,setOlder]=useState(false),[hasOlder,setHasOlder]=useState(false);
  const [track,setTrack]=useState<Track|null>(null),[confirm,setConfirm]=useState<{id:string;group:boolean;conversa?:boolean}|null>(null);
  /** O texto da pesquisa da lista, e a folha do `+`. */
  const [comecarLocal,setComecarLocal]=useState(false);
  const comecar=novaConversa?.aberta??comecarLocal;
  const setComecar=novaConversa?.definir??setComecarLocal;
  const [groupEditor,setGroupEditor]=useState<string|null>(null),[groupName,setGroupName]=useState(''),[members,setMembers]=useState<string[]>([]);
  const [groupDetails,setGroupDetails]=useState<string|null>(null);
  // O menu de um amigo no toque longo (iPhone, 5/10, OpcoesDoAmigo).
  const [menuDoAmigo,setMenuDoAmigo]=useState<{id:string;ancora:{x:number;y:number;width:number;height:number}}|null>(null);
  // No iOS a rota é dona do chat, inclusive durante o gesto de voltar.
  // A lista por baixo não monta outro leitor de mensagens da mesma conversa.
  const conversation=conversationTarget ?? (web ? social.conversation : null);
  const contact=conversation?.kind==='friend'?social.contacts.find(c=>c.id===conversation.id):null;
  const friend=conversation?.kind==='friend'?social.friends.find(f=>f.friendId===conversation.id) || (contact?{friendId:contact.id,name:contact.name,avatarUrl:contact.avatar_url,online:false,lastSeenAt:null,currentlyPlaying:null}:null):null;
  const group=conversation?.kind==='group'?social.groups.find(g=>g.id===conversation.id):null;
  const detailedGroup=social.groups.find(g=>g.id===groupDetails);
  const key=conversation?(conversation.kind==='group'?`group:${conversation.id}`:conversation.id):'';
  const draft=social.drafts[key] || '';
  const unread=naoLidasPorAmigo(social.received,social.seen);
  const ordered=[...messages].reverse();
  // As mensagens só guardam o id da playlist. O nome e as capas vêm daqui, uma
  // vez por conjunto de ids: sem isto o chat só sabia dizer "Open playlist".
  const [playlistsDoChat,setPlaylistsDoChat]=useState<Map<string,Playlist>>(new Map());
  const [reacoes,setReacoes]=useState<Map<string,Reaction[]>>(new Map());
  const [aReagir,setAReagir]=useState<string|null>(null);
  /** A folha do "＋" do compositor (9/10): mandar música sem sair da conversa. */
  const [enviarMusica,setEnviarMusica]=useState(false);
  const aTocar=usePlayer(x=>x.current);
  /**
   * A mensagem a que se está a responder. Por conversa: mudar de conversa larga
   * a resposta, senão ela ia citar uma mensagem de outra pessoa.
   */
  const [aResponder,setAResponder]=useState<SharedItem|null>(null);
  /** A original para onde se acabou de saltar, acesa um instante. */
  const [destacada,setDestacada]=useState<string|null>(null);
  const lista=useRef<FlatList<SharedItem>>(null);
  const campo=useRef<TextInput>(null);
  /** Originais mais antigas do que a página carregada, pedidas à parte. */
  const [citadasFora,setCitadasFora]=useState<{ids:string;mapa:Map<string,SharedItem>}>({ids:'',mapa:new Map()});
  const idsDasMensagens=messages.map(m=>m.id).join(',');
  const recarregarReacoes=useCallback(async()=>{
    if(!idsDasMensagens){setReacoes(new Map());return;}
    setReacoes(await getReactions(idsDasMensagens.split(',')));
  },[idsDasMensagens]);
  useEffect(()=>{void recarregarReacoes();},[recarregarReacoes]);
  // O canal de tempo real nasce uma vez por conversa; a ref dá-lhe sempre a
  // versão actual da função em vez da que existia quando ele foi criado.
  const recarregarReacoesRef=useRef(recarregarReacoes);recarregarReacoesRef.current=recarregarReacoes;
  /**
   * A reação aparece no toque e só depois vai ao servidor: esperar pela ida e
   * volta faz um botão que parece partido. Se falhar, a releitura repõe o
   * estado certo.
   */
  const reagir=async(itemId:string,emoji:string|null)=>{
    setAReagir(null);
    if(!myId)return;
    setReacoes(anterior=>{
      const copia=new Map(anterior);
      const semAMinha=(copia.get(itemId)??[]).filter(r=>r.userId!==myId);
      copia.set(itemId,emoji?[...semAMinha,{itemId,userId:myId,emoji}]:semAMinha);
      return copia;
    });
    try{await setReaction(itemId,emoji);}catch{/* a releitura repõe */}
    void recarregarReacoes();
  };
  const idsDePlaylist=Array.from(new Set(messages.map(m=>m.playlistId).filter(Boolean) as string[])).sort().join(',');
  useEffect(()=>{
    if(!idsDePlaylist){setPlaylistsDoChat(new Map());return;}
    let vivo=true;
    void getPlaylistPreviews(idsDePlaylist.split(',')).then(m=>{if(vivo)setPlaylistsDoChat(m);});
    return()=>{vivo=false;};
  },[idsDePlaylist]);
  // As originais que ficaram fora da página (a conversa vem às 100): pedem-se
  // à parte, para a citação dizer o que era em vez de aparecer vazia.
  const idsCitadosFora=citadasPorCarregar(messages).join(',');
  useEffect(()=>{
    if(!idsCitadosFora)return;
    let vivo=true;
    void getMensagensCitadas(idsCitadosFora.split(','))
      .then(mapa=>{if(vivo)setCitadasFora({ids:idsCitadosFora,mapa});})
      .catch(()=>{if(vivo)setCitadasFora({ids:idsCitadosFora,mapa:new Map()});});
    return()=>{vivo=false;};
  },[idsCitadosFora]);
  const excerto=(m:SharedItem)=>excertoDaMensagem(m,{
    faixa:m.trackData?{titulo:tituloDaFaixa(m.trackData),artista:displayArtist(m.trackData)}:null,
    playlist:m.playlistId?playlistsDoChat.get(m.playlistId)?.name??null:null,
  });
  const irParaAMensagem=(id:string)=>{
    const indice=ordered.findIndex(x=>x.id===id);
    if(indice<0)return;
    lista.current?.scrollToIndex({index:indice,animated:true,viewPosition:0.5});
    setDestacada(id);
    setTimeout(()=>setDestacada(d=>d===id?null:d),1400);
  };
  const responderA=(m:SharedItem)=>{
    setAReagir(null);setAResponder(m);
    // Como no Instagram: responder abre o teclado.
    setTimeout(()=>campo.current?.focus(),60);
  };
  const citacao=(m:SharedItem)=>{
    if(!m.replyToId)return null;
    const carregada=acharOriginal(messages,m.replyToId);
    const original=carregada??citadasFora.mapa.get(m.replyToId)??null;
    // Enquanto a original de fora ainda vem a caminho, não se diz que se perdeu.
    if(!original&&citadasFora.ids!==idsCitadosFora)return null;
    return <CitacaoDaResposta accent={accent}
      autor={original?quemECitado(original.sender.id,myId,original.sender.name):null}
      excerto={original?excerto(original):null}
      onPress={carregada?()=>irParaAMensagem(carregada.id):undefined}/>;
  };
  /** Mensagens seguidas da mesma pessoa, dentro de cinco minutos, ficam sem o cabeçalho repetido. */
  const seguida=(m:SharedItem,index:number)=>{const antes=ordered[index+1];return !!antes&&antes.sender.id===m.sender.id&&new Date(m.createdAt).getTime()-new Date(antes.createdAt).getTime()<300000;};
  const setDraft=(text:string)=>useSocial.setState(x=>({drafts:{...x.drafts,[key]:text}}));
  // No PC a conversa abre ao lado da lista; no iPhone a lista nunca a mostra
  // (`conversation` acima) e ela é uma página da pilha.
  const open=(kind:'friend'|'group',id:string)=>{useSocial.setState({conversation:{kind,id}});if(!web)irPara({tipo:'conversa',kind,id});};
  const run=async(action:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);setError('');try{await action();await social.refresh();}catch(e:any){setError(e.message || 'That did not go through.');}finally{setBusy(false);}};
  useEffect(()=>{if(initialFriend)open('friend',initialFriend);else if(initialGroup)open('group',initialGroup);},[initialFriend,initialGroup]);
  useEffect(()=>{setGroupDetails(null);setAResponder(null);setDestacada(null);},[key]);
  useEffect(()=>{
    let active=true;
    if(query.trim().length<2){setResults([]);return;}
    const timer=setTimeout(()=>{void searchProfiles(query).then(rows=>{if(active)setResults(rows);}).catch(e=>{if(active)setError(e.message);});},400);
    return()=>{active=false;clearTimeout(timer);};
  },[query]);
  useEffect(()=>{
    if(!conversation || !visible)return;
    let active=true,loading=false,firstLoad=true,reload=false,aoVivo=false,jaLigou=false,ultimaCarga=0,esteveAtras=false,perdida=false;
    setMessages([]);setHasOlder(false);setChatLoading(true);
    const load=async()=>{
      if(!active)return;
      // Escondida não lê, mas fica a dever: o próximo foco relê.
      if(!appEstaVisivel()){perdida=true;return;}
      if(loading){reload=true;return;}loading=true;reload=false;perdida=false;ultimaCarga=Date.now();
      try{const rows=conversation.kind==='group'?await getGroupMessages(conversation.id):await getChatMessages(conversation.id);
        if(active){if(firstLoad){setHasOlder(rows.length===100);firstLoad=false;}setMessages(previous=>mergeMessages(previous,rows));useSocial.getState().rememberConversation(key,rows);const last=rows.filter(m=>m.sender.id!==myId).at(-1);if(last&&canRead())await useSocial.getState().markRead(key,last.createdAt);}}
      catch(e:any){if(active)setError(e.message || 'Could not refresh this conversation.');}
      finally{loading=false;if(active){setChatLoading(false);if(reload)void load();}}
    };
    // Realtime entrega mensagens novas imediatamente. Esta consulta é apenas
    // recuperação para uma ligação silenciosamente caída; seis segundos
    // mantinham o chat a pedir a mesma página dez vezes por minuto. Com o canal
    // ligado, de cinco em cinco minutos (6/10, logs do Supabase).
    const inboxIds = (rows: SharedItem[]) => rows.filter(m => conversation.kind === 'group'
      ? m.groupId === conversation.id : !m.groupId && m.sender.id === conversation.id).map(m => m.id).join(',');
    // As dos outros chegam pela inbox (é ela que as lê, uma vez para a app toda).
    const inboxSubscription = useSocial.subscribe((next, previous) => {
      if (next.received !== previous.received && inboxIds(next.received) !== inboxIds(previous.received)) void load();
    });
    // Voltar à janela relia a conversa a cada foco (no Windows, cada alt-tab):
    // com o canal ligado, só passado um minuto, ou depois de o iPhone a ter
    // tido em segundo plano (aí o Realtime não entrega).
    const focus = (estado?: unknown) => {
      if (estado === 'background') { esteveAtras = true; return; }
      if (!canRead()) return;
      if (aoVivo && !esteveAtras && !perdida && Date.now() - ultimaCarga < 60_000) return;
      esteveAtras = false;
      void load();
    };
    const app = AppState.addEventListener('change', focus);
    if (web) window.addEventListener('focus', focus);
    let voltas = 0;
    void load();const pararTimer=intervaloComAppVisivel(()=>{if(!aoVivo||++voltas%5===0)void load();},60000);
    // Só as MINHAS desta conversa (mandadas noutro aparelho): qualquer mensagem
    // que eu pudesse ver, de qualquer conversa, relia esta.
    const minhaDaqui=(r:{sender_id?:string;recipient_id?:string|null;group_id?:string|null}|null|undefined)=>!!r&&r.sender_id===myId
      &&(conversation.kind==='group'?r.group_id===conversation.id:!r.group_id&&r.recipient_id===conversation.id);
    const channel=supabase.channel(`chat:${key}`)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'shared_items'},(evento)=>{if(minhaDaqui(evento.new as any))void load();})
      // As reações chegam pelo seu próprio evento, sem esperar pelo polling.
      .on('postgres_changes',{event:'*',schema:'public',table:'item_reactions'},()=>void recarregarReacoesRef.current())
      .subscribe((estado)=>{const antes=aoVivo;aoVivo=estado==='SUBSCRIBED';if(aoVivo&&!antes&&jaLigou)void load();if(aoVivo)jaLigou=true;});
    return()=>{active=false;app.remove();if(web)window.removeEventListener('focus',focus);inboxSubscription();pararTimer();void supabase.removeChannel(channel);};
  },[key,visible,conversation,myId]);
  const loadOlder=async()=>{
    if(!conversation||older||!messages.length)return;setOlder(true);
    try{const rows=conversation.kind==='group'?await getGroupMessages(conversation.id,messages[0]):await getChatMessages(conversation.id,messages[0]);
      const c=useSocial.getState().conversation;if(c?.id!==conversation.id||c.kind!==conversation.kind)return;
      setMessages(previous=>mergeMessages(previous,rows));setHasOlder(rows.length===100);
    }catch(e:any){setError(e.message);}finally{setOlder(false);}
  };
  const send=async()=>{
    const text=draft.trim();if(!conversation||!text||busy)return;
    await run(async()=>{
      const respostaA=aResponder?.id??null;
      if(conversation.kind==='group')await shareComGrupo(conversation.id,'track',null,text,respostaA);else await shareItem(conversation.id,'track',null,text,respostaA);
      // Só depois de enviar: se falhar, a resposta continua armada com o texto.
      setAResponder(null);
      // Limpar o que foi enviado e MAIS NADA.
      //
      // A guarda que estava aqui comparava a string inteira com o rascunho
      // capturado no início -- e o que foi enviado foi o `trim` dele. Bastava
      // o campo diferir num espaço, e diferia: o corrector do iOS fecha a
      // palavra ao carregar em Send, e essa alteração chega depois. A
      // comparação falhava, a mensagem seguia, e o texto ficava no campo.
      //
      // A pergunta certa não é "está igual?" mas "sobrou alguma coisa que eu
      // não enviei?". Escrever durante o envio continua a ser respeitado, que
      // era a razão de haver guarda nenhuma.
      useSocial.setState(s=>{
        const agora=s.drafts[key]??'';
        const sobra=agora.trim()===text?'':agora.startsWith(draft)?agora.slice(draft.length).trimStart():agora;
        return {drafts:{...s.drafts,[key]:sobra}};
      });
      const rows=conversation.kind==='group'?await getGroupMessages(conversation.id):await getChatMessages(conversation.id);
      const current=useSocial.getState().conversation;
      if(current?.id===conversation.id&&current.kind===conversation.kind){setMessages(previous=>mergeMessages(previous,rows));useSocial.getState().rememberConversation(key,rows);const last=rows.filter(m=>m.sender.id!==myId).at(-1);if(last)await social.markRead(key,last.createdAt);}
    });
  };
  /** Mandar uma música ou uma playlist a esta conversa (a folha do "＋" e o ♪). */
  const enviarItem=async(tipo:'track'|'playlist',item:any)=>{
    if(!conversation)return;
    setEnviarMusica(false);
    await run(async()=>{
      if(conversation.kind==='group')await shareComGrupo(conversation.id,tipo,item);else await shareItem(conversation.id,tipo,item);
      const rows=conversation.kind==='group'?await getGroupMessages(conversation.id):await getChatMessages(conversation.id);
      const current=useSocial.getState().conversation;
      if(current?.id===conversation.id&&current.kind===conversation.kind){setMessages(previous=>mergeMessages(previous,rows));useSocial.getState().rememberConversation(key,rows);}
    });
  };
  /**
   * Os auscultadores do cabeçalho: se ele está a ouvir, a folha dele (Listen
   * along); senão, convida-o para uma Jam com o que estás a tocar.
   */
  const ouvirJuntosCom=(amigo:{friendId:string;name:string;musicActivity?:{listening:boolean}|null})=>{
    if(!web&&amigo.musicActivity?.listening){abrirFolhaDoAmigo(amigo.friendId);return;}
    const atual=usePlayer.getState().current;
    if(!atual){avisarInfo('Play a song first',`Then ${amigo.name} can listen along with you`);return;}
    void useOuvirJuntos.getState().abrir(atual,[amigo.friendId])
      .then(()=>avisarFeito(`Invited ${amigo.name} to listen`,tituloDaFaixa(atual)))
      .catch(e=>avisarErro(mensagemDeErro(e,'Couldn’t start listening together')));
  };
  // Uma lista de conversas ordena-se por quem falou por último, não pela ordem
  // em que a amizade foi aceite. Quem ainda nunca trocou nada fica por baixo,
  // por nome, para a secção não parecer baralhada ao acaso.
  const accepted=social.friends.filter(f=>f.status==='accepted').slice().sort((a,b)=>{
    const x=social.activity[a.friendId]??0,y=social.activity[b.friendId]??0;
    return x||y?y-x:a.name.localeCompare(b.name);
  });
  const pending=social.friends.filter(f=>f.status==='pending');
  const title=friend?.name || group?.name || 'Chat';
  const puxar=usePuxarParaAtualizar(()=>useSocial.getState().refresh(),cabecalho?.espaco??0);
  const requests=<>
    {pending.length>0&&<Text style={s.label}>Friend requests</Text>}
    {pending.map(f=><View key={f.friendId} style={s.card}><View style={s.row}><FriendAvatar avatarUrl={f.avatarUrl} name={f.name} size={44}/><View style={{flex:1}}><Text style={s.text}>{f.name}</Text><Text style={s.muted}>{f.isSender?'Request sent':'Wants to be your friend'}</Text></View></View><View style={s.row}>{!f.isSender&&<SocialButton primary disabled={busy} onPress={()=>void run(()=>acceptFriendRequest(f.friendId))}>Accept</SocialButton>}<SocialButton quiet disabled={busy} onPress={()=>void run(()=>declineOrRemoveFriendship(f.friendId))}>{f.isSender?'Cancel request':'Decline'}</SocialButton></View></View>)}
  </>;
  const list=<View style={s.body}>
    {!novaConversa&&<View style={[s.row,{justifyContent:'flex-end'}]}>
      <SocialIconButton label="Start a conversation" icon="person-add-outline" onPress={()=>setComecar(true)}/>
    </View>}
    <Animated.ScrollView refreshControl={puxar} onScroll={cabecalho?.onScroll} scrollEventThrottle={cabecalho?.scrollEventThrottle}
      scrollIndicatorInsets={{top:cabecalho?.espaco??0}} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{gap:16,paddingTop:cabecalho?.espaco??0,paddingBottom:bottomPadding}}>
      {(error||social.error)&&<Text accessibilityRole="alert" style={s.error}>{error||social.error}</Text>}
      {social.loading&&!accepted.length&&<SkeletonDeConversas/>}
      <SocialOverview key={myId??'signed-out'} friends={accepted} groups={social.groups} contacts={social.contacts}
        activity={social.activity} previews={social.conversationPreviews} unread={unread} now={social.now} myId={myId}
        loading={social.loading} requests={requests} onOpen={open} onProfile={onProfile} onTrack={setTrack}
        pedidos={pending.filter(f=>!f.isSender).length} procurar={web?undefined:procurar} gutter={web?SOCIAL_GUTTER:24}
        onRemoveFriend={id=>setConfirm({id,group:false})}
        onFriendMenu={web?undefined:(id,ancora)=>setMenuDoAmigo({id,ancora})}
        onDeleteConversation={id=>setConfirm({id,group:false,conversa:true})} onStart={()=>setComecar(true)}/>
    </Animated.ScrollView>
  </View>;
  const groupHeader=group?<GroupChatHeader group={group} split={split} onBack={closeChat} onDetails={()=>setGroupDetails(group.id)}/>:undefined;
  // O nome aparecia TRES vezes: na barra, na linha de perfil, e dentro de cada
  // mensagem recebida. Numa conversa a dois so ha duas pessoas -- e o lado do
  // balao ja diz quem falou. Fica uma vez, com a cara e o estado.
  const estiloDoSeparador={alignSelf:'center' as const,fontSize:12,fontWeight:'600' as const,color:colors.textTertiary,marginBottom:8,marginTop:4};
  const estiloDeSistema={fontSize:12.5,fontWeight:'600' as const,color:colors.textTertiary,textAlign:'center' as const};
  const amigoHeader=friend?<CabecalhoDoAmigo
    nome={friend.name} avatarUrl={friend.avatarUrl}
    estado={friend.online?'Online now':ultimaAtividade(friend.lastSeenAt,social.now)}
    online={friend.online}
    aOuvir={(friend.currentlyPlaying as Track|null|undefined)??null} cor={accent}
    onVoltar={closeChat} onPerfil={()=>onProfile(friend.friendId)}
    onOuvir={web?undefined:()=>abrirFolhaDoAmigo(friend.friendId)}
    onOuvirJuntos={()=>ouvirJuntosCom(friend)}
  />:undefined;
  /**
   * Uma mensagem da conversa (9/10, docs/PLANO-SOCIAL-IOS.md, fase 2). A hora saiu
   * dos balões para separadores ao centro (lib/gruposDeMensagens.ts); as seguidas
   * da mesma pessoa juntam-se num grupo e só a última leva a ponta e a cara; o
   * balão já não tem borda (só a mensagem destacada); o convite para a Jam e o
   * convite para uma playlist são cartões e linhas de sistema, fora do balão.
   */
  const horaCurta=(d:Date)=>d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
  const desenharMensagem=(m:SharedItem,index:number)=>{
    // `ordered` vai da mais nova para a mais antiga (a lista é invertida).
    const antiga=ordered[index+1],nova=ordered[index-1];
    const separador=separadorPorCima(m,antiga,social.now,horaCurta);
    const comAAntiga=!separador&&mesmoGrupo(antiga,m);
    const fimDoGrupo=!(nova&&mesmoGrupo(m,nova)&&!separadorPorCima(nova,m,social.now,horaCurta));
    const minha=m.sender.id===myId;
    const nomeDaPlaylist=m.playlistId?playlistsDoChat.get(m.playlistId)?.name??'a playlist':'a playlist';
    let corpo:React.ReactNode;
    if(group){
      corpo=<GroupMessage message={m} own={m.sender.id===myId} showSender={!seguida(m,index)} citacao={citacao(m)} onResponder={()=>responderA(m)} destacada={destacada===m.id} playlist={m.playlistId?playlistsDoChat.get(m.playlistId):undefined}
          reactions={reacoes.get(m.id)??[]} myId={myId} aReagir={aReagir===m.id} onReagir={emoji=>void reagir(m.id,emoji)} onAbrirReacoes={()=>setAReagir(a=>a===m.id?null:m.id)} onFecharReacoes={()=>setAReagir(null)} onProfile={onProfile} onTrack={setTrack} onPlaylist={onPlaylist}/>;
    }else if(m.itemType==='sessao'&&m.sessionId){
      corpo=<ConviteDeSessao id={m.sessionId} mensagem={m.message} minha={minha} quem={m.sender.name}/>;
    }else if(m.playlistId&&m.message?.trim()===MENSAGEM_DO_CONVITE){
      corpo=<View style={{alignSelf:'stretch',alignItems:'center',gap:8,paddingVertical:4}}>
        <Text style={estiloDeSistema}>{minha?`You added ${title} to ${nomeDaPlaylist}`:`${m.sender.name} added you to ${nomeDaPlaylist}`}</Text>
        <View style={{backgroundColor:colors.surface,borderRadius:20,padding:10,maxWidth:'86%'}}>
          <SharedPlaylistCard semFundo playlist={playlistsDoChat.get(m.playlistId)} onPress={()=>onPlaylist(m.playlistId!)}/>
        </View>
      </View>;
    }else{
      corpo=<View style={{flexDirection:'row',alignItems:'flex-end',gap:6,alignSelf:minha?'flex-end':'flex-start',maxWidth:'92%'}}>
        {/* A cara de quem falou, ao lado do balão: só do lado dele, e só na
            última de um grupo -- nas outras fica o espaço, para alinharem. */}
        {!minha?(fimDoGrupo?<Pressable onPress={()=>onProfile(m.sender.id)} accessibilityLabel={`View ${m.sender.name}`} style={{marginBottom:2}}>
          <FriendAvatar avatarUrl={m.sender.avatarUrl} name={m.sender.name} size={26}/>
        </Pressable>:<View style={{width:26}}/>):null}
        <View style={{flexShrink:1,gap:5}}>
        <MessageBubble own={minha} aberto={aReagir===m.id} onAbrir={()=>setAReagir(a=>a===m.id?null:m.id)}
          onResponder={()=>responderA(m)} onDuploToque={()=>void reagir(m.id,'❤️')}
          rotulo={`Message from ${m.sender.name}. Double-tap to like, hold to react or reply`}
          style={{
            // `theme.soft` e nao `accent` puro: o accent pode ser CLARO (o do
            // Joao e branco), e texto branco num balao branco nao se le.
            backgroundColor:minha?tema.soft:colors.surface,
            // Sem borda (9/10): era o balão com uma moldura e o cartão com outra.
            borderWidth:destacada===m.id?1:0,
            borderColor:accent,
            paddingHorizontal:m.trackData||m.playlistId?10:13,paddingVertical:m.trackData||m.playlistId?10:9,borderRadius:20,gap:8,
            // O canto cortado do lado de quem fala, só na última do grupo.
            ...(fimDoGrupo?{[minha?'borderBottomRightRadius':'borderBottomLeftRadius']:6}:{}),
          }}>
        {citacao(m)}
        {!!m.message&&<Text selectable style={[s.text,{flexShrink:1,paddingHorizontal:m.trackData||m.playlistId?3:0}]}>{m.message}</Text>}
        {m.trackData&&<FaixaPartilhada faixa={m.trackData} minha={minha} onPress={()=>setTrack(m.trackData)}
          onTocar={()=>void usePlayer.getState().tocarMusica(m.trackData!,undefined,true)}/>}
        {m.playlistId&&<SharedPlaylistCard semFundo playlist={playlistsDoChat.get(m.playlistId)} onPress={()=>onPlaylist(m.playlistId!)}/>}
        </MessageBubble>
        <ReactionRow reactions={reacoes.get(m.id)??[]} myId={myId} own={minha}
          aberto={aReagir===m.id} onEscolher={emoji=>void reagir(m.id,emoji)} onFechar={()=>setAReagir(null)}
          onResponder={()=>responderA(m)}/>
        {/* A hora exata, com o toque longo (saiu dos balões). */}
        {aReagir===m.id?<Text style={[s.muted,{fontSize:11,alignSelf:minha?'flex-end':'flex-start'}]}>{horaCurta(new Date(m.createdAt))}</Text>:null}
        </View>
      </View>;
    }
    return <View style={{paddingTop:comAAntiga?2:(group?6:12)}}>
      {separador?<Text style={estiloDoSeparador}>{separador}</Text>:null}
      {corpo}
    </View>;
  };
  const chat=<View style={{flex:1,minHeight:0}}>
      {web&&groupHeader}
      <View style={{flex:1,minHeight:0,padding:web?24:16,gap:12}}>
        {!web&&<FundoDaApp/>}
        {/* No PC a conversa só dizia o nome (João, 26/9: "devia ter a imagem dele em cima").
            A cara com a bolinha de online, o nome e, por baixo, o estado ou o que está a
            ouvir -- o mesmo que o CabecalhoDoAmigo dá no iPhone. Clicar abre o perfil. */}
        {web&&!group&&<View style={s.row}>
          <Pressable accessibilityRole="button" accessibilityLabel={`View ${title}`} disabled={!friend} onPress={()=>friend&&onProfile(friend.friendId)}
            style={{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:12}}>
            <View>
              <FriendAvatar avatarUrl={friend?.avatarUrl??null} name={title} size={40}/>
              {friend?.online?<View style={{position:'absolute',right:-1,bottom:-1,width:12,height:12,borderRadius:6,backgroundColor:'#3ECF6E',borderWidth:2,borderColor:colors.bg}}/>:null}
            </View>
            <View style={{flex:1,minWidth:0}}>
              <Text numberOfLines={1} style={s.title}>{title}</Text>
              {friend?<Text numberOfLines={1} style={[s.muted,friend.currentlyPlaying&&{color:accent}]}>
                {friend.currentlyPlaying?`♫ ${tituloDaFaixa(friend.currentlyPlaying)} · ${displayArtist(friend.currentlyPlaying)}`
                  :friend.online?'Online now':ultimaAtividade(friend.lastSeenAt,social.now)}
              </Text>:null}
            </View>
          </Pressable>
          <SocialIconButton label="Back to chats" icon={split?'close':'chevron-back'} onPress={closeChat}/>
        </View>}
        {!!error&&<Text style={s.error}>{error}</Text>}{chatLoading&&<ActivityIndicator color={accent}/>}
        {group&&!chatLoading&&!messages.length&&!error?<View style={{flex:1,justifyContent:'center'}}><GroupEmptyState group={group}/></View>:
        <FlatList ref={lista} inverted onScrollToIndexFailed={info=>{
          // A original ainda não foi medida (fora do que a lista desenhou):
          // aproxima-se pela altura média e tenta-se outra vez.
          lista.current?.scrollToOffset({offset:info.averageItemLength*info.index,animated:true});
          setTimeout(()=>lista.current?.scrollToIndex({index:info.index,animated:true,viewPosition:0.5}),250);
        }} ListFooterComponent={hasOlder?<SocialButton disabled={older} onPress={()=>void loadOlder()}>{older?'Loading…':'Older messages'}</SocialButton>:null} data={ordered} keyExtractor={m=>m.id} contentContainerStyle={{paddingVertical:10,paddingHorizontal:web?10:0}} style={{flex:1}} keyboardShouldPersistTaps="handled" renderItem={({item:m,index})=>desenharMensagem(m,index)}/>}
        {aResponder&&<BarraDeResposta accent={accent} excerto={excerto(aResponder)}
          titulo={aResponder.sender.id===myId?'Replying to yourself':`Replying to ${aResponder.sender.name}`}
          onCancelar={()=>setAResponder(null)}/>}
        {group?<GroupComposer campoRef={campo} value={draft} onChange={setDraft} busy={busy} onSend={()=>void send()}/>:
          <View style={[s.row,{alignItems:'flex-end'}]}><Pressable accessibilityRole="button" accessibilityLabel="Send music" onPress={()=>setEnviarMusica(true)}
            style={({pressed}:any)=>[{width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,0.08)'},pressed&&{opacity:0.7}]}>
            <Ionicons name="add" size={22} color={colors.text}/></Pressable><TextInput ref={campo} accessibilityLabel="Message" placeholder="Message…" placeholderTextColor={colors.textSecondary} value={draft} onChangeText={setDraft} multiline maxLength={4000} style={[s.input,{flex:1,maxHeight:90}]} editable={!busy}
            {...({onKeyPress:(e:any)=>{const evento=e?.nativeEvent??e;if(!web||evento?.key!=='Enter'||evento?.shiftKey||evento?.isComposing)return;e.preventDefault?.();evento.preventDefault?.();if(!busy&&draft.trim())void send();}} as any)}/>{draft.trim()||!aTocar?<SocialButton primary disabled={busy||!draft.trim()} onPress={()=>void send()}>Send</SocialButton>
            :<Pressable accessibilityRole="button" accessibilityLabel={`Send what you're playing: ${tituloDaFaixa(aTocar)}`} disabled={busy} onPress={()=>void enviarItem('track',aTocar)}
              style={({pressed}:any)=>[{width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:accent},pressed&&{opacity:0.75}]}>
              <Ionicons name="musical-note" size={18} color={textoSobre(accent)}/></Pressable>}</View>}
      </View></View>;

  return <View style={s.body} onLayout={e=>setWidth(e.nativeEvent.layout.width)}>
    {conversationTarget ? <View style={{flex:1,minHeight:0}}>
      {groupHeader??amigoHeader??<View style={s.row}><SocialIconButton label="Back to chats" icon="chevron-back" onPress={closeChat}/><Text style={s.title}>{title}</Text></View>}
      {chat}
    </View> : <View style={{flex:1,minHeight:0,flexDirection:split?'row':'column',paddingHorizontal:web?SOCIAL_GUTTER:24,gap:split?24:0,paddingBottom:web?24:0}}>
      {(!web||split||!conversation)&&<View style={{flex:split?undefined:1,width:split?300:undefined,minHeight:0}}>{list}</View>}
      {web&&(split||!!conversation)&&<View style={{flex:1,minWidth:0,minHeight:0,borderWidth:1,borderColor:colors.borderStrong,borderRadius:14,overflow:'hidden'}}>
        {conversation?chat:<View style={{flex:1,alignItems:'center',justifyContent:'center',padding:24,gap:12}}><Ionicons name="chatbubbles-outline" size={36} color={colors.textSecondary}/><Text style={s.title}>Your conversations</Text><Text style={[s.muted,{textAlign:'center'}]}>Choose a friend or group to open a conversation.</Text></View>}
      </View>}
    </View>}

    {/* Procurar gente deixou de ser um separador ao lado das conversas: e uma
        coisa que se faz de vez em quando, e agora vive atras do icone. */}
    {/* O que o `+` abre. Duas accoes, uma intencao -- comecar uma conversa
        nova. Ter as duas sempre a vista custava um icone e uma pilula no topo
        de uma pagina que e uma lista. */}
    <SocialModal visible={comecar&&visible} title="Start a conversation" onClose={()=>setComecar(false)}>
      <View style={{padding:20,gap:12}}>
        <SocialButton icon="person-add-outline" onPress={()=>{setComecar(false);setTab('add');}}>Add a friend</SocialButton>
        <SocialButton icon="people-outline" onPress={()=>{setComecar(false);setGroupEditor('new');setMembers([]);setGroupName('');}}>New group</SocialButton>
      </View>
    </SocialModal>
    <SocialModal visible={tab==='add'&&visible} title="Find people" onClose={()=>{setTab('friends');setQuery('');}}>
      <View style={{padding:20,gap:12}}>
        <Text style={s.muted}>Search by name or username.</Text>
        <TextInput accessibilityLabel="Search people" value={query} onChangeText={setQuery} style={s.input} placeholder="Name or username" placeholderTextColor={colors.textSecondary} autoCapitalize="none" autoFocus/>
        {results.map(p=><View key={p.id} style={s.conversa}>
          <Pressable onPress={()=>onProfile(p.id)}><FriendAvatar avatarUrl={p.avatar_url} name={p.name} size={44}/></Pressable>
          <View style={{flex:1,minWidth:0,gap:2}}>
            <Text numberOfLines={1} style={[s.text,{fontWeight:'600'}]}>{p.name}</Text>
            <Text numberOfLines={1} style={s.muted}>@{p.username}</Text>
          </View>
          <SocialButton disabled={busy||social.friends.some(f=>f.friendId===p.id)} onPress={()=>void run(()=>sendFriendRequest(p.id))}>{social.friends.some(f=>f.friendId===p.id)?'Added':'Add'}</SocialButton>
        </View>)}
        {!results.length&&!!query.trim()&&<Text style={s.muted}>Nobody with that name.</Text>}
      </View>
    </SocialModal>

    <SocialModal visible={!!detailedGroup&&visible} title="Group details" onClose={()=>setGroupDetails(null)}>
      {detailedGroup&&<GroupDetails group={detailedGroup} myId={myId} onProfile={id=>{setGroupDetails(null);onProfile(id);}}
        onAdd={()=>{setMembers([]);setError('');setGroupEditor(detailedGroup.id);setGroupDetails(null);}}
        onLeave={()=>{setError('');setConfirm({id:detailedGroup.id,group:true});setGroupDetails(null);}}/>}
    </SocialModal>

    {!web&&<OpcoesDoAmigo amigo={menuDoAmigo?social.friends.find(f=>f.friendId===menuDoAmigo.id)??null:null} ancora={menuDoAmigo?.ancora??null}
      aoFechar={()=>setMenuDoAmigo(null)} aoMensagem={id=>open('friend',id)} aoPerfil={onProfile} aoPedirRemover={id=>setConfirm({id,group:false})}/>}
    <SocialModal visible={!!confirm} title={confirm?.conversa?'Delete conversation?':confirm?.group?'Leave group?':'Remove friend?'} onClose={()=>setConfirm(null)}><View style={{padding:20,gap:12}}><Text style={s.muted}>{confirm?.conversa?'The messages are deleted for good, on both sides. This cannot be undone.':'Earlier messages stay saved.'}</Text><SocialButton danger disabled={busy} onPress={()=>void run(async()=>{if(!confirm)return;if(confirm.conversa)await apagarConversa(confirm.id);else if(confirm.group)await sairDoGrupo(confirm.id);else await declineOrRemoveFriendship(confirm.id);setConfirm(null);closeChat();})}>{confirm?.conversa?'Delete':'Confirm'}</SocialButton><SocialButton quiet onPress={()=>setConfirm(null)}>Cancel</SocialButton></View></SocialModal>
    {/* O mesmo cartao com avatar, nome e @username que a lista de amigos usa.
        Estava aqui uma coluna de botoes centrados com um visto colado ao nome
        -- que nao mostrava quem era a pessoa, nao dizia quantos iam escolhidos,
        e nao se parecia com nada no resto da app. */}
    <SocialModal visible={!!groupEditor} title={groupEditor==='new'?'New group':'Add people'} onClose={()=>setGroupEditor(null)}>
      <ScrollView style={{flexShrink:1}} contentContainerStyle={{padding:20,gap:12}} keyboardShouldPersistTaps="handled">
        {groupEditor==='new'&&<TextInput accessibilityLabel="Group name" value={groupName} onChangeText={setGroupName} maxLength={60} placeholder="Group name" placeholderTextColor={colors.textSecondary} style={s.input}/>}
        {(() => {
          const escolhiveis=accepted.filter(f=>groupEditor==='new'||!social.groups.find(g=>g.id===groupEditor)?.membros.some(m=>m.id===f.friendId));
          if(!escolhiveis.length)return <Text style={s.muted}>{groupEditor==='new'?'Add a friend before you can start a group.':'Everyone you know is already in this group.'}</Text>;
          return <>
            <Text style={s.label}>{members.length?`Selected · ${members.length}`:'Choose who goes in'}</Text>
            {escolhiveis.map(f=>{
              const escolhido=members.includes(f.friendId);
              return <Pressable key={f.friendId} accessibilityRole="checkbox" accessibilityState={{checked:escolhido}} style={[s.card,s.row]} onPress={()=>setMembers(m=>m.includes(f.friendId)?m.filter(id=>id!==f.friendId):[...m,f.friendId])}>
                <FriendAvatar avatarUrl={f.avatarUrl} name={f.name} size={40}/>
                <View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={s.text}>{f.name}</Text><Text numberOfLines={1} style={s.muted}>@{f.username}</Text></View>
                <Ionicons name={escolhido?'checkmark-circle':'ellipse-outline'} size={24} color={escolhido?accent:colors.textSecondary}/>
              </Pressable>;
            })}
          </>;
        })()}
        <SocialButton primary disabled={busy||!members.length||(groupEditor==='new'&&!groupName.trim())} onPress={()=>void run(async()=>{if(groupEditor==='new')await criarGrupo(groupName,members);else if(groupEditor)await acrescentarAoGrupo(groupEditor,members);setGroupEditor(null);})}>{groupEditor==='new'?'Create group':'Add to group'}</SocialButton>
        {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      </ScrollView>
    </SocialModal>
    <SocialTrackActions track={track} onClose={()=>setTrack(null)} onArtist={onArtist}/>
    <EnviarMusica visible={enviarMusica&&!!conversation} onClose={()=>setEnviarMusica(false)} onEnviar={(tipo,item)=>void enviarItem(tipo,item)}/>
  </View>;
}

function mergeMessages(previous:SharedItem[],incoming:SharedItem[]):SharedItem[]{
  const map=new Map(previous.map(m=>[m.id,m]));incoming.forEach(m=>map.set(m.id,m));
  return [...map.values()].sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)||a.id.localeCompare(b.id));
}
