import { PainelDoLeitor } from '../desktop/PainelDoLeitor.web';
import { SeparadorDaLateral } from '../desktop/SeparadorDeLargura.web';
import { TransicaoDePagina } from '../desktop/TransicaoDePagina.web';
import { viagemChegou, voltarViajando } from '../desktop/viagem.web';
import { retratosDaVolta } from '../lib/retratosQueViajam';
import { MenuDeContexto, ultimoClique, type PontoNoEcra } from '../desktop/MenuDeContexto.web';
import { RetrospetivaPage } from '../desktop/paginas/RetrospetivaPage.web';
import { VocesOsDoisPage } from '../desktop/paginas/VocesOsDoisPage.web';
import { nomeDaRota } from '../lib/voltarPara';
import { ShareFriendSheet } from '../components/ShareFriendSheet';
import { RecommendationPreferences } from '../components/RecommendationPreferences';
import React, { ReactNode, useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { removeTrackFromPlaylist } from '../api/playlists';
import { EscolherPlaylist } from '../desktop/EscolherPlaylist.web';
import { criarEPor, porNaPlaylist } from '../desktop/porNaPlaylist.web';
import { avisos, type AvisoDeRemocao } from '../lib/avisoDeRemocao';
import { CamadaDoArrasto } from '../desktop/Arrastar.web';
import { PreEscutaDoRefrao } from '../desktop/PreEscutaDoRefrao.web';
import { AvisoComDesfazer } from '../desktop/AvisoComDesfazer.web';
import { removeFromLibrary, saveToLibrary, checkIsSaved } from '../api/library';
import type { OrigemDaFila } from '../lib/origemDaFila';
import { savedKey, useSaved } from '../state/saved';
import { garantirGuardadas } from '../lib/guardarFaixa';
import { useRecomendacoes } from '../state/recomendacoes';
import { useDesktopNotifications } from '../hooks/useDesktopNotifications';
import { useSocial } from '../state/social';
import { NotificationBanner } from '../components/NotificationBanner';
import { HandoffBanner } from '../components/HandoffBanner';
import { endSession, publishSession, publishSessionNow } from '../lib/sessionSync';
import { useAutoplayRadio } from '../lib/radioSync';
import { RotuloDoVoltar, Artwork, Button, Field, Loading, marcar, Toast } from '../desktop/ui.web';
import { COR } from '../desktop/tokens.web';
import { styles } from '../desktop/estilos.web';
import { SpotifyImportPage } from '../desktop/SpotifyImportPage.web';
import { useAuth } from '../state/auth';
import { contextoDaRecomendacaoAtual, usePlayer } from '../state/player';
import { usePresencaDoDiscord } from '../hooks/usePresencaDoDiscord';
import { useSincroniaDaSessao } from '../hooks/useSincroniaDaSessao';
import { getCorNaJanela, getDiscordRichPresence, getDoisTons, type CorDoLeitor } from '../lib/prefs';
import { definirDoisTons } from '../desktop/doisTons.web';
import { FundoDaCapa } from '../desktop/FundoDaCapa.web';
import { sessaoDoSegredoDiscord } from '../lib/presencaDoDiscord';
import { registar } from '../lib/eventos';
import { BarreiraDeErros } from '../components/BarreiraDeErros';
import { anotarEcra } from '../state/saudeDaApp';
import { contextoParaAnalytics, type DiscoveryContext } from '../lib/contextoDaDescoberta';
import { menuDaFaixa, type IdDaAcao } from '../lib/menuDaFaixa';
import { useConnectivity } from '../state/connectivity';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { usePrivacidade } from '../state/privacidade';
import { useTheme } from '../state/theme';
import type { Track } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { SocialPage } from '../desktop/paginas/SocialPage.web';

import { SettingsPage } from '../desktop/paginas/SettingsPage.web';
import { LibraryCheckPage } from '../desktop/paginas/LibraryCheckPage.web';
import { JanelaDoJam } from '../desktop/JanelaDoJam.web';

import { ProfilePage, StatsPage } from '../desktop/paginas/ProfilePage.web';

import { ArtistPage, ArtistsPage, MisturaPage, SearchPage, SongsPage } from '../desktop/paginas/BibliotecaPages.web';

import { PlaylistPage, PlaylistsPage } from '../desktop/paginas/PlaylistPages.web';

import { ImportPage } from '../desktop/paginas/ImportPage.web';

import { NowPlayingPage } from '../desktop/paginas/NowPlayingPage.web';

import { injectDesktopDocumentStyles, PlayerBar, Sidebar, TitleBar } from '../desktop/casca.web';
import { useDicas } from '../desktop/useDicas.web';
import { SAIDA_DO_LEITOR_MS, useSaida } from '../desktop/useSaida.web';
import { useFotoDoArtista } from '../hooks/useVizinhancaDoArtista';
import { fotoNoTamanho } from '../lib/catalogo';
import { usePonteDoLeitor } from '../desktop/usePonteDoLeitor.web';
import { useAtalhosDaJanela } from '../desktop/useAtalhosDaJanela.web';
import { useBarraDeTarefas } from '../desktop/useBarraDeTarefas.web';
import { ModoLimpo } from '../desktop/ModoLimpo.web';
import { BoasVindasPc } from '../desktop/BoasVindasPc.web';
import { type OrigemDoMenu, type Route, type ShareTarget } from '../desktop/rotas';
import { rotaNoPc, type Destino } from '../lib/destinos';
import { DestinosProvider } from './destinos';
import { AVISO_DO_NAO_INTERESSA, eSugestao, naoInteressa } from '../state/naoInteressa';
const V = View as any;

function AuthDesktop() {
  const signIn = useAuth((s) => s.signIn); const signUp = useAuth((s) => s.signUp);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin'); const [identifier, setIdentifier] = useState(''); const [email, setEmail] = useState(''); const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  // `finally`: um pedido que atire (rede a cair a meio) deixava o botão preso em "Please wait…".
  const submit = async () => { setBusy(true); setError(null); try { const message = mode === 'signin' ? await signIn(identifier, password) : await signUp(email, password, username); setError(message); } catch { setError('Could not reach Duotone. Check your connection and try again.'); } finally { setBusy(false); } };
  return <View style={styles.auth}><View style={styles.authGlow} /><View style={styles.authCard}><View style={[styles.authLogo, { alignItems: 'center', gap: 12, flexDirection: 'row' }]}><Image source={require('../../assets/auth-logo.png')} style={{ width: 44, height: 44 }} resizeMode="contain" /></View><Text style={styles.authTitle}>Your music, in one place.</Text><Text style={styles.authBody}>Sign in to your Duotone library and continue listening across devices.</Text><View style={styles.segment}><Pressable onPress={() => setMode('signin')} style={[styles.segmentItem, mode === 'signin' && styles.segmentActive]}><Text style={styles.segmentText}>Sign in</Text></Pressable><Pressable onPress={() => setMode('signup')} style={[styles.segmentItem, mode === 'signup' && styles.segmentActive]}><Text style={styles.segmentText}>Create account</Text></Pressable></View>
    <View style={{ gap: 12 }}>{mode === 'signin' ? <Field icon="mail-outline" placeholder="Email" value={identifier} onChangeText={setIdentifier} onSubmitEditing={submit} keyboardType="email-address" /> : <><Field icon="person-outline" placeholder="Username" value={username} onChangeText={setUsername} /><Field icon="mail-outline" placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" /></>}<Field icon="lock-closed-outline" placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry onSubmitEditing={submit} />{error && <Text style={styles.error}>{error}</Text>}<Button onPress={submit} ocupado={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</Button></View></View><Text style={styles.authFoot}>Duotone for Windows</Text></View>;
}

/** Atualiza as variáveis CSS sem voltar a renderizar a casca e a página. */
function ThemeCssSync({panelOpacity}:{panelOpacity:number}) {
  const color=useTheme(s=>s.theme.color);
  useEffect(()=>{
    document.documentElement.style.setProperty('--accent-color',color);
    document.documentElement.style.setProperty('--panel-opacity',String(panelOpacity));
  },[color,panelOpacity]);
  return null;
}

function DesktopShell() {
  // No iPhone este seguidor vive no PlayerRoot. O Windows tem uma barra e um
  // player próprios, portanto tem de o montar aqui: sem ele a pessoa entrava
  // na sala e aparecia na lista, mas a faixa da sessão nunca chegava ao player
  // local — ficava eternamente em "Loading · 0%" e todos os toques passavam a
  // ser interpretados como sugestões para o Jam.
  useSincroniaDaSessao();
  const [route, setRoute] = useState<Route>({ name: 'search' }); const history = useRef<Route[]>([]); const [toast, setToast] = useState('');
  // Só o nome da página: os parâmetros (ids, nomes de artistas) são conteúdo.
  useEffect(() => { anotarEcra(route.name); }, [route.name]);
  // Uma rota nova acabou de entrar: se havia uma viagem a meio (o mosaico de uma playlist), cumpre-se (30/10).
  useEffect(() => { viagemChegou(); }, [route]);
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [jamOpen, setJamOpen] = useState(false);
  // O Now Playing também SAI (20/10): fica montado a apagar-se enquanto a
  // página de baixo (ou a nova) aparece, e a cor da capa apaga-se na janela.
  const saidaDoLeitor = useSaida(nowPlayingOpen, SAIDA_DO_LEITOR_MS);
  // A app tem de parecer instantânea (27/9). A rota muda em duas velocidades:
  // a da LATERAL no próprio clique (o realce anda logo), e a da PÁGINA numa
  // transição do React -- a nova monta-se sem congelar a janela, e a antiga
  // fica até ela estar pronta. `rotaRef` é a verdade entre as duas: o histórico
  // escreve-se aqui, e não dentro de um `setRoute(fn)`, que numa transição o
  // React pode chamar mais de uma vez.
  const rotaRef = useRef<Route>(route);
  const [rotaDaLateral, setRotaDaLateral] = useState<Route>(route);
  // Enquanto a página nova se prepara, a de agora esbate-se (30/9, a passagem
  // entre páginas do `TransicaoDePagina`): o "pendente" da transição diz quando.
  const [aMudarDePagina, startTransition] = useTransition();
  // `fecharLeitor`: o Now Playing fecha DENTRO da mesma transição (30/9). Fechado
  // à parte, fechava logo e a página nova só chegava depois: durante um ou dois
  // fotogramas via-se a de ANTES por baixo dele (Artists -> Now Playing -> Liked
  // Songs mostrava os Artists antes das Liked Songs).
  // `volta`: a página chega calada (30/10, o "refresh" ao voltar): sem repetir a entrada. Vai na
  // mesma transição que a rota, para a página nova nascer já com a marca.
  const [chegouDeVolta, setChegouDeVolta] = useState(false);
  const mudarRota = useCallback((next: Route, { fecharLeitor = false, volta = false } = {}) => {
    rotaRef.current = next;
    setRotaDaLateral(next);
    startTransition(() => {
      setRoute(next);
      setChegouDeVolta(volta);
      if (fecharLeitor) setNowPlayingOpen(false);
    });
  }, []);
  const abrirSocial = useCallback((conversation?:{friendId?:string;groupId?:string}) => {
    // Also select directly: the route can already have this friendId while
    // SocialHub is displaying a different conversation opened from its list.
    if (conversation?.groupId) useSocial.setState({conversation:{kind:'group',id:conversation.groupId}});
    else if (conversation?.friendId) useSocial.setState({conversation:{kind:'friend',id:conversation.friendId}});
    setJamOpen(false);
    const next: Route = { name: 'social', ...conversation };
    // Já na conversa: não há página nova à espera, o leitor fecha já.
    if (JSON.stringify(rotaRef.current) === JSON.stringify(next)) { setNowPlayingOpen(false); return; }
    mudarRota(next, { fecharLeitor: true });
  }, [mudarRota]);
  useDesktopNotifications(abrirSocial, () => {
    if (route.name !== 'social' || nowPlayingOpen || jamOpen) return null;
    const conversation = useSocial.getState().conversation;
    return conversation ? (conversation.kind === 'group' ? `group:${conversation.id}` : conversation.id) : null;
  });
  /**
   * A presenca do Discord vive na casca, e nao numa pagina.
   *
   * Publicar o que esta a tocar nao pode depender de se estar no Now Playing:
   * a musica continua com a app em qualquer seccao, e a presenca tem de a
   * acompanhar. As preferencias sao lidas uma vez e depois vem por evento,
   * como o modo do glitch -- as Definicoes sao outra pagina e esta fica montada.
  */
  const [discordOn,setDiscordOn]=useState(false);
  const discordApp=window.duotoneDesktop?.discordApplicationId??'';
  const discordUserId=useAuth((s)=>s.session?.user.id??null);
  useEffect(()=>{
    void getDiscordRichPresence().then(setDiscordOn);
    const ouvir=(e:any)=>{setDiscordOn(!!e.detail?.on);};
    window.addEventListener('duotone:discord',ouvir);
    return ()=>window.removeEventListener('duotone:discord',ouvir);
  },[]);
  // A escuta privada cala o Discord também. Espera-se pela preferência: ligar
  // o Discord no arranque e só depois saber que a pessoa é privada publicava
  // a faixa no perfil dela durante esse instante.
  const privada=usePrivacidade((s)=>s.privada||!s.carregada);
  usePresencaDoDiscord(discordOn&&!privada,discordApp);
  // O que o indicador do leitor diz: se o Discord está mesmo a publicar.
  const discordLigado=discordOn&&!!discordApp&&!!window.duotoneDesktop?.definirPresencaNoDiscord;
  useEffect(()=>{
    const ouvir=window.duotoneDesktop?.onDiscordJoin;
    if(!ouvir)return;
    let aEntrar=false;
    return ouvir((segredo)=>{
      const sessao=sessaoDoSegredoDiscord(segredo);
      registar('discord_join_recebido', { valido: !!sessao });
      if(!sessao){setToast('This Discord invite is not valid.');return;}
      const actual=useOuvirJuntos.getState();
      if(actual.sessao?.id===sessao){setToast('You are already in this Jam.');return;}
      if(aEntrar)return;
      aEntrar=true;
      void (async()=>{
        try{
          // Um convite pode ter aberto a aplicação no ecrã de login. Quando o
          // utilizador entra, a fila do preload entrega-o antes do efeito raiz
          // ter tempo de ligar a store; garantimos aqui que ela já tem dono.
          if(!useOuvirJuntos.getState().euId&&discordUserId)await useOuvirJuntos.getState().ligar(discordUserId);
          await useOuvirJuntos.getState().juntarSe(sessao, 'discord');
          setToast('Joined the Jam from Discord.');
        }catch{
          setToast('Could not join this Jam. You must be Duotone friends and the Jam must still be open.');
        }finally{aEntrar=false;}
      })();
    });
  },[discordUserId]);
  const [trackMenu, setTrackMenu] = useState<Track | null>(null);
  /** O "Add to playlist" do Now Playing: o painel das playlists sozinho, no botão. */
  const [escolhaSolta, setEscolhaSolta] = useState<{ faixa: Track; rato: PontoNoEcra } | null>(null);
  const [trackMenuOpen, setTrackMenuOpen] = useState(false);
  const [recommendationTrack,setRecommendationTrack]=useState<Track|null>(null);
  const [recommendationContext,setRecommendationContext]=useState<DiscoveryContext|null>(null);
  const [trackMenuContext,setTrackMenuContext]=useState<DiscoveryContext|null>(null);
  const [pontoDoMenu, setPontoDoMenu] = useState<PontoNoEcra>({ x: 0, y: 0 });
  // Partilhar é a MESMA janela em toda a app (5/10, auditoria M2): a
  // `ShareFriendSheet`, que no PC é um diálogo. Havia uma segunda aqui, com
  // outro título e sem o "Listen together".
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  // O estado "guardada" do menu vem do conjunto em memória (16/10, auditoria
  // 9), como no iPhone: perguntava ao servidor a cada menu (dois pedidos), e o
  // menu abria com "Checking your library…" numa música que já se tinha -- e
  // uma falha dava-a como por guardar. `null` só antes da primeira leitura.
  const guardadasLidas = useSaved((s) => s.loaded);
  const isSaved = useSaved((s) => (trackMenu ? s.keys.has(savedKey(trackMenu)) : false));
  /** O índice real na fila, quando o menu abriu numa linha da fila. */
  const [trackMenuFila, setTrackMenuFila] = useState<number | null>(null);
  /** A playlist, quando o menu abriu numa linha dela, e o papel real da pessoa
   *  (16/10, auditoria 6): era a rota de fundo a decidir, com `podeEditar:
   *  true` sempre -- um leitor via "Remove from this playlist", que a RLS
   *  recusava, e o menu do leitor ou do painel herdava-o da página de baixo. */
  const [trackMenuPlaylist, setTrackMenuPlaylist] = useState<OrigemDoMenu['playlist'] | null>(null);
  const [trackMenuLeitor, setTrackMenuLeitor] = useState<OrigemDoMenu['leitor'] | null>(null);
  const semRede = useConnectivity((s) => s.offline);
  const emJam = useOuvirJuntos((s) => !!s.sessao);
  const filaDoLeitor = usePlayer((s) => s.queue);
  const indiceDoLeitor = usePlayer((s) => s.queueIndex);

  // Não subscrever a casca inteira ao store: `positionMs` muda durante toda
  // a reprodução e fazia voltar a renderizar navegação, página, diálogos e
  // sidebar só para a barra avançar. Cada consumidor de progresso subscreve-o
  // diretamente (PlayerBar/HandoffBanner).
  const currentTrack = usePlayer((s) => s.current);
  const isPlayingState = usePlayer((s) => s.isPlaying);
  const queueIndex = usePlayer((s) => s.queueIndex);

  // O coração da música que toca também (16/10): eram dois pedidos por
  // música, e um "não" a cada falha de rede. As mudanças deste aparelho chegam
  // pelo `markSaved`; as do outro, relendo o conjunto (um pedido) quando a
  // janela volta à frente, no máximo de 10 em 10 min.
  const currentIsSaved = useSaved((s) => (currentTrack ? s.keys.has(savedKey(currentTrack)) : false));
  useEffect(() => {
    garantirGuardadas();
    let lidaEm = Date.now();
    const aFrente = () => {
      if (Date.now() - lidaEm < 10 * 60_000) return;
      lidaEm = Date.now();
      void useSaved.getState().refresh();
    };
    window.addEventListener('focus', aFrente);
    return () => window.removeEventListener('focus', aFrente);
  }, []);

  // Otimista (24/9): o coração muda no clique, e só volta atrás se o servidor
  // recusar. Esperava por três idas à rede -- perguntar, gravar e reler --
  // antes de mexer. É o que o coração do iPhone já fazia.
  const aGuardarAtual = useRef(false);
  const toggleSaveCurrent = async () => {
    if (!currentTrack || aGuardarAtual.current) return;
    aGuardarAtual.current = true;
    const faixa = currentTrack;
    const tirar = currentIsSaved;
    useSaved.getState().markSaved(faixa, !tirar);
    try {
      if (tirar) {
        const { trackId } = await checkIsSaved(faixa.source, faixa.sourceId);
        const idToRemove = trackId || faixa.id;
        if (idToRemove) await removeFromLibrary(idToRemove);
        notify('Removed from Liked Songs.');
      } else {
        await saveToLibrary(faixa);
        const contexto=contextoDaRecomendacaoAtual();
        if(contexto)registar('recomendacao_guardada',contextoParaAnalytics(contexto));
        notify('Added to Liked Songs.');
      }
      window.dispatchEvent(new Event('duotone:refresh-library'));
    } catch (e: any) {
      useSaved.getState().markSaved(faixa, tirar);
      notify(e?.message || 'Could not update library.');
    } finally {
      aGuardarAtual.current = false;
    }
  };

  const [panelOpacity, setPanelOpacity] = useState(0.72);
  // Diálogos usam o destino estável. A animação CSS vive no componente
  // minúsculo abaixo e deixa de redesenhar toda a aplicação dez vezes.

  // O caminho para a FRENTE, como num browser (27/9: os botões laterais do rato
  // andam para trás e para a frente). `voltar` enche-o; navegar para um sítio
  // novo esvazia-o. `'leitor'` é o Now Playing, que é uma camada e não uma rota.
  const futuro = useRef<(Route | 'leitor')[]>([]);
  const navigate = useCallback((next: Route) => {
    futuro.current = [];
    if (next.name === 'now-playing') {
      // O leitor é uma camada: a página de origem continua montada por baixo,
      // com scroll, pesquisa e ordenação exatamente onde estavam.
      setNowPlayingOpen(true);
      return;
    }
    // Carregar duas vezes no mesmo sítio não é navegar. Sem isto o histórico
    // enchia-se de repetições e o voltar ficava a pedir cliques para não sair
    // do mesmo ecrã. Com o leitor aberto, fecha-o e mostra a página de baixo.
    const atual = rotaRef.current;
    if (JSON.stringify(atual) === JSON.stringify(next)) { setNowPlayingOpen(false); return; }
    history.current.push(atual);
    mudarRota(next, { fecharLeitor: true });
  }, [mudarRota]);
  const back = useCallback(() => {
    if (nowPlayingOpen) { setNowPlayingOpen(false); futuro.current.push('leitor'); return; }
    const de = rotaRef.current;
    futuro.current.push(de);
    const para: Route = history.current.pop() || { name: 'playlists' };
    // Da página de uma playlist ou de um artista de volta à grelha dele (30/10): o cabeçalho
    // voa para o cartão. Qualquer outro caminho volta como sempre.
    voltarViajando(retratosDaVolta(de, para), () => mudarRota(para, { volta: true }));
  }, [nowPlayingOpen, mudarRota]);
  /** O botão de trás do rato: como o `back`, mas sem histórico não faz nada
   * (o `back` das páginas cai nas Playlists, que é o que o botão delas diz). */
  const voltarPeloRato = useCallback(() => {
    if (!nowPlayingOpen && history.current.length === 0) return;
    back();
  }, [back, nowPlayingOpen]);
  const avancar = useCallback(() => {
    const seguinte = futuro.current.pop();
    if (!seguinte) return;
    if (seguinte === 'leitor') { setNowPlayingOpen(true); return; }
    history.current.push(rotaRef.current);
    mudarRota(seguinte, { fecharLeitor: true });
  }, [mudarRota]);
  // Os botões laterais do rato (3 = trás, 4 = frente). No `mouseup` e com
  // `preventDefault`: é aí que o Chromium faria a navegação dele, e a janela
  // não tem histórico de browser para onde voltar.
  useEffect(() => {
    const aoLargar = (e: MouseEvent) => {
      if (e.button !== 3 && e.button !== 4) return;
      e.preventDefault();
      if (e.button === 3) voltarPeloRato(); else avancar();
    };
    const engolir = (e: MouseEvent) => { if (e.button === 3 || e.button === 4) e.preventDefault(); };
    window.addEventListener('mouseup', aoLargar);
    window.addEventListener('mousedown', engolir);
    return () => { window.removeEventListener('mouseup', aoLargar); window.removeEventListener('mousedown', engolir); };
  }, [voltarPeloRato, avancar]);
  const notify = useCallback((s: string) => setToast(s), []);
  // Os avisos dos componentes partilhados (avisarFeito/avisarErro/avisarInfo,
  // lib/avisoDeRemocao.ts) só tinham quem os mostrasse no iPhone: no PC
  // calavam-se (o "Invited … to listen" do Social, 24/10). Vão para o toast.
  // Um aviso com "Undo" (24/10: o que se larga ao arrastar) mostra o botão, e
  // dura o que o aviso diz; os outros vão para o toast de sempre.
  const [avisoComDesfazer, setAvisoComDesfazer] = useState<AvisoDeRemocao | null>(null);
  useEffect(() => avisos.ouvir(() => {
    const a = avisos.atual();
    if (a?.desfazer) { setToast(''); setAvisoComDesfazer(a); return; }
    setAvisoComDesfazer(null);
    if (a) setToast(a.detalhe ? `${a.texto} · ${a.detalhe}` : a.texto);
  }), []);
  // Os avisos da Jam (29/9): no iPhone aparecem na barra da sessão; o PC não
  // tinha onde os mostrar -- "You are now the Jam host", "Added · ...", a Jam
  // que acabou. Vão para o mesmo toast do resto da app.
  useEffect(() => useOuvirJuntos.subscribe((agora, antes) => {
    if (agora.aviso && agora.aviso !== antes.aviso) setToast(agora.aviso);
    if (agora.acabouSemAviso && !antes.acabouSemAviso) {
      setToast('The Jam ended.');
      useOuvirJuntos.getState().limparAviso();
    }
  }), []);
  const fecharJam = useCallback(() => setJamOpen(false), []);
  const abrirJam = useCallback(async () => {
    const juntos = useOuvirJuntos.getState();
    if (!juntos.sessao) {
      const track = usePlayer.getState().current;
      if (!track) { notify('Play a song before starting a Jam.'); return; }
      try {
        await juntos.abrir(track, []);
      } catch {
        notify('Could not start the Jam. Check your connection and try again.');
        return;
      }
    }
    setJamOpen(true);
  }, [notify]);
  const play = useCallback((track: Track, queue?: Track[], discoveryContext?:DiscoveryContext, origem?: OrigemDaFila) => {
    usePlayer.getState().playTrack(track, queue, false, false, discoveryContext, origem);
  }, []);
  const tocarMusica = useCallback((track: Track, queue?: Track[], discoveryContext?:DiscoveryContext, origem?: OrigemDaFila) => {
    void usePlayer.getState().tocarMusica(track, queue, false, discoveryContext, origem);
  }, []);

  useEffect(() => {
    const onPlaybackNotice = (event: any) => notify(String(event.detail || 'Playback changed.'));
    window.addEventListener('duotone:playback-notice', onPlaybackNotice);
    return () => window.removeEventListener('duotone:playback-notice', onPlaybackNotice);
  }, [notify]);

  // Evita mandar um delete ao arrancar sem nada a tocar.
  const hadTrackRef = useRef(false);

  // Rádio: abastece a fila antes de ela acabar (ver useAutoplayRadio).
  useAutoplayRadio();

  // Com a janela escondida (tabuleiro ou minimizada) há 30 s, larga-se a cache
  // de memória do Blink -- imagens descodificadas de páginas que já não se
  // veem. Uma vez por cada vez que se esconde (27/9: 700 MB minimizada).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const mudou = () => {
      clearTimeout(t);
      if (document.hidden) t = setTimeout(() => { if (document.hidden) window.duotoneDesktop?.aliviarMemoria?.(); }, 30_000);
    };
    document.addEventListener('visibilitychange', mudou);
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', mudou); };
  }, []);

  // A cor da capa na janela toda enquanto o Now Playing está aberto (26/9).
  // As Definições avisam por evento, como a opacidade.
  const [corDoLeitor, setCorDoLeitor] = useState<CorDoLeitor>('janela');
  // As capas a dois tons: desligadas de origem, e as Definições ligam-nas (30/10).
  useEffect(() => { void getDoisTons().then(definirDoisTons); }, []);
  useEffect(() => {
    void getCorNaJanela().then(setCorDoLeitor);
    const mudou = (e: any) => { if (e.detail === 'janela' || e.detail === 'pagina') setCorDoLeitor(e.detail); };
    window.addEventListener('duotone:cor-na-janela', mudou);
    return () => window.removeEventListener('duotone:cor-na-janela', mudou);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('pref:panelOpacity').then((val) => {
      if (val) setPanelOpacity(Number(val));
    });
  }, []);

  useEffect(() => {
    const handleOpacity = (e: any) => {
      if (e.detail) setPanelOpacity(Number(e.detail));
    };
    window.addEventListener('duotone:panel-opacity', handleOpacity);
    return () => window.removeEventListener('duotone:panel-opacity', handleOpacity);
  }, []);

  // O `irPara` de toda a casca (5/10, lib/destinos.ts): os componentes
  // partilhados e os que vivem fundo na árvore (a barra do leitor, a coluna do
  // artista) navegam por ele. Substituiu o evento global `duotone:navigate`,
  // que era um segundo caminho, sem tipos, para o mesmo `navigate`.
  const irPara = useCallback((destino: Destino) => {
    const rota = rotaNoPc(destino);
    if (rota) navigate(rota as Route);
  }, [navigate]);

  // Guardar a sessão privada ao fechar; a presença tem validade no servidor.
  useEffect(() => {
    const bye = () => { if (usePlayer.getState().current) publishSessionNow(); };
    window.addEventListener('pagehide', bye);
    return () => window.removeEventListener('pagehide', bye);
  }, []);

  // Sessão deste PC, para o telemóvel poder continuar. Mesma assimetria do
  // telemóvel: a fila é independente do estado social.
  useEffect(() => {
    if (currentTrack) publishSession();
    else if (hadTrackRef.current) void endSession();
    hadTrackRef.current = !!currentTrack;
  }, [currentTrack, isPlayingState, queueIndex]);

  // Atalhos globais e mini leitor (desktop/usePonteDoLeitor.web.ts).
  usePonteDoLeitor({ guardarAtual: () => void toggleSaveCurrent(), abrirPesquisa: () => navigate({ name: 'search' }) });
  // A barra de tarefas do Windows: botões na miniatura e lista de saltos (10/10).
  useBarraDeTarefas(notify);
  // Os atalhos DENTRO da janela (Espaço, Ctrl+F, Ctrl+L, setas), que não são
  // os globais: ver lib/atalhosDaJanela.ts. A pesquisa ganha o foco depois de
  // montar -- é ela que ouve o `duotone:focus-search`.
  useAtalhosDaJanela({
    gostar: () => void toggleSaveCurrent(),
    pesquisar: () => {
      navigate({ name: 'search' });
      setTimeout(() => window.dispatchEvent(new Event('duotone:focus-search')), 80);
    },
  });

  // Media Session Keyboard API sync + Electron hardware keys integration
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => {
        usePlayer.getState()._setIsPlaying(true);
        usePlayer.getState()._yt?.play();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        usePlayer.getState()._setIsPlaying(false);
        usePlayer.getState()._yt?.pause();
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        usePlayer.getState().prev();
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        usePlayer.getState().next();
      });
    }

    // Electron hardware key listeners
    const desktop = (window as any).duotoneDesktop;
    if (desktop) {
      const unsubPlayPause = desktop.onMediaKeyPlayPause(() => {
        usePlayer.getState().togglePlay();
      });
      const unsubNext = desktop.onMediaKeyNext(() => {
        usePlayer.getState().next();
      });
      const unsubPrev = desktop.onMediaKeyPrev(() => {
        usePlayer.getState().prev();
      });

      return () => {
        unsubPlayPause();
        unsubNext();
        unsubPrev();
      };
    }
  }, []);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      if (currentTrack) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title,
          artist: displayArtist(currentTrack),
          album: currentTrack.album || 'Duotone',
          artwork: currentTrack.artworkUrl ? [{ src: currentTrack.artworkUrl }] : []
        });
      } else {
        navigator.mediaSession.metadata = null;
      }
    }
  }, [currentTrack]);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlayingState ? 'playing' : 'paused';
    }
  }, [isPlayingState]);

  // **As recomendacoes comecam com a app, e nao com a pagina.** Preparar a
  // descoberta demora -- fala com um catalogo e com o YouTube faixa a faixa --
  // e faze-lo so quando ele abre a Pesquisa e faze-lo a horas de ele estar a
  // olhar. Aqui ja ha sessao (esta casca so existe com ela).
  useEffect(() => { void useRecomendacoes.getState().carregar(); }, []);

  const more = useCallback(async (track: Track, discoveryContext?:DiscoveryContext, origem?: OrigemDoMenu) => {
    setTrackMenu(track);
    setTrackMenuContext(discoveryContext??null);
    setTrackMenuFila(typeof origem?.fila === 'number' ? origem.fila : null);
    setTrackMenuPlaylist(origem?.playlist ?? null);
    setTrackMenuLeitor(origem?.leitor ?? null);
    // Abre onde se clicou (5/10, MenuDeContexto.web.tsx): clique direito ou "…".
    setPontoDoMenu(ultimoClique());
    setTrackMenuOpen(true);
    garantirGuardadas();
  }, []);

  const toggleSave = async () => {
    if (!trackMenu) return;
    setTrackMenuOpen(false);
    const tirar = isSaved;
    // Otimista: os corações das listas mudam já; voltam atrás se falhar.
    useSaved.getState().markSaved(trackMenu, !tirar);
    try {
      if (tirar) {
        // O id da BD só se pergunta aqui, ao tirar (era a cada menu aberto).
        const { trackId } = await checkIsSaved(trackMenu.source, trackMenu.sourceId);
        const idToRemove = trackId || trackMenu.id;
        if (idToRemove) await removeFromLibrary(idToRemove);
        notify('Removed from Liked Songs.');
      } else {
        await saveToLibrary(trackMenu);
        if(trackMenuContext)registar('recomendacao_guardada',contextoParaAnalytics(trackMenuContext));
        notify('Added to Liked Songs.');
      }
      window.dispatchEvent(new Event('duotone:refresh-library'));
    } catch (e: any) {
      useSaved.getState().markSaved(trackMenu, tirar);
      notify(e?.message || 'Could not update library.');
    }
  };

  const removeFromCurrentPlaylist = async () => {
    if (!trackMenu || !trackMenuPlaylist?.podeEditar || !trackMenu.id) return;
    setTrackMenuOpen(false);
    try {
      await removeTrackFromPlaylist(trackMenuPlaylist.id, trackMenu.id);
      notify('Removed from playlist.');
      window.dispatchEvent(new CustomEvent('duotone:refresh-playlist'));
    } catch (e: any) {
      notify(e?.message || 'Could not remove track.');
    }
  };

  /**
   * O menu da faixa no PC (clique direito e "…"): as ações, a ordem e os
   * nomes de todos os menus, os do iPhone incluídos (lib/menuDaFaixa.ts).
   * Ganhou o "Play next", que só não existia aqui, e o "Remove from queue" na
   * fila do Now Playing. Download não há: o leitor do PC não guarda áudio.
   */
  const nomeDoArtistaDoMenu = trackMenu ? displayArtist(trackMenu) : '';
  const filaMudou = trackMenuFila === null || !trackMenu || trackMenuFila === indiceDoLeitor
    || filaDoLeitor[trackMenuFila]?.source !== trackMenu.source
    || filaDoLeitor[trackMenuFila]?.sourceId !== trackMenu.sourceId;
  const menuDoPc = trackMenu ? menuDaFaixa({
    plataforma: 'pc',
    // A barra do leitor tem o "Open Now Playing"; a capa do Now Playing, o menu curto do leitor (24/10).
    onde: trackMenuFila !== null ? 'fila' : trackMenuLeitor === 'barra' ? 'barra' : trackMenuLeitor === 'capa' ? 'leitor' : 'lista',
    semRede,
    tocaSemRede: false,
    guardada: guardadasLidas ? isSaved : null,
    podeDescarregar: false,
    download: 'nenhum',
    temArtista: !!nomeDoArtistaDoMenu && nomeDoArtistaDoMenu !== 'Unknown artist',
    playlist: trackMenuPlaylist && trackMenuFila === null ? { podeEditar: trackMenuPlaylist.podeEditar } : null,
    fila: trackMenuFila !== null ? { emJam, mudou: filaMudou } : null,
    sugestao: !!trackMenuContext || eSugestao(trackMenu),
  }) : [];
  const fazerNoMenu = (id: IdDaAcao) => {
    const t = trackMenu;
    if (!t) return;
    switch (id) {
      case 'abrir-leitor': setTrackMenuOpen(false); irPara({ tipo: 'a-tocar' }); return;
      case 'tocar-agora':
        setTrackMenuOpen(false);
        // Na fila, o mesmo que clicar na linha; nas listas, o que já fazia.
        if (trackMenuFila !== null) void usePlayer.getState().playTrack(t, usePlayer.getState().queue);
        else tocarMusica(t, undefined, trackMenuContext ?? undefined);
        return;
      case 'tocar-a-seguir': setTrackMenuOpen(false); usePlayer.getState().playNext(t); notify('Will play next.'); return;
      case 'por-na-fila': setTrackMenuOpen(false); usePlayer.getState().addToQueue(t); notify('Added to queue.'); return;
      case 'guardar': void toggleSave(); return;
      // 'por-em-playlist' não chega aqui: a linha abre o painel das playlists ao lado.
      // O artista sai do `displayArtist` e nao do campo `artist`, que no
      // YouTube e o CANAL: com o campo cru abria-se a pagina de um canal de
      // uploads em vez da do artista.
      case 'ver-artista': setTrackMenuOpen(false); navigate({ name: 'artist', value: nomeDoArtistaDoMenu }); return;
      case 'partilhar': setTrackMenuOpen(false); void openShareDialog({ itemType: 'track', item: t, name: t.title }); return;
      case 'recomendacoes': setTrackMenuOpen(false); setRecommendationTrack(t); setRecommendationContext(trackMenuContext); return;
      case 'nao-interessa':
        setTrackMenuOpen(false);
        void naoInteressa(t).then(() => notify(AVISO_DO_NAO_INTERESSA)).catch((e: any) => notify(e?.message || 'Could not save this preference.'));
        return;
      case 'tirar-da-playlist': void removeFromCurrentPlaylist(); return;
      case 'tirar-da-fila': {
        setTrackMenuOpen(false);
        // Relê na hora: um índice antigo nunca pode tirar outra música.
        const p = usePlayer.getState();
        const alvo = trackMenuFila === null ? undefined : p.queue[trackMenuFila];
        if (trackMenuFila === null || useOuvirJuntos.getState().sessao || trackMenuFila === p.queueIndex
          || !alvo || alvo.source !== t.source || alvo.sourceId !== t.sourceId) return;
        p.removeFromQueue(trackMenuFila);
        notify('Removed from queue.');
        return;
      }
      default: return;
    }
  };

  /**
   * O "Add to playlist" (24/10): um painel ao lado do menu, e não um diálogo
   * (desktop/EscolherPlaylist.web.tsx, desktop/porNaPlaylist.web.ts).
   */
  const painelDasPlaylists = (t: Track, fechar: () => void, voltar?: () => void) => (
    <EscolherPlaylist faixa={t} aoFechar={fechar} aoVoltar={voltar}
      aoEscolher={(p, jaLaEsta) => void porNaPlaylist(t, p, jaLaEsta, notify)}
      aoCriar={(nome) => void criarEPor(t, nome, notify)} />
  );
  const cabecalhoDaFaixa = (t: Track) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Artwork track={t} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: COR.texto, fontSize: 14, fontWeight: '700' }}>{tituloDaFaixa(t)}</Text>
        <Text numberOfLines={1} style={{ color: COR.textoMedio, fontSize: 12, marginTop: 1 }}>{displayArtist(t)}</Text>
      </View>
    </View>
  );
  const abrirPlaylistsSozinhas = (t: Track) => setEscolhaSolta({ faixa: t, rato: ultimoClique() });

  const openShareDialog = (target: ShareTarget) => { setShareTarget(target); };

  // Com a cor na janela, o painel fica transparente para ela passar por baixo
  // da lateral e da barra de título; a página deixa de pintar a sua.
  const leitorAberto = nowPlayingOpen || route.name === 'now-playing';
  // A sair, a cor fica na janela a apagar-se (`a-apagar`), e a superfície
  // volta ao fundo dela ao mesmo passo (`main-a-voltar`): sem salto no fim.
  const corNaJanela = corDoLeitor === 'janela' && (leitorAberto || saidaDoLeitor.aSair) && !!currentTrack;
  const aApagarACor = corNaJanela && saidaDoLeitor.aSair;
  // A cor da foto do artista na janela (30/10): a MESMA camada do Now Playing
  // (`FundoDaCapa onde="janela"`, o mesmo véu e a mesma intensidade), com a foto
  // do catálogo dele. Só com a preferência "Now Playing colour" em "Whole
  // window", e só se a foto se souber: sem ela não há camada, e a superfície
  // fica como sempre. Ao sair da página a cor apaga-se, como a do Now Playing.
  const [artistaDaCor, setArtistaDaCor] = useState('');
  if (route.name === 'artist' && artistaDaCor !== route.value) setArtistaDaCor(route.value);
  const fotoDaCor = useFotoDoArtista(artistaDaCor);
  const corDoArtista = useSaida(corDoLeitor === 'janela' && route.name === 'artist' && !leitorAberto && !!fotoDaCor, SAIDA_DO_LEITOR_MS);
  const corDoArtistaApaga = corDoArtista.aSair && !corNaJanela;
  const corDoArtistaMontada = corDoArtista.montado && !corNaJanela;
  const common = { play, tocarMusica, notify, more };
  let page: ReactNode;
  switch (route.name) {
    case 'search': page = <SearchPage navigate={navigate} {...common} />; break; case 'songs': page = <SongsPage {...common} />; break; case 'artists': page = <ArtistsPage navigate={navigate} notify={notify} />; break;
    case 'artist': page = <ArtistPage name={route.value} back={back} corNaJanela={corDoArtistaMontada && !corDoArtistaApaga} {...common} />; break; case 'playlists': page = <PlaylistsPage navigate={navigate} notify={notify} share={openShareDialog} />; break; case 'playlist': // `key`: uma playlist nova NÃO herda as faixas da anterior (duas fixadas na lateral: a segunda abria com a lista da primeira e só o título mudava).
    page = <PlaylistPage key={route.id} id={route.id} title={route.title} abrirPessoas={!!route.pessoas} back={back} share={openShareDialog} navigate={navigate} {...common} />; break;
    case 'mistura': page = <MisturaPage key={route.id} id={route.id} titulo={route.titulo} back={back} {...common} />; break;
    case 'stats': page = <StatsPage key={route.userId} back={back} play={play} userId={route.userId} />; break;
    case 'retrospetiva': page = <RetrospetivaPage key={`${route.userId}:${route.ano}`} back={back} play={play} userId={route.userId} ano={route.ano} />; break;
    case 'voces-os-dois': page = <VocesOsDoisPage key={route.userId} userId={route.userId} nome={route.nome} back={back} play={play} />; break;
    case 'import': page = <ImportPage back={back} notify={notify} />; break; case 'spotify-import': page = <SpotifyImportPage back={back} notify={notify} />; break; case 'profile': page = <ProfilePage aoMenuDaFaixa={(t) => void more(t)} />; break; case 'settings': page = <SettingsPage notify={notify} navigate={navigate} />; break;
    case 'library-check': page = <LibraryCheckPage back={back} play={play} />; break;
    case 'social': page = <SocialPage friendId={route.friendId} groupId={route.groupId} visible={!nowPlayingOpen && !jamOpen} aoMenuDaFaixa={(t) => void more(t)} />; break;
    case 'friend-profile': page = <ProfilePage userId={route.userId} back={back} aoMenuDaFaixa={(t) => void more(t)} />; break;
    case 'now-playing': page = <NowPlayingPage fundoNaJanela={corNaJanela} share={openShareDialog} play={play} tocarMusica={tocarMusica} notify={notify} more={more} currentIsSaved={currentIsSaved} toggleSaveCurrent={toggleSaveCurrent} navigate={navigate} back={back} aoAdicionarAPlaylist={abrirPlaylistsSozinhas} />; break;
  }

  // Painel dos tokens, com a opacidade que o utilizador escolher nas
  // Definicoes. Era `rgba(18,18,24)` a martelo, fora de qualquer paleta.
  const bgStyle = { backgroundColor: `rgba(12, 12, 16, ${panelOpacity})` };

  // O nome da página que está atrás (5/10, lib/voltarPara.ts). Com o Now
  // Playing por cima, o voltar fecha-o e mostra a página de baixo.
  const rotuloDoVoltar = nomeDaRota(nowPlayingOpen ? route : history.current[history.current.length - 1]);
  return <DestinosProvider value={irPara}><RotuloDoVoltar.Provider value={rotuloDoVoltar}><View style={[styles.root, { backgroundColor: 'transparent' }]}>{corNaJanela && <FundoDaCapa onde="janela" aApagar={aApagarACor} uri={currentTrack?.artworkUrl ?? null} />}{corDoArtistaMontada && fotoDaCor && <FundoDaCapa onde="janela" aApagar={corDoArtistaApaga} uri={fotoNoTamanho(fotoDaCor, 250)} />}<ThemeCssSync panelOpacity={panelOpacity}/><TitleBar comPainel /><V style={[styles.main, (corNaJanela && !aApagarACor) || (corDoArtistaMontada && !corDoArtistaApaga) ? { backgroundColor: 'transparent' } : bgStyle]} {...(aApagarACor || corDoArtistaApaga ? marcar('main-a-voltar') : {})}><View style={styles.sidebar}><Sidebar route={rotaDaLateral} navigate={navigate} notify={notify} voltar={back} /><SeparadorDaLateral /></View><PainelDoLeitor more={more} notify={notify}><View style={styles.content}>{/* Com a cor na janela o painel do leitor é transparente: a página de baixo esconde-se (continua montada, com o scroll onde estava). */}<View style={[{ flex: 1, minHeight: 0 }, nowPlayingOpen && corNaJanela && ({ visibility: 'hidden' } as any)]}><TransicaoDePagina chave={JSON.stringify(route)} aSair={aMudarDePagina} volta={chegouDeVolta}><BarreiraDeErros onde={`pagina:${route.name}`} chave={JSON.stringify(route)}>{page}</BarreiraDeErros></TransicaoDePagina></View>{saidaDoLeitor.montado&&<View pointerEvents={saidaDoLeitor.aSair?'none':'auto'} {...(saidaDoLeitor.aSair?marcar('np-a-sair'):{})} style={[StyleSheet.absoluteFill,{zIndex:20,backgroundColor:corNaJanela?'transparent':COR.fundo}]}><BarreiraDeErros onde="pagina:now-playing-painel"><NowPlayingPage fundoNaJanela={corNaJanela} share={openShareDialog} play={play} tocarMusica={tocarMusica} notify={notify} more={more} currentIsSaved={currentIsSaved} toggleSaveCurrent={toggleSaveCurrent} navigate={navigate} back={back} aoAdicionarAPlaylist={abrirPlaylistsSozinhas} /></BarreiraDeErros></View>}</View></PainelDoLeitor></V><PlayerBar currentIsSaved={currentIsSaved} toggleSaveCurrent={toggleSaveCurrent} onJam={() => void abrirJam()} discordLigado={discordLigado} onAviso={notify} aoMenuDaFaixa={() => { if (currentTrack) void more(currentTrack, undefined, { leitor: 'barra' }); }} /><HandoffBanner /><NotificationBanner onOpen={abrirSocial} /><ModoLimpo /><BoasVindasPc />{toast && <Toast message={toast} onDone={() => setToast('')} />}{avisoComDesfazer && <AvisoComDesfazer aviso={avisoComDesfazer} />}<CamadaDoArrasto /><PreEscutaDoRefrao />
    <JanelaDoJam open={jamOpen} onClose={fecharJam} notify={notify} />
    
    {/* O menu de uma faixa abre no cursor (5/10, auditoria M1): era um
        diálogo ao centro do ecrã. As linhas saem de lib/menuDaFaixa.ts; uma
        indisponível fica à vista, apagada, a dizer porquê. */}
    {trackMenuOpen && trackMenu ? <MenuDeContexto
      rato={pontoDoMenu}
      rotulo={`Options for ${tituloDaFaixa(trackMenu)}`}
      cabecalho={cabecalhoDaFaixa(trackMenu)}
      linhas={menuDoPc.map((a) => ({ id: a.id, rotulo: a.rotulo, icone: a.icone, perigo: a.destrutiva, motivo: a.indisponivel, submenu: a.id === 'por-em-playlist' }))}
      submenu={({ fechar, voltar }) => painelDasPlaylists(trackMenu, fechar, voltar)}
      aoEscolher={(id) => fazerNoMenu(id as IdDaAcao)}
      aoFechar={() => setTrackMenuOpen(false)}
    /> : null}
    {escolhaSolta ? <MenuDeContexto
      rato={escolhaSolta.rato}
      rotulo="Add to playlist"
      cabecalho={cabecalhoDaFaixa(escolhaSolta.faixa)}
      linhas={[]}
      corpo={painelDasPlaylists(escolhaSolta.faixa, () => setEscolhaSolta(null))}
      aoEscolher={() => {}}
      aoFechar={() => setEscolhaSolta(null)}
    /> : null}

    <RecommendationPreferences visible={!!recommendationTrack} track={recommendationTrack} reason={recommendationContext?.reason} onClose={()=>{setRecommendationTrack(null);setRecommendationContext(null);}}/>

    <ShareFriendSheet visible={!!shareTarget} itemType={shareTarget?.itemType ?? 'track'} item={shareTarget?.item ?? null} onClose={() => setShareTarget(null)} />
  </View></RotuloDoVoltar.Provider></DestinosProvider>;
}

export function RootNavigator() {
  const initialized = useAuth((s) => s.initialized); const session = useAuth((s) => s.session);
  useEffect(injectDesktopDocumentStyles, []);
  // As legendas dos botões de ícone (20/10): uma só, para a janela toda.
  useDicas();
  if (!initialized) return <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}><Loading /></View>;
  return <View style={styles.root}><Image source={require('../../assets/wallpaper.png')} style={styles.backgroundImage} />{session ? <DesktopShell /> : <View style={{ flex: 1, backgroundColor: 'transparent' }}><TitleBar /><AuthDesktop /></View>}</View>;
}
