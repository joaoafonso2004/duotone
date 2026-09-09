import type { Track } from '../types';

/**
 * O que os teus amigos mais ouvem, junto num sítio.
 *
 * ## Porque não é a soma das contagens
 *
 * A ordenação óbvia -- somar as reproduções de toda a gente -- dá a prateleira
 * a quem ouve mais, e não ao que é mais consensual. Um amigo que ouça uma faixa
 * duzentas vezes empurra-a à frente de outra que TRÊS amigos ouvem. E a
 * pergunta que esta prateleira responde é "o que é que eles ouvem", não "o que
 * é que o mais activo deles ouve".
 *
 * Por isso manda **quantos amigos distintos** a ouvem, e só a seguir o total
 * de reproduções. Com um amigo só, as duas ordens são a mesma e isto não muda
 * nada; com cinco, é a diferença entre uma prateleira sobre eles e uma
 * prateleira sobre um deles.
 *
 * ## Quem aparece por baixo do título
 *
 * Devolve também os NOMES de quem ouve cada faixa, porque é isso que separa
 * isto de mais uma lista de músicas: "Sampas e Basílio" por baixo de uma faixa
 * é a razão de ela estar ali. Os nomes vêm pela ordem de quem a ouviu mais.
 *
 * Sem imports de runtime: `scripts/test-favoritas-dos-amigos.ts` corre em Node
 * puro, como o `lib/misturas.ts` e o `lib/estilos.ts`.
 */

/** As faixas de um amigo, já lidas. */
export type EscutaDeAmigo = {
  /** Como ele se chama, para aparecer por baixo da faixa. */
  nome: string;
  faixas: readonly (Track & { count: number })[];
};

/** Uma faixa e quem dos teus amigos a ouve. */
export type FavoritaDeAmigo = Track & {
  /** Quantos amigos distintos a ouvem. É o primeiro critério de ordem. */
  amigos: number;
  /** Os nomes, do que mais a ouviu para o que menos. */
  nomes: string[];
  /** A soma das reproduções de todos eles. Desempata. */
  total: number;
};

/** Quantos amigos se consultam. Cada um é uma ida à rede. */
export const AMIGOS_A_CONSULTAR = 8;

/**
 * Junta as escutas de vários amigos numa lista ordenada.
 *
 * `chave` vem de fora para este módulo não importar nada em tempo de execução
 * -- é a mesma decisão do `lib/misturas.ts` e pela mesma razão.
 */
export function favoritasDosAmigos(
  escutas: readonly EscutaDeAmigo[],
  chave: (t: Track) => string,
  limite: number,
): FavoritaDeAmigo[] {
  type Acumulado = { faixa: Track; total: number; porAmigo: { nome: string; count: number }[] };
  const porChave = new Map<string, Acumulado>();

  for (const amigo of escutas) {
    // Um amigo conta UMA vez por faixa, mesmo que a resposta traga a mesma
    // faixa duas vezes -- senão o "quantos amigos" deixava de ser quantos
    // amigos.
    const jaVistas = new Set<string>();
    for (const faixa of amigo.faixas) {
      const k = chave(faixa);
      if (!k || jaVistas.has(k)) continue;
      jaVistas.add(k);
      const contagem = Number.isFinite(faixa.count) && faixa.count > 0 ? faixa.count : 1;
      const registo = porChave.get(k);
      if (registo) {
        registo.total += contagem;
        registo.porAmigo.push({ nome: amigo.nome, count: contagem });
      } else {
        porChave.set(k, { faixa, total: contagem, porAmigo: [{ nome: amigo.nome, count: contagem }] });
      }
    }
  }

  return [...porChave.values()]
    .map((r): FavoritaDeAmigo => ({
      ...r.faixa,
      amigos: r.porAmigo.length,
      nomes: [...r.porAmigo].sort((a, b) => b.count - a.count).map((x) => x.nome),
      total: r.total,
    }))
    // Primeiro quantos, depois quanto. Ver o cabeçalho.
    .sort((a, b) => b.amigos - a.amigos || b.total - a.total)
    .slice(0, Math.max(0, limite));
}

/** "Sampas", "Sampas e Basílio", "Sampas, Basílio e mais 2". */
export function quemOuve(nomes: readonly string[]): string {
  if (nomes.length === 0) return '';
  if (nomes.length === 1) return nomes[0];
  if (nomes.length === 2) return `${nomes[0]} e ${nomes[1]}`;
  return `${nomes[0]}, ${nomes[1]} e mais ${nomes.length - 2}`;
}
