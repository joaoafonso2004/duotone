import { supabase } from '../lib/supabase';
import { displayArtist, type FaixaParaAprender } from '../lib/artistName';
import type { FaixaComArtista } from '../lib/afinidade';
import { lerFaixasDasPlaylists, esquecerFaixasDasPlaylists, type LinhaDePlaylist } from './playlistSnapshot';
import { medirTrabalho, cederParaInterface } from '../lib/trabalhoLocal';

/**
 * Os pares artista-playlist do utilizador, que é o que dá a co-ocorrência.
 *
 * **Porque não serve o `getLibrary`.** Ele junta tudo num `Map` por faixa e
 * deita fora a playlist de onde veio — e é precisamente ESSA a informação que
 * diz que dois artistas se parecem. Sem ela só sobrava "estão os dois na
 * biblioteca", que não distingue nada numa biblioteca de 500 faixas.
 *
 * Lido às páginas, e o resultado fica em memória, por conta: a
 * co-ocorrência muda quando se mexe numa playlist, não de minuto a minuto.
 */

/** Quanto tempo o mapa fica válido. Meia hora é mais do que uma sessão de
 * escuta e menos do que o tempo que leva a reorganizar playlists. */
const VALIDADE_MS = 30 * 60 * 1000;

export type DadosDeAfinidade = {
  /** Um par por linha: e a co-ocorrencia. */
  pares: FaixaComArtista[];
  /**
   * As linhas cruas, com o canal por tratar. Servem para o `nomesDeConfianca`
   * saber que nomes vieram de um canal oficial -- o que o `pares` ja nao diz,
   * porque ai o artista ja foi extraido.
   */
  faixas: FaixaParaAprender[];
};

/**
 * **A cache é da CONTA.** Guardava-se sem dono e era devolvida antes de se
 * saber quem pedia: trocar de conta na mesma sessão dava, durante meia hora,
 * as playlists da conta anterior à descoberta da nova (auditoria de 16/9).
 */
let cache: { conta: string; em: number; linhas: LinhaDePlaylist[]; dados: DadosDeAfinidade } | null = null;
/** Sobe a cada `esquecerAfinidade`: uma leitura que começou antes de uma
 * playlist mudar devolve-se a quem a pediu, mas não fica guardada. */
let geracao = 0;
/** Páginas de 1000 (o corte do PostgREST), com teto: 20 000 linhas chegam
 * para a co-ocorrência e uma biblioteca desmedida não prende a descoberta. */
const POR_PAGINA = 1000;
const MAX_PAGINAS = 20;

/** Da sessão guardada, sem ida à rede: é consultado em cada sugestão. */
async function contaAtual(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user?.id;
  if (!id) throw new Error('Session expired');
  return id;
}

export async function paresDeArtistaEPlaylist(): Promise<DadosDeAfinidade> {
  const conta = await contaAtual();
  const daMinha = geracao;
  const linhas = await lerFaixasDasPlaylists();
  if (cache?.conta === conta && cache.linhas === linhas && Date.now() - cache.em < VALIDADE_MS) return cache.dados;

  const pares: FaixaComArtista[] = [];
  const faixas: FaixaParaAprender[] = [];
  for (let inicio = 0; inicio < Math.min(linhas.length, POR_PAGINA * MAX_PAGINAS); inicio += 200) {
    medirTrabalho('affinity.derive', () => { for (const linha of linhas.slice(inicio, inicio + 200)) {
    const t = linha.tracks;
    if (!t) continue;
    const crua = { source: t.source, title: t.title ?? '', artist: t.artist ?? null };
    faixas.push(crua);
    const artista = displayArtist(crua);
    if (!artista || artista === 'Unknown artist') continue;
    pares.push({ artista, playlistId: linha.playlist_id ?? null });
    } });
    if (inicio + 200 < linhas.length) await cederParaInterface();
  }

  const dados = { pares, faixas };
  if (daMinha === geracao) cache = { conta, em: Date.now(), linhas, dados };
  return dados;
}

/** Esquece o mapa. Chamado por quem mexe nas playlists (`api/playlists.ts`
 * e a folha de adicionar), para a próxima sugestão já contar com a mudança. */
export function esquecerAfinidade(): void {
  cache = null;
  geracao++;
  esquecerFaixasDasPlaylists();
}
