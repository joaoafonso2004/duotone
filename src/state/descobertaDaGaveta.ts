import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { lerMemoriaDaDescoberta, oQueMostrar, type MemoriaDaDescoberta } from '../lib/gaveta';

/**
 * A gaveta a fazer-se descobrir (6.0.4): a linha de luz na borda da Home, o
 * ponto no botão e o empurrão do primeiro arranque. A regra está em
 * `oQueMostrar` (lib/gaveta.ts); aqui só a memória, NESTE aparelho (a chave não
 * é `pref:`, e não viaja na conta: descobrir é coisa de cada iPhone).
 */
const CHAVE = 'duotone:gaveta:descoberta';

export const useDescoberta = create<{ costura: boolean; empurrar: boolean }>(() => ({ costura: false, empurrar: false }));

let memoria: MemoriaDaDescoberta | null = null;
let gravacao: Promise<void> = Promise.resolve();
const gravar = () => {
  const m = memoria;
  if (m) gravacao = gravacao.then(() => AsyncStorage.setItem(CHAVE, JSON.stringify(m))).catch(() => {});
};

/** Uma vez por abertura da app: conta-a, e decide o que a Home mostra. */
export async function carregarDescoberta(): Promise<void> {
  if (memoria) return;
  let bruto: unknown = null;
  try { const t = await AsyncStorage.getItem(CHAVE); bruto = t ? JSON.parse(t) : null; } catch { /* começa do zero */ }
  if (memoria) return;
  const lida = lerMemoriaDaDescoberta(bruto);
  memoria = lida.vista ? lida : { ...lida, arranques: lida.arranques + 1 };
  useDescoberta.setState(oQueMostrar(memoria));
  gravar();
}

/** A gaveta abriu: a linha de luz, o ponto e o empurrão saem para sempre. */
export function marcarGavetaVista(): void {
  if (memoria?.vista) return;
  memoria = { ...(memoria ?? { arranques: 1, empurrada: true }), vista: true, empurrada: true };
  useDescoberta.setState({ costura: false, empurrar: false });
  gravar();
}

/** O empurrão aconteceu: não se repete. */
export function marcarEmpurrada(): void {
  if (!memoria || memoria.empurrada) return;
  memoria = { ...memoria, empurrada: true };
  useDescoberta.setState({ empurrar: false });
  gravar();
}
