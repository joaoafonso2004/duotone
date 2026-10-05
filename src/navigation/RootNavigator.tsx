import type { NavigatorScreenParams } from '@react-navigation/native';
import {useReducedMotion} from '../hooks/useReducedMotion';
import { OfflineNotice,withInternet } from '../components/OfflineNotice';
import { useConnectivity } from '../state/connectivity';
import { useSocial } from '../state/social';
import { naoLidasPorAmigo } from '../lib/social';
import { FriendProfileScreen } from '../screens/FriendProfileScreen';
import { BarreiraDeErros } from '../components/BarreiraDeErros';
import { anotarEcra } from '../state/saudeDaApp';
import {
  DarkTheme,
  LinkingOptions,
  NavigationContainer,
  Theme,
  createNavigationContainerRef,
  getFocusedRouteNameFromRoute,
} from '@react-navigation/native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { BarraDeSeparadores } from './BarraDeSeparadores';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { Animated, StyleSheet, View, ActivityIndicator } from 'react-native';
import { escalaDoFundo, raioDoFundo, veuDoFundo } from '../state/transicaoDoLeitor';
import { HandoffBanner } from '../components/HandoffBanner';
import { PlayerRoot } from '../components/PlayerRoot';
import { Doca } from '../components/Doca';
import { atualizarDoca } from '../state/doca';
import { ArtistsScreen } from '../screens/ArtistsScreen';
import { AuthScreen } from '../screens/AuthScreen';
import { ImportYouTubeScreen } from '../screens/ImportYouTubeScreen';
import { ListeningStatsScreen } from '../screens/ListeningStatsScreen';
import { DownloadsScreen } from '../screens/DownloadsScreen';
import { LibraryCheckScreen } from '../screens/LibraryCheckScreen';
import { RetrospetivaScreen } from '../screens/RetrospetivaScreen';
import { LibraryGroupScreen } from '../screens/LibraryGroupScreen';
import { PrateleiraScreen } from '../screens/PrateleiraScreen';
import type { NomeDaPrateleira } from '../state/recomendacoes';
import { PlaylistDetailScreen } from '../screens/PlaylistDetailScreen';
import { VocesOsDoisScreen } from '../screens/VocesOsDoisScreen';
import { PlaylistsScreen } from '../screens/PlaylistsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { FilaScreen } from '../screens/FilaScreen';
import { FolhaScreen } from '../screens/FolhaScreen';
import type { DetentesDaFolha } from '../state/folhasNativas';
import { SongsScreen } from '../screens/SongsScreen';
import { SocialScreen } from '../screens/SocialScreen';
import { ConversaScreen } from '../screens/ConversaScreen';
import { useAuth } from '../state/auth';
import { colors } from '../theme';
import { useTheme } from '../state/theme';
import { useNotifications } from '../state/notifications';
import { useInAppNotifications } from '../hooks/useInAppNotifications';
import { NotificationBanner } from '../components/NotificationBanner';
import { AvisoDeRemocao } from '../components/AvisoDeRemocao';
import { AvisoDaReproducao } from '../components/AvisoDaReproducao';
import { ProgressoDaImportacao } from '../components/ProgressoDaImportacao';
import { BoasVindas } from '../components/BoasVindas';
import { usePlayer } from '../state/player';
import { closeNotificationOverlays } from '../lib/notificationOverlays';
import type { NotificationTarget } from '../lib/inAppNotifications';

const OnlineArtists=withInternet(ArtistsScreen,'Artists');
const OnlineImportYouTube=withInternet(ImportYouTubeScreen,'ImportYouTube');
const OnlineListeningStats=withInternet(ListeningStatsScreen,'ListeningStats');
const OnlineRetrospetiva=withInternet(RetrospetivaScreen,'Retrospetiva');
const OnlineLibraryGroup=withInternet(LibraryGroupScreen,'LibraryGroup');
const OnlinePrateleira=withInternet(PrateleiraScreen,'Prateleira');
const OnlinePlaylistDetail=withInternet(PlaylistDetailScreen,'PlaylistDetail');
const OnlinePlaylists=withInternet(PlaylistsScreen,'Playlists');
const OnlineProfile=withInternet(ProfileScreen,'Profile');
const OnlineSearch=withInternet(SearchScreen,'Search');
const OnlineSocial=withInternet(SocialScreen,'Social');
const OnlineFriendProfile=withInternet(FriendProfileScreen,'Profile');
const OnlineVocesOsDois=withInternet(VocesOsDoisScreen,'Profile');

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabsParamList>;
  Settings: undefined;
  /** A fila numa folha nativa do iOS (3/10, `screens/FilaScreen.tsx`). */
  Fila: undefined;
  /**
   * As outras folhas, nativas no iOS (4/10, `screens/FolhaScreen.tsx`): o
   * conteúdo vive em `state/folhasNativas.ts`, pelo `id`.
   */
  Folha: { id: string; detentes?: DetentesDaFolha };
  ListeningStats: {userId?:string} | undefined;
  Retrospetiva: {ano?:number;userId?:string} | undefined;
  Downloads: undefined;
  /** O Library check. Ver `screens/LibraryCheckScreen.tsx`. */
  LibraryCheck: undefined;
  FriendProfile: {userId:string};
  Conversa: {kind:'friend'|'group';id:string};
  /** A pagina sobre ti e um amigo. Ver `screens/VocesOsDoisScreen.tsx`. */
  VocesOsDois: { userId: string; nome?: string };
  Playlists: undefined;
  /** `editar`: abre já na edição (o "Edit playlist" do toque longo, 28/9). */
  PlaylistDetail: { id: string; name: string; editar?: boolean };
  ImportYouTube: undefined;
  Artists: undefined;
  LibraryGroup: { type: 'album' | 'artist'; name: string };
  /**
   * A lista completa de uma prateleira de recomendações ou de uma mistura.
   *
   * Leva a ORIGEM e não as faixas: assim é uma vista sobre a store, e não uma
   * cópia congelada que fica a mostrar o que já não existe depois de um
   * refrescar.
   */
  Prateleira: {
    titulo: string;
    fonte:
      | { tipo: 'prateleira'; nome: NomeDaPrateleira }
      | { tipo: 'mistura'; id: string }
      /** A Daily mix do iPhone. Ver `state/misturaDoDia.ts`. */
      | { tipo: 'doDia' };
  };
};

/** Os separadores de baixo. Exportado para quem precisa de saltar de um para
 *  outro -- o `RootStackParamList` nao os conhece, e o `navigate` tipado por
 *  ele recusa-os. */
export type TabsParamList = {
  Search: undefined;
  Songs: undefined;
  Artists: undefined;
  Playlists: undefined;
  Profile: undefined;
  /**
   * O Social e uma SECCAO, e nao um ecra empilhado -- mas nao aparece na
   * barra.
   *
   * Porque mudou: a app muda de seccao a arrastar para os lados, e o Perfil
   * era a ultima. Arrastar para la dele nao fazia nada, e o Social so se
   * abria por botao. Como seccao, o arrastar leva la com o mesmo gesto e a
   * mesma animacao de todas as outras -- e o botao das mensagens continua
   * onde estava, para quem prefere tocar.
   *
   * Fora da barra porque seis icones apertavam os cinco que ja la estao. Quem
   * o filtra e a `BarraDeSeparadores`.
   */
  Social: { openChatWithFriendId?: string; openGroupId?: string } | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createMaterialTopTabNavigator<TabsParamList>();

const stackScreenOptions = { headerShown: false } as const;

/**
 * Cada ecrã leva a sua barreira de erros: um que rebente mostra "Reload" e os
 * outros (e o leitor, que vive fora deles) continuam. Ver `BarreiraDeErros`.
 */
function envolverEcra({ route, children }: { route: { name: string }; children: React.ReactElement }) {
  return <BarreiraDeErros onde={`ecra:${route.name}`}>{children}</BarreiraDeErros>;
}

// Cada tab com navegação para ecrãs de detalhe recebe o seu próprio stack
// aninhado. Assim, ao abrir um álbum/artista/playlist a tab bar de baixo
// continua visível (o React Navigation mantém-na renderizada à volta de
// qualquer stack aninhado) — antes, estes ecrãs eram irmãos da própria Tabs
// no stack raiz, o que escondia a barra por completo.
function PlaylistsStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions} screenLayout={envolverEcra}>
      <Stack.Screen name="Playlists" component={OnlinePlaylists} />
      <Stack.Screen name="PlaylistDetail" component={OnlinePlaylistDetail} />
      <Stack.Screen name="ImportYouTube" component={OnlineImportYouTube} />
    </Stack.Navigator>
  );
}

function ArtistsStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions} screenLayout={envolverEcra}>
      <Stack.Screen name="Artists" component={OnlineArtists} />
      <Stack.Screen name="LibraryGroup" component={OnlineLibraryGroup} />
    </Stack.Navigator>
  );
}


/**
 * Os cinco separadores, agora com o dedo.
 *
 * Trocou-se o `bottom-tabs` por um navegador com paginador porque o primeiro
 * não desliza -- não é configuração, é uma decisão da biblioteca. A barra
 * continua em baixo e continua com o mesmo aspecto; está escrita à mão no
 * `BarraDeSeparadores`, que é o preço do gesto.
 *
 * Montam-se a escolhida e as vizinhas (`lazyPreloadDistance: 1`): com
 * deslize, a página do lado entra no ecrã ENQUANTO o dedo se move, e uma que
 * só começasse a montar nesse instante mostrava um vazio a meio do gesto. As
 * outras montam-se uma a uma depois da abertura (`BarraDeSeparadores`,
 * auditoria 4.2, 4/10). Até aí montavam as cinco no arranque, com a abertura
 * a correr -- e o relatório tinha uma paragem de quase um segundo ali.
 */
function Tabs() {
  const reducedMotion = useReducedMotion();

  return (
    <Tab.Navigator
      screenLayout={envolverEcra}
      initialRouteName={useConnectivity.getState().offline ? 'Songs' : 'Search'}
      tabBarPosition="bottom"
      tabBar={(props) => <BarraDeSeparadores {...props} />}
      screenOptions={{
        lazy: true,
        lazyPreloadDistance: 1,
        // Quem pediu menos animação continua a poder tocar nos separadores; o
        // que se lhe tira é a página a correr por baixo do dedo.
        swipeEnabled: !reducedMotion,
        animationEnabled: !reducedMotion,
      }}
    >
      <Tab.Screen name="Search" component={OnlineSearch} />
      <Tab.Screen name="Songs" component={SongsScreen} />
      <Tab.Screen name="Artists" component={ArtistsStack} options={({ route }) => ({
        swipeEnabled: !reducedMotion && (getFocusedRouteNameFromRoute(route) ?? 'Artists') === 'Artists',
      })} />
      <Tab.Screen name="Playlists" component={PlaylistsStack} options={({ route }) => ({
        swipeEnabled: !reducedMotion && (getFocusedRouteNameFromRoute(route) ?? 'Playlists') === 'Playlists',
      })} />
      <Tab.Screen name="Profile" component={OnlineProfile} />
      {/* Depois do Perfil, e escondido da barra: e o destino do arrastar para
          la da ultima seccao. Ver o `TabsParamList`. */}
      <Tab.Screen name="Social" component={OnlineSocial} />
    </Tab.Navigator>
  );
}

function Splash() {
  return (
    <View style={styles.splash}>
      <LinearGradient
        colors={['#0F0F12', '#0A0A0C']}
        style={StyleSheet.absoluteFill}
      />
      <ActivityIndicator size="large" color="#8E8E93" />
    </View>
  );
}

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Os links `duotone://` (eram do widget, que saiu a 1/10) entram pelo scheme
// da app e chegam directamente à conversa escolhida. Sem esta configuração, o iOS abria o Duotone mas
// deixava-o na página onde já estava.
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['duotone://'],
  config: {
    screens: {
      // O Social passou a viver DENTRO dos separadores, por isso o caminho
      // tem de ir buscá-lo lá. Deixá-lo à raiz fazia o `duotone://social` do
      // widget abrir a app e não sair do sítio -- que é exactamente o
      // problema que esta configuração existe para resolver.
      Tabs: {
        screens: {
          Social: {
            path: 'social',
          },
        },
      },
    },
  },
};

function visibleConversation(): string | null {
  // A conversa é uma página própria (Conversa) desde 5/10; o Social é só a lista.
  if (!navigationRef.isReady() || navigationRef.getCurrentRoute()?.name !== 'Conversa' || usePlayer.getState().expanded) return null;
  const c = useSocial.getState().conversation;
  return c ? c.kind === 'group' ? `group:${c.id}` : c.id : null;
}
async function openNotification(target: NotificationTarget) {
  const userId = useAuth.getState().session?.user.id;
  await closeNotificationOverlays();
  if (!userId || useAuth.getState().session?.user.id !== userId) return;
  if (!navigationRef.isReady()) return;
  usePlayer.getState().setExpanded(false);
  // Explicitly select on every tap, including a repeated link to the same chat.
  useSocial.setState({conversation:target.groupId ? {kind:'group',id:target.groupId}
    : target.friendId ? {kind:'friend',id:target.friendId} : null});
  navigationRef.navigate('Tabs',{screen:'Social',params:{openChatWithFriendId:target.friendId,openGroupId:target.groupId}});
}

export function RootNavigator() {
  const session = useAuth((s) => s.session);
  const offlineUserId=useAuth(s=>s.offlineUserId);
  const offline=useConnectivity(s=>s.offline);
  const initialized = useAuth((s) => s.initialized);
  const theme = useTheme((s) => s.destino);

  const socialReceived=useSocial(s=>s.received);
  const socialSeen=useSocial(s=>s.seen);
  const socialFriends=useSocial(s=>s.friends);
  useEffect(()=>{
    const unread=naoLidasPorAmigo(socialReceived,socialSeen).size>0;
    const pending=socialFriends.some(f=>f.status==='pending'&&!f.isSender);
    useNotifications.setState({hasNotification:unread||pending,hasSocialNotification:unread||pending});
  },[socialReceived,socialSeen,socialFriends]);

  useInAppNotifications(visibleConversation);

  if (!initialized) return <Splash />;

  const navTheme: Theme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: theme.color,
      background: 'transparent',
      card: colors.bg,
      text: colors.text,
      border: colors.border,
    },
  };

  return (
    <NavigationContainer
      theme={navTheme}
      ref={navigationRef}
      linking={linking}
      // NUNCA abre sozinha nos Downloads (João, 24/9): a 3.8.1 fazia-o com e sem
      // rede, porque o estado da rede chega depois da navegação. Os Downloads
      // estão onde sempre estiveram, e sem rede as Songs já só mostram o que toca.
      onReady={() => { anotarEcra(navigationRef.getCurrentRoute()?.name); atualizarDoca(navigationRef.getRootState()); }}
      onStateChange={() => { anotarEcra(navigationRef.getCurrentRoute()?.name); atualizarDoca(navigationRef.getRootState()); }}
    >
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {session || offlineUserId ? (
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            {/* A app recua quando o leitor abre (2/10): encolhe, ganha os cantos
                redondos e escurece, e volta para a frente com o gesto de o
                fechar. O preto à volta é o que se vê entre ela e o ecrã. Ver
                state/transicaoDoLeitor.ts. */}
            <Animated.View style={{ flex: 1, overflow: 'hidden', borderRadius: raioDoFundo, transform: [{ scale: escalaDoFundo }] }}>
            {/* Imagem de fundo abstrata global (renderizada apenas uma vez na app inteira) */}
            {/* O desfoque vem na PRÓPRIA imagem, calculado uma vez quando ela
                carrega. Era um BlurView de ecrã inteiro por cima dela: um
                desfoque ao vivo que o iPhone recalculava sempre que alguma
                coisa mexia no ecrã (a capa a flutuar, as listas a deslizar), e
                que quase não se via -- está tapado a 88% pela camada preta. */}
            <Image
              source={require('../../assets/login_bg.png')}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={300}
              blurRadius={12}
            />

            {/* Camada preta semi-transparente para alto contraste e legibilidade */}
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: 'rgba(10, 10, 15, 0.88)' }
              ]}
            />

            <Stack.Navigator screenOptions={stackScreenOptions} screenLayout={envolverEcra}>
              <Stack.Screen name="Tabs" component={Tabs} />
              <Stack.Screen name="Settings" component={SettingsScreen} />
              {/* A fila numa folha NATIVA (3/10): abre a meio e sobe toda; a
                  app de trás recua com os cantos redondos quando sobe. */}
              <Stack.Screen
                name="Fila"
                component={FilaScreen}
                options={{
                  presentation: 'formSheet',
                  sheetAllowedDetents: [0.5, 1],
                  sheetGrabberVisible: true,
                  sheetExpandsWhenScrolledToEdge: true,
                  contentStyle: { backgroundColor: colors.surfaceHigh },
                }}
              />
              {/* As outras folhas (4/10): o `BottomSheet` empurra esta rota no
                  iPhone. Cabem no conteúdo, a não ser que peçam alturas. */}
              <Stack.Screen
                name="Folha"
                component={FolhaScreen}
                options={({ route }) => ({
                  presentation: 'formSheet',
                  sheetAllowedDetents: route.params.detentes ?? 'fitToContents',
                  sheetGrabberVisible: true,
                  sheetExpandsWhenScrolledToEdge: route.params.detentes !== undefined && route.params.detentes !== 'fitToContents',
                  contentStyle: { backgroundColor: colors.surfaceHigh },
                })}
              />
              <Stack.Screen name="ListeningStats" component={OnlineListeningStats} />
              <Stack.Screen name="Retrospetiva" component={OnlineRetrospetiva} />
              {/* Sem withInternet: ver o que está guardado é justamente o que
                  tem de funcionar sem rede. */}
              <Stack.Screen name="Downloads" component={DownloadsScreen} />
              <Stack.Screen name="LibraryCheck" component={LibraryCheckScreen} />
              <Stack.Screen name="FriendProfile" component={OnlineFriendProfile} />
              <Stack.Screen name="Conversa" component={ConversaScreen} options={{gestureEnabled:true,fullScreenGestureEnabled:true,gestureDirection:'horizontal'}} />
              <Stack.Screen name="VocesOsDois" component={OnlineVocesOsDois} />
              <Stack.Screen name="LibraryGroup" component={OnlineLibraryGroup} />
              <Stack.Screen name="Prateleira" component={OnlinePrateleira} />
              <Stack.Screen name="PlaylistDetail" component={OnlinePlaylistDetail} />
            </Stack.Navigator>
            {/* A base de baixo: o vidro do mini-player e dos separadores (3/10).
                Por cima dos ecrãs e dentro da app de trás: recua com ela. */}
            <Doca />
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: veuDoFundo }]} />
            </Animated.View>
            {/* O leitor contém o motor: se rebentar, volta a montar sozinho
                (e a faixa retoma), sem aviso por cima da app. */}
            <BarreiraDeErros onde="leitor" discreta>
              <PlayerRoot />
            </BarreiraDeErros>
            {/* "A tocar no PC — continuar aqui". Fica por cima do mini-player. */}
            <HandoffBanner />
            {/* O que se tirou, com "Undo" (3/10, lib/avisoDeRemocao.ts). */}
            <AvisoDeRemocao />
            <NotificationBanner onOpen={openNotification} />
            {/* "A música vai parar quando o ecrã bloquear": a extração do
                YouTube está bloqueada. Ver lib/saudeDaReproducao.ts. */}
            <AvisoDaReproducao />
            {/* As playlists a entrar por link, em segundo plano (26/9). */}
            <ProgressoDaImportacao />
            {/* O questionário da primeira vez (26/9): uma vez por conta. */}
            <BoasVindas />
            {/* REATIVADO (ago 2026). A condição que este comentário previa
                aconteceu: o ANDROID_VR já NÃO resolve áudio sem PO Token. O
                CDN corta em ~1MB cumulativos por vídeo/IP — medido no 4G do
                João, que descarregou 1 131 072 bytes e levou 403 a seguir,
                mesmo com os pedidos a encolher até 128KB. Sem PO Token não há
                música inteira. O custo (WebView escondida com a VM do
                BotGuard) passou a valer a pena. */}
            {/* DESLIGADO outra vez (ago 2026), agora com prova: com
                pot=yes o CDN cortou na mesma, no mesmo byte. O teto é de
                reputação do IP/sessão, não falta de token — de um IP limpo o
                ANDROID_VR descarrega tudo SEM token nenhum. Além disso o
                token que sabemos gerar é do desafio WEB e os PO Token são
                ligados ao cliente, por isso nunca autorizaria um URL pedido
                pelo ANDROID_VR. Não vale a WebView a correr a VM em
                permanencia. <BotGuardMinter /> para reativar. */}
          </View>
        ) : (
          <View style={{flex:1}}>{offline&&<OfflineNotice compact signIn/>}<AuthScreen /></View>
        )}
      </View>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogo: {
    width: 130,
    height: 130,
    marginBottom: 16,
  },
  splashText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
});
