/**
 * O que o aviso de versão nova mostra: as notas e o botão de atualizar.
 *
 * Sem imports de runtime, testado em `scripts/test-aviso-de-versao.ts`.
 */

/** Máximo de linhas das notas no aviso — o resto fica no site. */
export const MAX_LINHAS_DAS_NOTAS = 4;

/** As Definições do PC pedem ao aviso para voltar a procurar (mesmo uma versão dispensada). */
export const EVENTO_PROCURAR_ATUALIZACAO = 'duotone:procurar-atualizacao';

/**
 * As notas, em poucas linhas que se leem.
 *
 * Quando o workflow cai na lista de commits, as notas trazem `release: Duotone
 * 3.2.0` e `Comparar com win-v3.1.0: https://...` -- e era isso que o aviso
 * mostrava a quem ia atualizar (14/9). Essas linhas são do git, não da versão.
 *
 * O título ("Duotone for iPhone 6.0.2"), os cabeçalhos ("New", "Improved",
 * "Fixed") e o "Full changelog" também saem (15/11): as notas de 6.0.x gastavam
 * neles duas das quatro linhas, e a novidade ficava de fora do aviso.
 */
export function resumirNotas(notas: string, max: number = MAX_LINHAS_DAS_NOTAS): string[] {
  return (notas ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('<!--'))
    .map((l) => l
      .replace(/^#{1,6}\s*/, '')
      .replace(/^[-*+]\s+/, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/`(.+?)`/g, '$1'))
    .filter((l) => !/^release:\s/i.test(l)
      && !/^(comparar com|compare with)\b/i.test(l)
      && !/^duotone \d+\.\d+/i.test(l)
      && !/^duotone for (iphone|windows|pc)\b/i.test(l)
      && !/^(new|improved|fixed|changed)$/i.test(l)
      && !/^full changelog\b/i.test(l)
      && !/^https?:\/\//i.test(l))
    .slice(0, max);
}

export type FaseDaAtualizacao = 'parada' | 'a-descarregar' | 'a-instalar' | 'falhou';

/** O texto do botão principal do aviso, no PC. */
export function rotuloDaAtualizacao(fase: FaseDaAtualizacao, progresso: number): string {
  if (fase === 'a-descarregar') {
    const percentagem = Math.max(0, Math.min(100, Math.round((Number(progresso) || 0) * 100)));
    return `Downloading… ${percentagem}%`;
  }
  if (fase === 'a-instalar') return 'Installing — Duotone will reopen';
  if (fase === 'falhou') return 'Try again';
  return 'Update now';
}
