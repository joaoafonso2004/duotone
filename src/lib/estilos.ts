/**
 * Os teus estilos, descobertos e não etiquetados.
 *
 * ## A ideia
 *
 * Não há género nenhum guardado nesta app: o catálogo devolve título, artista
 * e duração, e mais nada (ver `FaixaDoCatalogo` em `api/catalogo.ts`). Podia
 * pedir-se a etiqueta a outro serviço; mas o sinal de que se precisa **já está
 * a ser descarregado todos os dias** para a descoberta.
 *
 * **Dois artistas teus que partilham vizinhos são do mesmo estilo.** É esse o
 * truque, e dispensa etiquetas: o catálogo diz, para cada artista, quem se
 * parece com ele; comparam-se essas listas par a par, e quem se sobrepõe
 * agrupa-se. O nome do género nunca chega a ser preciso para o agrupamento
 * existir -- só para o poder anunciar, e para isso há o artista mais central.
 *
 * ## Porque é que isto é barato
 *
 * São umas dezenas de artistas. A conta é O(n²) sobre conjuntos pequenos, corre
 * no telemóvel em milissegundos, e com a cache do catálogo quente não vai à
 * rede uma única vez -- as vizinhanças são as mesmas que a descoberta já pediu.
 *
 * ## O peso é a raiz da contagem
 *
 * Como no `escolherAlvos` do `api/descoberta.ts`, e pela mesma razão que lá
 * está escrita: em bruto, o artista mais ouvido abafa tudo o resto e todos os
 * grupos acabavam por ser dele. A raiz mantém a ordem e aproxima os extremos.
 *
 * Sem imports de runtime: `scripts/test-estilos.ts` corre em Node puro, como o
 * `lib/misturas.ts` e o `lib/radio.ts`.
 */

import type { Mistura } from './misturas';
import type { Track } from '../types';

/** Um agrupamento de artistas teus que se parecem uns com os outros. */
export type Estilo = {
  /** Estável entre carregamentos, para a navegação o poder guardar. */
  id: string;
  /** Como o grupo se apresenta. Ver `nomeDoEstilo`. */
  nome: string;
  /** As chaves canónicas dos membros, do mais ouvido para o menos. */
  chaves: string[];
  /** Os nomes como se escrevem, na mesma ordem. */
  nomes: string[];
  /** A soma das raízes das contagens. Decide que grupos se mostram. */
  peso: number;
};

/** Abaixo disto dois artistas não são do mesmo estilo, são só dois artistas. */
export const SEMELHANCA_MINIMA = 0.1;

/**
 * Um empurrão quando um dos dois aparece na lista de vizinhos do outro.
 *
 * A sobreposição de vizinhos é um sinal indirecto -- "conhecem a mesma gente".
 * Um artista estar DIRECTAMENTE na lista do outro é o catálogo a dizer que se
 * parecem, e isso vale mais do que qualquer sobreposição.
 */
export const BONUS_DE_VIZINHO = 0.25;

/** Quantos grupos se mostram, no máximo. */
export const ESTILOS = 3;

/** Abaixo de dois artistas não é um estilo, é um artista -- e para isso já há
 *  as misturas por artista. */
export const MINIMO_DE_ARTISTAS = 2;

/** Quantos artistas teus entram na conta. Mais do que isto e a cauda longa
 *  começa a colar grupos que não têm nada a ver. */
export const CANDIDATOS_A_ESTILO = 25;

/**
 * Quanto é que dois conjuntos se sobrepõem, de 0 a 1 (Jaccard).
 *
 * Dois conjuntos vazios dão zero e não um: "não sei nada de nenhum dos dois"
 * não é o mesmo que "são iguais", e tratá-los como iguais colava num só grupo
 * todos os artistas que o catálogo não conhece.
 */
export function sobreposicao(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let comuns = 0;
  const [pequeno, grande] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of pequeno) if (grande.has(x)) comuns++;
  if (comuns === 0) return 0;
  return comuns / (a.size + b.size - comuns);
}

/** O quanto dois artistas teus se parecem, pelo que o catálogo sabe. */
export function semelhanca(
  a: { chave: string; vizinhos: ReadonlySet<string> },
  b: { chave: string; vizinhos: ReadonlySet<string> },
): number {
  let valor = sobreposicao(a.vizinhos, b.vizinhos);
  if (a.vizinhos.has(b.chave) || b.vizinhos.has(a.chave)) valor += BONUS_DE_VIZINHO;
  return valor;
}

/**
 * Como o grupo se chama.
 *
 * **Pelos artistas e não por um género**, porque um género não está em lado
 * nenhum -- e porque "Isak & Joint One" diz mais a quem ouve isso do que
 * "Rap/Hip Hop", que é o mais fino que o catálogo saberia dizer.
 *
 * Com um só membro seria uma mistura por artista disfarçada, e essas já
 * existem; daí o `MINIMO_DE_ARTISTAS`. O `Like X` fica para quando um dia
 * houver grupos de um.
 */
export function nomeDoEstilo(nomes: readonly string[]): string {
  if (nomes.length === 0) return 'Your mix';
  if (nomes.length === 1) return `Like ${nomes[0]}`;
  return `${nomes[0]} & ${nomes[1]}`;
}

type Membro = { chave: string; nome: string; peso: number; vizinhos: ReadonlySet<string> };

/**
 * Agrupa os teus artistas por quem se parece com quem.
 *
 * Aglomerativo e ganancioso: cada artista começa sozinho, junta-se sempre o par
 * de grupos mais parecido, e pára-se quando nada passa do limiar. A ligação
 * entre dois GRUPOS é a média das semelhanças entre os seus membros -- a
 * ligação simples (o melhor par) encadeava grupos inteiros através de um único
 * artista que se parecia com dois mundos diferentes.
 *
 * A ordem da saída é pelo peso, e a dos membros dentro de cada grupo também:
 * é o membro mais ouvido que dá o nome ao grupo.
 */
export function agruparPorEstilo(
  artistas: readonly { nome: string; escutas: number }[],
  /** Os vizinhos de um artista, em chaves canónicas. Vazio para quem o
   *  catálogo não conhecer -- e esses ficam de fora, que é o correcto. */
  vizinhosDe: (chave: string) => readonly string[],
  chaveDoNome: (nome: string) => string,
  { maximo = ESTILOS, minimo = SEMELHANCA_MINIMA } = {},
): Estilo[] {
  const membros: Membro[] = [];
  const vistos = new Set<string>();
  for (const a of artistas.slice(0, CANDIDATOS_A_ESTILO)) {
    const chave = chaveDoNome(a.nome);
    if (!chave || vistos.has(chave)) continue;
    const vizinhos = new Set(vizinhosDe(chave));
    // Sem vizinhos não há como saber com quem se parece. Entrar na mesma
    // punha-o a colar-se ao primeiro grupo por acaso.
    if (vizinhos.size === 0) continue;
    vistos.add(chave);
    membros.push({ chave, nome: a.nome, peso: Math.sqrt(Math.max(0, a.escutas)), vizinhos });
  }
  if (membros.length < MINIMO_DE_ARTISTAS) return [];

  // A matriz de semelhanças, calculada uma vez.
  const par = new Map<string, number>();
  const chaveDoPar = (i: number, j: number) => (i < j ? `${i}:${j}` : `${j}:${i}`);
  for (let i = 0; i < membros.length; i++) {
    for (let j = i + 1; j < membros.length; j++) {
      par.set(chaveDoPar(i, j), semelhanca(membros[i], membros[j]));
    }
  }

  let grupos: { indices: number[] }[] = membros.map((_, i) => ({ indices: [i] }));

  /** A média das semelhanças entre os membros de dois grupos. */
  const ligacao = (a: { indices: number[] }, b: { indices: number[] }): number => {
    let soma = 0;
    for (const i of a.indices) for (const j of b.indices) soma += par.get(chaveDoPar(i, j)) ?? 0;
    return soma / (a.indices.length * b.indices.length);
  };

  for (;;) {
    let melhor = { valor: minimo, a: -1, b: -1 };
    for (let i = 0; i < grupos.length; i++) {
      for (let j = i + 1; j < grupos.length; j++) {
        const v = ligacao(grupos[i], grupos[j]);
        if (v > melhor.valor) melhor = { valor: v, a: i, b: j };
      }
    }
    if (melhor.a < 0) break;
    const juntos = { indices: [...grupos[melhor.a].indices, ...grupos[melhor.b].indices] };
    grupos = grupos.filter((_, n) => n !== melhor.a && n !== melhor.b);
    grupos.push(juntos);
  }

  const saida: Estilo[] = grupos
    .filter((g) => g.indices.length >= MINIMO_DE_ARTISTAS)
    .map((g): Estilo => {
      const ordenados = g.indices
        .map((i) => membros[i])
        .sort((x, y) => y.peso - x.peso);
      const nomes = ordenados.map((m) => m.nome);
      return {
        // Pelo membro mais ouvido: o mesmo grupo dá o mesmo id entre
        // carregamentos, mesmo que a ordem dos outros mude.
        id: `estilo:${ordenados[0].chave}`,
        nome: nomeDoEstilo(nomes),
        chaves: ordenados.map((m) => m.chave),
        nomes,
        peso: ordenados.reduce((soma, m) => soma + m.peso, 0),
      };
    })
    .sort((a, b) => b.peso - a.peso);

  return saida.slice(0, maximo);
}

/** Faixas por mistura de estilo. O mesmo do `POR_MISTURA` das outras. */
export const POR_ESTILO = 25;
/** Abaixo disto nao e uma playlist, e uma musica com um titulo por cima. */
export const MINIMO_DE_FAIXAS = 8;

/**
 * As playlists de cada estilo.
 *
 * A regra e a mesma das misturas por artista: as TUAS faixas dos artistas do
 * grupo, intercaladas com as descobertas que esses artistas trouxeram. Uma tua,
 * uma nova, uma tua -- em bloco, as novas ficavam todas no fim, que e onde
 * ninguem chega.
 *
 * O minimo e mais alto do que o das misturas por artista (oito contra cinco):
 * um grupo junta VARIOS artistas, e se entre todos nao houver oito faixas o que
 * o agrupamento encontrou nao era um estilo, era ruido.
 */
export function misturasDeEstilo(
  estilos: readonly Estilo[],
  biblioteca: readonly Track[],
  chaveDoArtista: (t: Track) => string,
  baralhar: <T>(l: readonly T[]) => T[] = (l) => [...l],
  vizinhas: ReadonlyMap<string, readonly Track[]> = new Map(),
): Mistura[] {
  const porChave = new Map<string, Track[]>();
  for (const faixa of biblioteca) {
    const chave = chaveDoArtista(faixa);
    if (!chave) continue;
    const lista = porChave.get(chave);
    if (lista) lista.push(faixa);
    else porChave.set(chave, [faixa]);
  }

  const saida: Mistura[] = [];
  for (const estilo of estilos) {
    const minhas: Track[] = [];
    const novas: Track[] = [];
    for (const chave of estilo.chaves) {
      minhas.push(...(porChave.get(chave) ?? []));
      novas.push(...(vizinhas.get(chave) ?? []));
    }
    if (minhas.length + novas.length < MINIMO_DE_FAIXAS) continue;

    const a = baralhar(minhas);
    const b = baralhar(novas);
    const juntas: Track[] = [];
    for (let i = 0; juntas.length < POR_ESTILO && (i < a.length || i < b.length); i++) {
      if (a[i]) juntas.push(a[i]);
      if (b[i] && juntas.length < POR_ESTILO) juntas.push(b[i]);
    }
    saida.push({ id: estilo.id, nome: estilo.nome, faixas: juntas });
  }
  return saida;
}
