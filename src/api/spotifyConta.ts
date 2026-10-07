import * as AuthSession from 'expo-auth-session';
import { Platform } from 'react-native';
import { chaveDeArtista } from '../lib/artistName';
import { ENV } from '../lib/env';
import {
  falhaDaApi, falhaDaAutorizacao, gostoAPartirDoSpotify, type FalhaDoSpotify, type GostoDoSpotify,
} from '../lib/gostoDoSpotify';
import { setGostoDoSpotify } from '../lib/prefs';
import {
  linhasDosItens, listasParaEscolher, MAXIMO_DA_CONTA, MAXIMO_DE_PLAYLISTS, playlistsDosItens, quantasLer,
  type ListaDoSpotify,
} from '../lib/bibliotecaDoSpotify';
import type { LinhaDaPlaylist } from '../lib/linkDePlaylist';

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
/** Para importar a biblioteca (7/10): as playlists (também as privadas e colaborativas) e as Liked Songs. */
const ESCOPOS_DA_BIBLIOTECA = ['playlist-read-private', 'playlist-read-collaborative', 'user-library-read'];

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

/** O login PKCE e a troca do código; devolve o token, que vive só na memória de quem chamou. */
async function autorizar(escopos: string[]): Promise<string> {
  if (!spotifyDisponivel()) throw new ErroDoSpotify('sem-configuracao');
  const clientId = ENV.SPOTIFY_CLIENT_ID;
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'duotone', path: 'spotify-auth' });

  const pedido = new AuthSession.AuthRequest({
    clientId,
    scopes: escopos,
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

  try {
    const trocado = await AuthSession.exchangeCodeAsync(
      { clientId, code: resposta.params.code, redirectUri, extraParams: { code_verifier: pedido.codeVerifier ?? '' } },
      DESCOBERTA,
    );
    return trocado.accessToken;
  } catch (e: any) {
    const erro = `${e?.code ?? ''} ${e?.message ?? ''}`.trim();
    throw new ErroDoSpotify(falhaDaAutorizacao(erro), erro);
  }
}

export async function importarGostoDoSpotify(): Promise<GostoDoSpotify> {
  const token = await autorizar(ESCOPOS);

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

/**
 * A biblioteca do Spotify, para escolher o que importar (7/10, iPhone): as
 * Liked Songs e as playlists. O `ler` traz as músicas de uma lista com o mesmo
 * token -- vive aqui, na memória, e morre com a escolha (nada se guarda).
 */
export type BibliotecaDoSpotify = {
  listas: ListaDoSpotify[];
  ler: (lista: ListaDoSpotify) => Promise<{ linhas: LinhaDaPlaylist[]; cortada: boolean }>;
};

export async function abrirBibliotecaDoSpotify(): Promise<BibliotecaDoSpotify> {
  const token = await autorizar(ESCOPOS_DA_BIBLIOTECA);
  const eu = await lerDoSpotify('/me', token).then((d) => (typeof d?.id === 'string' ? d.id : null)).catch(() => null);
  const gostadas = Number((await lerDoSpotify('/me/tracks?limit=1', token))?.total) || 0;
  const playlists: ListaDoSpotify[] = [];
  for (let offset = 0; offset < MAXIMO_DE_PLAYLISTS; offset += 50) {
    const d = await lerDoSpotify(`/me/playlists?limit=50&offset=${offset}`, token);
    playlists.push(...playlistsDosItens(d?.items, eu));
    if (!d?.next) break;
  }
  const listas = listasParaEscolher(gostadas, playlists);
  if (!listas.length) throw new ErroDoSpotify('vazio');
  const ler = async (lista: ListaDoSpotify) => {
    const { ler: quantas, cortada } = quantasLer(lista.total);
    const gostadasDaConta = lista.id === 'gostadas';
    const passo = gostadasDaConta ? 50 : 100;
    const linhas: LinhaDaPlaylist[] = [];
    for (let offset = 0; offset < quantas; offset += passo) {
      const caminho = gostadasDaConta
        ? `/me/tracks?limit=50&offset=${offset}`
        : `/playlists/${encodeURIComponent(lista.id)}/tracks?limit=100&offset=${offset}`;
      const d = await lerDoSpotify(caminho, token);
      linhas.push(...linhasDosItens(d?.items));
      if (!d?.next) break;
    }
    return { linhas: linhas.slice(0, MAXIMO_DA_CONTA), cortada };
  };
  return { listas, ler };
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
