/**
 * O porteiro do "o que mudou?" (11/11). Sem imports: `scripts/test-o-que-mudou.ts`.
 *
 * Guarda, por parte da conta, a marca que tinha a última vez que essa parte foi
 * lida com sucesso (`confirmar`). Ao voltar à app, um só pedido traz as marcas
 * de agora; só "mudou" a parte cuja marca é diferente da guardada -- ou que
 * nunca foi confirmada. Uma marca é a hora da última mudança feita por OUTRO
 * aparelho (o servidor já tira as deste).
 *
 * A marca que se confirma é a de ANTES da leitura: uma mudança que chegue a
 * meio dela tem uma marca mais nova, e a próxima verificação relê.
 */

export type ParteDaConta = 'mensagens' | 'amizades' | 'ajustes' | 'presets' | 'prefs';
export type Verificacao = { mudou: boolean; confirmar: () => void };
type Marcas = Record<string, string>;
type Resposta = Marcas | null | 'sem-funcao';

/** Pedidos de partes diferentes no mesmo regresso partilham a resposta. */
export const PARTILHA_MS = 5_000;

const SEMPRE: Verificacao = { mudou: true, confirmar: () => {} };

export function criarPorteiro(deps: {
  pedir: () => Promise<Resposta>;
  conta: () => Promise<string | null>;
  agora: () => number;
}) {
  const vistos = new Map<ParteDaConta, string>();
  let contaVista: string | null = null;
  let semFuncao = false;
  let partilhado: { em: number; conta: string; pedido: Promise<Resposta> } | null = null;

  async function verificar(partes: readonly ParteDaConta[], opcoes?: { fresco?: boolean }): Promise<Verificacao> {
    let conta: string | null = null;
    try { conta = await deps.conta(); } catch { conta = null; }
    if (!conta) return SEMPRE;
    if (conta !== contaVista) { vistos.clear(); contaVista = conta; partilhado = null; semFuncao = false; }
    if (semFuncao) return SEMPRE;
    const agora = deps.agora();
    if (opcoes?.fresco || !partilhado || partilhado.conta !== conta || !(agora - partilhado.em < PARTILHA_MS) || agora < partilhado.em) {
      partilhado = { em: agora, conta, pedido: deps.pedir().catch(() => null) };
    }
    const resposta = await partilhado.pedido;
    if (resposta === 'sem-funcao') { semFuncao = true; return SEMPRE; }
    if (!resposta) return SEMPRE;
    const marcaDe = (p: ParteDaConta) => (typeof resposta[p] === 'string' ? resposta[p] : '');
    const mudou = partes.some((p) => !vistos.has(p) || vistos.get(p) !== marcaDe(p));
    return {
      mudou,
      confirmar: () => {
        if (contaVista !== conta) return;
        for (const p of partes) vistos.set(p, marcaDe(p));
      },
    };
  }

  return { verificar };
}
