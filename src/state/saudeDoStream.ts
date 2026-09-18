import AsyncStorage from '@react-native-async-storage/async-storage';
import { ligacaoAoMotor } from '../../modules/duotone-stream';
import type { LigacaoAoMotor } from '../lib/youtubeCache';
import {
  SAUDE_INICIAL, depoisDeTransmitir, descreverSaude, lerSaude, podeTransmitir,
  type SaudeDoStream,
} from '../lib/tocarEnquantoDescarrega';

/**
 * Se o iPhone toca enquanto descarrega (ver `lib/tocarEnquantoDescarrega.ts`).
 * Não é uma preferência: ninguém escolhe isto, é a app que desiste do caminho
 * novo quando o motor não o aguenta. Fica no aparelho, porque é sobre o
 * aparelho (a versão do iOS, o binário instalado).
 */
const CHAVE = 'stream:saude:v1';

let saude: SaudeDoStream = SAUDE_INICIAL;
let aLer: Promise<void> | null = null;

function ler(): void {
  aLer ??= AsyncStorage.getItem(CHAVE)
    .then((texto) => { saude = lerSaude(texto); })
    .catch(() => {});
}

/**
 * A ponte para o módulo nativo, ou `null` para descarregar primeiro: sem
 * módulo neste binário, ou desligado por falhas. A primeira chamada da sessão
 * ainda não leu o disco e deixa tentar -- uma faixa a mais, no pior caso.
 */
export function ligacaoParaTransmitir(): LigacaoAoMotor | null {
  ler();
  if (!ligacaoAoMotor) return null;
  return podeTransmitir(saude, Date.now()) ? ligacaoAoMotor : null;
}

export function anotarTransmissao(resultado: 'tocou' | 'falhou'): void {
  const antes = saude;
  saude = depoisDeTransmitir(saude, resultado, Date.now());
  if (saude.falhasSeguidas === antes.falhasSeguidas && saude.desligadoAte === antes.desligadoAte) return;
  AsyncStorage.setItem(CHAVE, JSON.stringify(saude)).catch(() => {});
}

/** A linha do relatório de reprodução. */
export function estadoDoStream(): string {
  return descreverSaude(saude, Date.now(), !!ligacaoAoMotor);
}
