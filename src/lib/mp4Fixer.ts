/**
 * Utilitário para corrigir o cabeçalho de ficheiros MP4/M4A descarregados do YouTube.
 * 
 * ALVO: Os streams m4a (AAC) do YouTube contêm metadados de duração incorretos/duplicados.
 * Isto faz com que o AVPlayer do iOS calcule a duração errada, mostrando o tempo errado
 * no ecrã de bloqueio e tocando silêncio no final.
 * 
 * SOLUÇÃO: Procuramos recursivamente os átomos do contentor MP4 ('mvhd', 'tkhd', 'mdhd', 'mehd')
 * e reescrevemos o valor de duração com base no tempo real da música obtido da API do YouTube.
 * Adicionalmente:
 *  - Desativamos os blocos de índice de segmentos ('sidx', 'ssix') convertendo-os em 'free'.
 *  - Desativamos os blocos de edit list ('edts') convertendo-os em 'free', pois o AVPlayer
 *    usa as entradas do 'elst' (edit list) COMO DURAÇÃO ADICIONAL — quando combinadas com
 *    as durações dos cabeçalhos, resultam num valor inflacionado (ex.: 1.5x ou 2x).
 *    Sem edit list, o AVPlayer usa diretamente a duração dos cabeçalhos que nós corrigimos.
 */

function read32(buffer: Uint8Array, offset: number): number {
  return (
    (buffer[offset] << 24) |
    (buffer[offset + 1] << 16) |
    (buffer[offset + 2] << 8) |
    buffer[offset + 3]
  );
}

function write32(buffer: Uint8Array, offset: number, value: number) {
  buffer[offset] = (value >> 24) & 0xff;
  buffer[offset + 1] = (value >> 16) & 0xff;
  buffer[offset + 2] = (value >> 8) & 0xff;
  buffer[offset + 3] = value & 0xff;
}

function write64(buffer: Uint8Array, offset: number, value: number) {
  const high = Math.floor(value / 0x100000000);
  const low = value % 0x100000000;
  write32(buffer, offset, high);
  write32(buffer, offset + 4, low);
}

/**
 * Converte o tipo de um box MP4 para 'free' (bloco vazio), neutralizando-o
 * sem alterar o tamanho do ficheiro.
 */
function neutralizeBox(buffer: Uint8Array, offset: number) {
  buffer[offset + 4] = 102; // 'f'
  buffer[offset + 5] = 114; // 'r'
  buffer[offset + 6] = 101; // 'e'
  buffer[offset + 7] = 101; // 'e'
}

/**
 * Corrige os cabeçalhos de duração do buffer M4A em-lugar.
 */
export function fixMp4Duration(buffer: Uint8Array, durationSeconds: number): void {
  if (durationSeconds <= 0) return;
  try {
    let movieTimescale = 1000; // Timescale padrão caso o mvhd não seja lido antes

    function findAndFixBoxes(start: number, end: number) {
      let offset = start;
      while (offset + 8 <= end) {
        const size = read32(buffer, offset);
        const type = String.fromCharCode(
          buffer[offset + 4],
          buffer[offset + 5],
          buffer[offset + 6],
          buffer[offset + 7]
        );

        let boxSize = size;
        let headerSize = 8;

        if (size === 1) {
          // Tamanho de 64 bits
          const low = read32(buffer, offset + 12);
          boxSize = low;
          headerSize = 16;
        } else if (size === 0) {
          boxSize = end - offset;
        }

        if (boxSize <= 0 || offset + boxSize > end) break;

        const boxContentStart = offset + headerSize;
        const boxContentEnd = offset + boxSize;

        if (type === 'moov' || type === 'trak' || type === 'mdia' || type === 'mvex') {
          // Contentores - entrar para analisar filhos
          findAndFixBoxes(boxContentStart, boxContentEnd);
        } else if (type === 'mvhd') {
          // Movie Header
          const version = buffer[boxContentStart];
          if (version === 1) {
            const timescale = read32(buffer, boxContentStart + 20);
            movieTimescale = timescale;
            const newDuration = Math.round(durationSeconds * timescale);
            write64(buffer, boxContentStart + 24, newDuration);
          } else if (version === 0) {
            const timescale = read32(buffer, boxContentStart + 12);
            movieTimescale = timescale;
            const newDuration = Math.round(durationSeconds * timescale);
            write32(buffer, boxContentStart + 16, newDuration);
          }
        } else if (type === 'tkhd') {
          // Track Header (usa o movieTimescale determinado pelo mvhd)
          const version = buffer[boxContentStart];
          const newDuration = Math.round(durationSeconds * movieTimescale);
          if (version === 1) {
            write64(buffer, boxContentStart + 28, newDuration);
          } else if (version === 0) {
            write32(buffer, boxContentStart + 20, newDuration);
          }
        } else if (type === 'mdhd') {
          // Media Header
          const version = buffer[boxContentStart];
          if (version === 1) {
            const timescale = read32(buffer, boxContentStart + 20);
            const newDuration = Math.round(durationSeconds * timescale);
            write64(buffer, boxContentStart + 24, newDuration);
          } else if (version === 0) {
            const timescale = read32(buffer, boxContentStart + 12);
            const newDuration = Math.round(durationSeconds * timescale);
            write32(buffer, boxContentStart + 16, newDuration);
          }
        } else if (type === 'mehd') {
          // Movie Extends Header — usa o movieTimescale (não um hardcoded 1000)
          const version = buffer[boxContentStart];
          const newDuration = Math.round(durationSeconds * movieTimescale);
          if (version === 1) {
            write64(buffer, boxContentStart + 4, newDuration);
          } else if (version === 0) {
            write32(buffer, boxContentStart + 4, newDuration);
          }
        } else if (type === 'edts') {
          // Edit List container — neutralizar completamente para impedir o AVPlayer
          // de usar as entradas do elst como duração adicional/mapeamento de timeline.
          // O elst pode conter entradas que fazem o AVPlayer calcular uma duração
          // inflacionada (1.5x, 2x). Converter para 'free' é seguro: sem edit list
          // o AVPlayer reproduz o media diretamente e usa a duração dos cabeçalhos
          // (mvhd/mdhd/tkhd) que nós já corrigimos.
          neutralizeBox(buffer, offset);
        } else if (type === 'sidx' || type === 'ssix') {
          // Desativar o indexador de segmentos (sidx/ssix) convertendo-o para um bloco livre (free).
          // Isto força o AVPlayer a usar a duração do cabeçalho mvhd que nós corrigimos.
          neutralizeBox(buffer, offset);
        }

        offset += boxSize;
      }
    }

    findAndFixBoxes(0, buffer.length);
  } catch (err) {
    console.warn('Erro ao corrigir metadados MP4:', err);
  }
}
