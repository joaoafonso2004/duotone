import type { NavigatorScreenParams } from '@react-navigation/native';
import {useReducedMotion} from '../hooks/useReducedMotion';
import {StateIcon} from '../components/StateIcon';
import { OfflineNotice,withInternet } from '../components/OfflineNotice';
import { useConnectivity } from '../state/connectivity';
import { useSocial } from '../state/social';
import { naoLidasPorAmigo } from '../lib/social';
import { FriendProfileScreen } from '../screens/FriendProfileScreen';
import Ionicons from '@expo/vector-icons/Ionicons';
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
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { Animated, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { HandoffBanner } from '../components/HandoffBanner';
import { PlayerRoot } from '../components/PlayerRoot';
import { ArtistsScreen } from '../screens/ArtistsScreen';
import { AuthScreen } from '../screens/AuthScreen';
import { ImportYouTubeScreen } from '../screens/ImportYouTubeScreen';
import { ListeningStatsScreen } from '../screens/ListeningStatsScreen';
import { DownloadsScreen } from '../screens/DownloadsScreen';
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
import { SongsScreen } from '../screens/SongsScreen';
import { SmartCollectionsScreen } from '../screens/SmartCollectionsScreen';
import { SocialScreen } from '../screens/SocialScreen';
import { useAuth } from '../state/auth';
import { colors } from '../theme';
import { useTheme } from '../state/theme';
import { useNotifications } from '../state/notifications';
import { useInAppNotifications } from '../hooks/useInAppNotifications';
import { NotificationBanner } from '../components/NotificationBanner';
import { AvisoDaReproducao } from '../components/AvisoDaReproducao';
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
  ListeningStats: {userId?:string} | undefined;
  Retrospetiva: {ano?:number;userId?:string} | undefined;
  Downloads: undefined;
  SmartCollections: undefined;
  FriendProfile: {userId:string};
  /** A pagina sobre ti e um amigo. Ver `screens/VocesOsDoisScreen.tsx`. */
  VocesOsDois: { userId: string; nome?: string };
  Playlists: undefined;
  PlaylistDetail: { id: string; name: string };
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
      | { tipo: 'mistura'; id: string };
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

// Cada tab com navegação para ecrãs de detalhe recebe o seu próprio stack
// aninhado. Assim, ao abrir um álbum/artista/playlist a tab bar de baixo
// continua visível (o React Navigation mantém-na renderizada à volta de
// qualquer stack aninhado) — antes, estes ecrãs eram irmãos da própria Tabs
// no stack raiz, o que escondia a barra por completo.
function PlaylistsStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Playlists" component={OnlinePlaylists} />
      <Stack.Screen name="PlaylistDetail" component={OnlinePlaylistDetail} />
      <Stack.Screen name="ImportYouTube" component={OnlineImportYouTube} />
    </Stack.Navigator>
  );
}

function ArtistsStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
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
 * O `lazy` fica desligado como estava: as páginas montam todas de uma vez.
 * Com deslize isso passou de preferência a necessidade -- a página do lado
 * entra no ecrã ENQUANTO o dedo se move, e uma que só começasse a montar
 * nesse instante mostrava um vazio a meio do gesto.
 */
function Tabs() {
  const reducedMotion = useReducedMotion();

  return (
    <Tab.Navigator
      initialRouteName={useConnectivity.getState().offline ? 'Songs' : 'Search'}
      tabBarPosition="bottom"
      tabBar={(props) => <BarraDeSeparadores {...props} />}
      screenOptions={{
        lazy: false,
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

// Os links do widget entram pelo scheme da app e chegam directamente à
// conversa escolhida. Sem esta configuração, o iOS abria o Duotone mas
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
  if (!navigationRef.isReady() || navigationRef.getCurrentRoute()?.name !== 'Social' || usePlayer.getState().expanded) return null;
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
    <NavigationContainer theme={navTheme} ref={navigationRef} linking={linking}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {session || offlineUserId ? (
          <View style={{ flex: 1 }}>
            {/* Imagem de fundo abstrata global (renderizada apenas uma vez na app inteira) */}
            <Image
              source={require('../../assets/login_bg.png')}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={300}
            />

            {/* Camada de desfoque (blur) */}
            <BlurView
              intensity={20}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />

            {/* Camada preta semi-transparente para alto contraste e legibilidade */}
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: 'rgba(10, 10, 15, 0.88)' }
              ]}
            />

            <Stack.Navigator screenOptions={stackScreenOptions}>
              <Stack.Screen name="Tabs" component={Tabs} />
              <Stack.Screen name="Settings" component={SettingsScreen} />
              <Stack.Screen name="ListeningStats" component={OnlineListeningStats} />
              <Stack.Screen name="Retrospetiva" component={OnlineRetrospetiva} />
              {/* Sem withInternet: ver o que está guardado é justamente o que
                  tem de funcionar sem rede. */}
              <Stack.Screen name="Downloads" component={DownloadsScreen} />
              <Stack.Screen name="SmartCollections" component={SmartCollectionsScreen} />
              <Stack.Screen name="FriendProfile" component={OnlineFriendProfile} />
              <Stack.Screen name="VocesOsDois" component={OnlineVocesOsDois} />
              <Stack.Screen name="LibraryGroup" component={OnlineLibraryGroup} />
              <Stack.Screen name="Prateleira" component={OnlinePrateleira} />
              <Stack.Screen name="PlaylistDetail" component={OnlinePlaylistDetail} />
            </Stack.Navigator>
            <PlayerRoot />
            {/* "A tocar no PC — continuar aqui". Fica por cima do mini-player. */}
            <HandoffBanner />
            <NotificationBanner onOpen={openNotification} />
            {/* "A música vai parar quando o ecrã bloquear": a extração do
                YouTube está bloqueada. Ver lib/saudeDaReproducao.ts. */}
            <AvisoDaReproducao />
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
