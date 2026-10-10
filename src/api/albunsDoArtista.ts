import { chaveDeArtista, tituloNoLeitor } from '../lib/artistName';
import {
  canalPelasProvas, canalSemProvas, FORMA_DO_CANAL, fotoDoCanal, legendaDoAlbum, lerAlbunsDoCanal, lerCancoesComArtistas, lerMusicasDoCanal,
  maisRecente, mixDoCanal, type AlbumDoArtista, type CancaoComArtistas, type MixDoArtista, type Prova,
} from '../lib/albunsDoArtista';
import type { Track } from '../types';
import type { YtRecommendedPlaylist } from './youtube';
import { lerNoYtMusic, pesquisarCancoesCru } from './ytMusic';

/** Quantas músicas da biblioteca se procuram para saber qual é o canal. */
const PROVAS = 3;

/** Um álbum para as listas (o mesmo formato das playlists), com o tipo e o ano. */
export type AlbumDaPagina = YtRecommendedPlaylist & { tipo: string; ano: string | null };

export type PaginaDoArtista = {
  albuns: AlbumDaPagina[];
  /** O lançamento mais recente, para o destaque no topo. */
  maisRecente: AlbumDaPagina | null;
  /** As músicas dele, do canal certo: a lista "todas", ou as do topo se ela falhar. */
  musicas: Track[];
  /** O botão "Mix" do canal (29/9): a rádio dele, que se toca pelo `lerRadioPeloYtMusic`. */
  mix: MixDoArtista | null;
  /** A foto do canal (30/9, `fotoDoCanal`): quando o catálogo não tem a dele. */
  foto: string | null;
};

const VAZIA: PaginaDoArtista = { albuns: [], maisRecente: null, musicas: [], mix: null, foto: null };
/** Em memória, por sessão: não vale uma escrita no Supabase por página aberta. */
const memoria = new Map<string, Promise<PaginaDoArtista>>();

/**
 * O que a página de um artista mostra do YouTube Music (28/9 e 29/9): os
 * álbuns, o lançamento mais recente e as músicas dele. Ver `lib/albunsDoArtista.ts`.
 *
 * Tudo sai do CANAL do artista, escolhido pelas músicas dele que estão na
 * biblioteca -- pelo nome vinham os álbuns e as músicas de um homónimo (o Isak
 * Danielson na página do Isak). Sem chave nem quota. Falhar é página vazia: a
 * página diz "No albums found" e as "More tracks" voltam à pesquisa pelo nome.
 */
export function paginaDoArtista(nome: string, faixas: readonly Track[]): Promise<PaginaDoArtista> {
  const alvo = chaveDeArtista(nome);
  if (!alvo) return Promise.resolve(VAZIA);
  const provas: Prova[] = faixas
    .filter((t) => t.source === 'youtube')
    .slice(0, PROVAS)
    .map((t) => ({ videoId: t.sourceId, titulo: tituloNoLeitor(t) }));
  const escolhido = canalEscolhido(alvo);
  const chave = `${alvo}|${escolhido ?? ''}|${provas.map((p) => p.videoId).join(',')}`;
  let pedido = memoria.get(chave);
  if (!pedido) {
    pedido = procurar(nome, alvo, provas, escolhido).catch(() => VAZIA);
    memoria.set(chave, pedido);
    // Uma falha (sem rede) não fica guardada: a próxima visita tenta outra vez.
    void pedido.then((p) => { if (!p.albuns.length && !p.musicas.length) memoria.delete(chave); });
  }
  return pedido;
}

/** Só os álbuns (quem já os pedia assim). */
export async function albunsDoArtista(nome: string, faixas: readonly Track[]): Promise<YtRecommendedPlaylist[]> {
  return (await paginaDoArtista(nome, faixas)).albuns;
}

/**
 * O canal que se escolheu na pesquisa por tipo (29/9): tocar num artista abre a
 * página DESSE, sem adivinhar pelo nome -- procurar "Isak" e escolher o Isak
 * Danielson não pode abrir o outro. Vale um minuto, o tempo de a página abrir:
 * voltar mais tarde ao artista pela biblioteca volta a ser decidido pelas
 * músicas dele que lá estão.
 */
const canaisEscolhidos = new Map<string, { canal: string; em: number }>();
const VALIDADE_DA_ESCOLHA_MS = 60_000;
export function lembrarCanalDoArtista(nome: string, canal: string): void {
  const alvo = chaveDeArtista(nome);
  if (alvo && /^UC[\w-]{22}$/.test(canal)) canaisEscolhidos.set(alvo, { canal, em: Date.now() });
}
function canalEscolhido(alvo: string): string | null {
  const e = canaisEscolhidos.get(alvo);
  return e && Date.now() - e.em < VALIDADE_DA_ESCOLHA_MS ? e.canal : null;
}

/** O canal do artista: o escolhido, ou o que assina as músicas dele (as provas). */
async function canalPara(nome: string, alvo: string, provas: Prova[], escolhido: string | null): Promise<string | null> {
  if (escolhido) return escolhido;
  if (provas.length) {
    const respostas = await Promise.all(provas.map(async (prova) => ({
      prova,
      cancoes: lerCancoesComArtistas(await pesquisarCancoesCru(`${nome} ${prova.titulo}`)),
    })));
    return canalPelasProvas(respostas, alvo, chaveDeArtista);
  }
  return canalSemProvas(lerCancoesComArtistas(await pesquisarCancoesCru(nome)), alvo, chaveDeArtista);
}

/**
 * Os lançamentos de um artista, para os novos lançamentos (10/10,
 * `state/novosLancamentos.ts`): só a página do canal, sem a lista das músicas.
 * Com o canal de ontem é UM pedido; sem ele, as pesquisas das provas primeiro.
 * `null` quando não se conseguiu ler (sem rede): não é o mesmo que "nada".
 */
export async function lancamentosDoArtista(
  nome: string, faixas: readonly Track[], canalConhecido: string | null,
): Promise<{ canal: string; albuns: AlbumDoArtista[] } | null> {
  const alvo = chaveDeArtista(nome);
  if (!alvo) return null;
  const provas: Prova[] = faixas.filter((t) => t.source === 'youtube').slice(0, PROVAS)
    .map((t) => ({ videoId: t.sourceId, titulo: tituloNoLeitor(t) }));
  const canal = canalConhecido && FORMA_DO_CANAL.test(canalConhecido)
    ? canalConhecido : await canalPara(nome, alvo, provas, null);
  if (!canal) return null;
  const pagina = await lerNoYtMusic(canal);
  if (!pagina) return null;
  return { canal, albuns: lerAlbunsDoCanal(pagina) };
}

async function procurar(nome: string, alvo: string, provas: Prova[], escolhido: string | null): Promise<PaginaDoArtista> {
  const canal = await canalPara(nome, alvo, provas, escolhido);
  if (!canal) return VAZIA;

  const paginaDoCanal = await lerNoYtMusic(canal);
  const lidos = lerAlbunsDoCanal(paginaDoCanal);
  const { topo, todas } = lerMusicasDoCanal(paginaDoCanal);
  // A lista inteira é um pedido a mais (grátis); se falhar, ficam as do topo.
  const daLista = todas ? lerCancoesComArtistas(await lerNoYtMusic(todas)) : [];
  const albuns = lidos.map(paraLista);
  const recente = maisRecente(lidos);
  return {
    albuns,
    maisRecente: recente ? albuns.find((a) => a.id === recente.id) ?? null : null,
    musicas: (daLista.length ? daLista : topo).map((c) => paraFaixa(c, nome)),
    mix: mixDoCanal(paginaDoCanal),
    foto: fotoDoCanal(paginaDoCanal),
  };
}

/** O Mix de um canal sem ler a página toda (o artista em destaque na pesquisa). */
const mixesPorCanal = new Map<string, Promise<MixDoArtista | null>>();
export function mixDoArtista(canal: string): Promise<MixDoArtista | null> {
  if (!FORMA_DO_CANAL.test(canal)) return Promise.resolve(null);
  let pedido = mixesPorCanal.get(canal);
  if (!pedido) {
    pedido = lerNoYtMusic(canal).then(mixDoCanal).catch(() => null);
    mixesPorCanal.set(canal, pedido);
    void pedido.then((m) => { if (!m) mixesPorCanal.delete(canal); });
  }
  return pedido;
}

function paraLista(a: AlbumDoArtista): AlbumDaPagina {
  return { id: a.id, title: a.titulo, artworkUrl: a.capa, channelTitle: legendaDoAlbum(a), tipo: a.tipo, ano: a.ano };
}

/** Uma música do canal como faixa da app. O artista é o desta página. */
function paraFaixa(c: CancaoComArtistas, nome: string): Track {
  const alvo = chaveDeArtista(nome);
  const deste = c.artistas.find((a) => chaveDeArtista(a.nome) === alvo) ?? c.artistas[0];
  return {
    source: 'youtube',
    sourceId: c.videoId,
    title: c.titulo,
    artist: deste?.nome ?? nome,
    album: null,
    artworkUrl: `https://i.ytimg.com/vi/${c.videoId}/hqdefault.jpg`,
    durationSeconds: c.duracaoSec,
  };
}
