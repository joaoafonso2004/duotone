import { AppState } from 'react-native';
import {
  juntarMedida, textoDoProcessamento, type MedidaDoProcessamento,
} from '../lib/processamentoDoAudio';
import type { FimDeDownload } from '../lib/youtubeCache';

/**
 * As últimas medições do processamento dos downloads, para a secção do
 * relatório do iPhone (3/10, lib/processamentoDoAudio.ts). Só em memória:
 * morre com a app, como os travões do fôlego com que se compara.
 */
let medidas: MedidaDoProcessamento[] = [];

/** Chamado pelo `ligarMedicoes` a cada download que acaba. */
export function guardarProcessamento(fim: FimDeDownload): void {
  if (fim.resultado !== 'ok' || !fim.processamento) return;
  medidas = juntarMedida(medidas, {
    ...fim.processamento,
    em: Date.now(),
    bytes: fim.bytes,
    prioridade: fim.prioridade,
    aFrente: AppState.currentState === 'active',
  });
}

export function textoDoProcessamentoAgora(): string {
  return textoDoProcessamento(medidas);
}
