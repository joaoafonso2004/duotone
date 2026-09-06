/**
 * Preflight do contentor MP4: percorre a árvore de boxes SEM escrever nada e
 * confirma que cada campo que o fixer vai tocar cabe mesmo dentro da sua box.
 *
 * O bug que isto fecha: o `mp4Fixer` confirmava que a box cabia no PAI, mas
 * depois escrevia em offsets fixos (`boxContentStart + 16`, `+ 20`, ...) sem
 * confirmar o fim da própria box. Um `mvhd` truncado fazia o `write32` alterar
 * bytes do `mdat` seguinte — ou seja, o corretor de duração corrompia o áudio
 * que estava a tentar corrigir.
 *
 * Isto não é um descodificador nem uma verificação de autenticidade: só
 * responde à pergunta "é seguro escrever nos sítios onde o fixer escreve?".
 */

const CONTENTORES = ['moov', 'trak', 'mdia', 'mvex'];
const CAMPOS = ['mvhd', 'tkhd', 'mdhd', 'mehd'];

// Bytes mínimos de conteúdo por box, a contar do byte da versão, para que os
// offsets que o fixer usa existam. Derivados do ISO/IEC 14496-12.
function minimoDe(tipo: string, versao: number): number {
  if (tipo === 'tkhd') return versao ? 36 : 24;
  if (tipo === 'mehd') return versao ? 12 : 8;
  return versao ? 32 : 20; // mvhd, mdhd
}

export function validarEstruturaMp4(buffer: Uint8Array): void {
  const vista = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let boxes = 0;

  const percorrer = (inicio: number, fim: number, profundidade: number): void => {
    if (profundidade > 32) throw new Error('MP4: aninhamento excessivo');
    let offset = inicio;

    while (offset < fim) {
      if (++boxes > 200_000) throw new Error('MP4: boxes a mais');
      if (fim - offset < 8) throw new Error('MP4: cabeçalho truncado');

      // getUint32 e não read32: o parser antigo lia com sinal, e uma box com o
      // bit alto ligado dava tamanho negativo.
      let tamanho = vista.getUint32(offset, false);
      let cabecalho = 8;

      if (tamanho === 1) {
        if (fim - offset < 16) throw new Error('MP4: largesize truncado');
        // O downloader tem teto de 256 MiB; uma box acima de 4 GiB nunca cabe.
        if (vista.getUint32(offset + 8, false) !== 0) throw new Error('MP4: box demasiado grande');
        tamanho = vista.getUint32(offset + 12, false);
        cabecalho = 16;
      } else if (tamanho === 0) {
        tamanho = fim - offset; // box que se estende até ao fim do pai
      }

      if (tamanho < cabecalho || tamanho > fim - offset) throw new Error('MP4: tamanho inválido');

      const tipo = String.fromCharCode(
        buffer[offset + 4], buffer[offset + 5], buffer[offset + 6], buffer[offset + 7],
      );
      const conteudo = offset + cabecalho;
      const limite = offset + tamanho;

      if (CONTENTORES.indexOf(tipo) >= 0) {
        percorrer(conteudo, limite, profundidade + 1);
      } else if (CAMPOS.indexOf(tipo) >= 0) {
        if (conteudo >= limite) throw new Error(`MP4: ${tipo} sem conteúdo`);
        const versao = buffer[conteudo];
        if (versao !== 0 && versao !== 1) throw new Error(`MP4: ${tipo} com versão ${versao}`);
        if (limite - conteudo < minimoDe(tipo, versao)) throw new Error(`MP4: ${tipo} truncado`);
      }

      offset = limite;
    }
  };

  percorrer(0, buffer.length, 0);
}
