import type { Mistura } from './misturas';
import type { Track } from '../types';

/**
 * A música que não existe em serviço nenhum.
 *
 * ## Isto não é uma prateleira, é a identidade da app
 *
 * O catálogo do Duotone é o YouTube, e essa é a diferença que nenhum acordo de
 * licenciamento fecha: os ao vivo, os sped up, os remixes, os sets, os leaks,
 * as versões de 2019 antes do master. Uma biblioteca com 357 faixas do Juice
 * WRLD que não existem no Spotify não é um acaso — é a razão de a app existir.
 *
 * O que faltava era dizê-lo. Enquanto isto for um efeito lateral do YouTube,
 * é preciso explicá-lo a quem abre a app; com uma prateleira, percebe-se num
 * segundo e sem ninguém falar.
 *
 * ## Como é que a app sabe
 *
 * Sem perguntar nada ao Spotify. Pergunta-se ao Deezer por todas as faixas —
 * é o que enche o `track_catalog` — e o Deezer tem o mesmo catálogo licenciado:
 * as mesmas editoras, os mesmos distribuidores. Se ele não a conhece, ela não
 * tem edição comercial. Ver `supabase/sem-edicao-comercial.sql`.
 *
 * ## Porque é que o mínimo é baixo
 *
 * Ao contrário dos géneros e das décadas, aqui **cinco faixas já são uma
 * prateleira**. Uma gaveta com cinco músicas de jazz não faz de ninguém um
 * ouvinte de jazz; cinco faixas que não existem em mais lado nenhum são cinco
 * faixas que não existem em mais lado nenhum. A raridade não precisa de
 * quantidade para valer.
 *
 * Sem imports de runtime: `scripts/test-sem-edicao.ts` corre em Node puro.
 */

/** Faixas por prateleira. */
export const POR_PRATELEIRA = 30;
/** Abaixo disto não vale uma prateleira. Ver o cabeçalho: é baixo de propósito. */
export const MINIMO = 5;
/** O id é estável, para a navegação o poder guardar. */
export const ID = 'raras:sem-edicao';

export function misturaSemEdicao(
  biblioteca: readonly Track[],
  semEdicao: (t: Track) => boolean,
  chave: (t: Track) => string,
  peso: (t: Track) => number = () => 0,
  baralhar: <T>(l: readonly T[]) => T[] = (l) => [...l],
): Mistura[] {
  const achadas: Track[] = [];
  const vistas = new Set<string>();

  for (const faixa of biblioteca) {
    if (!semEdicao(faixa)) continue;
    const k = chave(faixa);
    if (!k || vistas.has(k)) continue;
    vistas.add(k);
    achadas.push(faixa);
  }

  if (achadas.length < MINIMO) return [];

  // As mais ouvidas primeiro, e só depois se baralha o resto. Numa prateleira
  // de raridades a que se ouve mais é a que se quer voltar a ouvir -- ao
  // contrário das décadas, onde a ordem da biblioteca não diz nada.
  const ordenadas = [...achadas].sort((a, b) => peso(b) - peso(a));
  const topo = ordenadas.slice(0, Math.min(5, ordenadas.length));
  const resto = baralhar(ordenadas.slice(topo.length));

  return [{
    id: ID,
    nome: 'Rare finds',
    faixas: [...topo, ...resto].slice(0, POR_PRATELEIRA),
  }];
}
