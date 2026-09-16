import * as AuthSession from 'expo-auth-session';
import { Platform } from 'react-native';
import { chaveDeArtista } from '../lib/artistName';
import { ENV } from '../lib/env';
import {
  falhaDaApi, falhaDaAutorizacao, gostoAPartirDoSpotify, type FalhaDoSpotify, type GostoDoSpotify,
} from '../lib/gostoDoSpotify';
import { setGostoDoSpotify } from '../lib/prefs';

/**
 * Ler o gosto de uma conta do Spotify, uma vez, e guardá-lo nas preferências.
 * A regra de como pesa vive em `lib/gostoDoSpotify.ts`.
 *
 * - **Não se guarda token nenhum.** Lê-se, calcula-se, e o acesso morre aqui.
 *   Atualizar é voltar a carregar no botão -- o Spotify lembra-se da
 *   autorização e não volta a perguntar.
 * - **PKCE, sem segredo**: numa app instalada não há onde esconder um segredo.
 * - **Só no iPhone.** O endereço de regresso é o esquema `duotone://`, que o
 *   Electron não trata. O gosto viaja para o PC pelas preferências.
 * - **Modo de desenvolvimento do Spotify**: só entram as contas acrescentadas
 *   à mão no painel da app (developer.spotify.com, no máximo cinco). As outras
 *   fazem login mas levam 403 "User not registered" na API: é o
 *   `nao-registado`. Ver `falhaDaApi`.
 */

const DESCOBERTA = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};
const ESCOPOS = ['user-top-read', 'user-read-recently-played'];

/** Tem de estar, exatamente assim, nos Redirect URIs da app do Spotify. */
export const REGRESSO_DO_SPOTIFY = 'duotone://spotify-auth';

export class ErroDoSpotify extends Error {
  constructor(readonly tipo: FalhaDoSpotify, detalhe?: string) {
    super(detalhe ?? tipo);
  }
}

export function spotifyDisponivel(): boolean {
  return Platform.OS === 'ios' && !!ENV.SPOTIFY_CLIENT_ID;
}

export async function importarGostoDoSpotify(): Promise<GostoDoSpotify> {
  if (!spotifyDisponivel()) throw new ErroDoSpotify('sem-configuracao');
  const clientId = ENV.SPOTIFY_CLIENT_ID;
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'duotone', path: 'spotify-auth' });

  const pedido = new AuthSession.AuthRequest({
    clientId,
    scopes: ESCOPOS,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
  });
  const resposta = await pedido.promptAsync(DESCOBERTA);
  if (resposta.type === 'error') {
    const erro = resposta.params?.error ?? resposta.error?.message;
    throw new ErroDoSpotify(falhaDaAutorizacao(erro), erro);
  }
  if (resposta.type !== 'success' || !resposta.params.code) throw new ErroDoSpotify('cancelado');

  let token: string;
  try {
    const trocado = await AuthSession.exchangeCodeAsync(
      { clientId, code: resposta.params.code, redirectUri, extraParams: { code_verifier: pedido.codeVerifier ?? '' } },
      DESCOBERTA,
    );
    token = trocado.accessToken;
  } catch (e: any) {
    const erro = `${e?.code ?? ''} ${e?.message ?? ''}`.trim();
    throw new ErroDoSpotify(falhaDaAutorizacao(erro), erro);
  }

  const [curto, medio, longo, recentes] = await Promise.all([
    maisOuvidos(token, 'short_term'),
    maisOuvidos(token, 'medium_term'),
    maisOuvidos(token, 'long_term'),
    ouvidosHaPouco(token),
  ]);
  const gosto = gostoAPartirDoSpotify({ curto, medio, longo, recentes }, chaveDeArtista, Date.now());
  if (gosto.artistas.length === 0) throw new ErroDoSpotify('vazio');
  await setGostoDoSpotify(gosto);
  return gosto;
}

async function lerDoSpotify(caminho: string, token: string): Promise<any> {
  let r: Response;
  try {
    r = await fetch(`https://api.spotify.com/v1${caminho}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch (e: any) {
    throw new ErroDoSpotify('rede', e?.message);
  }
  // O corpo diz porquê: em modo de desenvolvimento, que a conta não está na lista.
  const corpo = r.ok ? '' : await r.text().catch(() => '');
  const falha = falhaDaApi(r.status, corpo);
  if (falha) throw new ErroDoSpotify(falha, `HTTP ${r.status} ${corpo.slice(0, 200)}`);
  return r.json();
}

async function maisOuvidos(token: string, periodo: 'short_term' | 'medium_term' | 'long_term'): Promise<string[]> {
  const dados = await lerDoSpotify(`/me/top/artists?time_range=${periodo}&limit=50`, token);
  return (dados?.items ?? []).map((a: any) => a?.name).filter((n: unknown): n is string => typeof n === 'string');
}

async function ouvidosHaPouco(token: string): Promise<string[]> {
  const dados = await lerDoSpotify('/me/player/recently-played?limit=50', token);
  return (dados?.items ?? [])
    .map((i: any) => i?.track?.artists?.[0]?.name)
    .filter((n: unknown): n is string => typeof n === 'string');
}
