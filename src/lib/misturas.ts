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

/**
 * De quantos artistas se escolhe, para as misturas mudarem de dia para dia.
 *
 * Sem isto eram sempre as mesmas quatro, e por uma razão que não é acidente:
 * os artistas mais ouvidos não mudam de um dia para o outro. As faixas lá
 * dentro baralhavam, os nomes nunca. Uma prateleira que nunca muda deixa de
 * se olhar ao fim de dois dias.
 *
 * Agora roda-se dentro dos doze mais ouvidos. Continua a ser música tua --
 * o que muda é qual dos teus artistas sai hoje.
 */
export const CANDIDATOS = 12;
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
  /**
   * Por onde começar a escolher. Vem do DIA e não do acaso: dentro do mesmo
   * dia a página tem de ser a mesma a cada abertura, senão as playlists
   * trocavam de sítio entre um regresso à pesquisa e o seguinte.
   */
  deslocamento = 0,
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
  // Percorre-se a lista inteira a partir do deslocamento e dá-se a volta: se
  // os de hoje não tiverem música que chegue, continua-se pelos outros em vez
  // de devolver menos playlists do que as que cabiam.
  const total = artistas.length;
  for (let n = 0; n < total; n++) {
    if (saida.length >= MISTURAS) break;
    const artista = artistas[(deslocamento + n) % total];
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
