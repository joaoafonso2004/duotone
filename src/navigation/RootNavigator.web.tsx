import {TransitionView} from '../components/TransitionView';
import { RecommendationPreferences } from '../components/RecommendationPreferences';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { displayArtist } from '../lib/artistName';
import { addTracksToPlaylist, createPlaylist, deletePlaylist, getPlaylistTracks, importSharedPlaylist, removeTrackFromPlaylist, renamePlaylist } from '../api/playlists';
import { addSearchHistoryEntry, clearSearchHistory, getSearchHistory } from '../api/searchHistory';
import { getLibrary, getLikedSongs, removeFromLibrary, saveToLibrary, checkIsSaved } from '../api/library';
import { fetchYouTubePlaylist, searchYouTube } from '../api/youtube';
import { YouTubePlayerView } from '../components/YouTubePlayerView';
import { FriendAvatar } from '../components/FriendAvatar';
import { useSaved } from '../state/saved';
import { useRecomendacoes } from '../state/recomendacoes';
import { useDesktopNotifications } from '../hooks/useDesktopNotifications';
import { fetchListeningStats, type StatsResult } from '../api/listeningStats';
import { formatListeningTime, type StatsPeriod, type TimelineBucket } from '../lib/listeningStats';
import { HandoffBanner } from '../components/HandoffBanner';
import { endSession, publishSession, publishSessionNow } from '../lib/sessionSync';
import { useAutoplayRadio } from '../lib/radioSync';
import { Artwork, Button, ContentScroll, desktop, Dialog, Empty, Field, formatTime, IconButton, Loading, Page, Shelf, Toast, TrackTable, ui } from '../desktop/ui.web';
import { COR, ESP, FONT, FONTES, LINHA_LISTA, RAIO, TIPO } from '../desktop/tokens.web';
import { styles } from '../desktop/estilos.web';
import { GlitchArtwork } from '../desktop/glitch/GlitchArtwork.web';
import { SpotifyImportPage } from '../desktop/SpotifyImportPage.web';
import {
  getEffectIntensity, getGlitchMode,
  setEffectIntensity, setGlitchMode,
  type EffectIntensity, type GlitchMode,
  getShowRewindButton, getShowTrackDuration,
  setShowRewindButton, setShowTrackDuration, setShowTrackDurationCache,
  setAutoplayRadio as persistAutoplayRadio
} from '../lib/prefs';
import {
  getProfilePlayStats, getProfileMostPlayed, getProfileRecentlyPlayed, getTopArtists,
  getHeavyRotation, getForgottenFavorites,
  type ProfilePlayEntry, type DbPlayStats,
} from '../api/plays';
import {
  acceptFriendRequest, archiveInboxItem, declineOrRemoveFriendship,
  getFriendCount, getFriendships, getInboxItems, searchProfiles,
  shareComGrupo, getGrupos, type ChatGroup, shareItem, sendFriendRequest, getChatMessages, type Friendship, type SharedItem
} from '../api/social';
import { APP_VERSION, BUILD_ID } from '../lib/buildInfo';
import { historico, limparHistorico, relatorio, resumo } from '../lib/playbackDiagnostics';
import { supabase } from '../lib/supabase';
import { useAuth } from '../state/auth';
import { contextoDaRecomendacaoAtual, usePlayer } from '../state/player';
import { usePresencaDoDiscord } from '../hooks/usePresencaDoDiscord';
import { useSincroniaDaSessao } from '../hooks/useSincroniaDaSessao';
import { getDiscordRichPresence } from '../lib/prefs';
import { sessaoDoSegredoDiscord } from '../lib/presencaDoDiscord';
import { registar } from '../lib/eventos';
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
import { ModoLimpo } from '../desktop/ModoLimpo.web';
import { PRIMARY, type CommonPageProps, type Route, type ShareTarget } from '../desktop/rotas';
import {
  memberSince, newerVersion, playEntryToTrack,
  PlaylistArtwork, relativeTime, useLibraryData,
} from '../desktop/paginas/comum.web';
const P = Pressable as any;
const V = View as any;

function AuthDesktop() {
  const signIn = useAuth((s) => s.signIn); const signUp = useAuth((s) => s.signUp);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin'); const [identifier, setIdentifier] = useState(''); const [email, setEmail] = useState(''); const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const submit = async () => { setBusy(true); setError(null); const message = mode === 'signin' ? await signIn(identifier, password) : await signUp(email, password, username); setError(message); setBusy(false); };
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
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [jamOpen, setJamOpen] = useState(false);
  const abrirSocial = useCallback((conversation?:{friendId?:string;groupId?:string}) => { setNowPlayingOpen(false); setRoute({ name: 'social',...conversation }); }, []);
  useDesktopNotifications(abrirSocial);
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
  const [playlistDialog, setPlaylistDialog] = useState(false);
  const [shareDialog, setShareDialog] = useState(false);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [friends, setFriends] = useState<Friendship[]>([]);
  // VARIOS destinatarios, nao um. Mandar a mesma musica a tres pessoas
  // eram tres idas ao dialogo; o `shareItem` ja aceita uma lista e
  // insere-as de uma vez.
  const [shareGroups, setShareGroups] = useState<ChatGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [shareMessage, setShareMessage] = useState('');
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [sharing, setSharing] = useState(false);
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

  const toggleSaveCurrent = async () => {
    if (!currentTrack) return;
    try {
      const { saved, trackId } = await checkIsSaved(currentTrack.source, currentTrack.sourceId);
      if (saved) {
        const idToRemove = trackId || currentTrack.id;
        if (idToRemove) {
          await removeFromLibrary(idToRemove);
          useSaved.getState().markSaved(currentTrack, false);
          notify('Removed from library.');
        }
      } else {
        await saveToLibrary(currentTrack);
        useSaved.getState().markSaved(currentTrack, true);
        const contexto=contextoDaRecomendacaoAtual();
        if(contexto)registar('recomendacao_guardada',contextoParaAnalytics(contexto));
        notify('Saved to library.');
      }
      window.dispatchEvent(new Event('duotone:refresh-library'));
    } catch (e: any) {
      notify(e?.message || 'Could not update library.');
    }
  };

  const [panelOpacity, setPanelOpacity] = useState(0.72);
  // Diálogos usam o destino estável. A animação CSS vive no componente
  // minúsculo abaixo e deixa de redesenhar toda a aplicação dez vezes.
  const theme = useTheme((s) => s.destino);

  const navigate = useCallback((next: Route) => {
    if (next.name === 'now-playing') {
      // O leitor é uma camada: a página de origem continua montada por baixo,
      // com scroll, pesquisa e ordenação exatamente onde estavam.
      setNowPlayingOpen(true);
      return;
    }
    setNowPlayingOpen(false);
    setRoute((current) => {
      // Carregar duas vezes no mesmo sítio não é navegar. Sem isto o histórico
      // enchia-se de repetições e o voltar ficava a pedir cliques para não sair
      // do mesmo ecrã.
      if (JSON.stringify(current) === JSON.stringify(next)) return current;
      history.current.push(current);
      return next;
    });
  }, []);
  const back = useCallback(() => {
    if (nowPlayingOpen) { setNowPlayingOpen(false); return; }
    setRoute(history.current.pop() || { name: 'playlists' });
  }, [nowPlayingOpen]);
  const notify = useCallback((s: string) => setToast(s), []);
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
  const play = useCallback((track: Track, queue?: Track[], discoveryContext?:DiscoveryContext) => {
    usePlayer.getState().playTrack(track, queue, false, false, discoveryContext);
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

  useEffect(() => {
    // Pelo `navigate` e não pelo `setRoute`: abrir o Now Playing pela barra do
    // player é navegar como qualquer outra coisa. A saltar o histórico, ficava
    // um ecrã sem volta -- para regressar à playlist era abri-la de novo e
    // percorrer tudo outra vez até onde se ia.
    const handleNav = (e: any) => {
      if (e.detail) navigate(e.detail);
    };
    window.addEventListener('duotone:navigate', handleNav);
    return () => window.removeEventListener('duotone:navigate', handleNav);
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
    try {
      if (isSaved && idToRemove) {
        await removeFromLibrary(idToRemove);
        useSaved.getState().markSaved(trackMenu, false);
        notify('Removed from library.');
      } else {
        await saveToLibrary(trackMenu);
        useSaved.getState().markSaved(trackMenu, true);
        if(trackMenuContext)registar('recomendacao_guardada',contextoParaAnalytics(trackMenuContext));
        notify('Saved to library.');
      }
      window.dispatchEvent(new Event('duotone:refresh-library'));
    } catch (e: any) {
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
    descarregada: false,
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
        else play(t, undefined, trackMenuContext ?? undefined);
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

  const openShareDialog = async (target: ShareTarget) => {
    setShareTarget(target);
    setSelectedGroups([]);
    setShareGroups([]);
    setSelectedFriends([]);
    setShareMessage('');
    setShareDialog(true);
    setLoadingFriends(true);
    try {
      const [list, groups] = await Promise.all([getFriendships(), getGrupos()]);
      setFriends(list.filter(f => f.status === 'accepted'));
      setShareGroups(groups);
    } catch {
      setFriends([]);
    } finally {
      setLoadingFriends(false);
    }
  };

  const sendShare = async () => {
    if (!shareTarget || sharing || selectedFriends.length + selectedGroups.length === 0) return;
    setSharing(true);
    try {
      const envios = [
        ...(selectedFriends.length ? [{ tipo: 'amigos', id: '', enviar: () => shareItem(selectedFriends, shareTarget.itemType, shareTarget.item, shareMessage) }] : []),
        ...selectedGroups.map((id) => ({ tipo: 'grupo', id, enviar: () => shareComGrupo(id, shareTarget.itemType, shareTarget.item, shareMessage) })),
      ];
      const resultados = await Promise.allSettled(envios.map((e) => e.enviar()));
      const falhas = envios.filter((_, i) => resultados[i].status === 'rejected');
      // Só ficam selecionados os destinos falhados: repetir não duplica os envios feitos.
      setSelectedFriends(falhas.some((e) => e.tipo === 'amigos') ? selectedFriends : []);
      setSelectedGroups(falhas.filter((e) => e.tipo === 'grupo').map((e) => e.id));
      if (falhas.length) {
        notify('Some shares failed. Retry the selected recipients.');
        return;
      }
      setShareDialog(false);
      setShareTarget(null);
      setShareMessage('');
      notify(shareTarget.itemType === 'playlist' ? 'Playlist shared successfully.' : 'Song shared successfully.');
    } finally {
      setSharing(false);
    }
  };

  const common = { play, notify, more };
  let page: ReactNode;
  switch (route.name) {
    case 'search': page = <SearchPage navigate={navigate} {...common} />; break; case 'songs': page = <SongsPage {...common} />; break; case 'artists': page = <ArtistsPage navigate={navigate} />; break;
    case 'artist': page = <ArtistPage name={route.value} back={back} {...common} />; break; case 'playlists': page = <PlaylistsPage navigate={navigate} notify={notify} share={openShareDialog} />; break; case 'playlist': page = <PlaylistPage id={route.id} title={route.title} back={back} share={openShareDialog} {...common} />; break;
    case 'mistura': page = <MisturaPage key={route.id} id={route.id} titulo={route.titulo} back={back} {...common} />; break;
    case 'stats': page = <StatsPage key={route.userId} back={back} play={play} userId={route.userId} />; break;
    case 'import': page = <ImportPage back={back} notify={notify} />; break; case 'spotify-import': page = <SpotifyImportPage back={back} notify={notify} />; break; case 'profile': page = <ProfilePage navigate={navigate} notify={notify} />; break; case 'settings': page = <SettingsPage notify={notify} navigate={navigate} />; break;
    case 'library-check': page = <LibraryCheckPage back={back} play={play} />; break;
    case 'social': page = <SocialPage navigate={navigate} friendId={route.friendId} groupId={route.groupId} notify={notify} play={play} more={more} />; break;
    case 'friend-profile': page = <ProfilePage userId={route.userId} navigate={navigate} notify={notify} back={back} />; break;
    case 'now-playing': page = <NowPlayingPage share={openShareDialog} play={play} notify={notify} more={more} currentIsSaved={currentIsSaved} toggleSaveCurrent={toggleSaveCurrent} navigate={navigate} back={back} aoAdicionarAPlaylist={(t) => { setTrackMenu(t); void openPlaylistDialog(); }} />; break;
  }

  // Painel dos tokens, com a opacidade que o utilizador escolher nas
  // Definicoes. Era `rgba(18,18,24)` a martelo, fora de qualquer paleta.
  const bgStyle = { backgroundColor: `rgba(12, 12, 16, ${panelOpacity})` };

  return <View style={[styles.root, { backgroundColor: 'transparent' }]}><ThemeCssSync panelOpacity={panelOpacity}/><TitleBar /><View style={styles.main}><V style={[styles.sidebar, bgStyle]} className="glass-panel"><Sidebar route={route} navigate={navigate} /></V><V style={[styles.content, bgStyle]} className="glass-panel"><TransitionView transitionKey={JSON.stringify(route)}>{page}</TransitionView>{nowPlayingOpen&&<View style={[StyleSheet.absoluteFill,{zIndex:20,backgroundColor:COR.fundo}]}><NowPlayingPage share={openShareDialog} play={play} notify={notify} more={more} currentIsSaved={currentIsSaved} toggleSaveCurrent={toggleSaveCurrent} navigate={navigate} back={back} aoAdicionarAPlaylist={(t) => { setTrackMenu(t); void openPlaylistDialog(); }} /></View>}</V></View><PlayerBar currentIsSaved={currentIsSaved} toggleSaveCurrent={toggleSaveCurrent} onJam={() => void abrirJam()} discordLigado={discordLigado} onAviso={notify} /><HandoffBanner /><ModoLimpo />{toast && <Toast message={toast} onDone={() => setToast('')} />}
    <JanelaDoJam open={jamOpen} onClose={fecharJam} notify={notify} />
    
    {/* CUSTOM ACTIONS DIALOG */}
    <Dialog open={trackMenuOpen} title="Track Actions" onClose={() => setTrackMenuOpen(false)}>
      {trackMenu && (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: desktop.border }}>
            <Artwork track={trackMenu} size={48} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: desktop.text, fontSize: 14, fontWeight: '700' }}>{trackMenu.title}</Text>
              <Text numberOfLines={1} style={{ color: desktop.muted, fontSize: 12 }}>{displayArtist(trackMenu)}</Text>
            </View>
          </View>
          {/* As linhas saem de lib/menuDaFaixa.ts. Uma indisponível fica à
              vista, apagada, e diz porquê por baixo em vez de desaparecer. */}
          {menuDoPc.map((a) => {
            const apagada = !!a.indisponivel;
            const cor = a.destrutiva ? '#EF4444' : theme.color;
            return (
              <Pressable
                key={a.id}
                disabled={apagada}
                accessibilityState={{ disabled: apagada }}
                onPress={() => fazerNoMenu(a.id)}
                style={({ hovered }: any) => [styles.destination, a.indisponivel && { paddingVertical: 7 }, hovered && !apagada && styles.settingHover, apagada && ({ cursor: 'default' } as any)]}
              >
                <Ionicons name={a.icone as keyof typeof Ionicons.glyphMap} size={18} color={cor} style={{ opacity: apagada ? 0.4 : 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.destinationText, { flex: 0 }, a.destrutiva && { color: '#EF4444' }, apagada && { opacity: 0.4 }]}>{a.rotulo}</Text>
                  {a.indisponivel ? <Text style={{ color: desktop.dim, fontSize: 11, marginTop: 2 }}>{a.indisponivel}</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </Dialog>

    <RecommendationPreferences visible={!!recommendationTrack} track={recommendationTrack} reason={recommendationContext?.reason} onClose={()=>{setRecommendationTrack(null);setRecommendationContext(null);}}/>
    {/* PLAYLIST DIALOG */}
    <Dialog open={playlistDialog} title="Add to playlist" onClose={() => setPlaylistDialog(false)}>
      {playlists.length ? <View style={{ gap: 6 }}>{playlists.map((p) => <Pressable key={p.id} onPress={() => addTo(p.id)} style={({ hovered }) => [styles.destination, hovered && styles.settingHover]}><Ionicons name="albums-outline" size={18} color={theme.color} /><Text style={styles.destinationText}>{p.name}</Text></Pressable>)}</View> : <Empty icon="albums-outline" title="No playlists" body="Create a playlist first, then add this track." />}
    </Dialog>

    {/* SHARE DIALOG */}
    <Dialog open={shareDialog} title={shareTarget?.itemType === 'playlist' ? 'Share playlist' : 'Share song'} onClose={() => { if (!sharing) { setShareDialog(false); setSelectedFriends([]); setSelectedGroups([]); } }}>
      {shareTarget && (
        <View style={{ gap: 12 }}>
          <Text numberOfLines={1} style={styles.dialogBody}>Sharing “{shareTarget.name}”</Text>
          <Text style={styles.formLabel}>SELECT FRIENDS</Text>
          {loadingFriends ? <Loading /> : friends.length ? (
            <View style={{ gap: 6, maxHeight: 180, overflow: 'auto' as any }}>
              {friends.map((f) => (
                // Caixas e nao circulos: o circulo diz "escolhe UM", e agora
                // escolhem-se quantos se quiser.
                <Pressable
                  key={f.friendId}
                  disabled={sharing}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selectedFriends.includes(f.friendId) }}
                  onPress={() => setSelectedFriends((antes) => antes.includes(f.friendId)
                    ? antes.filter((id) => id !== f.friendId)
                    : [...antes, f.friendId])}
                  style={[styles.destination, selectedFriends.includes(f.friendId) && { borderColor: theme.color, backgroundColor: theme.soft }]}
                >
                  <Ionicons
                    name={selectedFriends.includes(f.friendId) ? 'checkbox' : 'square-outline'}
                    color={selectedFriends.includes(f.friendId) ? theme.color : desktop.dim}
                    size={18}
                  />
                  <Text style={styles.destinationText}>{f.name} (@{f.username})</Text>
                </Pressable>
              ))}
            </View>
          ) : <Text style={styles.dialogBody}>No friends found. Go to the Social page to add friends.</Text>}

          {shareGroups.length > 0 && <>
            <Text style={styles.formLabel}>SELECT GROUPS</Text>
            <ScrollView style={{ maxHeight: 180 }} contentContainerStyle={{ gap: 6 }}>
              {shareGroups.map((g) => <Pressable key={g.id} disabled={sharing}
                accessibilityRole="checkbox" accessibilityState={{ checked: selectedGroups.includes(g.id) }}
                onPress={() => setSelectedGroups((antes) => antes.includes(g.id) ? antes.filter((id) => id !== g.id) : [...antes, g.id])}
                style={[styles.destination, selectedGroups.includes(g.id) && { borderColor: theme.color, backgroundColor: theme.soft }]}>
                <Ionicons name={selectedGroups.includes(g.id) ? 'checkbox' : 'square-outline'} size={18} color={theme.color} />
                <Text style={styles.destinationText}>{g.name} · {g.membros.length} members</Text>
              </Pressable>)}
            </ScrollView>
          </>}
          {friends.length + shareGroups.length > 0 && (
            <>
              <Text style={styles.formLabel}>MESSAGE (OPTIONAL)</Text>
              <Field placeholder={`Add a note about this ${shareTarget.itemType}…`} value={shareMessage} onChangeText={setShareMessage} />
              <View style={styles.dialogActions}>
                <Button secondary disabled={sharing} onPress={() => setShareDialog(false)}>Cancel</Button>
                <Button onPress={sendShare} disabled={selectedFriends.length + selectedGroups.length === 0 || sharing}>{
                  sharing ? 'Sharing…'
                    : selectedFriends.length + selectedGroups.length > 1
                      // Diz quantos: quem escolheu cinco pessoas quer ver o cinco
                      // antes de carregar, e nao depois no aviso.
                      ? `Share with ${selectedFriends.length + selectedGroups.length}`
                      : shareTarget.itemType === 'playlist' ? 'Share Playlist' : 'Share Song'
                }</Button>
              </View>
            </>
          )}
        </View>
      )}
    </Dialog>
  </View>;
}

export function RootNavigator() {
  const initialized = useAuth((s) => s.initialized); const session = useAuth((s) => s.session);
  useEffect(injectDesktopDocumentStyles, []);
  if (!initialized) return <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}><Loading /></View>;
  return <View style={styles.root}><Image source={require('../../assets/wallpaper.png')} style={styles.backgroundImage} />{session ? <DesktopShell /> : <View style={{ flex: 1, backgroundColor: 'transparent' }}><TitleBar /><AuthDesktop /></View>}</View>;
}
