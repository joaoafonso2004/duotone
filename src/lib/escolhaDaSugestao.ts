/**
 * Que sugestão o Smart Shuffle mete na fila, e quando não mete nenhuma.
 *
 * A descoberta já ordenava as candidatas pela posição no Deezer e pelo gosto,
 * mas a pontuação perdia-se pelo caminho: o leitor recebia faixas soltas e
 * metia a primeira que servisse, fosse qual fosse (auditoria de 16/9, ponto 6).
 * Agora cada candidata traz a sua proveniência até aqui.
 *
 * Sem imports de runtime: `scripts/test-escolha-da-sugestao.ts` corre em Node
 * puro.
 */

export type Proveniencia = {
  /** A âncora que a trouxe, pela chave (`chaveDeArtista`). */
  ancora: string;
  /** A faixa é do próprio artista âncora. */
  propria: boolean;
  /** Posição na lista do Deezer para essa âncora: 0 é a própria. */
  posicaoNoCatalogo: number;
  /** Catálogo + gosto, 0 a 2 (`pontuarPorGosto`). */
  pontos: number;
  /** 0 é a faixa mais ouvida do artista no Deezer, 1 a segunda, etc. */
  ronda: number;
};

/**
 * O mínimo para entrar na fila sozinha: o próprio artista âncora ou um dos
 * dez primeiros semelhantes do Deezer. Mais abaixo, o catálogo já está a
 * adivinhar, e ninguém está lá para corrigir a escolha. Decisão do João a 16/9.
 */
export const POSICAO_MAXIMA_NO_CATALOGO = 10;

export function confiante(p: Proveniencia | undefined): p is Proveniencia {
  return !!p && (p.propria || p.posicaoNoCatalogo <= POSICAO_MAXIMA_NO_CATALOGO);
}

/** Em intervalos, para a analítica: sem conteúdo nenhum da pessoa. */
export function intervaloDosPontos(pontos: number): 'baixo' | 'medio' | 'alto' {
  if (pontos >= 1.5) return 'alto';
  if (pontos >= 1) return 'medio';
  return 'baixo';
}

/**
 * As candidatas pela ordem em que devem entrar, só as de confiança.
 *
 * - **Primeiro a âncora da música que está a tocar**, depois as das ouvidas
 *   antes, pela ordem de `ancorasDoContexto`. As outras vêm a seguir, pela
 *   ordem em que apareceram.
 * - **As âncoras alternam**, como na descoberta: senão as três primeiras
 *   sugestões voltavam a ser todas do mesmo lado.
 * - **Dentro de uma âncora, uma faixa por artista antes da segunda**, e em
 *   cada ronda o artista com mais pontos primeiro. Por pontos puros, o melhor
 *   artista dava as cinco sugestões seguintes.
 *
 * Sem nenhuma de confiança devolve vazio, e o leitor não mete nada.
 */
export function ordenarParaInserir<T>(
  candidatas: readonly T[],
  proveniencia: (t: T) => Proveniencia | undefined,
  ancorasDoContexto: readonly string[] = [],
): T[] {
  const grupos = new Map<string, { t: T; p: Proveniencia; i: number }[]>();
  candidatas.forEach((t, i) => {
    const p = proveniencia(t);
    if (!confiante(p)) return;
    const grupo = grupos.get(p.ancora);
    if (grupo) grupo.push({ t, p, i }); else grupos.set(p.ancora, [{ t, p, i }]);
  });

  const lugar = (ancora: string) => {
    const i = ancorasDoContexto.indexOf(ancora);
    return i < 0 ? ancorasDoContexto.length : i;
  };
  const ordemDosGrupos = [...grupos.keys()]
    .map((ancora, i) => ({ ancora, i }))
    .sort((a, b) => lugar(a.ancora) - lugar(b.ancora) || a.i - b.i)
    .map((g) => grupos.get(g.ancora)!
      .sort((a, b) => a.p.ronda - b.p.ronda || b.p.pontos - a.p.pontos || a.i - b.i));

  const saida: T[] = [];
  for (let r = 0; ; r++) {
    let houve = false;
    for (const grupo of ordemDosGrupos) {
      if (r < grupo.length) { saida.push(grupo[r].t); houve = true; }
    }
    if (!houve) break;
  }
  return saida;
}
