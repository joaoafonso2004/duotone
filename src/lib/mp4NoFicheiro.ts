/**
 * O `fixMp4Duration` sobre um ficheiro que JÁ ESTÁ no disco, sem o ler todo
 * (auditoria 4.1, 4/10).
 *
 * O download nativo (`modules/duotone-download`) escreve os bocados direto no
 * `.part`: os bytes do áudio nunca passam pelo JavaScript. Falta corrigir a
 * duração (mp4Fixer.ts), e para isso chega a CABEÇA -- o que vem antes do
 * primeiro moof/mdat -- e os cabeçalhos de 8 bytes das boxes de topo. São as
 * mesmas regras do `mp4AoVivo.ts`, que o `test-mp4-ao-vivo.mjs` prova iguais
 * ao fixer sobre o ficheiro inteiro; o `test-mp4-no-ficheiro.mjs` prova estas
 * contra o fixer da mesma maneira.
 *
 * Primeiro decide-se, só a ler; escreve-se no fim, e só se o resultado for o
 * MESMO do fixer inteiro (`exato`). Quando não dá para garantir (a cabeça não
 * fecha, uma box de topo com campos depois dos fragmentos, boxes que não
 * fecham no fim do ficheiro) não se escreve nada e devolve-se `exato: false`:
 * quem chama corre o fixer sobre o ficheiro inteiro, o caminho de sempre.
 *
 * Sem imports além do fixer e do validador, para correr em Node.
 */

import { fixMp4Duration } from './mp4Fixer';
import { validarEstruturaMp4 } from './mp4Structure';

/** Onde a cabeça acaba. */
const FRAGMENTOS = ['moof', 'mdat'];
/** O que o fixer neutraliza ao nível de cima: basta o cabeçalho. */
const A_NEUTRALIZAR = ['sidx', 'ssix', 'edts'];
/** O que o fixer corrige POR DENTRO. Depois da cabeça não se sabe fazê-lo. */
const POR_DENTRO = ['moov', 'trak', 'mdia', 'mvex', 'mvhd', 'tkhd', 'mdhd', 'mehd'];
/** O teto do `validarEstruturaMp4`. */
const MAX_BOXES = 200_000;
const FREE = new Uint8Array([102, 114, 101, 101]);

/** Ler e escrever num ficheiro aberto, por posição. */
export type AcessoAoFicheiro = {
  ler(posicao: number, quantos: number): Uint8Array;
  escrever(posicao: number, bytes: Uint8Array): void;
};

function u32(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}

function tipoEm(b: Uint8Array, o: number): string {
  return String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
}

/**
 * Corrige no sítio. `exato: true` quer dizer que o ficheiro ficou igual ao do
 * `fixMp4Duration` sobre ele inteiro (incluindo "não mexer em nada", quando o
 * fixer não mexeria).
 */
export function corrigirMp4NoFicheiro(
  f: AcessoAoFicheiro,
  total: number,
  durationSeconds: number | null,
): { exato: boolean } {
  const cabecalhoEm = (posicao: number) => f.ler(posicao, Math.min(16, total - posicao));

  // --- onde acaba a cabeça
  let cursor = 0;
  let fim = -1;
  while (cursor < total) {
    const c = cabecalhoEm(cursor);
    if (c.length < 8) break;
    let tamanho = u32(c, 0);
    let cabecalho = 8;
    if (tamanho === 1) {
      if (c.length < 16 || u32(c, 8) !== 0) break;
      tamanho = u32(c, 12);
      cabecalho = 16;
    } else if (tamanho === 0) {
      break; // até ao fim do ficheiro: a cabeça não fecha
    }
    if (tamanho < cabecalho) break;
    if (FRAGMENTOS.indexOf(tipoEm(c, 0)) >= 0) { fim = cursor; break; }
    cursor += tamanho;
  }
  // Sem cabeça que feche, o corretor ao vivo retinha tudo e corria o fixer
  // inteiro no fim: aqui é quem chama que o faz.
  if (fim < 0) return { exato: false };

  const cabeca = f.ler(0, fim);
  let boxes = 0;
  let semCorrecao = false;
  try {
    boxes = validarEstruturaMp4(cabeca);
    fixMp4Duration(cabeca, durationSeconds);
  } catch {
    // Cabeça inválida => ficheiro inválido => o fixer não mexia em nada.
    semCorrecao = true;
  }

  // --- o corpo: só os cabeçalhos das boxes de topo
  const neutralizar: number[] = [];
  let proxima = fim;
  let ateAoFim = false;
  let invalido = false;
  let divergente = false;
  while (proxima < total) {
    const c = cabecalhoEm(proxima);
    if (c.length < 8) { invalido = true; break; }
    let tamanho = u32(c, 0);
    let cabecalho = 8;
    if (tamanho === 1) {
      if (c.length < 16 || u32(c, 8) !== 0) { invalido = true; break; }
      tamanho = u32(c, 12);
      cabecalho = 16;
    }
    if (tamanho !== 0 && tamanho < cabecalho) { invalido = true; break; }
    if (++boxes > MAX_BOXES) invalido = true;
    if (!semCorrecao) {
      const tipo = tipoEm(c, 0);
      if (A_NEUTRALIZAR.indexOf(tipo) >= 0) neutralizar.push(proxima + 4);
      else if (POR_DENTRO.indexOf(tipo) >= 0) divergente = true;
    }
    if (tamanho === 0) { ateAoFim = true; break; }
    proxima += tamanho;
  }

  if (semCorrecao) return { exato: true };
  const fechou = ateAoFim || proxima === total;
  if (!fechou || invalido || divergente) return { exato: false };

  f.escrever(0, cabeca);
  for (const posicao of neutralizar) f.escrever(posicao, FREE);
  return { exato: true };
}
