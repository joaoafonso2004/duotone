/**
 * Que codec pedir ao YouTube: o AAC de sempre (itag 140) ou o Opus (251) --
 * entrega 3 do docs/PLANO-AUDIO-IOS-CACHE-OPUS.md.
 *
 * Este módulo só guarda a DECISÃO, e é partilhado pelo resolvedor
 * (`api/ytstream.ts`, que escolhe o formato) e pela cache (`lib/youtubeCache.ts`,
 * que escolhe qual dos ficheiros tocar). Quem decide de facto é
 * `state/saudeDoOpus.ts`, que se liga aqui no arranque (`definirEscolhaDoCodec`):
 * sem ligação -- nos testes, no PC -- é sempre AAC, que é o comportamento de
 * antes.
 *
 * Duas regras que não dependem de ninguém:
 * - o "Data saver" é sempre AAC (o Opus é a qualidade ALTA);
 * - uma faixa cujo Opus o motor já recusou nesta sessão (`evitarOpusPara`)
 *   é AAC até a app fechar, mesmo que o Opus continue ligado para as outras.
 *
 * Sem imports: corre em Node puro.
 */

export type Codec = 'aac' | 'opus';
export type Qualidade = 'high' | 'saver';

/** Onde vivem os ficheiros Opus em cache. O AAC fica no `yt-audio-` de sempre. */
export const PREFIXO_OPUS = 'yt-opus-v1-';

let escolher: () => Codec = () => 'aac';
const evitados = new Set<string>();

export function definirEscolhaDoCodec(fn: () => Codec): void {
  escolher = fn;
}

export function codecPreferido(videoId: string, qualidade: Qualidade): Codec {
  if (qualidade !== 'high' || evitados.has(videoId)) return 'aac';
  return escolher();
}

export function evitarOpusPara(videoId: string): void {
  evitados.add(videoId);
}

/** Só para testes. */
export function reporCodecParaTestes(): void {
  escolher = () => 'aac';
  evitados.clear();
}
