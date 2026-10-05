import AsyncStorage from '@react-native-async-storage/async-storage';

// Só metadados públicos do Deezer. Preferências, filas e dados da conta
// continuam a ser lidos no servidor; esta cache nunca os aceita.
const CHAVE = 'duotone:deezer-cache:v1';
const MAXIMO = 3000;
const MAX_CARACTERES = 600_000;
type Entrada = { payload: unknown; em: number };
const entradas = new Map<string, Entrada>();
const respostas = new Set<string>();
let tamanho = 0;
const tamanhos = new Map<string, number>();
let carregamento: Promise<void> | null = null;
let escrita: ReturnType<typeof setTimeout> | undefined;

function colocar(key: string, entrada: Entrada): void {
  const caracteres = JSON.stringify([key, entrada]).length;
  if (caracteres > MAX_CARACTERES) return;
  tamanho -= tamanhos.get(key) ?? 0;
  entradas.delete(key); tamanhos.delete(key);
  entradas.set(key, entrada); tamanhos.set(key, caracteres); tamanho += caracteres;
  // Os resultados compactos dos pares valem mais do que uma resposta grande:
  // expulsá-los durante a mesma biblioteca reabria o ciclo no próximo arranque.
  if (!key.startsWith('deezer:par-confirmado:')) { respostas.delete(key); respostas.add(key); }
  while (entradas.size > MAXIMO || tamanho > MAX_CARACTERES) {
    const primeira = respostas.values().next().value ?? entradas.keys().next().value!;
    tamanho -= tamanhos.get(primeira) ?? 0;
    entradas.delete(primeira); tamanhos.delete(primeira); respostas.delete(primeira);
  }
}

function carregar(): Promise<void> {
  return carregamento ??= (async () => {
    try {
      const raw = await AsyncStorage.getItem(CHAVE);
      if (!raw || raw.length > MAX_CARACTERES + MAXIMO * 2 + 2) return;
      const dados: unknown = JSON.parse(raw);
      if (!Array.isArray(dados)) return;
      for (const item of dados) {
        if (!Array.isArray(item) || item.length !== 2) continue;
        const [key, e] = item;
        if (typeof key !== 'string' || !key.startsWith('deezer:') || !e ||
          !Number.isFinite(e.em) || e.em > Date.now() || Date.now() - e.em > 30 * 86400_000) continue;
        colocar(key, e);
      }
    } catch { /* Uma cache inválida não impede o pedido normal. */ }
  })();
}

export async function lerCacheExternaLocal(key: string, maxAgeMs: number): Promise<Entrada | null> {
  if (!key.startsWith('deezer:')) return null;
  await carregar();
  const e = entradas.get(key);
  return e && Date.now() - e.em <= maxAgeMs ? e : null;
}

export async function guardarCacheExternaLocal(key: string, entrada: Entrada): Promise<void> {
  if (!key.startsWith('deezer:')) return;
  await carregar();
  try { colocar(key, entrada); } catch { return; }
  // Uma escrita por lote, fora da resposta que desbloqueia o ecrã. Depois
  // do primeiro carregamento os acertos da cache não escrevem nem fazem rede.
  if (escrita) return;
  escrita = setTimeout(() => {
    escrita = undefined;
    try { void AsyncStorage.setItem(CHAVE, JSON.stringify([...entradas])).catch(() => {}); } catch { /* best-effort */ }
  }, 1500);
}
