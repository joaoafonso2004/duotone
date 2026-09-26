import type { LinhaDaPlaylist, LinkDePlaylist, PlaylistDoSpotify } from './linkDePlaylist';

/**
 * Importar UMA playlist por link, do princípio ao fim (26/9).
 *
 * Corre em segundo plano (quem pediu pode estar no questionário da primeira
 * vez, ou já a ouvir), por isso diz sempre onde vai: `aoProgresso` com feitas
 * e total, e no fim quantas entraram e quantas ficaram de fora.
 *
 * - **Spotify**: as linhas do embed passam pelo MESMO comparador da
 *   importação por CSV (`importSpotifyCsv`), e só entram as de confiança. Não
 *   há ecrã de revisão aqui: numa importação que corre sozinha, uma música
 *   errada na playlist é pior do que uma a menos -- e diz-se quantas faltaram.
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
  lerSpotify: (id: string) => Promise<PlaylistDoSpotify | null>;
  lerYouTube: (id: string) => Promise<{ title: string; items: { videoId: string; title: string; channel?: string | null; thumbnail?: string | null }[] }>;
  /** O comparador: devolve, por linha, a faixa escolhida e se é de confiança. */
  resolver: (
    linhas: LinhaDaPlaylist[],
    aoAvancar: (feitas: number) => void,
    sinal?: AbortSignal,
  ) => Promise<{ track: FaixaImportada | null; confident: boolean }[]>;
  criarPlaylist: (nome: string) => Promise<{ id: string }>;
  adicionar: (playlistId: string, faixas: FaixaImportada[]) => Promise<unknown>;
}

export interface Progresso { fase: 'a-ler' | 'a-procurar' | 'a-guardar'; feitas: number; total: number }

export interface Resultado {
  nome: string;
  playlistId: string;
  adicionadas: number;
  /** Do Spotify, as que o comparador não encontrou com confiança. */
  deFora: number;
  /** A playlist trazia mais do que o embed mostra (100). */
  cortada: boolean;
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

export async function importarPorLink(
  link: LinkDePlaylist,
  deps: Dependencias,
  aoProgresso: (p: Progresso) => void,
  sinal?: AbortSignal,
): Promise<Resultado> {
  aoProgresso({ fase: 'a-ler', feitas: 0, total: 0 });

  if (link.tipo === 'youtube') {
    const p = await deps.lerYouTube(link.id);
    const faixas: FaixaImportada[] = p.items.map((x) => ({
      source: 'youtube', sourceId: x.videoId, title: x.title, artist: x.channel || null,
      album: null, artworkUrl: x.thumbnail || null, durationSeconds: null,
    }));
    if (!faixas.length) throw new ErroDaImportacao('vazia', 'That playlist is empty.');
    aoProgresso({ fase: 'a-guardar', feitas: faixas.length, total: faixas.length });
    const { id } = await deps.criarPlaylist(p.title || 'YouTube playlist');
    await deps.adicionar(id, faixas);
    return { nome: p.title, playlistId: id, adicionadas: faixas.length, deFora: 0, cortada: false };
  }

  const p = await deps.lerSpotify(link.id);
  if (!p) throw new ErroDaImportacao('privada-ou-mudou', "Couldn't read that playlist. Make sure it's public.");
  if (!p.faixas.length) throw new ErroDaImportacao('vazia', 'That playlist is empty.');
  const total = p.faixas.length;
  aoProgresso({ fase: 'a-procurar', feitas: 0, total });
  const resultados = await deps.resolver(p.faixas, (feitas) => aoProgresso({ fase: 'a-procurar', feitas: Math.min(feitas, total), total }), sinal);
  const vistas = new Set<string>();
  const boas: FaixaImportada[] = [];
  for (const r of resultados) {
    if (!r.confident || !r.track || vistas.has(r.track.sourceId)) continue;
    vistas.add(r.track.sourceId);
    boas.push(r.track);
  }
  if (!boas.length) throw new ErroDaImportacao('nada-encontrado', "Couldn't find any of those songs.");
  aoProgresso({ fase: 'a-guardar', feitas: total, total });
  const { id } = await deps.criarPlaylist(p.nome);
  await deps.adicionar(id, boas);
  return { nome: p.nome, playlistId: id, adicionadas: boas.length, deFora: total - boas.length, cortada: total >= MAXIMO_DO_EMBED };
}
