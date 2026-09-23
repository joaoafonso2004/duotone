import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { definirEscolhaDoCodec } from '../lib/codecDeAudio';
import {
  OPUS_LIGADO, SAUDE_INICIAL, depoisDoMotor, descreverSaudeDoOpus, lerSaudeDoOpus, podePedirOpus, versaoMaior,
  type SaudeDoOpus,
} from '../lib/saudeDoOpus';

/**
 * Se o iPhone pede Opus ao YouTube (ver `lib/saudeDoOpus.ts`). Como o
 * `saudeDoStream`: não é uma preferência, é a app a desistir quando o motor
 * não aguenta. Fica no aparelho, porque é sobre o aparelho.
 */
const CHAVE = 'opus:saude:v1';

let saude: SaudeDoOpus = SAUDE_INICIAL;
let aLer: Promise<void> | null = null;

function contexto() {
  return {
    ligado: OPUS_LIGADO,
    plataforma: Platform.OS,
    versaoDoIos: Platform.OS === 'ios' ? versaoMaior(Platform.Version) : null,
    saude,
    agora: Date.now(),
  };
}

/**
 * Chamar no arranque. Até o disco ser lido a resposta é AAC: um toque no
 * primeiro segundo não pode pedir Opus a um telemóvel onde ele já foi
 * desligado.
 */
export function instalarEscolhaDoCodec(): Promise<void> {
  let lido = false;
  definirEscolhaDoCodec(() => (lido && podePedirOpus(contexto()) ? 'opus' : 'aac'));
  aLer ??= AsyncStorage.getItem(CHAVE)
    .then((texto) => { saude = lerSaudeDoOpus(texto); })
    .catch(() => {})
    .finally(() => { lido = true; });
  return aLer;
}

function gravar(): void {
  AsyncStorage.setItem(CHAVE, JSON.stringify(saude)).catch(() => {});
}

export function anotarOpus(resultado: 'tocou' | 'recusou'): void {
  const antes = saude;
  saude = depoisDoMotor(saude, resultado, Date.now());
  if (
    saude.falhasSeguidas === antes.falhasSeguidas
    && saude.desligadoAte === antes.desligadoAte
    && saude.provado === antes.provado
  ) return;
  gravar();
}

/** Já tocou Opus neste telemóvel? Só aí o crossfade o prepara. */
export function opusProvado(): boolean {
  return saude.provado;
}

/** A linha do relatório de reprodução. */
export function estadoDoOpus(): string {
  return descreverSaudeDoOpus(contexto());
}
