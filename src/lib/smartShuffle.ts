/**
 * Shuffle inteligente: de vez em quando entra uma música que não está na fila.
 *
 * A ideia é a do Spotify e veio de um amigo do João: carregas uma vez no
 * shuffle e é o normal; carregas outra vez e passa a intercalar sugestões
 * relacionadas com o que estás a ouvir. Serve para descobrir coisas sem sair
 * da playlist.
 *
 * **O que este ficheiro decide, e o que não decide.** Decide QUANDO entra uma
 * sugestão e SE uma candidata serve. Não vai à rede nem sabe o que é uma
 * recomendação — isso é o `api/radio.ts`, que já existe para o rádio e devolve
 * exatamente o que aqui é preciso. Sem imports de runtime, testável em Node
 * puro (`scripts/test-smart-shuffle.ts`), como o resto da lógica.
 */

export type ModoDeShuffle = 'off' | 'normal' | 'inteligente';

/**
 * Uma sugestão a cada quatro faixas.
 *
 * Nem uma em cada duas — aí deixa de ser a tua playlist — nem uma em cada dez,
 * que não se nota. Quatro é aproximadamente o que o Spotify faz, e é pouco o
 * suficiente para uma sugestão má não estragar a sessão.
 */
export const A_CADA = 4;

/** Uma música sugerida não volta durante este período, mesmo noutro upload. */
export const DIAS_SEM_REPETIR = 30;
export const JANELA_SEM_REPETIR_MS = DIAS_SEM_REPETIR * 24 * 60 * 60 * 1000;
/** Teto local: cobre até uso contínuo durante a janela sem inchar o storage. */
export const LIMITE_DO_HISTORICO = 4000;

export type SugestaoNoHistorico = { em: number; chaves: string[] };

/**
 * Chaves guardadas por sugestão. Eram 3 (o upload e uma identidade); a
 * identidade da música passou a ter variantes -- ver lib/identidadeDaMusica.ts
 * -- e cortar a 3 deitava fora as que apanham outro upload.
 */
export const MAX_CHAVES_POR_SUGESTAO = 12;

/**
 * As duas identidades que interessam: o upload exato e a música.
 *
 * A segunda recebe artista e título já normalizados pelo chamador. É ela que
 * faz `Future - Mask Off (Official Video)` e outro upload de `Mask Off`
 * contarem como a mesma sugestão.
 */
export function chavesDaSugestao(
  upload: string,
  artista: string,
  titulo: string,
): string[] {
  const chaves = upload ? [upload] : [];
  if (artista && titulo) chaves.push(`musica:${artista}|${titulo}`);
  return [...new Set(chaves)];
}

/** Lê apenas entradas válidas e ainda dentro da janela de 30 dias. */
export function lerHistoricoDoSmartShuffle(
  valor: unknown,
  agora: number = Date.now(),
): SugestaoNoHistorico[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((item): item is { em: number; chaves: unknown[] } =>
      !!item && Number.isFinite(item.em) && Array.isArray(item.chaves)
      && item.em >= agora - JANELA_SEM_REPETIR_MS && item.em <= agora + 24 * 60 * 60 * 1000)
    .map((item) => ({
      em: item.em,
      chaves: [...new Set(item.chaves.filter((k): k is string => typeof k === 'string' && !!k))]
        .slice(0, MAX_CHAVES_POR_SUGESTAO),
    }))
    .filter((item) => item.chaves.length > 0)
    .sort((a, b) => b.em - a.em)
    .slice(0, LIMITE_DO_HISTORICO);
}

export function chavesRecentesDoSmartShuffle(
  historico: readonly SugestaoNoHistorico[],
  agora: number = Date.now(),
): Set<string> {
  const recentes = new Set<string>();
  for (const item of lerHistoricoDoSmartShuffle(historico, agora)) {
    for (const chave of item.chaves) recentes.add(chave);
  }
  return recentes;
}

/** Acrescenta as sugestões que entraram e poda as que já podem voltar. */
export function registarNoHistoricoDoSmartShuffle(
  historico: readonly SugestaoNoHistorico[],
  sugestoes: readonly (readonly string[])[],
  agora: number = Date.now(),
): SugestaoNoHistorico[] {
  const novas = sugestoes
    .map((chaves) => ({ em: agora, chaves: [...new Set(chaves.filter(Boolean))].slice(0, MAX_CHAVES_POR_SUGESTAO) }))
    .filter((item) => item.chaves.length > 0);
  return lerHistoricoDoSmartShuffle([...novas, ...historico], agora);
}

/**
 * Junta a memória deste aparelho com a que veio da conta.
 *
 * A mesma entrada (mesmo instante, mesmas chaves) vinda dos dois lados conta
 * uma vez; o resto soma-se. O que vier estragado da conta é deitado fora pelo
 * `lerHistoricoDoSmartShuffle`, como o que vem estragado do armazenamento.
 */
export function juntarHistoricos(
  a: unknown,
  b: unknown,
  agora: number = Date.now(),
): SugestaoNoHistorico[] {
  const vistas = new Set<string>();
  const juntas: SugestaoNoHistorico[] = [];
  for (const item of [...lerHistoricoDoSmartShuffle(a, agora), ...lerHistoricoDoSmartShuffle(b, agora)]) {
    const id = `${item.em}|${item.chaves.join('|')}`;
    if (vistas.has(id)) continue;
    vistas.add(id);
    juntas.push(item);
  }
  return lerHistoricoDoSmartShuffle(juntas, agora);
}

export function foiSugeridaRecentemente(
  chaves: readonly string[],
  recentes: ReadonlySet<string>,
): boolean {
  return chaves.some((chave) => recentes.has(chave));
}

/** O ciclo do botão: off → normal → inteligente → off. */
export function proximoModo(actual: ModoDeShuffle): ModoDeShuffle {
  if (actual === 'off') return 'normal';
  if (actual === 'normal') return 'inteligente';
  return 'off';
}

/** O modo a partir dos dois booleanos que a store guarda. */
export function modoDeShuffle(ligado: boolean, inteligente: boolean): ModoDeShuffle {
  if (!ligado) return 'off';
  return inteligente ? 'inteligente' : 'normal';
}

/**
 * Está na hora de sugerir?
 *
 * `desdeAUltima` conta as faixas normais tocadas desde a última sugestão. A
 * primeira sugestão não sai logo à primeira faixa de propósito: começar uma
 * sessão com uma música que não é tua dá a impressão de que a playlist está
 * errada.
 */
export function deveSugerir(
  modo: ModoDeShuffle,
  desdeAUltima: number,
  aCada: number = A_CADA,
): boolean {
  if (modo !== 'inteligente') return false;
  if (aCada < 1) return false;
  return desdeAUltima >= aCada;
}

/**
 * Onde entra a sugestão: logo a seguir à que está a tocar.
 *
 * Não no fim da fila — a graça é ouvi-la a seguir, não daqui a duas horas. E
 * entra MESMO na fila, para aparecer na lista e se poder saltar ou guardar
 * como qualquer outra.
 */
export function posicaoDaSugestao(tamanhoDaFila: number, indiceActual: number): number {
  if (tamanhoDaFila <= 0) return 0;
  const i = Math.max(0, Math.min(indiceActual, tamanhoDaFila - 1));
  return i + 1;
}

/**
 * A primeira candidata que serve, ou null.
 *
 * Uma sugestão que já está na fila não é sugestão nenhuma — e uma que já foi
 * sugerida antes nesta sessão repetida seria pior do que não sugerir nada.
 */
export function escolherSugestao<T>(
  candidatas: readonly T[],
  chave: (t: T) => string,
  naFila: ReadonlySet<string>,
  jaSugeridas: ReadonlySet<string>,
): T | null {
  for (const c of candidatas) {
    const k = chave(c);
    if (!k) continue;
    if (naFila.has(k) || jaSugeridas.has(k)) continue;
    return c;
  }
  return null;
}

/** O rótulo do botão, para o leitor de ecrã e para o tooltip. */
export function rotuloDoModo(modo: ModoDeShuffle): string {
  if (modo === 'normal') return 'Shuffle';
  if (modo === 'inteligente') return 'Smart shuffle — mixes in new tracks';
  return 'Shuffle off';
}
