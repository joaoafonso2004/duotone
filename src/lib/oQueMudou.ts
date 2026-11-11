import { supabase } from './supabase';
import { getDeviceId } from './deviceIdentity';
import { idDaConta } from './idDaConta';
import { criarPorteiro, type ParteDaConta, type Verificacao } from './porteiroDasMudancas';

/**
 * "O que mudou?" num só pedido, ao voltar à app (11/11, `supabase/o-que-mudou.sql`).
 *
 * Cada parte da app (o Social, os ajustes por faixa, os presets do EQ, os
 * favoritos) relia a sua tabela a cada regresso -- uns oito pedidos, quase
 * sempre para nada. Agora perguntam todas ao mesmo pedido, partilhado, e só
 * relê quem tem alguma coisa nova de OUTRO aparelho ou de outra pessoa.
 *
 * Sem a migração aplicada (ou sem rede, ou sem sessão), a resposta é sempre
 * "mudou": tudo funciona como antes. A lógica está em `porteiroDasMudancas.ts`.
 */
const porteiro = criarPorteiro({
  conta: idDaConta,
  agora: () => Date.now(),
  pedir: async () => {
    const aparelho = await getDeviceId().catch(() => '');
    const { data, error } = await supabase.rpc('o_que_mudou', { p_aparelho: aparelho });
    if (error) {
      const codigo = (error as { code?: string }).code;
      return codigo === 'PGRST202' || codigo === '42883' ? 'sem-funcao' : null;
    }
    const marcas = (data as { marcas?: unknown } | null)?.marcas;
    return marcas && typeof marcas === 'object' ? (marcas as Record<string, string>) : {};
  },
});

export type { ParteDaConta, Verificacao };

/** Mudou alguma destas partes desde a última leitura confirmada? */
export function verificarMudancas(partes: readonly ParteDaConta[], opcoes?: { fresco?: boolean }): Promise<Verificacao> {
  return porteiro.verificar(partes, opcoes);
}
