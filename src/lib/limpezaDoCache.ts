/**
 * Quem sai quando o cache passa do limite.
 *
 * Vive separado do sistema de ficheiros de propósito: é a única decisão da app
 * que APAGA música do telemóvel, e uma decisão dessas tem de poder ser lida e
 * testada sem tocar em disco nenhum.
 *
 * A regra é simples e a ordem importa: nada é apagado enquanto couber no
 * limite; quando não cabe, saem os mais antigos primeiro; e o que está
 * protegido não sai nunca, mesmo que isso signifique ficar acima do limite.
 * Ficar com o cache maior do que devia é um problema de espaço; apagar a faixa
 * que a pessoa fixou para o avião é um problema de confiança.
 */

export interface FicheiroEmCache {
  id: string;
  bytes: number;
  /** Data de escrita em ms. Quanto menor, mais antigo. */
  modificadoEm: number;
}

export function escolherParaApagar(
  ficheiros: readonly FicheiroEmCache[],
  protegidos: Iterable<string>,
  limiteBytes: number,
): string[] {
  let total = 0;
  for (const f of ficheiros) total += Math.max(0, f.bytes);
  if (total <= limiteBytes) return [];

  const intocaveis = new Set(protegidos);
  const porIdade = [...ficheiros].sort((a, b) => a.modificadoEm - b.modificadoEm);

  const aApagar: string[] = [];
  for (const f of porIdade) {
    if (total <= limiteBytes) break;
    if (intocaveis.has(f.id)) continue;
    aApagar.push(f.id);
    total -= Math.max(0, f.bytes);
  }
  return aApagar;
}
