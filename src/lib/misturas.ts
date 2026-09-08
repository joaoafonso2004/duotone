import type { Track } from '../types';

/** Uma playlist que a app montou sozinha. */
export type Mistura = {
  /** Estável entre carregamentos, para a navegação poder guardá-lo. */
  id: string;
  nome: string;
  faixas: Track[];
};

/** Quantas se mostram. */
export const MISTURAS = 4;
/** Faixas por mistura. */
export const POR_MISTURA = 25;
/** Abaixo disto não é uma playlist, é uma música com um título por cima. */
export const MINIMO_PARA_VALER = 5;

/**
 * As misturas por artista, a partir da tua biblioteca.
 *
 * ## O que isto é, e o que ainda não é
 *
 * Uma mistura ancorada num artista que ouves muito: tudo o que tens dele,
 * baralhado. É honesto e é útil -- resolve o "quero ouvir tudo o que tenho
 * deste" sem ir à página dele.
 *
 * Não é ainda o *daily mix* do Spotify, que mistura o artista âncora com
 * VIZINHOS dele. Falta o mapa de quem é vizinho de quem, e ele existe: o
 * `descobrirNovas` calcula-o para escolher o que sugerir, e deita-o fora no
 * fim. Guardá-lo é o passo seguinte, e é em `api/descoberta.ts` que se faz --
 * não aqui.
 *
 * ## Porque só artistas com música que chegue
 *
 * Uma "mistura" de três faixas não é uma playlist, é uma música com um título
 * por cima -- e uma capa em mosaico de quatro células com duas vazias diz logo
 * ao utilizador que a app está a inventar. Abaixo do mínimo, o artista não dá
 * mistura nenhuma e passa-se ao seguinte.
 *
 * Sem imports de runtime: `scripts/test-misturas.ts` corre em Node puro.
 */
export function misturasDaBiblioteca(
  artistas: readonly { name: string }[],
  biblioteca: readonly Track[],
  chaveDoArtista: (t: Track) => string,
  chaveDoNome: (nome: string) => string,
  baralhar: <T>(l: readonly T[]) => T[] = (l) => [...l],
): Mistura[] {
  const porChave = new Map<string, Track[]>();
  for (const faixa of biblioteca) {
    const chave = chaveDoArtista(faixa);
    if (!chave) continue;
    const lista = porChave.get(chave);
    if (lista) lista.push(faixa);
    else porChave.set(chave, [faixa]);
  }

  const saida: Mistura[] = [];
  for (const artista of artistas) {
    if (saida.length >= MISTURAS) break;
    const chave = chaveDoNome(artista.name);
    const faixas = porChave.get(chave);
    if (!faixas || faixas.length < MINIMO_PARA_VALER) continue;
    saida.push({
      id: `artista:${chave}`,
      nome: `${artista.name} mix`,
      faixas: baralhar(faixas).slice(0, POR_MISTURA),
    });
  }
  return saida;
}
