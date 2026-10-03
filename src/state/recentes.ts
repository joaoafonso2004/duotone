import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { capasDaFila, lerRecentes, podeVoltar, registarRecente, type Recente } from '../lib/recentes';
import { usePlayer } from './player';

/**
 * O "Jump back in" da Home (3/10, `lib/recentes.ts`): por conta, no aparelho
 * (`jump-back-in:v1:<conta>`). Não viaja: é sobre o que se ouviu NESTE
 * telemóvel, e lê-se sem rede.
 */
export const useRecentes = create<{ lista: Recente[]; conta: string | null }>(() => ({ lista: [], conta: null }));

const chave = (conta: string) => `jump-back-in:v1:${conta}`;

/** Chamado quando a conta muda (App.tsx): sem conta, nada. */
export async function carregarRecentes(conta: string | null): Promise<void> {
  useRecentes.setState({ conta, lista: [] });
  if (!conta) return;
  try {
    const lista = lerRecentes(await AsyncStorage.getItem(chave(conta)));
    // Entretanto pode ter mudado de conta, ou tocado alguma coisa.
    if (useRecentes.getState().conta !== conta) return;
    const agora = useRecentes.getState().lista;
    let juntos = lista;
    for (const r of [...agora].reverse()) juntos = registarRecente(juntos, r);
    useRecentes.setState({ lista: juntos });
  } catch { /* sem disco, começa vazio */ }
}

/**
 * Cada lista nova com origem entra à frente (uma vez, no topo do App.tsx).
 * Ouve a store do leitor em vez de cada ecrã se lembrar de registar.
 */
export function instalarRecentes(): () => void {
  return usePlayer.subscribe((s, antes) => {
    const o = s.origemDaFila;
    if (o === antes.origemDaFila || !podeVoltar(o)) return;
    const { conta, lista } = useRecentes.getState();
    const nova = registarRecente(lista, { tipo: o.tipo, nome: o.nome, id: o.id, capas: capasDaFila(s.queue), quando: Date.now() });
    useRecentes.setState({ lista: nova });
    if (conta) void AsyncStorage.setItem(chave(conta), JSON.stringify(nova)).catch(() => {});
  });
}
