import { Ionicons } from '@expo/vector-icons';
import {
  DarkTheme,
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
import { PlayerRoot } from '../components/PlayerRoot';
import { ArtistsScreen } from '../screens/ArtistsScreen';
import { AuthScreen } from '../screens/AuthScreen';
import { ImportYouTubeScreen } from '../screens/ImportYouTubeScreen';
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
import { updateLastSeen } from '../api/social';

export type RootStackParamList = {
  Tabs: undefined;
  Settings: undefined;
  Playlists: undefined;
  PlaylistDetail: { id: string; name: string };
  ImportYouTube: undefined;
  Artists: undefined;
  LibraryGroup: { type: 'album' | 'artist'; name: string };
  Social: undefined;
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
      <Stack.Screen name="Playlists" component={PlaylistsScreen} />
      <Stack.Screen name="PlaylistDetail" component={PlaylistDetailScreen} />
      <Stack.Screen name="ImportYouTube" component={ImportYouTubeScreen} />
    </Stack.Navigator>
  );
}

function ArtistsStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Artists" component={ArtistsScreen} />
      <Stack.Screen name="LibraryGroup" component={LibraryGroupScreen} />
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
  const theme = useTheme((s) => s.theme);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
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
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons
            name={
              focused
                ? TAB_ICONS[route.name]
                : (`${TAB_ICONS[route.name]}-outline` as keyof typeof Ionicons.glyphMap)
            }
            size={size}
            color={color}
          />
        ),
      })}
    >
      <Tab.Screen name="Search" component={SearchScreen} />
      <Tab.Screen name="Songs" component={SongsScreen} />
      <Tab.Screen name="Artists" component={ArtistsStack} />
      <Tab.Screen name="Playlists" component={PlaylistsStack} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
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

export function RootNavigator() {
  const session = useAuth((s) => s.session);
  const initialized = useAuth((s) => s.initialized);
  const theme = useTheme((s) => s.theme);

  useEffect(() => {
    if (!session) return;
    updateLastSeen();
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') {
        updateLastSeen();
      }
    }, 45000);

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        updateLastSeen();
      }
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [session]);

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
    <NavigationContainer theme={navTheme} ref={navigationRef}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {session ? (
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
              <Stack.Screen name="Social" component={SocialScreen} />
            </Stack.Navigator>
            <PlayerRoot />
            {/* BotGuardMinter (PO Token on-device) DESLIGADO de propósito: o
                cliente ANDROID_VR resolve o áudio sem PO Token, tornando-o
                redundante, e a WebView escondida a correr a VM do BotGuard em
                cada sessão era pesada e suspeita de causar restarts. O código
                fica em BotGuardMinter.tsx para reativar SE um dia os clientes
                android começarem a exigir PO Token — bastaria voltar a montar
                <BotGuardMinter /> aqui. */}
          </View>
        ) : (
          <AuthScreen />
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
