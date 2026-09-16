import { supabase } from '../lib/supabase';
import { displayArtist, type FaixaParaAprender } from '../lib/artistName';
import type { FaixaComArtista } from '../lib/afinidade';

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
let cache: { conta: string; em: number; dados: DadosDeAfinidade } | null = null;
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
  if (cache && cache.conta === conta && Date.now() - cache.em < VALIDADE_MS) return cache.dados;

  const daMinha = geracao;
  const linhas: any[] = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const inicio = pagina * POR_PAGINA;
    const { data, error } = await supabase
      .from('playlist_tracks')
      .select('playlist_id, tracks (title, artist, source), playlists!inner (owner_id)')
      .eq('playlists.owner_id', conta)
      // Ordem estável, senão as páginas repetem e saltam linhas.
      .order('playlist_id', { ascending: true })
      .order('track_id', { ascending: true })
      .range(inicio, inicio + POR_PAGINA - 1);
    if (error) throw error;
    linhas.push(...(data ?? []));
    if (!data || data.length < POR_PAGINA) break;
  }

  const pares: FaixaComArtista[] = [];
  const faixas: FaixaParaAprender[] = [];
  for (const linha of linhas) {
    const t = linha.tracks;
    if (!t) continue;
    const crua = { source: t.source, title: t.title ?? '', artist: t.artist ?? null };
    faixas.push(crua);
    const artista = displayArtist(crua);
    if (!artista || artista === 'Unknown artist') continue;
    pares.push({ artista, playlistId: linha.playlist_id ?? null });
  }

  const dados = { pares, faixas };
  if (daMinha === geracao) cache = { conta, em: Date.now(), dados };
  return dados;
}

/** Esquece o mapa. Chamado por quem mexe nas playlists (`api/playlists.ts`
 * e a folha de adicionar), para a próxima sugestão já contar com a mudança. */
export function esquecerAfinidade(): void {
  cache = null;
  geracao++;
}
