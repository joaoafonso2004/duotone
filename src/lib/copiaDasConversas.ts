import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SharedItem } from '../api/social';

/**
 * As últimas mensagens de cada conversa, no aparelho (10/11). Abrir um chat sem
 * rede mostrava-o vazio; agora mostra o que se viu da última vez, e a leitura
 * da rede (quando há) vem por cima.
 *
 * Em memória para a sessão e no AsyncStorage para o arranque seguinte. Por
 * conta: a chave leva o id de quem está a usar a app.
 */
const POR_CONVERSA = 60;
const memoria = new Map<string, SharedItem[]>();
const chave = (conta: string, conversa: string) => `duotone:conversa:${conta}:${conversa}`;

/** As mais recentes, pela ordem da conversa. */
export function ultimasMensagens(itens: readonly SharedItem[]): SharedItem[] {
  return [...itens].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id)).slice(-POR_CONVERSA);
}

export function copiaEmMemoria(conta: string, conversa: string): SharedItem[] | null {
  return memoria.get(chave(conta, conversa)) ?? null;
}

export async function lerCopiaDaConversa(conta: string, conversa: string): Promise<SharedItem[] | null> {
  const k = chave(conta, conversa);
  const m = memoria.get(k);
  if (m) return m;
  try {
    const texto = await AsyncStorage.getItem(k);
    const lida = texto ? JSON.parse(texto) : null;
    if (!Array.isArray(lida)) return null;
    memoria.set(k, lida);
    return lida;
  } catch { return null; }
}

export function guardarCopiaDaConversa(conta: string, conversa: string, itens: readonly SharedItem[]): void {
  if (!conta || !itens.length) return;
  const k = chave(conta, conversa);
  const ultimas = ultimasMensagens(itens);
  memoria.set(k, ultimas);
  AsyncStorage.setItem(k, JSON.stringify(ultimas)).catch(() => { /* sem espaço: fica a da memória */ });
}
