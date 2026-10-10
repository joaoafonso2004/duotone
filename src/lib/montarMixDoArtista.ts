/**
 * O Mix de um artista (10/10): mais dele, e não sempre igual.
 *
 * O "Mix" do YouTube Music (`RDEM...`, o botão do cabeçalho do canal) começa
 * SEMPRE pelo mesmo vídeo (o do botão: para a Sia, a "Waterfall" do Stargate,
 * que nem é dela) e só um quinto das 50 é do artista -- o resto são parecidos.
 * Medido a 10/10: Sia 10-11 em 50, Plutónio 14 em 50. "Clico em Mix, toca
 * sempre a mesma música dela e a fila já não é da Sia" (João).
 *
 * Agora: as músicas DELE (a lista "todas" do canal, e as dele que vierem no
 * rádio) baralhadas, a começar por uma das primeiras da lista (um êxito, mas
 * não sempre o mesmo), e uma parecida do rádio a cada duas dele, pela ordem do
 * rádio (que já vem ordenado por parecença). Quando uma das listas acaba, a
 * outra continua.
 *
 * Puro, sem imports: `scripts/test-mix-do-artista.ts`.
 */

/** Duas dele, uma parecida. */
export const DELE_POR_PARECIDA = 2;
/** O começo sai de entre as primeiras da lista do canal (as mais ouvidas). */
export const ESCOLHER_O_COMECO_ENTRE = 5;
export const TAMANHO_DO_MIX = 50;

export function montarMixDoArtista<T>(
  doCanal: readonly T[],
  doRadio: readonly T[],
  eDele: (t: T) => boolean,
  identidade: (t: T) => readonly string[],
  sorteio: () => number,
  total = TAMANHO_DO_MIX,
): T[] {
  const vistas = new Set<string>();
  const nova = (t: T) => {
    const chaves = identidade(t);
    if (!chaves.length || chaves.some((k) => vistas.has(k))) return false;
    chaves.forEach((k) => vistas.add(k));
    return true;
  };
  const indice = (n: number) => Math.min(n - 1, Math.floor(sorteio() * n));

  // As dele: primeiro as do canal, depois as que o rádio trouxe a mais.
  const dele = [...doCanal, ...doRadio.filter(eDele)].filter(nova);
  // O começo: uma das primeiras do canal (as mais ouvidas), à sorte.
  const deEntre = Math.min(ESCOLHER_O_COMECO_ENTRE, doCanal.length ? Math.min(doCanal.length, dele.length) : dele.length);
  const comeco = deEntre > 0 ? dele.splice(indice(deEntre), 1) : [];
  // O resto baralhado (Fisher-Yates).
  for (let i = dele.length - 1; i > 0; i--) {
    const j = indice(i + 1);
    [dele[i], dele[j]] = [dele[j], dele[i]];
  }
  const delas = [...comeco, ...dele];
  const parecidas = doRadio.filter((t) => !eDele(t)).filter(nova);

  const fora: T[] = [];
  let a = 0, b = 0;
  while (fora.length < total && (a < delas.length || b < parecidas.length)) {
    for (let k = 0; k < DELE_POR_PARECIDA && a < delas.length && fora.length < total; k++) fora.push(delas[a++]);
    if (b < parecidas.length && fora.length < total) fora.push(parecidas[b++]);
    // Sem mais dele, as parecidas seguem sozinhas (e vice-versa, pelo ciclo).
    if (a >= delas.length) while (b < parecidas.length && fora.length < total) fora.push(parecidas[b++]);
  }
  return fora;
}
