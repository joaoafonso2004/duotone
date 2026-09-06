/**
 * Faixas que o utilizador fixou: nunca são apagadas pela limpeza automática.
 *
 * O cache tem um teto de 500 MB e, quando é ultrapassado, os ficheiros mais
 * antigos saem. Isso está bem para o que foi guardado sozinho ao tocar, mas
 * não para o que alguém mandou guardar de propósito — descarregar um álbum
 * para uma viagem e encontrá-lo apagado à chegada é a pior coisa que um leitor
 * de música offline pode fazer.
 *
 * Os ids ficam no AsyncStorage e não no servidor: isto é sobre ficheiros DESTE
 * telemóvel, e um download não viaja entre aparelhos.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const CHAVE = 'downloads_fixados';

interface Estado {
  ids: ReadonlySet<string>;
  carregado: boolean;
}

export const useDownloadsFixados = create<Estado>(() => ({
  ids: new Set<string>(),
  carregado: false,
}));

/** Lê os fixados do disco. Chamar uma vez no arranque, antes da limpeza. */
export async function carregarFixados(): Promise<void> {
  try {
    const cru = await AsyncStorage.getItem(CHAVE);
    const lista: unknown = cru ? JSON.parse(cru) : [];
    const ids = Array.isArray(lista) ? lista.filter((v): v is string => typeof v === 'string') : [];
    useDownloadsFixados.setState({ ids: new Set(ids), carregado: true });
  } catch {
    // Sem os fixados a limpeza só protege a fila — pior, mas não fatal.
    useDownloadsFixados.setState({ carregado: true });
  }
}

async function gravar(ids: ReadonlySet<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAVE, JSON.stringify([...ids]));
  } catch {
    // Fica em memória até à próxima gravação; não vale a pena chatear ninguém.
  }
}

/** Fixa ou desafixa. Devolve o estado novo. */
export async function alternarFixado(videoId: string): Promise<boolean> {
  const ids = new Set(useDownloadsFixados.getState().ids);
  const fixado = !ids.has(videoId);
  if (fixado) ids.add(videoId);
  else ids.delete(videoId);
  useDownloadsFixados.setState({ ids });
  await gravar(ids);
  return fixado;
}

/** Deixa de proteger algo que já não existe em disco. */
export async function esquecerFixado(videoId: string): Promise<void> {
  const ids = new Set(useDownloadsFixados.getState().ids);
  if (!ids.delete(videoId)) return;
  useDownloadsFixados.setState({ ids });
  await gravar(ids);
}

export function estaFixado(videoId: string): boolean {
  return useDownloadsFixados.getState().ids.has(videoId);
}

export function idsFixados(): string[] {
  return [...useDownloadsFixados.getState().ids];
}
