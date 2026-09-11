import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import {
  DISCOVERY_MODES, type DiscoveryMode,
} from '../lib/discoveryControl';
import { registar } from '../lib/eventos';

type Estado = {
  userId: string | null;
  mode: DiscoveryMode;
  ready: boolean;
  revision: number;
};

export const useDiscoveryControl = create<Estado>(() => ({
  userId: null,
  mode: 'balanced',
  ready: false,
  revision: 0,
}));

let geracao = 0;
const chave = (id: string) => `discovery-control:${id}`;

function modoValido(valor: unknown): valor is DiscoveryMode {
  return typeof valor === 'string' && DISCOVERY_MODES.includes(valor as DiscoveryMode);
}

/** Preferência por conta e por dispositivo; funciona também offline. */
export async function carregarDiscoveryControl(userId: string | null): Promise<void> {
  const actual = ++geracao;
  useDiscoveryControl.setState({ userId, mode: 'balanced', ready: false });
  if (!userId) { useDiscoveryControl.setState({ ready: true }); return; }
  try {
    const guardado = await AsyncStorage.getItem(chave(userId));
    if (actual !== geracao) return;
    useDiscoveryControl.setState({ mode: modoValido(guardado) ? guardado : 'balanced', ready: true });
  } catch {
    if (actual === geracao) useDiscoveryControl.setState({ ready: true });
  }
}

export async function definirDiscoveryMode(mode: DiscoveryMode): Promise<void> {
  const estado = useDiscoveryControl.getState();
  if (!modoValido(mode) || mode === estado.mode) return;
  useDiscoveryControl.setState((s) => ({ mode, revision: s.revision + 1 }));
  registar('controlo_descoberta_alterado', { modo: mode });
  if (estado.userId) await AsyncStorage.setItem(chave(estado.userId), mode).catch(() => {});
}
