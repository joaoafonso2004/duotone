import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FaixaResolvida } from '../api/catalogo';

/**
 * O `track_catalog` guardado no aparelho (11/11).
 *
 * A tabela partilhada nunca muda uma linha ("a primeira fica"), e a app voltava
 * a perguntar-lhe a biblioteca inteira a cada arranque, aos lotes de 150. Com a
 * app pública eram ~270 linhas de log por hora. Agora o que já se sabe fica
 * aqui para sempre, e o que a tabela não tinha só se volta a perguntar ao fim
 * de uma semana (outra pessoa pode tê-lo resolvido entretanto).
 *
 * Best-effort: um disco que falha só faz a app perguntar à tabela, como antes.
 */
const CHAVE = 'duotone:track-catalog:v1';
const MAXIMO = 4000;
const MAX_CARACTERES = 900_000;
export const FALTA_VALE_MS = 7 * 86_400_000;

type Entrada = { f: FaixaResolvida } | { falta: number };
const entradas = new Map<string, Entrada>();
let carregamento: Promise<void> | null = null;
let escrita: ReturnType<typeof setTimeout> | undefined;

function carregar(): Promise<void> {
  return carregamento ??= (async () => {
    try {
      const raw = await AsyncStorage.getItem(CHAVE);
      if (!raw || raw.length > MAX_CARACTERES * 2) return;
      const dados: unknown = JSON.parse(raw);
      if (!Array.isArray(dados)) return;
      for (const item of dados) {
        if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string') continue;
        const e = item[1];
        if (e && typeof e === 'object' && ('f' in e || Number.isFinite((e as any).falta))) entradas.set(item[0], e as Entrada);
      }
    } catch { /* uma cache inválida só faz perguntar à tabela */ }
  })();
}

function agendarEscrita(): void {
  while (entradas.size > MAXIMO) entradas.delete(entradas.keys().next().value as string);
  if (escrita) return;
  escrita = setTimeout(() => {
    escrita = undefined;
    try {
      let texto = JSON.stringify([...entradas]);
      // Uma biblioteca enorme não enche o armazenamento: saem as mais antigas.
      while (texto.length > MAX_CARACTERES && entradas.size > 0) {
        for (let i = 0; i < 200 && entradas.size > 0; i++) entradas.delete(entradas.keys().next().value as string);
        texto = JSON.stringify([...entradas]);
      }
      void AsyncStorage.setItem(CHAVE, texto).catch(() => {});
    } catch { /* best-effort */ }
  }, 2_000);
}

/** O que o aparelho já sabe destas chaves, e as que ainda é preciso perguntar. */
export async function lerDoAparelho(chaves: readonly string[], agora = Date.now()): Promise<{
  sabidas: Map<string, FaixaResolvida>; porPerguntar: string[];
}> {
  await carregar();
  const sabidas = new Map<string, FaixaResolvida>();
  const porPerguntar: string[] = [];
  for (const k of chaves) {
    const e = entradas.get(k);
    if (e && 'f' in e) sabidas.set(k, e.f);
    else if (e && agora - e.falta < FALTA_VALE_MS) continue;
    else porPerguntar.push(k);
  }
  return { sabidas, porPerguntar };
}

/** Guarda a resposta da tabela: as que vieram, e as perguntadas que não vieram. */
export async function guardarRespostaNoAparelho(
  sabidas: ReadonlyMap<string, FaixaResolvida>, perguntadas: readonly string[], agora = Date.now(),
): Promise<void> {
  await carregar();
  for (const [k, f] of sabidas) entradas.set(k, { f });
  for (const k of perguntadas) if (!sabidas.has(k)) entradas.set(k, { falta: agora });
  agendarEscrita();
}

/** Uma faixa resolvida aqui (pelo Deezer): fica sabida, sem perguntar à tabela. */
export async function lembrarNoAparelho(chave: string, faixa: FaixaResolvida): Promise<void> {
  await carregar();
  entradas.set(chave, { f: faixa });
  agendarEscrita();
}

/** Só para os testes. */
export function esquecerCatalogoNoAparelho(): void {
  entradas.clear();
  carregamento = null;
  if (escrita) { clearTimeout(escrita); escrita = undefined; }
}
