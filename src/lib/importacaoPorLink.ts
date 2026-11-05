import type { LinhaDaPlaylist, LinkDePlaylist, PlaylistLida } from './linkDePlaylist';

/**
 * Importar UMA playlist, do princípio ao fim (26/9; de qualquer sítio a 5/11).
 *
 * Corre em segundo plano (quem pediu pode estar no questionário da primeira
 * vez, ou já a ouvir), por isso diz sempre onde vai: `aoProgresso` com feitas
 * e total, e no fim quantas entraram e QUAIS ficaram de fora.
 *
 * Em dois passos, para o ecrã mostrar o que vai entrar antes de se carregar no
 * botão sem ler a playlist duas vezes: `lerPlaylist` (um link vira uma
 * `Leitura`) e `importarLeitura` (a leitura vai para uma playlist nova ou para
 * as Liked Songs). Uma lista colada ou um ficheiro já são linhas, e entram
 * direto no segundo passo.
 *
 * - **Spotify, Deezer, Apple Music, listas**: as linhas passam pelo MESMO
 *   comparador da importação por CSV (`importSpotifyCsv`), e só entram as de
 *   confiança. Não há ecrã de revisão: numa importação que corre sozinha, uma
 *   música errada na playlist é pior do que uma a menos -- e diz-se quais
 *   faltaram, pelo nome.
 * - **YouTube**: os vídeos já são as faixas, não há nada a procurar.
 *
 * A playlist só é criada no FIM, com o que se encontrou: uma importação que
 * falha a meio não deixa uma playlist vazia na biblioteca.
 *
 * As dependências entram por parâmetro: `scripts/test-importacao-por-link.ts`
 * corre isto sem rede.
 */

export interface FaixaImportada {
  source: 'youtube';
  sourceId: string;
  title: string;
  artist: string | null;
  album: string | null;
  artworkUrl: string | null;
  durationSeconds: number | null;
}

export interface Dependencias {
  lerSpotify: (id: string) => Promise<PlaylistLida | null>;
  lerYouTube: (id: string) => Promise<{ title: string; items: { videoId: string; title: string; channel?: string | null; thumbnail?: string | null }[] }>;
  /** A API pública do Deezer, a playlist inteira (até `MAXIMO_POR_IMPORTACAO`). */
  lerDeezer?: (id: string) => Promise<PlaylistLida | null>;
  /** O `link.deezer.com/s/…` da partilha, resolvido até ao id da playlist. */
  resolverDeezerCurto?: (url: string) => Promise<string | null>;
  /** A página pública de uma playlist do Apple Music (as primeiras 50). */
  lerApple?: (url: string) => Promise<PlaylistLida | null>;
  /** O comparador: devolve, por linha, a faixa escolhida e se é de confiança. */
  resolver: (
    linhas: LinhaDaPlaylist[],
    aoAvancar: (feitas: number) => void,
    sinal?: AbortSignal,
  ) => Promise<{ track: FaixaImportada | null; confident: boolean }[]>;
  criarPlaylist: (nome: string) => Promise<{ id: string }>;
  adicionar: (playlistId: string, faixas: FaixaImportada[]) => Promise<unknown>;
  /** As Liked Songs do Spotify vão para as Liked Songs (7/10), pela ordem (a mais recente primeiro). */
  guardarNasGostadas?: (faixas: FaixaImportada[]) => Promise<unknown>;
}

export interface Progresso { fase: 'a-ler' | 'a-procurar' | 'a-guardar'; feitas: number; total: number }

export type Destino = 'playlist' | 'gostadas';

export interface Resultado {
  nome: string;
  playlistId: string;
  adicionadas: number;
  /** As que o comparador não encontrou com confiança. */
  deFora: number;
  /** A playlist trazia mais do que se leu (o embed do Spotify mostra 100, o Apple Music 50). */
  cortada: boolean;
  /** Até onde se leu, quando `cortada` (100, 50, ou o máximo por importação). */
  limite?: number | null;
  /** "Artista - Música" das que ficaram de fora, pela ordem (até `MAXIMO_DE_FALTAS`). */
  faltaram?: string[];
  destino?: Destino;
}

export class ErroDaImportacao extends Error {
  motivo: 'privada-ou-mudou' | 'vazia' | 'nada-encontrado';
  constructor(motivo: ErroDaImportacao['motivo'], mensagem: string) {
    super(mensagem);
    this.motivo = motivo;
  }
}

/** O embed do Spotify só mostra as primeiras 100. */
export const MAXIMO_DO_EMBED = 100;

/**
 * Até onde cada sítio deixa ler uma playlist (5/11, medido): o embed do
 * Spotify mostra 100 e a página do Apple Music 50. O Deezer e o YouTube dão a
 * lista toda. Aqui e não em linkDePlaylist.ts: este módulo corre em Node puro
 * nos testes, e só pode importar tipos.
 */
export const LIMITE_DO_LINK: Record<LinkDePlaylist['tipo'], number | null> = {
  spotify: MAXIMO_DO_EMBED, apple: 50, youtube: null, deezer: null, 'deezer-curto': null,
};

/**
 * Uma importação procura no máximo 1000 músicas (5/11): cada uma é uma
 * pesquisa a sair do IP de casa, e duas mil seguidas apanhavam o limite do
 * YouTube. Uma lista maior entra às partes e diz-se.
 */
export const MAXIMO_POR_IMPORTACAO = 1000;

/** Quantos nomes das que faltaram se guardam para mostrar. */
export const MAXIMO_DE_FALTAS = 200;

/** Uma playlist lida e pronta a importar. */
export interface Leitura {
  origem: 'spotify' | 'youtube' | 'deezer' | 'apple' | 'lista';
  nome: string;
  capa: string | null;
  /** As linhas a procurar (tudo menos o YouTube). */
  linhas?: LinhaDaPlaylist[];
  /** As faixas já prontas (o YouTube). */
  faixas?: FaixaImportada[];
  /** Quantas vão entrar no comparador (ou as faixas prontas). */
  total: number;
  cortada: boolean;
  limite: number | null;
}

const nomeDaLinha = (l: LinhaDaPlaylist) => `${l.artist} - ${l.title}`;

/** As linhas de uma playlist lida, cortadas ao máximo por importação. */
export function leituraDasLinhas(origem: Leitura['origem'], p: PlaylistLida, limiteDoSitio: number | null): Leitura {
  const linhas = p.faixas.slice(0, MAXIMO_POR_IMPORTACAO);
  const porDoSitio = limiteDoSitio != null && p.faixas.length >= limiteDoSitio && (p.total == null || p.total > p.faixas.length || p.faixas.length === limiteDoSitio);
  const porNos = p.faixas.length > MAXIMO_POR_IMPORTACAO || (p.total != null && p.total > MAXIMO_POR_IMPORTACAO);
  return {
    origem, nome: p.nome, capa: p.capa, linhas, total: linhas.length,
    cortada: porDoSitio || porNos,
    limite: porNos ? MAXIMO_POR_IMPORTACAO : porDoSitio ? limiteDoSitio : null,
  };
}

/** Lê um link até ao que vai entrar. Atira `ErroDaImportacao` quando não dá. */
export async function lerPlaylist(link: LinkDePlaylist, deps: Dependencias): Promise<Leitura> {
  if (link.tipo === 'youtube') {
    const p = await deps.lerYouTube(link.id);
    const faixas: FaixaImportada[] = p.items.map((x) => ({
      source: 'youtube', sourceId: x.videoId, title: x.title, artist: x.channel || null,
      album: null, artworkUrl: x.thumbnail || null, durationSeconds: null,
    }));
    if (!faixas.length) throw new ErroDaImportacao('vazia', 'That playlist is empty.');
    return { origem: 'youtube', nome: p.title || 'YouTube playlist', capa: faixas[0]?.artworkUrl ?? null, faixas, total: faixas.length, cortada: false, limite: null };
  }
  if (link.tipo === 'spotify') {
    const p = await deps.lerSpotify(link.id);
    if (!p) throw new ErroDaImportacao('privada-ou-mudou', "Couldn't read that playlist. Make sure it's public.");
    if (!p.faixas.length) throw new ErroDaImportacao('vazia', 'That playlist is empty.');
    return leituraDasLinhas('spotify', p, MAXIMO_DO_EMBED);
  }
  if (link.tipo === 'deezer' || link.tipo === 'deezer-curto') {
    const id = link.tipo === 'deezer' ? link.id : await deps.resolverDeezerCurto?.(link.url);
    const p = id && deps.lerDeezer ? await deps.lerDeezer(id) : null;
    if (!p) throw new ErroDaImportacao('privada-ou-mudou', "Couldn't read that playlist. Make sure it's public.");
    if (!p.faixas.length) throw new ErroDaImportacao('vazia', 'That playlist is empty.');
    return leituraDasLinhas('deezer', p, LIMITE_DO_LINK.deezer);
  }
  const p = deps.lerApple ? await deps.lerApple(link.url) : null;
  if (!p) throw new ErroDaImportacao('privada-ou-mudou', "Couldn't read that playlist. Make sure it's public.");
  if (!p.faixas.length) throw new ErroDaImportacao('vazia', 'That playlist is empty.');
  return leituraDasLinhas('apple', p, LIMITE_DO_LINK.apple);
}

/** Uma leitura para o destino: as linhas pelo comparador, as faixas prontas direto. */
export async function importarLeitura(
  l: Leitura,
  destino: Destino,
  deps: Pick<Dependencias, 'resolver' | 'criarPlaylist' | 'adicionar' | 'guardarNasGostadas'>,
  aoProgresso: (p: Progresso) => void,
  sinal?: AbortSignal,
): Promise<Resultado> {
  if (l.faixas) {
    const faixas = l.faixas.slice(0, MAXIMO_POR_IMPORTACAO);
    if (!faixas.length) throw new ErroDaImportacao('vazia', 'That playlist is empty.');
    aoProgresso({ fase: 'a-guardar', feitas: faixas.length, total: faixas.length });
    const cortada = l.cortada || l.faixas.length > MAXIMO_POR_IMPORTACAO;
    const base = { nome: l.nome, adicionadas: faixas.length, deFora: 0, cortada, limite: cortada ? MAXIMO_POR_IMPORTACAO : null, faltaram: [], destino };
    if (destino === 'gostadas') {
      if (!deps.guardarNasGostadas) throw new ErroDaImportacao('nada-encontrado', "Couldn't save to your Liked Songs.");
      await deps.guardarNasGostadas(faixas);
      return { ...base, playlistId: '' };
    }
    const { id } = await deps.criarPlaylist(l.nome || 'YouTube playlist');
    await deps.adicionar(id, faixas);
    return { ...base, playlistId: id };
  }
  return importarLinhas({ nome: l.nome, linhas: l.linhas ?? [], cortada: l.cortada, limite: l.limite, destino }, deps, aoProgresso, sinal);
}

export async function importarPorLink(
  link: LinkDePlaylist,
  deps: Dependencias,
  aoProgresso: (p: Progresso) => void,
  sinal?: AbortSignal,
): Promise<Resultado> {
  aoProgresso({ fase: 'a-ler', feitas: 0, total: 0 });
  const l = await lerPlaylist(link, deps);
  return importarLeitura(l, 'playlist', deps, aoProgresso, sinal);
}

/**
 * Linhas JÁ LIDAS (de um link, da conta do Spotify -- lib/bibliotecaDoSpotify.ts
 * --, de uma lista colada ou de um ficheiro) pelo comparador, e o que se
 * encontrou com confiança para o destino: uma playlist nova com o nome, ou as
 * Liked Songs.
 */
export async function importarLinhas(
  o: { nome: string; linhas: LinhaDaPlaylist[]; cortada: boolean; limite?: number | null; destino: Destino },
  deps: Pick<Dependencias, 'resolver' | 'criarPlaylist' | 'adicionar' | 'guardarNasGostadas'>,
  aoProgresso: (p: Progresso) => void,
  sinal?: AbortSignal,
): Promise<Resultado> {
  if (!o.linhas.length) throw new ErroDaImportacao('vazia', 'That playlist is empty.');
  const aMais = o.linhas.length > MAXIMO_POR_IMPORTACAO;
  const linhas = aMais ? o.linhas.slice(0, MAXIMO_POR_IMPORTACAO) : o.linhas;
  const cortada = o.cortada || aMais;
  const limite = aMais ? MAXIMO_POR_IMPORTACAO : (o.limite ?? null);
  const total = linhas.length;
  aoProgresso({ fase: 'a-procurar', feitas: 0, total });
  const resultados = await deps.resolver(linhas, (feitas) => aoProgresso({ fase: 'a-procurar', feitas: Math.min(feitas, total), total }), sinal);
  const vistas = new Set<string>();
  const boas: FaixaImportada[] = [];
  const faltaram: string[] = [];
  resultados.forEach((r, i) => {
    if (!r.confident || !r.track) {
      if (linhas[i] && faltaram.length < MAXIMO_DE_FALTAS) faltaram.push(nomeDaLinha(linhas[i]));
      return;
    }
    if (vistas.has(r.track.sourceId)) return;
    vistas.add(r.track.sourceId);
    boas.push(r.track);
  });
  if (!boas.length) throw new ErroDaImportacao('nada-encontrado', "Couldn't find any of those songs.");
  aoProgresso({ fase: 'a-guardar', feitas: total, total });
  const base = { nome: o.nome, adicionadas: boas.length, deFora: total - boas.length, cortada, limite, faltaram, destino: o.destino };
  if (o.destino === 'gostadas') {
    if (!deps.guardarNasGostadas) throw new ErroDaImportacao('nada-encontrado', "Couldn't save to your Liked Songs.");
    await deps.guardarNasGostadas(boas);
    return { ...base, playlistId: '' };
  }
  const { id } = await deps.criarPlaylist(o.nome);
  await deps.adicionar(id, boas);
  return { ...base, playlistId: id };
}
