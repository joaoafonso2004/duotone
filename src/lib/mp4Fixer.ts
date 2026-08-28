/**
 * Utilitário para corrigir o cabeçalho de ficheiros MP4/M4A descarregados do YouTube.
 *
 * CAUSA RAIZ (verificada por dissecação dos átomos de um itag 140 real):
 * o m4a do YouTube é um MP4 FRAGMENTADO (moov sem samples + N pares moof/mdat)
 * mas, ao contrário de um fMP4/CMAF normal (onde mvhd/tkhd/mdhd = 0), o YouTube
 * escreve a duração TOTAL da faixa também nos cabeçalhos do moov. O AVPlayer
 * soma a duração declarada no moov com a duração dos fragmentos que vai
 * encontrando — como ambas valem a duração real, o AVPlayerItem (e portanto o
 * Lock Screen, que o expo-video alimenta com currentItem.duration) reporta
 * EXATAMENTE O DOBRO. Os metadados do YouTube (videoDetails.lengthSeconds,
 * sidx, soma dos trun) estão todos corretos — o problema é só a dupla
 * declaração moov+fragmentos.
 *
 * SOLUÇÃO: escrever 0 em mvhd/tkhd/mdhd (a forma canónica de um fMP4/CMAF,
 * que o AVPlayer trata corretamente todos os dias em DASH/HLS): a duração
 * passa a vir apenas dos fragmentos, que somam o valor real. O 'mehd', se
 * existir (não existe nos ficheiros atuais do YouTube), é o sítio correto
 * para declarar a duração total dos fragmentos — aí escrevemos o valor real.
 * Adicionalmente:
 *  - Desativamos os blocos de índice de segmentos ('sidx', 'ssix') convertendo-os em 'free'.
 *  - Desativamos os blocos de edit list ('edts') convertendo-os em 'free'
 *    (nos itag 140 atuais nem sequer existe edts; se aparecer, evita que o
 *    elst re-mapeie a timeline por cima da nossa correção).
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
 *
 * `durationSeconds` (duração real, se conhecida) só é usada para o 'mehd';
 * os cabeçalhos do moov são sempre postos a 0 (ver comentário no topo), pelo
 * que a correção funciona mesmo sem duração conhecida (passar null/0).
 */
export function fixMp4Duration(buffer: Uint8Array, durationSeconds: number | null): void {
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
          // Movie Header — duração a 0 (fMP4 canónico; a duração real vem dos fragmentos)
          const version = buffer[boxContentStart];
          if (version === 1) {
            const timescale = read32(buffer, boxContentStart + 20);
            movieTimescale = timescale;
            write64(buffer, boxContentStart + 24, 0);
          } else if (version === 0) {
            const timescale = read32(buffer, boxContentStart + 12);
            movieTimescale = timescale;
            write32(buffer, boxContentStart + 16, 0);
          }
        } else if (type === 'tkhd') {
          // Track Header — duração a 0
          const version = buffer[boxContentStart];
          if (version === 1) {
            write64(buffer, boxContentStart + 28, 0);
          } else if (version === 0) {
            write32(buffer, boxContentStart + 20, 0);
          }
        } else if (type === 'mdhd') {
          // Media Header — duração a 0
          const version = buffer[boxContentStart];
          if (version === 1) {
            write64(buffer, boxContentStart + 24, 0);
          } else if (version === 0) {
            write32(buffer, boxContentStart + 16, 0);
          }
        } else if (type === 'mehd') {
          // Movie Extends Header — o sítio CERTO para a duração total dos
          // fragmentos. Escreve a duração real se a soubermos; senão neutraliza
          // o box para o AVPlayer a calcular dos fragmentos.
          if (durationSeconds && durationSeconds > 0) {
            const version = buffer[boxContentStart];
            const newDuration = Math.round(durationSeconds * movieTimescale);
            if (version === 1) {
              write64(buffer, boxContentStart + 4, newDuration);
            } else if (version === 0) {
              write32(buffer, boxContentStart + 4, newDuration);
            }
          } else {
            neutralizeBox(buffer, offset);
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
