import { lerLink, servicoSemLeitura, type LinkDePlaylist } from './linkDePlaylist';
import { lerListaDeMusicas, type ListaLida } from './listaDeMusicas';

/**
 * O que está na caixa de importar (5/11): uma caixa só, para links, listas e
 * ficheiros, e a app percebe o que é. Puro: o ecrã do iPhone e a página do PC
 * mostram o mesmo cartão a partir disto (`test-importar-de-qualquer-sitio.ts`).
 */
export type Entrada =
  | { tipo: 'vazia' }
  /** Um link que se sabe ler: lê-se antes do botão, para o cartão dizer o nome e quantas. */
  | { tipo: 'link'; link: LinkDePlaylist; servico: string }
  /** Um serviço que se conhece mas não se lê sem conta: por lista ou ficheiro. */
  | { tipo: 'sem-leitura'; servico: string }
  | { tipo: 'link-desconhecido' }
  | { tipo: 'lista'; lista: ListaLida; nome: string; doFicheiro: boolean }
  /** Texto (ou ficheiro) em que não se percebeu nenhuma música. */
  | { tipo: 'nada'; doFicheiro: boolean };

export const NOME_DO_SERVICO: Record<LinkDePlaylist['tipo'], string> = {
  spotify: 'Spotify', youtube: 'YouTube', deezer: 'Deezer', 'deezer-curto': 'Deezer', apple: 'Apple Music',
};

/** O nome de uma lista colada, até alguém lhe dar outro. */
export const NOME_DA_LISTA_COLADA = 'Imported songs';

export function entradaDaImportacao(texto: string, ficheiro?: { nome: string; conteudo: string } | null): Entrada {
  if (ficheiro) {
    const lista = lerListaDeMusicas(ficheiro.conteudo, ficheiro.nome);
    const nome = ficheiro.nome.replace(/\.[^.]+$/, '').trim() || NOME_DA_LISTA_COLADA;
    return lista.linhas.length ? { tipo: 'lista', lista, nome, doFicheiro: true } : { tipo: 'nada', doFicheiro: true };
  }
  const t = String(texto || '').trim();
  if (!t) return { tipo: 'vazia' };
  // Uma linha só é um link (a partilha do Deezer vem dentro de uma frase).
  if (!/\r?\n/.test(t)) {
    const link = lerLink(t);
    if (link) return { tipo: 'link', link, servico: NOME_DO_SERVICO[link.tipo] };
    const servico = servicoSemLeitura(t);
    if (servico) return { tipo: 'sem-leitura', servico };
    if (/^(?:https?:\/\/|www\.|spotify:)\S+$/i.test(t)) return { tipo: 'link-desconhecido' };
  }
  const lista = lerListaDeMusicas(t);
  return lista.linhas.length ? { tipo: 'lista', lista, nome: NOME_DA_LISTA_COLADA, doFicheiro: false } : { tipo: 'nada', doFicheiro: false };
}

/** A frase do que não se lê por link, igual nas duas plataformas. */
export function fraseSemLeitura(servico: string, comFicheiro: boolean): { titulo: string; corpo: string } {
  return {
    titulo: `${servico} links can't be read yet`,
    corpo: comFicheiro
      ? 'Paste the songs here, one per line, or export them to a file with a free tool like TuneMyMusic and add it here.'
      : 'Paste the songs here, one per line. A tool like TuneMyMusic can export them to a file you can copy from.',
  };
}

/** A nota de uma playlist que se leu só em parte. */
export function notaDoCorte(servico: string, limite: number | null): string | null {
  if (limite == null) return null;
  if (limite >= 1000) return `Only the first ${limite} songs are imported at a time.`;
  return `${servico} shows the first ${limite} songs. For a longer playlist, use a list or a file.`;
}
