/**
 * O `fixMp4Duration` à medida que o ficheiro chega.
 *
 * Tocar enquanto descarrega (`transmitirAudio`, em youtubeCache.ts) põe bytes
 * em disco antes de o ficheiro estar inteiro, e o AVPlayer lê-os logo. A
 * correção da duração (mp4Fixer.ts) tem de estar feita ANTES: o moov é a
 * primeira coisa que ele lê, e é lá que nasce o 2x do ecrã bloqueado.
 *
 * O resultado é o MESMO do `fixMp4Duration` sobre o ficheiro inteiro -- o
 * `scripts/test-mp4-ao-vivo.mjs` compara os dois byte a byte, com bocados de
 * todos os tamanhos. Chega olhar para o princípio porque:
 *
 *  - o fixer só escreve dentro de moov/trak/mdia/mvex, nas mvhd/tkhd/mdhd/mehd
 *    e nas sidx/ssix/edts que encontre ao nível de cima;
 *  - num m4a do YouTube tudo o que tem campos vem ANTES do primeiro moof/mdat,
 *    a "cabeça". Retém-se a cabeça até estar completa e corrige-se com o
 *    próprio `fixMp4Duration`; dali para a frente só há sidx/ssix/edts a
 *    neutralizar, e isso faz-se com o cabeçalho de 8 bytes de cada box.
 *
 * Onde não dá para garantir o mesmo resultado diz-se (`exato: false`) em vez
 * de fingir: uma box com campos ao nível de cima DEPOIS do primeiro fragmento,
 * ou boxes que não fecham certo no fim -- aí o fixer inteiro não tocava em
 * nada (`validarEstruturaMp4`) e o que já foi para o disco levava a cabeça
 * corrigida. Quem chama não publica esse ficheiro: toca-se desta vez, e da
 * próxima descarrega-se pelo caminho antigo.
 *
 * Se a cabeça nunca fechar (sem moof/mdat, ou uma box que não se sabe medir),
 * retém-se tudo e no fim corre o `fixMp4Duration` sobre o ficheiro inteiro: o
 * caminho antigo, tal e qual. Nunca é pior do que esperar pelo download todo.
 *
 * Sem imports além do fixer e do validador, para o teste o carregar em Node.
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

export type Mp4AoVivo = {
  /** Recebe o bocado seguinte e devolve o que já pode ir para o disco. */
  receber(bocado: Uint8Array): Uint8Array;
  /**
   * Não vem mais nada. `resto` vai para o disco a seguir ao que já foi;
   * `exato` diz se o ficheiro inteiro ficou igual ao do `fixMp4Duration`.
   */
  acabar(): { resto: Uint8Array; exato: boolean };
  /** Bytes já devolvidos. */
  readonly libertados: number;
};

function u32(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}

function tipoEm(b: Uint8Array, o: number): string {
  return String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
}

function juntar(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (!a.length) return b;
  if (!b.length) return a;
  const c = new Uint8Array(a.length + b.length);
  c.set(a, 0);
  c.set(b, a.length);
  return c;
}

const VAZIO = new Uint8Array(0);

export function criarMp4AoVivo(durationSeconds: number | null): Mp4AoVivo {
  // --- fase da cabeça: guarda-se tudo, contíguo, com capacidade a dobrar
  // (a cabeça pode nunca fechar, e aí isto chega a ter o ficheiro inteiro).
  let naCabeca = true;
  let cabeca = new Uint8Array(0);
  let usados = 0;
  /** Próxima box de topo por medir, dentro da cabeça. */
  let cursor = 0;
  /** Uma box que não se sabe medir antes do fim: fica tudo retido. */
  let cabecaImpossivel = false;

  // --- fase do corpo
  let libertados = 0;
  /** Bytes recebidos e ainda não devolvidos; começam em `libertados`. */
  let pendente: Uint8Array = VAZIO;
  /** Posição absoluta da próxima box de topo; `Infinity` quando se deixa de seguir. */
  let proxima = 0;
  let boxes = 0;
  /** Houve uma box até ao fim do ficheiro (tamanho 0). */
  let ateAoFim = false;
  let invalido = false;
  let divergente = false;
  /** A cabeça não passou no validador: o fixer inteiro não tocaria em nada. */
  let semCorrecao = false;

  const guardar = (bocado: Uint8Array) => {
    if (usados + bocado.length > cabeca.length) {
      const maior = new Uint8Array(Math.max(usados + bocado.length, cabeca.length * 2, 64 * 1024));
      maior.set(cabeca.subarray(0, usados));
      cabeca = maior;
    }
    cabeca.set(bocado, usados);
    usados += bocado.length;
  };

  /** Mede as boxes de topo da cabeça; devolve onde ela acaba, ou -1. */
  const fimDaCabeca = (): number => {
    while (!cabecaImpossivel) {
      if (usados - cursor < 8) return -1;
      let tamanho = u32(cabeca, cursor);
      let cabecalho = 8;
      if (tamanho === 1) {
        if (usados - cursor < 16) return -1;
        if (u32(cabeca, cursor + 8) !== 0) { cabecaImpossivel = true; break; }
        tamanho = u32(cabeca, cursor + 12);
        cabecalho = 16;
      } else if (tamanho === 0) {
        // Vai até ao fim do ficheiro, que ainda não se sabe onde é.
        cabecaImpossivel = true;
        break;
      }
      if (tamanho < cabecalho) { cabecaImpossivel = true; break; }
      if (FRAGMENTOS.indexOf(tipoEm(cabeca, cursor)) >= 0) return cursor;
      cursor += tamanho;
    }
    return -1;
  };

  /** Segue as boxes de topo do corpo que já cabem em `pendente`. Devolve quanto se pode soltar. */
  const seguirCorpo = (): number => {
    while (proxima !== Infinity && proxima < libertados + pendente.length) {
      const rel = proxima - libertados;
      if (pendente.length - rel < 8) return rel;
      let tamanho = u32(pendente, rel);
      let cabecalho = 8;
      if (tamanho === 1) {
        if (pendente.length - rel < 16) return rel;
        if (u32(pendente, rel + 8) !== 0) { invalido = true; proxima = Infinity; break; }
        tamanho = u32(pendente, rel + 12);
        cabecalho = 16;
      }
      if (tamanho !== 0 && tamanho < cabecalho) { invalido = true; proxima = Infinity; break; }
      if (++boxes > MAX_BOXES) invalido = true;
      if (!semCorrecao) {
        const tipo = tipoEm(pendente, rel);
        if (A_NEUTRALIZAR.indexOf(tipo) >= 0) {
          pendente[rel + 4] = 102; // 'f'
          pendente[rel + 5] = 114; // 'r'
          pendente[rel + 6] = 101; // 'e'
          pendente[rel + 7] = 101; // 'e'
        } else if (POR_DENTRO.indexOf(tipo) >= 0) {
          divergente = true;
        }
      }
      if (tamanho === 0) { ateAoFim = true; proxima = Infinity; break; }
      proxima += tamanho;
    }
    return pendente.length;
  };

  const soltar = (): Uint8Array => {
    const ate = seguirCorpo();
    if (ate <= 0) return VAZIO;
    const saida = pendente.subarray(0, ate);
    pendente = ate === pendente.length ? VAZIO : pendente.slice(ate);
    libertados += saida.length;
    return saida;
  };

  return {
    get libertados() { return libertados; },

    receber(bocado) {
      if (!bocado.length) return VAZIO;
      if (!naCabeca) {
        // Cópia: o `pendente` é escrito no sítio e o bocado é de quem chamou.
        pendente = juntar(pendente, bocado.slice());
        return soltar();
      }
      guardar(bocado);
      const fim = fimDaCabeca();
      if (fim < 0) return VAZIO;

      naCabeca = false;
      const cab = cabeca.subarray(0, fim);
      try {
        boxes = validarEstruturaMp4(cab);
        fixMp4Duration(cab, durationSeconds);
      } catch {
        // Cabeça inválida => ficheiro inválido => o fixer não mexia em nada.
        semCorrecao = true;
      }
      pendente = cabeca.slice(0, usados);
      cabeca = VAZIO;
      proxima = fim;
      return soltar();
    },

    acabar() {
      if (naCabeca) {
        // O caminho antigo, exatamente: o fixer sobre o ficheiro inteiro.
        const tudo = cabeca.slice(0, usados);
        fixMp4Duration(tudo, durationSeconds);
        cabeca = VAZIO;
        naCabeca = false;
        libertados = tudo.length;
        return { resto: tudo, exato: true };
      }
      const total = libertados + pendente.length;
      const resto = pendente;
      pendente = VAZIO;
      libertados = total;
      if (semCorrecao) return { resto, exato: true };
      const fechou = ateAoFim || proxima === total;
      return { resto, exato: fechou && !invalido && !divergente };
    },
  };
}
