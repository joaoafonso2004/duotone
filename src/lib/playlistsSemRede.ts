/**
 * As playlists sem rede, no iPhone (16/10, auditoria 29).
 *
 * Sem rede, as Playlists e cada playlist diziam só "You're offline" -- o
 * `withInternet` desmontava os ecrãs. Agora abrem com a última cópia (a lista
 * das playlists e as faixas de cada uma, em disco) e toca-se o que está no
 * iPhone. Aqui ficam as contas e as frases, sem imports: testado em Node puro
 * (`scripts/test-playlists-sem-rede.ts`).
 */

export type NaCopia = { total: number; aqui: number };

/** Quantas músicas de cada playlist da cópia estão no iPhone. */
export function naCopiaSemRede<T>(
  porPlaylist: ReadonlyMap<string, readonly T[]>,
  tocaSemRede: (faixa: T) => boolean,
): Map<string, NaCopia> {
  const saida = new Map<string, NaCopia>();
  for (const [id, faixas] of porPlaylist) {
    let aqui = 0;
    for (const f of faixas) if (tocaSemRede(f)) aqui++;
    saida.set(id, { total: faixas.length, aqui });
  }
  return saida;
}

/**
 * A legenda de um cartão sem rede. Uma playlist fora da cópia (a de um amigo,
 * onde se colabora) só se vê com rede.
 */
export function legendaSemRede(c: NaCopia | undefined): string {
  if (!c || c.total === 0) return 'Needs internet';
  if (c.aqui === c.total) return `${c.total} ${c.total === 1 ? 'song' : 'songs'} · all on this iPhone`;
  if (c.aqui === 0) return `${c.total} ${c.total === 1 ? 'song' : 'songs'} · none on this iPhone`;
  return `${c.aqui} of ${c.total} on this iPhone`;
}

/** O que o Play e o Shuffle de uma playlist tocam sem rede: só o que está no iPhone, pela ordem. */
export function tocaveisSemRede<T>(faixas: readonly T[], offline: boolean, tocaSemRede: (faixa: T) => boolean): T[] {
  return offline ? faixas.filter(tocaSemRede) : [...faixas];
}
