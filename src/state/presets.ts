import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { AdjustmentSync, type AdjustmentSnapshot } from '../lib/adjustmentSync';
import {
  daPersistenciaDePresets, fundirPresets, type LinhaDosPresets, type MemoriaDePresets,
} from '../lib/presetsDoEqualizador';
import { guardarPresetRemoto, lerPresetsRemotos } from '../api/presets';
import { appEstaVisivel } from '../lib/appVisibility';
import { useAuth } from './auth';
import { useConnectivity } from './connectivity';

/**
 * Os presets do equalizador de quem está na conta (lib/presetsDoEqualizador.ts).
 *
 * A sincronização é a dos ajustes por faixa (state/trackAdjustments.ts), com o
 * mesmo motor: fila durável no aparelho, fusão pelo mais recente, Realtime a
 * avisar o outro aparelho. A diferença é a tabela (supabase/eq-presets.sql) --
 * e que sem ela a app não se queixa: os presets ficam no aparelho até a tabela
 * existir.
 */
export const usePresets = create<{ memoria: MemoriaDePresets }>(() => ({ memoria: {} }));

let ativo: { userId: string; engine: AdjustmentSync<LinhaDosPresets>; flush: () => void } | null = null;
/** Mudanças feitas antes de a conta abrir: entram quando ela abrir. */
let antesDeAbrir: MemoriaDePresets = {};

/**
 * Muda os presets: aplica já, guarda no aparelho e agenda o envio das linhas
 * que mudaram. `f` recebe a memória e o relógio, e devolve a memória nova --
 * são as funções do lib/presetsDoEqualizador.ts.
 */
export function mudarPresets(f: (m: MemoriaDePresets, agora: number) => MemoriaDePresets): void {
  const antes = usePresets.getState().memoria;
  const depois = f(antes, Date.now());
  if (depois === antes) return;
  usePresets.setState({ memoria: depois });
  const mudadas = Object.entries(depois).filter(([k, l]) => antes[k] !== l);
  if (!ativo) {
    for (const [k, l] of mudadas) antesDeAbrir[k] = l;
    return;
  }
  for (const [k, l] of mudadas) ativo.engine.edit(k, l);
  ativo.flush();
}

/** Tabela em falta: a migração ainda não correu. Não é um erro a repetir. */
const semTabela = (e: unknown) => {
  const code = (e as { code?: string } | null)?.code;
  return code === '42P01' || code === 'PGRST205';
};

export function iniciarPresets(userId: string): () => void {
  let parado = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let tabelaEmFalta = false;
  const chave = `eq-presets:v1:${userId}`;
  const online = () => !parado && !tabelaEmFalta && !useConnectivity.getState().offline
    && useAuth.getState().session?.user.id === userId && appEstaVisivel();

  const engine = new AdjustmentSync<LinhaDosPresets>({
    readLocal: async () => {
      const cru = await AsyncStorage.getItem(chave);
      if (!cru) return { values: {}, pending: {} };
      const lido = JSON.parse(cru) as { values?: unknown; pending?: unknown };
      return {
        values: daPersistenciaDePresets(JSON.stringify(lido.values ?? {})),
        pending: daPersistenciaDePresets(JSON.stringify(lido.pending ?? {})),
      };
    },
    writeLocal: async (s: AdjustmentSnapshot<LinhaDosPresets>) => { await AsyncStorage.setItem(chave, JSON.stringify(s)); },
    readRemote: async () => {
      try {
        return await lerPresetsRemotos(userId);
      } catch (e) {
        if (semTabela(e)) tabelaEmFalta = true;
        throw e;
      }
    },
    writeRemote: (k, v) => guardarPresetRemoto(userId, k, v),
    apply: (values) => { if (!parado) usePresets.setState({ memoria: values }); },
    status: () => {},
    fundir: fundirPresets,
  });

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { if (online()) void engine.sync(); }, 500);
  };
  ativo = { userId, engine, flush };
  for (const [k, l] of Object.entries(antesDeAbrir)) engine.edit(k, l);
  antesDeAbrir = {};

  const aoVoltarARede = useConnectivity.subscribe((s) => { if (!s.offline) flush(); });
  const aoAbrir = AppState.addEventListener('change', (estado) => { if (estado === 'active') flush(); });
  // Rede de segurança; quem avisa na hora é o Realtime.
  const intervalo = setInterval(() => { if (online()) void engine.sync(); }, 120000);
  const canal = supabase.channel(`eq-presets:${userId}`).on('postgres_changes',
    { event: '*', schema: 'public', table: 'user_eq_presets', filter: `user_id=eq.${userId}` }, flush).subscribe();
  if (Platform.OS === 'web') {
    window.addEventListener('online', flush);
    window.addEventListener('focus', flush);
  }
  flush();

  return () => {
    parado = true;
    engine.stop();
    if (ativo?.engine === engine) ativo = null;
    if (timer) clearTimeout(timer);
    clearInterval(intervalo);
    aoVoltarARede();
    aoAbrir.remove();
    void supabase.removeChannel(canal);
    if (Platform.OS === 'web') {
      window.removeEventListener('online', flush);
      window.removeEventListener('focus', flush);
    }
    // Os presets de quem sai não ficam à vista de quem entra.
    usePresets.setState({ memoria: {} });
  };
}
