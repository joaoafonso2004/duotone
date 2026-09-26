/**
 * A Daily mix: uma playlist que se refaz sozinha todos os dias, à mão de semear.
 *
 * Nasceu da forma como um amigo do João ouve música -- "só ouço uma playlist
 * que o Spotify atualiza conforme o que vamos ouvindo" (13/9) -- e das
 * playlists que o Spotify gera estarem fechadas a apps novas. A app faz a sua:
 * o `flowDoDia` (as mais ouvidas intercaladas com descobertas, já a partir do
 * gosto do Spotify quando foi lido), a MESMA durante o dia inteiro e igual no
 * iPhone e no PC, porque vive na cache da conta.
 *
 * - **O dia é o de UTC**, como a semana do "Discover new": o que importa é mudar
 *   uma vez por dia, não à meia-noite de ninguém em particular.
 * - **As primeiras `GUARDAR_EM_WIFI` ficam descarregadas em segundo plano**, só
 *   em Wi-Fi: carregar no play da mix começa logo, sem esperar pelo download --
 *   a outra metade da mesma queixa. Em dados móveis não se gasta nada por conta.
 *
 * Sem imports de runtime: testado em Node puro (scripts/test-mistura-do-dia.ts).
 */

export const MUSICAS_DA_MISTURA = 30;
export const GUARDAR_EM_WIFI = 12;

export function diaDe(agora: number = Date.now()): number {
  return Math.floor(agora / 86_400_000);
}

/** A mistura guardada, se for DESTE dia e tiver alguma coisa. */
export function misturaGuardada<T>(valor: unknown, dia: number): T[] | null {
  if (!valor || typeof valor !== 'object') return null;
  const v = valor as { dia?: unknown; faixas?: unknown };
  return v.dia === dia && Array.isArray(v.faixas) && v.faixas.length > 0 ? (v.faixas as T[]) : null;
}

/**
 * Quais descarregar agora: das primeiras da lista (as que tocam primeiro), as do
 * YouTube que ainda não estão em disco. Nada sem rede nem em dados móveis.
 */
export function faixasParaGuardar<T extends { source: string; sourceId: string }>(
  faixas: readonly T[],
  jaGuardada: (sourceId: string) => boolean,
  rede: { offline: boolean; dadosMoveis: boolean },
  maximo: number = GUARDAR_EM_WIFI,
): T[] {
  if (rede.offline || rede.dadosMoveis) return [];
  const vistas = new Set<string>();
  const saida: T[] = [];
  for (const faixa of faixas.slice(0, maximo)) {
    if (faixa.source !== 'youtube' || !faixa.sourceId || vistas.has(faixa.sourceId)) continue;
    vistas.add(faixa.sourceId);
    if (jaGuardada(faixa.sourceId)) continue;
    saida.push(faixa);
  }
  return saida;
}

// ---------------------------------------------------------------------------
// De onde vêm as músicas (26/9)
//
// Pedido do João: "músicas do género das que o user mais ouviu, em vez de ser
// só as que ele já tem favoritadas -- se no dia anterior ouviu mais um tipo de
// música, metes mais desse género, mas não tudo". Era 70% Heavy Rotation (as
// favoritas de sempre) e 30% descobertas do perfil geral: a mix quase não
// mudava de um dia para o outro e trazia pouco de novo.
//
// O YouTube não dá géneros. O "género" aqui é a VIZINHANÇA de um artista no
// catálogo (os semelhantes do Deezer, os mesmos do Smart Shuffle): dar mais
// lugares a um artista âncora é dar mais lugares ao género dele.
//
// - **Quem manda são as escutas recentes**, pela idade: hoje e ontem valem 3,
//   até três dias 1,5, até uma semana 1. O perfil de sempre entra com 30%, para
//   um dia de uma coisa só não apagar o resto.
// - **"Mas não tudo"**: os pesos passam pela raiz (achatam as diferenças) e
//   nenhuma âncora leva mais de `TETO_DE_UMA_ANCORA` da mix. Cada âncora leva
//   pelo menos um lugar.
// - **60% novas, 40% conhecidas**, e as conhecidas são do mesmo lado do gosto
//   (as que ouviu destes artistas), não as favoritas de sempre.
// - Abre com uma conhecida: arrancar com uma que não se conhece dá a ideia de
//   que a lista está errada (a mesma regra do Smart Shuffle).
// ---------------------------------------------------------------------------

export const ANCORAS_DO_DIA = 5;
export const TETO_DE_UMA_ANCORA = 0.4;
export const FRACAO_DE_NOVAS = 0.6;
/** Quanto o perfil de sempre pesa ao lado das escutas da última semana. */
export const PESO_DO_PERFIL = 0.3;

export type EscutaRecente = { chave: string; nome: string; em: number };
export type ArtistaDoPerfil = { chave: string; nome: string; escutas: number };
export type AncoraDoDia = { chave: string; nome: string; peso: number };

const HORA = 3_600_000;

/** Quanto vale uma escuta, pela idade. Mais de uma semana não conta. */
export function pesoDaIdade(idadeMs: number): number {
  const h = idadeMs / HORA;
  if (h <= 36) return 3;
  if (h <= 72) return 1.5;
  if (h <= 168) return 1;
  return 0;
}

function normalizar(m: Map<string, number>): Map<string, number> {
  const soma = [...m.values()].reduce((s, v) => s + v, 0);
  const saida = new Map<string, number>();
  if (soma <= 0) return saida;
  for (const [k, v] of m) saida.set(k, v / soma);
  return saida;
}

/**
 * Os artistas de que a mix de hoje parte, com a fatia de cada um (somam 1).
 * Vazio quando não há escutas nem perfil -- quem chama cai no flow antigo.
 */
export function ancorasDoDia(
  recentes: readonly EscutaRecente[],
  perfil: readonly ArtistaDoPerfil[],
  agora: number,
  quantas: number = ANCORAS_DO_DIA,
): AncoraDoDia[] {
  const nomes = new Map<string, string>();
  const doRecente = new Map<string, number>();
  for (const e of recentes) {
    if (!e.chave) continue;
    const p = pesoDaIdade(agora - e.em);
    if (p <= 0) continue;
    doRecente.set(e.chave, (doRecente.get(e.chave) ?? 0) + p);
    if (!nomes.has(e.chave)) nomes.set(e.chave, e.nome);
  }
  const doPerfil = new Map<string, number>();
  for (const a of perfil) {
    if (!a.chave || !(a.escutas > 0)) continue;
    doPerfil.set(a.chave, Math.sqrt(a.escutas));
    if (!nomes.has(a.chave)) nomes.set(a.chave, a.nome);
  }
  const r = normalizar(doRecente);
  const p = normalizar(doPerfil);
  const pesoPerfil = r.size === 0 ? 1 : p.size === 0 ? 0 : PESO_DO_PERFIL;
  const juntos = new Map<string, number>();
  for (const [k, v] of r) juntos.set(k, v * (1 - pesoPerfil));
  for (const [k, v] of p) juntos.set(k, (juntos.get(k) ?? 0) + v * pesoPerfil);

  const escolhidas = [...juntos]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, quantas);
  if (escolhidas.length === 0) return [];
  // A raiz achata: o que se ouviu o dobro leva mais, mas não o dobro.
  const fatias = tetoNasFatias(escolhidas.map(([, v]) => Math.sqrt(v)), TETO_DE_UMA_ANCORA);
  return escolhidas.map(([chave], i) => ({ chave, nome: nomes.get(chave) ?? chave, peso: fatias[i] }));
}

/**
 * Normaliza para somar 1 sem nenhuma fatia passar do teto: o que sobra de quem
 * passa vai para os outros, na proporção deles. Com poucas âncoras o teto não
 * se consegue cumprir (duas não cabem em 40% cada) e fica por igual.
 */
export function tetoNasFatias(pesos: readonly number[], teto: number): number[] {
  const n = pesos.length;
  if (n === 0) return [];
  if (n * teto <= 1) return pesos.map(() => 1 / n);
  let fatias = normalizarLista(pesos);
  for (let volta = 0; volta < n; volta++) {
    const acima = fatias.map((f) => f > teto + 1e-9);
    if (!acima.some(Boolean)) break;
    const excesso = fatias.reduce((s, f, i) => s + (acima[i] ? f - teto : 0), 0);
    const livres = fatias.reduce((s, f, i) => s + (acima[i] ? 0 : f), 0);
    fatias = fatias.map((f, i) => (acima[i] ? teto : f + (livres > 0 ? (f / livres) * excesso : 0)));
  }
  return fatias;
}

function normalizarLista(v: readonly number[]): number[] {
  const soma = v.reduce((s, x) => s + Math.max(0, x), 0);
  return soma > 0 ? v.map((x) => Math.max(0, x) / soma) : v.map(() => 1 / v.length);
}

/** Lugares por âncora: pelo maior resto, com pelo menos um para cada. */
export function lugaresPorAncora(pesos: readonly number[], total: number): number[] {
  const n = pesos.length;
  if (n === 0 || total <= 0) return new Array(n).fill(0);
  const exatos = normalizarLista(pesos).map((f) => f * total);
  const saida = exatos.map((e) => Math.max(1, Math.floor(e)));
  let conta = saida.reduce((s, v) => s + v, 0);
  const restos = exatos.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r);
  for (let k = 0; conta < total; k++, conta++) saida[restos[k % n].i] += 1;
  // O mínimo de um pode passar do total: tira-se a quem tem mais.
  while (conta > total) {
    const i = saida.indexOf(Math.max(...saida));
    if (saida[i] <= 1) break;
    saida[i] -= 1;
    conta -= 1;
  }
  return saida;
}

/**
 * Monta a mix: por âncora, `fracaoDeNovas` novas e o resto conhecidas; o que
 * faltar de um lado é tapado pelo outro da mesma âncora e depois pelas outras.
 * Intercaladas por âncora (nunca duas seguidas do mesmo lado quando há
 * alternativa) e a abrir com uma conhecida.
 */
export function comporMistura<T>(
  ancoras: readonly AncoraDoDia[],
  novas: ReadonlyMap<string, readonly T[]>,
  conhecidas: ReadonlyMap<string, readonly T[]>,
  total: number,
  chaveDaFaixa: (t: T) => string,
  fracaoDeNovas: number = FRACAO_DE_NOVAS,
): T[] {
  const usadas = new Set<string>();
  const tirar = (lista: readonly T[] | undefined, pos: { i: number }): T | null => {
    while (lista && pos.i < lista.length) {
      const t = lista[pos.i++];
      const k = chaveDaFaixa(t);
      if (!usadas.has(k)) { usadas.add(k); return t; }
    }
    return null;
  };
  const lugares = lugaresPorAncora(ancoras.map((a) => a.peso), total);
  const posNovas = ancoras.map(() => ({ i: 0 }));
  const posConhecidas = ancoras.map(() => ({ i: 0 }));
  const daAncora = (j: number, nova: boolean) => nova
    ? tirar(novas.get(ancoras[j].chave), posNovas[j])
    : tirar(conhecidas.get(ancoras[j].chave), posConhecidas[j]);

  // O que cada âncora dá. A proporção vale dentro de cada uma, e não só no
  // total: o lado de que se ouviu mais também traz novidades desse lado.
  const filas: { t: T; nova: boolean }[][] = ancoras.map((_, j) => {
    const alvoNovas = Math.round(lugares[j] * fracaoDeNovas);
    const fila: { t: T; nova: boolean }[] = [];
    let n = 0;
    while (fila.length < lugares[j]) {
      const querNova = n < alvoNovas;
      let faixa = daAncora(j, querNova);
      let nova = querNova;
      if (!faixa) { faixa = daAncora(j, !querNova); nova = !querNova; }
      if (!faixa) break;
      if (nova) n++;
      fila.push({ t: faixa, nova });
    }
    // Dentro da âncora: nova, nova, conhecida... em vez das novas todas juntas.
    const nov = fila.filter((x) => x.nova);
    const con = fila.filter((x) => !x.nova);
    const ordenada: { t: T; nova: boolean }[] = [];
    while (nov.length || con.length) {
      if (con.length && (ordenada.length % 3 === 2 || !nov.length)) ordenada.push(con.shift()!);
      else ordenada.push(nov.shift()!);
    }
    return ordenada;
  });

  // Lugares por encher (uma âncora sem faixas que cheguem): das sobras das
  // outras, pela ordem do peso.
  let emFalta = total - filas.reduce((s, f) => s + f.length, 0);
  while (emFalta > 0) {
    let deu = false;
    for (let j = 0; j < ancoras.length && emFalta > 0; j++) {
      let faixa = daAncora(j, true);
      let nova = true;
      if (!faixa) { faixa = daAncora(j, false); nova = false; }
      if (!faixa) continue;
      filas[j].push({ t: faixa, nova });
      emFalta--;
      deu = true;
    }
    if (!deu) break;
  }

  // Intercalar por crédito (round-robin pesado), sem repetir a âncora anterior
  // quando há outra com faixas.
  const tamanho = filas.map((f) => f.length);
  const soma = tamanho.reduce((s, v) => s + v, 0);
  const credito = filas.map(() => 0);
  const pos = filas.map(() => 0);
  const saida: { t: T; nova: boolean }[] = [];
  let anterior = -1;
  while (saida.length < soma) {
    for (let j = 0; j < filas.length; j++) if (pos[j] < tamanho[j]) credito[j] += tamanho[j];
    const haOutra = (j: number) => filas.some((_, k) => k !== j && pos[k] < tamanho[k]);
    let melhor = -1;
    for (let j = 0; j < filas.length; j++) {
      if (pos[j] >= tamanho[j]) continue;
      if (j === anterior && haOutra(j)) continue;
      if (melhor < 0 || credito[j] > credito[melhor]) melhor = j;
    }
    if (melhor < 0) break;
    credito[melhor] -= soma;
    saida.push(filas[melhor][pos[melhor]++]);
    anterior = melhor;
  }
  const primeiraConhecida = saida.findIndex((x) => !x.nova);
  if (primeiraConhecida > 0) saida.unshift(...saida.splice(primeiraConhecida, 1));
  return saida.slice(0, total).map((x) => x.t);
}
