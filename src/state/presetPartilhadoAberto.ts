import { Platform } from 'react-native';
import { create } from 'zustand';
import { avisarInfo } from '../lib/avisoDeRemocao';
import type { PresetPartilhado } from '../lib/presetPartilhado';

/**
 * O preset de um amigo aberto na folha (28/11, `components/FolhaDoPresetPartilhado.tsx`):
 * o cartão na conversa abre-a daqui, sem ter de passar funções pelo Social todo.
 */
export const usePresetPartilhadoAberto = create<{ preset: PresetPartilhado | null; de: string | null }>(() => ({
  preset: null,
  de: null,
}));

/** Abre a folha do preset: `de` é o nome de quem o mandou (null: fui eu). */
export function abrirPresetPartilhado(preset: PresetPartilhado, de: string | null): void {
  usePresetPartilhadoAberto.setState({ preset, de });
}

/**
 * O toque no cartão de um preset numa conversa: no iPhone abre a folha; no PC, que
 * não tem a Customise, diz onde se usa.
 */
export function tocarNoPresetDaMensagem(preset: PresetPartilhado, de: string | null): void {
  if (Platform.OS === 'web') {
    avisarInfo('Presets are for the iPhone', 'Open this conversation in Duotone on your iPhone to see, save or use it.');
    return;
  }
  abrirPresetPartilhado(preset, de);
}

export function fecharPresetPartilhado(): void {
  usePresetPartilhadoAberto.setState({ preset: null, de: null });
}
