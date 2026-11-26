import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import {
  comAspetoNovo, comNomeNovo, comPresetNovo, comPresetReposto, lerPresets, semPreset, type PresetDaAparencia,
} from '../lib/presetsDaAparencia';
import { aparenciaAtual, useAparencia } from './aparencia';
import { useCapaIOS } from './capaIOS';

/**
 * Os presets do Customise (26/11, `lib/presetsDaAparencia.ts`): no aparelho
 * (`pref:presetsDaAparencia`), como a aparência. Carregam quando o Customise abre.
 */
const CHAVE = 'pref:presetsDaAparencia';

type Estado = {
  presets: PresetDaAparencia[];
  carregado: boolean;
  carregar: () => Promise<void>;
  /** Guarda o aspeto de agora com este nome. */
  guardarAtual: (nome: string) => void;
  /** Põe o aspeto do preset (as opções e o estilo da capa). */
  aplicar: (id: string) => void;
  renomear: (id: string, nome: string) => void;
  /** O preset passa a ter o aspeto de agora. */
  atualizar: (id: string) => void;
  /** Tira-o e devolve como o repor (o "Undo"). */
  apagar: (id: string) => (() => void) | null;
};

let contador = 0;
const novoId = () => `p${Date.now().toString(36)}${(contador++).toString(36)}`;

export const usePresetsDaAparencia = create<Estado>((set, get) => {
  const mudar = (presets: PresetDaAparencia[]) => {
    set({ presets });
    void AsyncStorage.setItem(CHAVE, JSON.stringify(presets)).catch(() => {});
  };
  return {
    presets: [],
    carregado: false,
    carregar: async () => {
      if (get().carregado) return;
      try {
        const v = await AsyncStorage.getItem(CHAVE);
        set({ presets: v ? lerPresets(JSON.parse(v)) : [], carregado: true });
      } catch {
        set({ carregado: true });
      }
    },
    guardarAtual: (nome) => {
      mudar(comPresetNovo(get().presets, novoId(), nome, aparenciaAtual(), useCapaIOS.getState().style));
    },
    aplicar: (id) => {
      const p = get().presets.find((x) => x.id === id);
      if (!p) return;
      useAparencia.getState().restaurar(p.aparencia);
      if (useCapaIOS.getState().style !== p.capa) useCapaIOS.getState().setStyle(p.capa);
    },
    renomear: (id, nome) => mudar(comNomeNovo(get().presets, id, nome)),
    atualizar: (id) => mudar(comAspetoNovo(get().presets, id, aparenciaAtual(), useCapaIOS.getState().style)),
    apagar: (id) => {
      const antes = get().presets;
      const indice = antes.findIndex((p) => p.id === id);
      if (indice < 0) return null;
      const tirado = antes[indice];
      mudar(semPreset(antes, id));
      return () => mudar(comPresetReposto(get().presets, tirado, indice));
    },
  };
});
