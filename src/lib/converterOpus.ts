/**
 * WebM (itag 251) → MP4 com os mesmos pacotes Opus. Junta o leitor
 * (`lib/webmOpus.ts`) e o escritor (`lib/opusMp4.ts`), e é o que o
 * `youtubeCache` chama quando o ficheiro que chegou é um WebM.
 *
 * Atira `OPUS_INVALIDO` quando o WebM não é o que se sabe converter: quem
 * chama não publica nada e a faixa volta ao AAC. Nunca se entrega ao motor um
 * ficheiro meio convertido.
 */
import { escreverOpusMp4 } from './opusMp4';
import { lerWebmOpus } from './webmOpus';

export { OPUS_INVALIDO, pareceWebm } from './webmOpus';

export function converterWebmParaMp4(webm: Uint8Array, kbps = 0): { mp4: Uint8Array; segundos: number } {
  const { cabecalho, pacotes, amostras } = lerWebmOpus(webm);
  return { mp4: escreverOpusMp4(cabecalho, pacotes, kbps), segundos: amostras / 48_000 };
}
