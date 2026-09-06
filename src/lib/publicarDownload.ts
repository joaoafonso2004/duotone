/**
 * Publicar o áudio descarregado: escrever para um `.part` e só depois pô-lo no
 * lugar definitivo.
 *
 * Vive à parte, com uma interface mínima de ficheiro, por uma razão que custou
 * uma release: a v1.11.0 saiu a apagar o ficheiro acabado de descarregar. O
 * `finally` limpava o temporário com `if (parcial.exists) parcial.delete()`,
 * mas depois de um `moveSync` o objecto passa a apontar para o DESTINO — logo
 * `exists` era verdade e apagava-se o que se acabara de publicar. O download
 * corria até ao fim, o ficheiro sumia, e o AVPlayer dizia só "failed to load
 * the player item".
 *
 * A limpeza passa a depender de uma bandeira explícita e não do estado do
 * objecto: nunca se apaga nada depois de uma publicação bem sucedida, seja
 * qual for o que o `moveSync` faça ao `uri`.
 */

export interface FicheiroLocal {
  readonly uri: string;
  readonly exists: boolean;
  readonly size: number | null;
  create(): void;
  write(dados: Uint8Array): void;
  moveSync(destino: FicheiroLocal): void;
  delete(): void;
}

export const AUDIO_INCOMPLETO = 'Gravacao de audio incompleta';

export function publicarAudio(opts: {
  parcial: FicheiroLocal;
  destino: FicheiroLocal;
  dados: Uint8Array;
  /** Bytes esperados. O ficheiro só é promovido se o tamanho bater certo. */
  total: number;
  /** Consultado depois da escrita: um download abortado não se publica. */
  abortado?: () => boolean;
  /** O erro a lançar quando `abortado` devolve true. */
  erroDeAborto: string;
}): string {
  const { parcial, destino, dados, total, abortado, erroDeAborto } = opts;
  let publicado = false;
  try {
    parcial.create();
    parcial.write(dados);
    if (parcial.size !== total) throw new Error(AUDIO_INCOMPLETO);
    if (abortado?.()) throw new Error(erroDeAborto);
    // Outro job chegou primeiro: o que lá está serve, e o nosso temporário é
    // lixo que o `finally` limpa.
    if (destino.exists) return destino.uri;
    parcial.moveSync(destino);
    publicado = true;
    return destino.uri;
  } finally {
    if (!publicado) {
      try {
        if (parcial.exists) parcial.delete();
      } catch {
        // Um temporário que fica para trás é lixo, não é um erro a propagar.
      }
    }
  }
}
