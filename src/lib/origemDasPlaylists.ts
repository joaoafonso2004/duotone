/**
 * A playlist importada a partir de um link, a atualizar-se sozinha (9/11, maquete
 * `docs/melhorias-de-uso-maquete.html`, secção 3, opção C: "faz sozinho sem
 * perguntar"). As regras, sem rede nem armazenamento, para se testarem em Node.
 *
 * Guarda-se, por playlist, o link de onde veio e as linhas que a leitura trazia
 * (`conhecidas`). Ao abrir a playlist, no máximo uma vez por dia, lê-se o link
 * outra vez e entram só as que nunca se tinham visto -- uma música que tiraste
 * de propósito já era conhecida, e não volta.
 */
import type { FaixaImportada, Leitura } from './importacaoPorLink';
import type { LinhaDaPlaylist, LinkDePlaylist } from './linkDePlaylist';

export interface OrigemDaPlaylist {
  link: LinkDePlaylist;
  /** As linhas que o link já trouxe (as que entraram e as que faltaram). */
  conhecidas: string[];
  /** A última vez que se leu o link, em ms. */
  vistaEm: number;
}

export const UM_DIA_MS = 24 * 60 * 60 * 1000;
/** As conhecidas não crescem sem fim: guardam-se as mais recentes. */
export const MAXIMO_DE_CONHECIDAS = 5000;

const normalizar = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Uma linha por nome (o Spotify, o Deezer, o Apple Music, uma lista): sem acentos nem maiúsculas. */
export const chaveDaLinha = (l: Pick<LinhaDaPlaylist, 'artist' | 'title'>) => `l:${normalizar(l.artist)} - ${normalizar(l.title)}`;
/** Uma faixa que já vem pronta (o YouTube): pelo vídeo. */
export const chaveDaFaixaPronta = (f: Pick<FaixaImportada, 'sourceId'>) => `y:${f.sourceId}`;

export function chavesDaLeitura(l: Pick<Leitura, 'linhas' | 'faixas'>): string[] {
  return [...(l.linhas ?? []).map(chaveDaLinha), ...(l.faixas ?? []).map(chaveDaFaixaPronta)];
}

/** As que o link traz agora e que nunca se tinham visto. */
export function novasDaLeitura(l: Pick<Leitura, 'linhas' | 'faixas'>, conhecidas: readonly string[]): { linhas: LinhaDaPlaylist[]; faixas: FaixaImportada[] } {
  const k = new Set(conhecidas);
  return {
    linhas: (l.linhas ?? []).filter((x) => !k.has(chaveDaLinha(x))),
    faixas: (l.faixas ?? []).filter((x) => !k.has(chaveDaFaixaPronta(x))),
  };
}

/** Se é altura de ler o link outra vez (nunca mais do que uma vez por dia). */
export function deveVer(o: OrigemDaPlaylist | undefined, agora: number): o is OrigemDaPlaylist {
  return !!o && agora - o.vistaEm >= UM_DIA_MS;
}

/** As de antes e as de agora, sem repetir; passando do teto, ficam as mais recentes. */
export function juntarConhecidas(antes: readonly string[], agora: readonly string[], maximo = MAXIMO_DE_CONHECIDAS): string[] {
  const todas = [...new Set([...antes, ...agora])];
  return todas.length > maximo ? todas.slice(todas.length - maximo) : todas;
}
