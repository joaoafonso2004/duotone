import { TransicaoDePagina } from '../desktop/TransicaoDePagina.web';
import { MenuDeContexto, ultimoClique, type PontoNoEcra } from '../desktop/MenuDeContexto.web';
import { RetrospetivaPage } from '../desktop/paginas/RetrospetivaPage.web';
import { VocesOsDoisPage } from '../desktop/paginas/VocesOsDoisPage.web';
import { nomeDaRota } from '../lib/voltarPara';
import { ShareFriendSheet } from '../components/ShareFriendSheet';
import { RecommendationPreferences } from '../components/RecommendationPreferences';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { ReactNode, useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { addTracksToPlaylist, removeTrackFromPlaylist } from '../api/playlists';
import { removeFromLibrary, saveToLibrary, checkIsSaved } from '../api/library';
import type { OrigemDaFila } from '../lib/origemDaFila';
import { useSaved } from '../state/saved';
import { useRecomendacoes } from '../state/recomendacoes';
import { useDesktopNotifications } from '../hooks/useDesktopNotifications';
import { useSocial } from '../state/social';
import { NotificationBanner } from '../components/NotificationBanner';
import { HandoffBanner } from '../components/HandoffBanner';
import { endSession, publishSession, publishSessionNow } from '../lib/sessionSync';
import { useAutoplayRadio } from '../lib/radioSync';
import { RotuloDoVoltar, Artwork, Button, desktop, Dialog, Empty, Field, Loading, Toast } from '../desktop/ui.web';
import { COR } from '../desktop/tokens.web';
import { styles } from '../desktop/estilos.web';
import { SpotifyImportPage } from '../desktop/SpotifyImportPage.web';
import { useAuth } from '../state/auth';
import { contextoDaRecomendacaoAtual, usePlayer } from '../state/player';
import { usePresencaDoDiscord } from '../hooks/usePresencaDoDiscord';
import { useSincroniaDaSessao } from '../hooks/useSincroniaDaSessao';
import { getCorNaJanela, getDiscordRichPresence, type CorDoLeitor } from '../lib/prefs';
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
import { usePlaylists } from '../state/playlists';
import { useTheme } from '../state/theme';
import type { Playlist, Track } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { SocialPage } from '../desktop/paginas/SocialPage.web';

import { SettingsPage } from '../desktop/paginas/SettingsPage.web';
import { LibraryCheckPage } from '../desktop/paginas/LibraryCheckPage.web';
import { JanelaDoJam } from '../desktop/JanelaDoJam.web';

import { ProfilePage, StatsPage } from '../desktop/paginas/ProfilePage.web';

import { ArtistPage, ArtistsPage, MisturaPage, SearchPage, SongsPage } from '../desktop/paginas/BibliotecaPages.web';

import { invalidarCacheDaPlaylist, PlaylistPage, PlaylistsPage } from '../desktop/paginas/PlaylistPages.web';

import { ImportPage } from '../desktop/paginas/ImportPage.web';

import { NowPlayingPage } from '../desktop/paginas/NowPlayingPage.web';

import { injectDesktopDocumentStyles, PlayerBar, Sidebar, TitleBar } from '../desktop/casca.web';
import { usePonteDoLeitor } from '../desktop/usePonteDoLeitor.web';
import { useAtalhosDaJanela } from '../desktop/useAtalhosDaJanela.web';
import { ModoLimpo } from '../desktop/ModoLimpo.web';
import { BoasVindasPc } from '../desktop/BoasVindasPc.web';
import { type Route, type ShareTarget } from '../desktop/rotas';
import { rotaNoPc, type Destino } from '../lib/destinos';
import { DestinosProvider } from './destinos';
const V = View as any;

function AuthDesktop() {
  const signIn = useAuth((s) => s.signIn); const signUp = useAuth((s) => s.signUp);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin'); const [identifier, setIdentifier] = useState(''); const [email, setEmail] = useState(''); const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  // `finally`: um pedido que atire (rede a cair a meio) deixava o botão preso em "Please wait…".
  const submit = async () => { setBusy(true); setError(null); try { const message = mode === 'signin' ? await signIn(identifier, password) : await signUp(email, password, username); setError(message); } catch { setError('Could not reach Duotone. Check your connection and try again.'); } finally { setBusy(false); } };
  return <View style={styles.auth}><View style={styles.authGlow} /><View style={styles.authCard}><View style={[styles.authLogo, { alignItems: 'center', gap: 12, flexDirection: 'row' }]}><Image source={require('../../assets/auth-logo.png')} style={{ width: 44, height: 44 }} resizeMode="contain" /></View><Text style={styles.authTitle}>Your music, in one place.</Text><Text style={styles.authBody}>Sign in to your Duotone library and continue listening across devices.</Text><View style={styles.segment}><Pressable onPress={() => setMode('signin')} style={[styles.segmentItem, mode === 'signin' && styles.segmentActive]}><Text style={styles.segmentText}>Sign in</Text></Pressable><Pressable onPress={() => setMode('signup')} style={[styles.segmentItem, mode === 'signup' && styles.segmentActive]}><Text style={styles.segmentText}>Create account</Text></Pressable></View>
    <View style={{ gap: 12 }}>{mode === 'signin' ? <Field icon="mail-outline" placeholder="Email" value={identifier} onChangeText={setIdentifier} onSubmitEditing={submit} keyboardType="email-address" /> : <><Field icon="person-outline" placeholder="Username" value={username} onChangeText={setUsername} /><Field icon="mail-outline" placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" /></>}<Field icon="lock-closed-outline" placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry onSubmitEditing={submit} />{error && <Text style={styles.error}>{error}</Text>}<Button onPress={submit} disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</Button></View></View><Text style={styles.authFoot}>Duotone for Windows</Text></View>;
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
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [jamOpen, setJamOpen] = useState(false);
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
  const mudarRota = useCallback((next: Route, { fecharLeitor = false } = {}) => {
    rotaRef.current = next;
    setRotaDaLateral(next);
    startTransition(() => {
      setRoute(next);
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
  const [trackMenu, setTrackMenu] = useState<Track | null>(null); const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [trackMenuOpen, setTrackMenuOpen] = useState(false);
  const [recommendationTrack,setRecommendationTrack]=useState<Track|null>(null);
  const [recommendationContext,setRecommendationContext]=useState<DiscoveryContext|null>(null);
  const [trackMenuContext,setTrackMenuContext]=useState<DiscoveryContext|null>(null);
  const [pontoDoMenu, setPontoDoMenu] = useState<PontoNoEcra>({ x: 0, y: 0 });
  const [playlistDialog, setPlaylistDialog] = useState(false);
  // Partilhar é a MESMA janela em toda a app (5/10, auditoria M2): a
  // `ShareFriendSheet`, que no PC é um diálogo. Havia uma segunda aqui, com
  // outro título e sem o "Listen together".
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  // `null` enquanto o servidor não responde: o menu diz "Checking your
  // library…" em vez de mostrar o estado da faixa aberta antes desta.
  const [isSaved, setIsSaved] = useState<boolean | null>(null);
  /** O índice real na fila, quando o menu abriu numa linha da fila. */
  const [trackMenuFila, setTrackMenuFila] = useState<number | null>(null);
  const semRede = useConnectivity((s) => s.offline);
  const emJam = useOuvirJuntos((s) => !!s.sessao);
  const filaDoLeitor = usePlayer((s) => s.queue);
  const indiceDoLeitor = usePlayer((s) => s.queueIndex);
  const [savedTrackId, setSavedTrackId] = useState<string | null>(null);
  const [currentIsSaved, setCurrentIsSaved] = useState(false);

  // Não subscrever a casca inteira ao store: `positionMs` muda durante toda
  // a reprodução e fazia voltar a renderizar navegação, página, diálogos e
  // sidebar só para a barra avançar. Cada consumidor de progresso subscreve-o
  // diretamente (PlayerBar/HandoffBanner).
  const currentTrack = usePlayer((s) => s.current);
  const isPlayingState = usePlayer((s) => s.isPlaying);
  const queueIndex = usePlayer((s) => s.queueIndex);

  const checkCurrentSaved = useCallback(() => {
    if (!currentTrack) {
      setCurrentIsSaved(false);
      return;
    }
    checkIsSaved(currentTrack.source, currentTrack.sourceId)
      .then(({ saved }) => setCurrentIsSaved(saved))
      .catch(() => setCurrentIsSaved(false));
  }, [currentTrack]);

  useEffect(() => {
    checkCurrentSaved();
    window.addEventListener('duotone:refresh-library', checkCurrentSaved);
    return () => window.removeEventListener('duotone:refresh-library', checkCurrentSaved);
  }, [checkCurrentSaved]);

  // Otimista (24/9): o coração muda no clique, e só volta atrás se o servidor
  // recusar. Esperava por três idas à rede -- perguntar, gravar e reler --
  // antes de mexer. É o que o coração do iPhone já fazia.
  const aGuardarAtual = useRef(false);
  const toggleSaveCurrent = async () => {
    if (!currentTrack || aGuardarAtual.current) return;
    aGuardarAtual.current = true;
    const faixa = currentTrack;
    const tirar = currentIsSaved;
    setCurrentIsSaved(!tirar);
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
      setCurrentIsSaved(tirar);
      useSaved.getState().markSaved(faixa, tirar);
      notify(e?.message || 'Could not update library.');
    } finally {
      aGuardarAtual.current = false;
    }
  };

  const [panelOpacity, setPanelOpacity] = useState(0.72);
  // Diálogos usam o destino estável. A animação CSS vive no componente
  // minúsculo abaixo e deixa de redesenhar toda a aplicação dez vezes.
  const theme = useTheme((s) => s.destino);

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
    futuro.current.push(rotaRef.current);
    mudarRota(history.current.pop() || { name: 'playlists' });
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

  const more = useCallback(async (track: Track, discoveryContext?:DiscoveryContext, origem?: { fila?: number }) => {
    setTrackMenu(track);
    setTrackMenuContext(discoveryContext??null);
    setTrackMenuFila(typeof origem?.fila === 'number' ? origem.fila : null);
    setIsSaved(null);
    // Abre onde se clicou (5/10, MenuDeContexto.web.tsx): clique direito ou "…".
    setPontoDoMenu(ultimoClique());
    setTrackMenuOpen(true);
    try {
      const { saved, trackId } = await checkIsSaved(track.source, track.sourceId);
      setIsSaved(saved);
      setSavedTrackId(trackId);
    } catch {
      setIsSaved(false);
      setSavedTrackId(null);
    }
  }, []);

  const toggleSave = async () => {
    if (!trackMenu) return;
    setTrackMenuOpen(false);
    const idToRemove = savedTrackId || trackMenu.id;
    const tirar = !!(isSaved && idToRemove);
    // Otimista: os corações das listas mudam já; voltam atrás se falhar.
    useSaved.getState().markSaved(trackMenu, !tirar);
    try {
      if (tirar) {
        await removeFromLibrary(idToRemove!);
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
    if (!trackMenu || route.name !== 'playlist' || !trackMenu.id) return;
    setTrackMenuOpen(false);
    try {
      await removeTrackFromPlaylist(route.id, trackMenu.id);
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
    onde: trackMenuFila !== null ? 'fila' : 'lista',
    semRede,
    tocaSemRede: false,
    guardada: isSaved,
    podeDescarregar: false,
    download: 'nenhum',
    temArtista: !!nomeDoArtistaDoMenu && nomeDoArtistaDoMenu !== 'Unknown artist',
    playlist: route.name === 'playlist' && !nowPlayingOpen && trackMenuFila === null ? { podeEditar: true } : null,
    fila: trackMenuFila !== null ? { emJam, mudou: filaMudou } : null,
  }) : [];
  const fazerNoMenu = (id: IdDaAcao) => {
    const t = trackMenu;
    if (!t) return;
    switch (id) {
      case 'tocar-agora':
        setTrackMenuOpen(false);
        // Na fila, o mesmo que clicar na linha; nas listas, o que já fazia.
        if (trackMenuFila !== null) void usePlayer.getState().playTrack(t, usePlayer.getState().queue);
        else tocarMusica(t, undefined, trackMenuContext ?? undefined);
        return;
      case 'tocar-a-seguir': setTrackMenuOpen(false); usePlayer.getState().playNext(t); notify('Will play next.'); return;
      case 'por-na-fila': setTrackMenuOpen(false); usePlayer.getState().addToQueue(t); notify('Added to queue.'); return;
      case 'guardar': void toggleSave(); return;
      case 'por-em-playlist': setTrackMenuOpen(false); void openPlaylistDialog(); return;
      // O artista sai do `displayArtist` e nao do campo `artist`, que no
      // YouTube e o CANAL: com o campo cru abria-se a pagina de um canal de
      // uploads em vez da do artista.
      case 'ver-artista': setTrackMenuOpen(false); navigate({ name: 'artist', value: nomeDoArtistaDoMenu }); return;
      case 'partilhar': setTrackMenuOpen(false); void openShareDialog({ itemType: 'track', item: t, name: t.title }); return;
      case 'recomendacoes': setTrackMenuOpen(false); setRecommendationTrack(t); setRecommendationContext(trackMenuContext); return;
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

  const openPlaylistDialog = async () => {
    // A leitura pode falhar (sessao expirada, sem rede). Sem isto a promessa
    // ficava por apanhar e carregar no botao nao fazia NADA -- nem abria, nem
    // dizia porque nao. Abre-se na mesma: o dialogo sabe mostrar-se vazio.
    try {
      await usePlaylists.getState().carregar();
      setPlaylists(usePlaylists.getState().items);
    } catch (e: any) {
      setPlaylists([]);
      notify(e?.message || 'Could not load your playlists.');
    }
    setPlaylistDialog(true);
  };

  const addTo = async (id: string) => {
    if (!trackMenu) return;
    try {
      await addTracksToPlaylist(id, [trackMenu]);
      invalidarCacheDaPlaylist(id);
      setPlaylistDialog(false);
      notify('Added to playlist.');
      window.dispatchEvent(new CustomEvent('duotone:refresh-playlist', { detail: { id } }));
      window.dispatchEvent(new CustomEvent('duotone:refresh-playlists'));
    } catch (e: any) {
      notify(e?.message || 'Could not add track.');
    }
  };

  const openShareDialog = (target: ShareTarget) => { setShareTarget(target); };

  // Com a cor na janela, o painel fica transparente para ela passar por baixo
  // da lateral e da barra de título; a página deixa de pintar a sua.
  const leitorAberto = nowPlayingOpen || route.name === 'now-playing';
  const corNaJanela = corDoLeitor === 'janela' && leitorAberto && !!currentTrack;
  const common = { play, tocarMusica, notify, more };
  let page: ReactNode;
  switch (route.name) {
    case 'search': page = <SearchPage navigate={navigate} {...common} />; break; case 'songs': page = <SongsPage {...common} />; break; case 'artists': page = <ArtistsPage navigate={navigate} />; break;
    case 'artist': page = <ArtistPage name={route.value} back={back} {...common} />; break; case 'playlists': page = <PlaylistsPage navigate={navigate} notify={notify} share={openShareDialog} />; break; case 'playlist': page = <PlaylistPage id={route.id} title={route.title} back={back} share={openShareDialog} navigate={navigate} {...common} />; break;
    case 'mistura': page = <MisturaPage key={route.id} id={route.id} titulo={route.titulo} back={back} {...common} />; break;
    case 'stats': page = <StatsPage key={route.userId} back={back} play={play} userId={route.userId} />; break;
    case 'retrospetiva': page = <RetrospetivaPage key={`${route.userId}:${route.ano}`} back={back} play={play} userId={route.userId} ano={route.ano} />; break;
    case 'voces-os-dois': page = <VocesOsDoisPage key={route.userId} userId={route.userId} nome={route.nome} back={back} play={play} />; break;
    case 'import': page = <ImportPage back={back} notify={notify} />; break; case 'spotify-import': page = <SpotifyImportPage back={back} notify={notify} />; break; case 'profile': page = <ProfilePage />; break; case 'settings': page = <SettingsPage notify={notify} navigate={navigate} />; break;
    case 'library-check': page = <LibraryCheckPage back={back} play={play} />; break;
    case 'social': page = <SocialPage friendId={route.friendId} groupId={route.groupId} visible={!nowPlayingOpen && !jamOpen} />; break;
    case 'friend-profile': page = <ProfilePage userId={route.userId} back={back} />; break;
    case 'now-playing': page = <NowPlayingPage fundoNaJanela={corNaJanela} share={openShareDialog} play={play} tocarMusica={tocarMusica} notify={notify} more={more} currentIsSaved={currentIsSaved} toggleSaveCurrent={toggleSaveCurrent} navigate={navigate} back={back} aoAdicionarAPlaylist={(t) => { setTrackMenu(t); void openPlaylistDialog(); }} />; break;
  }

  // Painel dos tokens, com a opacidade que o utilizador escolher nas
  // Definicoes. Era `rgba(18,18,24)` a martelo, fora de qualquer paleta.
  const bgStyle = { backgroundColor: `rgba(12, 12, 16, ${panelOpacity})` };

  // O nome da página que está atrás (5/10, lib/voltarPara.ts). Com o Now
  // Playing por cima, o voltar fecha-o e mostra a página de baixo.
  const rotuloDoVoltar = nomeDaRota(nowPlayingOpen ? route : history.current[history.current.length - 1]);
  return <DestinosProvider value={irPara}><RotuloDoVoltar.Provider value={rotuloDoVoltar}><View style={[styles.root, { backgroundColor: 'transparent' }]}>{corNaJanela && <FundoDaCapa onde="janela" uri={currentTrack?.artworkUrl ?? null} />}<ThemeCssSync panelOpacity={panelOpacity}/><TitleBar /><V style={[styles.main, corNaJanela ? { backgroundColor: 'transparent' } : bgStyle]}><View style={styles.sidebar}><Sidebar route={rotaDaLateral} navigate={navigate} notify={notify} /></View><View style={styles.content}>{/* Com a cor na janela o painel do leitor é transparente: a página de baixo esconde-se (continua montada, com o scroll onde estava). */}<View style={[{ flex: 1, minHeight: 0 }, nowPlayingOpen && corNaJanela && ({ visibility: 'hidden' } as any)]}><TransicaoDePagina chave={JSON.stringify(route)} aSair={aMudarDePagina}><BarreiraDeErros onde={`pagina:${route.name}`} chave={JSON.stringify(route)}>{page}</BarreiraDeErros></TransicaoDePagina></View>{nowPlayingOpen&&<View style={[StyleSheet.absoluteFill,{zIndex:20,backgroundColor:corNaJanela?'transparent':COR.fundo}]}><BarreiraDeErros onde="pagina:now-playing-painel"><NowPlayingPage fundoNaJanela={corNaJanela} share={openShareDialog} play={play} tocarMusica={tocarMusica} notify={notify} more={more} currentIsSaved={currentIsSaved} toggleSaveCurrent={toggleSaveCurrent} navigate={navigate} back={back} aoAdicionarAPlaylist={(t) => { setTrackMenu(t); void openPlaylistDialog(); }} /></BarreiraDeErros></View>}</View></V><PlayerBar currentIsSaved={currentIsSaved} toggleSaveCurrent={toggleSaveCurrent} onJam={() => void abrirJam()} discordLigado={discordLigado} onAviso={notify} /><HandoffBanner /><NotificationBanner onOpen={abrirSocial} /><ModoLimpo /><BoasVindasPc />{toast && <Toast message={toast} onDone={() => setToast('')} />}
    <JanelaDoJam open={jamOpen} onClose={fecharJam} notify={notify} />
    
    {/* O menu de uma faixa abre no cursor (5/10, auditoria M1): era um
        diálogo ao centro do ecrã. As linhas saem de lib/menuDaFaixa.ts; uma
        indisponível fica à vista, apagada, a dizer porquê. */}
    {trackMenuOpen && trackMenu ? <MenuDeContexto
      rato={pontoDoMenu}
      rotulo={`Options for ${tituloDaFaixa(trackMenu)}`}
      cabecalho={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Artwork track={trackMenu} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: desktop.text, fontSize: 14, fontWeight: '700' }}>{tituloDaFaixa(trackMenu)}</Text>
          <Text numberOfLines={1} style={{ color: desktop.muted, fontSize: 12, marginTop: 1 }}>{displayArtist(trackMenu)}</Text>
        </View>
      </View>}
      linhas={menuDoPc.map((a) => ({ id: a.id, rotulo: a.rotulo, icone: a.icone, perigo: a.destrutiva, motivo: a.indisponivel }))}
      aoEscolher={(id) => fazerNoMenu(id as IdDaAcao)}
      aoFechar={() => setTrackMenuOpen(false)}
    /> : null}

    <RecommendationPreferences visible={!!recommendationTrack} track={recommendationTrack} reason={recommendationContext?.reason} onClose={()=>{setRecommendationTrack(null);setRecommendationContext(null);}}/>
    {/* PLAYLIST DIALOG */}
    <Dialog open={playlistDialog} title="Add to playlist" onClose={() => setPlaylistDialog(false)}>
      {playlists.length ? <View style={{ gap: 6 }}>{playlists.map((p) => <Pressable key={p.id} onPress={() => addTo(p.id)} style={({ hovered }) => [styles.destination, hovered && styles.settingHover]}><Ionicons name="albums-outline" size={18} color={theme.color} /><Text style={styles.destinationText}>{p.name}</Text></Pressable>)}</View> : <Empty icon="albums-outline" title="No playlists" body="Create a playlist first, then add this track." />}
    </Dialog>

    <ShareFriendSheet visible={!!shareTarget} itemType={shareTarget?.itemType ?? 'track'} item={shareTarget?.item ?? null} onClose={() => setShareTarget(null)} />
  </View></RotuloDoVoltar.Provider></DestinosProvider>;
}

export function RootNavigator() {
  const initialized = useAuth((s) => s.initialized); const session = useAuth((s) => s.session);
  useEffect(injectDesktopDocumentStyles, []);
  if (!initialized) return <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}><Loading /></View>;
  return <View style={styles.root}><Image source={require('../../assets/wallpaper.png')} style={styles.backgroundImage} />{session ? <DesktopShell /> : <View style={{ flex: 1, backgroundColor: 'transparent' }}><TitleBar /><AuthDesktop /></View>}</View>;
}
