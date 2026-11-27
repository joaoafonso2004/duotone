import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SeccaoDoIphone } from '../lib/procuraDasDefinicoes';

/**
 * As secções abertas das Definições do iPhone (27/11): lembram-se ao voltar. Só
 * deste aparelho (AsyncStorage). Uma secção que deixe de existir cai fora.
 */
const CHAVE = 'duotone:definicoes-abertas:v1';
const CONHECIDAS: readonly SeccaoDoIphone[] = ['playback', 'sound', 'appearance', 'general', 'library', 'storage', 'account', 'scrobbling', 'about'];

export async function lerSeccoesAbertas(): Promise<SeccaoDoIphone[]> {
  try {
    const raw = await AsyncStorage.getItem(CHAVE);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is SeccaoDoIphone => CONHECIDAS.includes(x)) : [];
  } catch { return []; }
}

export async function guardarSeccoesAbertas(abertas: SeccaoDoIphone[]): Promise<void> {
  try { await AsyncStorage.setItem(CHAVE, JSON.stringify(abertas)); } catch { /* fica por guardar */ }
}
