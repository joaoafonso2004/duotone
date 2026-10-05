import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RGB } from './corDaCapa';

// A fotografia já tem um caminho imutável. Assinar de novo não deve fazer o
// amostrador nativo descarregar a mesma capa outra vez em cada montagem.
const chaveDaImagem = (uri: string) => uri.includes('/storage/v1/object/sign/profile-') ? uri.split('?')[0]! : uri;
const KEY = 'duotone:cover-colours:v1';
const MAX = 100;
const memoria = new Map<string, RGB[]>();
const pendentes = new Map<string, Promise<RGB[] | null>>();
let carregamento: Promise<void> | null = null;
let escrita: ReturnType<typeof setTimeout> | undefined;

function valida(c: unknown): c is RGB[] {
  return Array.isArray(c) && c.length > 0 && c.length <= 16 && c.every(v => v &&
    ['r', 'g', 'b'].every(k => Number.isInteger(v[k]) && v[k] >= 0 && v[k] <= 255));
}

async function carregar() {
  return carregamento ??= (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw || raw.length > 100_000) return;
      const rows: unknown = JSON.parse(raw);
      if (!Array.isArray(rows)) return;
      for (const row of rows.slice(-MAX)) if (Array.isArray(row) && typeof row[0] === 'string' && valida(row[1])) {
        memoria.set(row[0], row[1]);
      }
    } catch { /* cores são opcionais */ }
  })();
}

export function coresEmCache(uri: string, amostrar: () => Promise<RGB[] | null>): Promise<RGB[] | null> {
  const key = chaveDaImagem(uri);
  const anterior = pendentes.get(key);
  if (anterior) return anterior;
  const pedido = (async () => {
    await carregar();
    const achado = memoria.get(key);
    if (achado) return achado;
    const cores = await amostrar();
    if (!valida(cores)) return null;
    memoria.set(key, cores);
    if (memoria.size > MAX) memoria.delete(memoria.keys().next().value!);
    if (!escrita) escrita = setTimeout(() => {
      escrita = undefined;
      void AsyncStorage.setItem(KEY, JSON.stringify([...memoria])).catch(() => {});
    }, 1500);
    return cores;
  })().finally(() => { if (pendentes.get(key) === pedido) pendentes.delete(key); });
  pendentes.set(key, pedido);
  return pedido;
}
