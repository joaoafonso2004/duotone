/**
 * As versões "clean" (censuradas) fora dos resultados (9/11).
 *
 * O YouTube tem muitas vezes as DUAS no mesmo canal -- a explícita e a clean --
 * com o mesmo título e a mesma duração, e a pesquisa normal não as distingue.
 * O YouTube Music marca a explícita (`lib/cancoesDoYtMusic.ts`).
 *
 * A regra, para não estragar a pesquisa: NUNCA se esconde uma música por não
 * ser explícita. Só se troca quando há um PAR provado -- duas canções com o
 * mesmo título, o mesmo artista e a mesma duração, uma marcada e a outra não.
 * A que não tem a marca é a clean, e fica a explícita no lugar dela. Uma
 * música sem par fica como está.
 *
 * E para não gastar pedidos (o João: "aceito se não for feito sempre que se
 * pesquisa algo"): só se pergunta ao YouTube Music quando os resultados da
 * pesquisa normal trazem duas iguais (`gruposDeGemeas`), uma vez por par, e a
 * resposta fica lembrada no aparelho (`state/versoesClean.ts`).
 *
 * Puro e sem imports de runtime: `scripts/test-versoes-clean.ts`.
 */

/** Um resultado da pesquisa normal: o que chega para ver se há duas iguais. */
export type Candidato = { id: string; titulo: string; canal: string; duracaoSec: number | null };

/** Uma canção do YouTube Music, com a marca (`CancaoDoYtMusic`, sem o álbum). */
export type CancaoMarcada = { videoId: string; titulo: string; artista: string; duracaoSec: number | null; explicita: boolean };

/** Duas durações "iguais": a clean corta um palavrão, não muda o tamanho. */
const FOLGA_SEG = 2;

/** Sem acentos, maiúsculas, pontuação nem espaços a mais. */
export function normalizar(s: string): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

/** "Drake - Topic" é o canal que a editora gera para o Drake. */
export const semTopic = (canal: string) => String(canal ?? '').replace(/\s+-\s+Topic$/i, '').trim();

const mesmaDuracao = (a: number | null, b: number | null) =>
  a != null && b != null && Math.abs(a - b) <= FOLGA_SEG;

/**
 * Os grupos de resultados que podem ser a explícita e a clean: o mesmo título,
 * o mesmo canal e a mesma duração, pela ordem em que aparecem. Sem duração não
 * há grupo -- é ela que separa a clean de um "ao vivo" com o mesmo nome.
 */
export function gruposDeGemeas(resultados: readonly Candidato[]): Candidato[][] {
  const grupos: Candidato[][] = [];
  const porChave = new Map<string, Candidato[][]>();
  const vistos = new Set<string>();
  for (const r of resultados) {
    if (!r.id || vistos.has(r.id) || r.duracaoSec == null) continue;
    vistos.add(r.id);
    const titulo = normalizar(r.titulo), canal = normalizar(semTopic(r.canal));
    if (!titulo || !canal) continue;
    const chave = `${canal}|${titulo}`;
    const candidatos = porChave.get(chave) ?? [];
    const grupo = candidatos.find((g) => mesmaDuracao(g[0]!.duracaoSec, r.duracaoSec));
    if (grupo) grupo.push(r);
    else {
      const novo = [r];
      candidatos.push(novo);
      porChave.set(chave, candidatos);
      grupos.push(novo);
    }
  }
  return grupos.filter((g) => g.length >= 2);
}

/** A mesma chave para o mesmo par, venha pela ordem que vier. */
export const chaveDoGrupo = (grupo: readonly Candidato[]) => grupo.map((c) => c.id).sort().join('+');

/** O que se pergunta ao YouTube Music sobre o grupo: "Drake Laugh Now Cry Later". */
export function perguntaDoGrupo(grupo: readonly Candidato[]): string {
  const c = grupo[0];
  return c ? `${semTopic(c.canal)} ${c.titulo}`.trim() : '';
}

/**
 * Os pares provados numa resposta do YouTube Music: `clean -> explícita`.
 * Par = o mesmo título, o mesmo artista e a mesma duração, uma marcada e a
 * outra não. Sem a explícita ao lado, uma canção sem marca é só uma canção.
 */
export function paresDoYtMusic(cancoes: readonly CancaoMarcada[]): Record<string, string> {
  const trocas: Record<string, string> = {};
  const igual = (a: CancaoMarcada, b: CancaoMarcada) =>
    normalizar(a.titulo) === normalizar(b.titulo) && normalizar(a.artista) === normalizar(b.artista)
    && mesmaDuracao(a.duracaoSec, b.duracaoSec);
  for (const limpa of cancoes) {
    if (limpa.explicita || !limpa.videoId) continue;
    const explicita = cancoes.find((c) => c.explicita && c.videoId && c.videoId !== limpa.videoId && igual(c, limpa));
    if (explicita) trocas[limpa.videoId] = explicita.videoId;
  }
  return trocas;
}

/**
 * A lista com as clean conhecidas trocadas pela explícita, no mesmo lugar. Se
 * a explícita já lá está, a clean sai e mais nada (não fica repetida).
 */
export function aplicarTrocas<T>(
  faixas: readonly T[],
  trocas: Readonly<Record<string, string>>,
  idDe: (f: T) => string,
  comId: (f: T, id: string) => T,
): T[] {
  if (!faixas.some((f) => trocas[idDe(f)])) return faixas as T[];
  const presentes = new Set(faixas.map(idDe));
  const fora: T[] = [];
  const postas = new Set<string>();
  for (const f of faixas) {
    const id = idDe(f);
    const explicita = trocas[id];
    if (!explicita) { if (!postas.has(id)) { postas.add(id); fora.push(f); } continue; }
    // A explícita está na lista (antes ou depois): fica só ela, no lugar dela.
    if (presentes.has(explicita) || postas.has(explicita)) continue;
    postas.add(explicita);
    fora.push(comId(f, explicita));
  }
  return fora;
}

/** Junta trocas novas às lembradas, com teto: passando dele ficam as mais recentes. */
export function juntarTrocas(antes: Readonly<Record<string, string>>, novas: Readonly<Record<string, string>>, teto: number): Record<string, string> {
  const todas = { ...antes };
  for (const [limpa, explicita] of Object.entries(novas)) { delete todas[limpa]; todas[limpa] = explicita; }
  const chaves = Object.keys(todas);
  for (const k of chaves.slice(0, Math.max(0, chaves.length - teto))) delete todas[k];
  return todas;
}
