import type { Track } from '../types';

/** Uma playlist que a app montou sozinha. */
export type Mistura = {
  /** Estável entre carregamentos, para a navegação poder guardá-lo. */
  id: string;
  nome: string;
  faixas: Track[];
};

/**
 * Quantas se mostram.
 *
 * Eram quatro. Seis e o numero do Spotify -- os Daily Mix 1 a 6 -- e a
 * diferenca nota-se: quatro cartoes numa prateleira horizontal leem-se como
 * "e so isto", seis obrigam a deslizar e e isso que diz que ha mais.
 *
 * Subir isto e seguro com bibliotecas pequenas: o `misturasDaBiblioteca` da a
 * volta a lista de artistas e salta os que nao tem musica que chegue, por isso
 * quem so tiver tres artistas com material continua a ver tres.
 */
export const MISTURAS = 6;

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
 * ## O que uma mistura é
 *
 * O artista âncora é alguém que se ouve muito; as faixas são as dele **e as
 * dos vizinhos dele**, intercaladas. É isso que separa uma mistura de uma
 * lista: sai-se do que já se conhece sem se sair do que se gosta.
 *
 * O mapa de vizinhos vem do `descobertasPorAncora`. Já era calculado para
 * escolher o que sugerir na descoberta e era deitado fora no fim -- guardá-lo
 * foi quase todo o trabalho, e fez-se lá e não aqui.
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
  /**
   * Descobertas por âncora, do `descobertasPorAncora`.
   *
   * **Indexado pelo `chaveDoNome`**, e não pelo nome em cru. Já foram as duas
   * coisas ao mesmo tempo e o resultado foi silencioso: nenhuma leitura
   * acertava, ninguém dava erro, e as misturas saíam sem vizinhos nenhuns.
   *
   * Vazio degrada para a mistura só com a biblioteca, que é o que existia
   * antes disto.
   */
  vizinhas: ReadonlyMap<string, readonly Track[]> = new Map(),
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
    const faixas = porChave.get(chave) ?? [];
    const doLado = vizinhas.get(chave) ?? [];
    // O mínimo conta as duas fontes. Contar só a biblioteca deitava fora
    // artistas com três faixas guardadas e vinte descobertas à espera -- uma
    // mistura perfeitamente boa, recusada por uma conta que ficou por
    // actualizar quando os vizinhos entraram.
    if (faixas.length + doLado.length < MINIMO_PARA_VALER) continue;
    // Uma tua, uma nova, uma tua: o conhecido dá o tom e o desconhecido entra
    // por entre ele. Em bloco, as novas ficavam todas no fim -- que é onde
    // ninguém chega -- e a mistura era a tua biblioteca com um apêndice.
    const minhas = baralhar(faixas);
    const novas = baralhar([...doLado]);
    const juntas: Track[] = [];
    for (let i = 0; juntas.length < POR_MISTURA && (i < minhas.length || i < novas.length); i++) {
      if (minhas[i]) juntas.push(minhas[i]);
      if (novas[i] && juntas.length < POR_MISTURA) juntas.push(novas[i]);
    }
    saida.push({
      id: `artista:${chave}`,
      nome: `${artista.name} mix`,
      faixas: juntas,
    });
  }
  return saida;
}
