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
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, AppState } from 'react-native';
import { HandoffBanner } from '../components/HandoffBanner';
import { PlayerRoot } from '../components/PlayerRoot';
import { ArtistsScreen } from '../screens/ArtistsScreen';
import { AuthScreen } from '../screens/AuthScreen';
import { ImportYouTubeScreen } from '../screens/ImportYouTubeScreen';
import { ListeningStatsScreen } from '../screens/ListeningStatsScreen';
import { LibraryGroupScreen } from '../screens/LibraryGroupScreen';
import { PlaylistDetailScreen } from '../screens/PlaylistDetailScreen';
import { PlaylistsScreen } from '../screens/PlaylistsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SongsScreen } from '../screens/SongsScreen';
import { SocialScreen } from '../screens/SocialScreen';
import { useAuth } from '../state/auth';
import { colors } from '../theme';
import { useTheme } from '../state/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNotificationsEnabled } from '../lib/prefs';
import * as Notifications from 'expo-notifications';
import { getFriendships, getInboxItems } from '../api/social';
import { useNotifications } from '../state/notifications';
import {
  ensureNotificationPermission,
  notifyNewInboxItems,
  notifyPendingFriendRequests,
} from '../lib/localNotifications';

const OnlineArtists=withInternet(ArtistsScreen,'Artists');
const OnlineImportYouTube=withInternet(ImportYouTubeScreen,'ImportYouTube');
const OnlineListeningStats=withInternet(ListeningStatsScreen,'ListeningStats');
const OnlineLibraryGroup=withInternet(LibraryGroupScreen,'LibraryGroup');
const OnlinePlaylistDetail=withInternet(PlaylistDetailScreen,'PlaylistDetail');
const OnlinePlaylists=withInternet(PlaylistsScreen,'Playlists');
const OnlineProfile=withInternet(ProfileScreen,'Profile');
const OnlineSearch=withInternet(SearchScreen,'Search');
const OnlineSocial=withInternet(SocialScreen,'Social');
const OnlineFriendProfile=withInternet(FriendProfileScreen,'Profile');

export type RootStackParamList = {
  Tabs: undefined;
  Settings: undefined;
  ListeningStats: {userId?:string} | undefined;
  FriendProfile: {userId:string};
  Playlists: undefined;
  PlaylistDetail: { id: string; name: string };
  ImportYouTube: undefined;
  Artists: undefined;
  LibraryGroup: { type: 'album' | 'artist'; name: string };
  Social: { openChatWithFriendId?: string; openGroupId?: string } | undefined;
};

type TabsParamList = {
  Search: undefined;
  Songs: undefined;
  Artists: undefined;
  Playlists: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabsParamList>();
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

const TAB_ICONS: Record<keyof TabsParamList, keyof typeof Ionicons.glyphMap> = {
  Search: 'search',
  Songs: 'musical-notes',
  Artists: 'people',
  Playlists: 'albums',
  Profile: 'person',
};

function Tabs() {
  const reducedMotion=useReducedMotion();
  // A navegação inteira não precisa de redesenhar em cada passo da animação;
  // os controlos/ecrãs visíveis animam o tema diretamente.
  const theme = useTheme((s) => s.destino);

  return (
    <Tab.Navigator
      initialRouteName={useConnectivity.getState().offline?"Songs":"Search"}
      screenOptions={({ route }) => ({
        headerShown: false,
        animation: reducedMotion?'none':'fade',
        transitionSpec: {animation:'timing',config:{duration:180}},
        lazy: false,
        tabBarActiveTintColor: theme.color,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          position: 'absolute',
          borderTopColor: colors.border,
          backgroundColor: 'transparent',
        },
        tabBarBackground: () => (
          <BlurView
            tint="dark"
            intensity={50}
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: 'rgba(10,10,15,0.72)' },
            ]}
          />
        ),
        tabBarIcon: ({ color, size, focused }) => {
          const hasNotification = useNotifications((s) => s.hasNotification);
          return (
            <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
              <StateIcon
                name={
                  focused
                    ? TAB_ICONS[route.name]
                    : (`${TAB_ICONS[route.name]}-outline` as keyof typeof Ionicons.glyphMap)
                }
                size={size}
                color={color}
              />
              {route.name === 'Profile' && hasNotification && (
                <View
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -2,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: '#FF3B30',
                  }}
                />
              )}
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Search" component={OnlineSearch} />
      <Tab.Screen name="Songs" component={SongsScreen} />
      <Tab.Screen name="Artists" component={ArtistsStack} />
      <Tab.Screen name="Playlists" component={PlaylistsStack} />
      <Tab.Screen name="Profile" component={OnlineProfile} />
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
      Social: {
        path: 'social',
      },
    },
  },
};

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

  // Rede de segurança para notificações enquanto há áudio em background.
  useEffect(() => {
    if (!session||offline) return;
    ensureNotificationPermission();

    const checkNewMessages = async () => {
      try {
        // A bolinha vermelha na app continua sempre; o que a preferência
        // controla são as notificações do sistema, que é o que incomoda.
        const notifyAllowed = await getNotificationsEnabled();
        const items = await getInboxItems();
        if (items.length > 0) {
          // Com a app em primeiro plano a bolinha vermelha chega; notificar
          // por cima disso seria ruído. Fora do primeiro plano (típico desta
          // app: a tocar música com o ecrã bloqueado) é a única forma de o
          // utilizador saber que recebeu alguma coisa.
          if (notifyAllowed && AppState.currentState !== 'active') {
            await notifyNewInboxItems(items);
          }
        }

        // Pedidos de amizade: ficam noutra tabela, não na inbox.
        const friendships = await getFriendships();
        // Recebido = pendente em que EU nao sou o remetente (nao ha campo
        // `direction`; a Friendship marca isso com `isSender`).
        const pendentes = friendships.filter((f) => f.status === 'pending' && !f.isSender).length;

        if (notifyAllowed && AppState.currentState !== 'active') {
          await notifyPendingFriendRequests(pendentes);
        }
      } catch (err) {
        // ignore
      }
    };

    // Em primeiro plano o Realtime de `useSocial` já atualiza a bolinha; duas
    // queries adicionais de 15 em 15 segundos só duplicavam trabalho. Este
    // caminho existe para notificações enquanto há áudio em background, com
    // a tarefa do BGTaskScheduler como recuperação quando o iOS suspende JS.
    const checkEmBackground=()=>{
      if(AppState.currentState!=='active')void checkNewMessages();
    };
    checkEmBackground();
    const interval = setInterval(checkEmBackground, 120000);
    const app=AppState.addEventListener('change',checkEmBackground);
    return () => {clearInterval(interval);app.remove();};
  }, [session,offline]);

  // Tocar na notificação leva ao Social — sem isto abria a app na última
  // página e o utilizador tinha de ir procurar a mensagem à mão.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const target = res.notification.request.content.data?.target;
      if (target === 'social' && navigationRef.isReady()) {
        const data=res.notification.request.content.data ?? {};
        navigationRef.navigate('Social',{openChatWithFriendId:typeof data.friendId==='string'?data.friendId:undefined,openGroupId:typeof data.groupId==='string'?data.groupId:undefined});
      }
    });
    return () => sub.remove();
  }, []);

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
              <Stack.Screen name="Social" component={OnlineSocial} />
              <Stack.Screen name="FriendProfile" component={OnlineFriendProfile} />
              <Stack.Screen name="LibraryGroup" component={OnlineLibraryGroup} />
              <Stack.Screen name="PlaylistDetail" component={OnlinePlaylistDetail} />
            </Stack.Navigator>
            <PlayerRoot />
            {/* "A tocar no PC — continuar aqui". Fica por cima do mini-player. */}
            <HandoffBanner />
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
