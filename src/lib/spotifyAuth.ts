import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { ENV } from './env';

WebBrowser.maybeCompleteAuthSession();

const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};

const SCOPES = [
  'user-read-email',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
];

const KEY_ACCESS = 'spotify_access_token';
const KEY_REFRESH = 'spotify_refresh_token';
const KEY_EXPIRES = 'spotify_expires_at';

/** Tem de estar registado tal e qual no dashboard da Spotify. */
export const SPOTIFY_REDIRECT_URI = AuthSession.makeRedirectUri({
  scheme: 'duotone',
  path: 'spotify-auth',
});

async function saveTokens(t: AuthSession.TokenResponse): Promise<void> {
  const expiresAt = Date.now() + (t.expiresIn ?? 3600) * 1000;
  await SecureStore.setItemAsync(KEY_ACCESS, t.accessToken);
  if (t.refreshToken) {
    await SecureStore.setItemAsync(KEY_REFRESH, t.refreshToken);
  }
  await SecureStore.setItemAsync(KEY_EXPIRES, String(expiresAt));
}

/** Abre o consentimento da Spotify (Authorization Code + PKCE). */
export async function connectSpotify(): Promise<boolean> {
  const request = new AuthSession.AuthRequest({
    clientId: ENV.SPOTIFY_CLIENT_ID,
    scopes: SCOPES,
    usePKCE: true,
    redirectUri: SPOTIFY_REDIRECT_URI,
  });

  const result = await request.promptAsync(discovery);
  if (result.type !== 'success' || !result.params.code) return false;

  const tokens = await AuthSession.exchangeCodeAsync(
    {
      clientId: ENV.SPOTIFY_CLIENT_ID,
      code: result.params.code,
      redirectUri: SPOTIFY_REDIRECT_URI,
      extraParams: { code_verifier: request.codeVerifier ?? '' },
    },
    discovery
  );

  await saveTokens(tokens);
  return true;
}

/** Devolve um access token válido, renovando se necessário. */
export async function getSpotifyAccessToken(): Promise<string | null> {
  const [access, refresh, expires] = await Promise.all([
    SecureStore.getItemAsync(KEY_ACCESS),
    SecureStore.getItemAsync(KEY_REFRESH),
    SecureStore.getItemAsync(KEY_EXPIRES),
  ]);

  const stillValid =
    access && expires && Date.now() < Number(expires) - 60_000;
  if (stillValid) return access;

  if (!refresh) return null;

  try {
    const tokens = await AuthSession.refreshAsync(
      { clientId: ENV.SPOTIFY_CLIENT_ID, refreshToken: refresh },
      discovery
    );
    await saveTokens(tokens);
    return tokens.accessToken;
  } catch (e) {
    console.warn('[spotify] falha ao renovar token', e);
    return null;
  }
}

export async function isSpotifyConnected(): Promise<boolean> {
  const refresh = await SecureStore.getItemAsync(KEY_REFRESH);
  return !!refresh;
}

export async function disconnectSpotify(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEY_ACCESS),
    SecureStore.deleteItemAsync(KEY_REFRESH),
    SecureStore.deleteItemAsync(KEY_EXPIRES),
  ]);
}
