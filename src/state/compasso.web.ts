import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Compasso } from '../lib/compasso';
import { usePlayer } from './player';

/**
 * O andamento de cada música, medido pela captura do Now Playing do PC (S3,
 * `lib/compasso.ts`). A captura só corre com ele aberto, e as barrinhas das listas
 * vêem-se com ele fechado: guardar por música é o que faz o andamento servir, a
 * partir da segunda vez que ela toca. Fica no aparelho, e não custa pedido nenhum.
 */
const CHAVE = 'compasso:pc';
const MAXIMO = 400;
/**
 * Uma medida nova só troca a guardada se for claramente melhor: sem isto, uma música
 * entre os 80 e os 160 BPM ia e vinha, e as barrinhas com ela.
 */
const MARGEM = 0.1;

/** `b`: o andamento à velocidade normal. `c`: a confiança. `v`: quando se mediu. */
type Medido = { b: number; c: number; v: number };

let memoria: Record<string, Medido> = {};
let lida = false;
let versao = 0;
const ouvintes = new Set<() => void>();

function avisar(): void {
  versao++;
  ouvintes.forEach((f) => f());
}

function ler(): void {
  if (lida) return;
  lida = true;
  AsyncStorage.getItem(CHAVE)
    .then((cru) => {
      const guardado = cru ? JSON.parse(cru) : null;
      if (!guardado || typeof guardado !== 'object') return;
      memoria = { ...guardado, ...memoria };
      avisar();
    })
    .catch(() => {});
}

export function ouvirCompassos(f: () => void): () => void {
  ler();
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

export const versaoDosCompassos = (): number => versao;

export function compassoMedido(id: string, velocidade = 1): Compasso | null {
  const m = memoria[id];
  return m ? { bpm: m.b * velocidade, confianca: m.c, fonte: 'captura' } : null;
}

/** O que a captura acabou de medir, para a música que está a tocar. */
export function medirCompasso(medida: { bpm: number; confianca: number }): void {
  const { current, playbackRate } = usePlayer.getState();
  if (!current) return;
  const ja = memoria[current.sourceId];
  if (ja && medida.confianca < ja.c + MARGEM) return;
  memoria[current.sourceId] = {
    b: Math.round((medida.bpm / (playbackRate || 1)) * 10) / 10,
    c: Math.round(medida.confianca * 100) / 100,
    v: Date.now(),
  };
  const ids = Object.keys(memoria);
  if (ids.length > MAXIMO) {
    ids.sort((a, b) => memoria[a].v - memoria[b].v);
    for (const id of ids.slice(0, ids.length - MAXIMO)) delete memoria[id];
  }
  AsyncStorage.setItem(CHAVE, JSON.stringify(memoria)).catch(() => {});
  avisar();
}
