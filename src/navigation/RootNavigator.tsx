import { Ionicons } from '@expo/vector-icons';
import {
  DarkTheme,
  NavigationContainer,
  Theme,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BlurView } from 'expo-blur';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PlayerRoot } from '../components/PlayerRoot';
import { AlbumsScreen } from '../screens/AlbumsScreen';
import { ArtistsScreen } from '../screens/ArtistsScreen';
import { AuthScreen } from '../screens/AuthScreen';
import { ImportYouTubeScreen } from '../screens/ImportYouTubeScreen';
import { LibraryGroupScreen } from '../screens/LibraryGroupScreen';
import { PlaylistDetailScreen } from '../screens/PlaylistDetailScreen';
import { PlaylistsScreen } from '../screens/PlaylistsScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SongsScreen } from '../screens/SongsScreen';
import { useAuth } from '../state/auth';
import { colors } from '../theme';

export type RootStackParamList = {
  Tabs: undefined;
  Settings: undefined;
  Playlists: undefined;
  PlaylistDetail: { id: string; name: string };
  ImportYouTube: undefined;
  Albums: undefined;
  Artists: undefined;
  LibraryGroup: { type: 'album' | 'artist'; name: string };
};

type TabsParamList = {
  Search: undefined;
  Songs: undefined;
  Albums: undefined;
  Artists: undefined;
  Playlists: undefined;
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

function AlbumsStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Albums" component={AlbumsScreen} />
      <Stack.Screen name="LibraryGroup" component={LibraryGroupScreen} />
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

const navTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.border,
  },
};

const TAB_ICONS: Record<keyof TabsParamList, keyof typeof Ionicons.glyphMap> = {
  Search: 'search',
  Songs: 'musical-notes',
  Albums: 'disc',
  Artists: 'people',
  Playlists: 'albums',
};

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        lazy: false,
        tabBarActiveTintColor: colors.text,
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
      <Tab.Screen name="Albums" component={AlbumsStack} />
      <Tab.Screen name="Artists" component={ArtistsStack} />
      <Tab.Screen name="Playlists" component={PlaylistsStack} />
    </Tab.Navigator>
  );
}

function Splash() {
  return (
    <View style={styles.splash}>
      <View style={styles.splashDots}>
        <View style={[styles.dot, { backgroundColor: colors.youtube }]} />
        <View style={[styles.dot, { backgroundColor: colors.spotify }]} />
      </View>
      <Text style={styles.splashText}>Duotone</Text>
    </View>
  );
}

export function RootNavigator() {
  const session = useAuth((s) => s.session);
  const initialized = useAuth((s) => s.initialized);

  if (!initialized) return <Splash />;

  return (
    <NavigationContainer theme={navTheme}>
      <View style={{ flex: 1 }}>
        {session ? (
          <>
            <Stack.Navigator screenOptions={stackScreenOptions}>
              <Stack.Screen name="Tabs" component={Tabs} />
              <Stack.Screen name="Settings" component={SettingsScreen} />
            </Stack.Navigator>
            <PlayerRoot />
          </>
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
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  splashDots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  splashText: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
  },
});
