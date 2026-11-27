import AsyncStorage from '@react-native-async-storage/async-storage';
import { juntarOuvida, MAXIMO_DE_LISTAS } from '../lib/baralhoDoShuffle';

/**
 * O baralho do shuffle no aparelho (27/11, `lib/baralhoDoShuffle.ts`): por lista,
 * as que já tocaram com o shuffle. Vive na memória e vai para o AsyncStorage (é só
 * deste aparelho: nada vai ao Supabase). Lê-se uma vez ao arrancar; até lá, as
 * ordens novas saem todas ao acaso, como antes.
 *
 * Escrever: no máximo uma vez a cada 3 s, com o retrato mais recente (cada música
 * que começa junta uma chave).
 */
const CHAVE = 'duotone:baralho-do-shuffle:v1';
const ESPERA_MS = 3000;

/** Lista → as que já tocaram, pela ordem em que se usaram (a última no fim). */
let baralhos = new Map<string, string[]>();
let lido = false;
let aGuardar: ReturnType<typeof setTimeout> | null = null;

const leitura = AsyncStorage.getItem(CHAVE).then((raw) => {
  if (!raw) return;
  try {
    const valor = JSON.parse(raw);
    if (!valor || typeof valor !== 'object') return;
    const lidos = new Map<string, string[]>();
    for (const [lista, chaves] of Object.entries(valor)) {
      if (Array.isArray(chaves)) lidos.set(lista, chaves.filter((k): k is string => typeof k === 'string'));
    }
    // O que já se juntou nesta abertura, antes de o disco responder, fica por cima.
    for (const [lista, chaves] of baralhos) lidos.set(lista, [...new Set([...(lidos.get(lista) ?? []), ...chaves])]);
    baralhos = lidos;
  } catch { /* um baralho estragado recomeça */ }
}).catch(() => {}).finally(() => { lido = true; });

/** As que já tocaram desta lista (vazio sem lista, ou antes de o disco responder). */
export function ouvidasDaLista(lista: string | null): ReadonlySet<string> {
  if (!lista) return new Set();
  return new Set(baralhos.get(lista) ?? []);
}

/** Uma música começou a tocar com o shuffle, desta lista de `tamanho` músicas. */
export function marcarOuvida(lista: string | null, chave: string, tamanho: number): void {
  if (!lista) return;
  const antes = baralhos.get(lista) ?? [];
  const depois = juntarOuvida(antes, chave, tamanho);
  // A usada por último vai para o fim do mapa; as mais antigas saem acima do limite.
  baralhos.delete(lista);
  baralhos.set(lista, depois);
  while (baralhos.size > MAXIMO_DE_LISTAS) baralhos.delete(baralhos.keys().next().value!);
  guardarDaquiA();
}

function guardarDaquiA(): void {
  if (aGuardar) return;
  aGuardar = setTimeout(() => {
    aGuardar = null;
    void leitura.then(() => AsyncStorage.setItem(CHAVE, JSON.stringify(Object.fromEntries(baralhos)))).catch(() => {});
  }, ESPERA_MS);
}

/** Para os testes: se o disco já respondeu. */
export const baralhoLido = (): boolean => lido;
