/**
 * O aviso do que se tirou ou apagou, com "Undo" (3/10, variante A de
 * `docs/fluidez-avisos-titulo.html`).
 *
 * Só para remoções -- decisão do João: criar uma playlist ou pôr na fila não
 * mostra nada. Substitui o par "Tens a certeza?" + "Removed / OK" por uma
 * remoção imediata que se pode desfazer. As confirmações que ficam são as que
 * não têm volta (apagar uma playlist, limpar a cache), e aí o aviso só informa.
 *
 * Um aviso de cada vez: um novo substitui o anterior, e o anterior conta como
 * acabado (corre o `aoAcabar`). O `aoAcabar` existe para o que fica ADIADO até
 * o aviso sair -- apagar o ficheiro de um download --, para desfazer não
 * precisar de rede.
 *
 * Sem imports: `scripts/test-aviso-de-remocao.ts`.
 */

export type AvisoDeRemocao = {
  id: number;
  texto: string;
  detalhe?: string;
  /** Repõe o que saiu. Sem isto, o aviso só informa (e dura menos). */
  desfazer?: () => unknown;
  /** O aviso saiu sem "Undo": faz o que ficou adiado. */
  aoAcabar?: () => void;
};

export const DURACAO_COM_DESFAZER_MS = 5000;
export const DURACAO_SEM_DESFAZER_MS = 3000;

export function duracaoDoAviso(a: Pick<AvisoDeRemocao, 'desfazer'>): number {
  return a.desfazer ? DURACAO_COM_DESFAZER_MS : DURACAO_SEM_DESFAZER_MS;
}

type Relogio = {
  marcar: (fn: () => void, ms: number) => unknown;
  desmarcar: (id: unknown) => void;
};

const relogioReal: Relogio = {
  marcar: (fn, ms) => setTimeout(fn, ms),
  desmarcar: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export function criarAvisos(relogio: Relogio = relogioReal) {
  let atual: AvisoDeRemocao | null = null;
  let temporizador: unknown = null;
  let proximo = 0;
  const ouvintes = new Set<() => void>();
  const avisar = () => { for (const f of [...ouvintes]) f(); };

  /** Tira o atual sem avisar ninguém; devolve-o. */
  const largar = (): AvisoDeRemocao | null => {
    const a = atual;
    atual = null;
    if (temporizador !== null) { relogio.desmarcar(temporizador); temporizador = null; }
    return a;
  };
  const acabar = (a: AvisoDeRemocao | null) => {
    try { a?.aoAcabar?.(); } catch { /* o aviso não parte quem o mostrou */ }
  };

  function fechar(id: number): void {
    if (!atual || atual.id !== id) return;
    acabar(largar());
    avisar();
  }

  function mostrar(novo: Omit<AvisoDeRemocao, 'id'>): number {
    // O anterior acabou: o que ele adiou faz-se agora.
    acabar(largar());
    const aviso = { ...novo, id: ++proximo };
    atual = aviso;
    temporizador = relogio.marcar(() => fechar(aviso.id), duracaoDoAviso(aviso));
    avisar();
    return aviso.id;
  }

  /** "Undo": repõe e tira o aviso. O `aoAcabar` NÃO corre. */
  async function desfazer(id: number): Promise<boolean> {
    if (!atual || atual.id !== id || !atual.desfazer) return false;
    const a = largar()!;
    avisar();
    await a.desfazer!();
    return true;
  }

  return {
    mostrar,
    fechar,
    desfazer,
    atual: (): AvisoDeRemocao | null => atual,
    ouvir(f: () => void): () => void {
      ouvintes.add(f);
      return () => { ouvintes.delete(f); };
    },
  };
}

/** O da app. */
export const avisos = criarAvisos();

export function avisarRemocao(aviso: Omit<AvisoDeRemocao, 'id'>): number {
  return avisos.mostrar(aviso);
}

/** "1 song" / "3 songs". */
export function contarMusicas(n: number): string {
  return n === 1 ? '1 song' : `${n} songs`;
}
