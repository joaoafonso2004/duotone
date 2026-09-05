import { duracoesCasam, normalizar } from './catalogoDaFaixa';

/**
 * O segundo catálogo: o que existe e nunca foi lançado.
 *
 * **Porque é que isto tinha de existir.** O Duotone conhece um catálogo só, o
 * Deezer, e um catálogo só sabe de música que saiu. Metade desta biblioteca
 * nunca saiu — leaks, snippets, freestyles, versões de trabalho — e para a app
 * essa metade não tem nome, não tem era, não tem produtor e não tem data. Não
 * é uma falha do Deezer: é uma pergunta que não se lhe pode fazer.
 *
 * Quem responde a essa pergunta são as comunidades que seguem cada artista, em
 * folhas de cálculo públicas a que chamam *trackers*. O ArtistGrid recolhe-as e
 * serve-as em JSON. São só metadados — nome, era, produtor, duração, data do
 * leak — e é só isso que daqui se importa.
 *
 * **O que isto NÃO é.** Não é o shuffle inteligente por outras palavras. Esse
 * pergunta ao catálogo pelas faixas mais ouvidas de artistas VIZINHOS, e por
 * construção só devolve música lançada. Este sabe o que os artistas que já
 * ouves nunca lançaram. São eixos diferentes, e este não tinha fonte nenhuma.
 *
 * Funções puras — ver scripts/test-tracker.ts.
 */

/**
 * As abas a preferir, por esta ordem.
 *
 * `main` traz tudo e é enorme — 1.674 faixas só no do Carti, mais de um mega
 * por artista, e isto corre em dados móveis. O `best` é a escolha da própria
 * comunidade e é exatamente a pergunta que interessa: «do que ele nunca
 * lançou, o que é que vale a pena ouvir?». Umas centenas de faixas, não
 * milhares.
 */
export const ABAS_PREFERIDAS = ['best', 'grails', 'main'] as const;

export interface FaixaDoTracker {
  /** Como se mostra, com a versão: `At The Gate [V4]`. */
  titulo: string;
  /** `(prod. Pi'erre Bourne)` e afins, já separados na origem. */
  creditos: string[];
  /** O projeto ou período a que pertence: `Die Lit`, `Whole Lotta Red`. */
  era: string;
  duracaoSegundos: number | null;
  dataDoLeak: string | null;
  /** `Full`, `OG File`, `Snippet`, `Cut` — quanto da faixa é que existe. */
  disponibilidade: string | null;
  qualidade: string | null;
  tipo: string | null;
}

/** O que é preciso saber de uma faixa da biblioteca para a comparar. */
export interface FaixaGuardada {
  titulo: string;
  duracaoSegundos?: number | null;
}

/**
 * `3:19` em segundos. Aceita horas (`1:02:03`) porque alguns sets longos as
 * têm, e devolve `null` para o que não for um tempo — a coluna também leva
 * `?:??` e traços quando ninguém sabe.
 */
export function segundosDoTempo(texto: unknown): number | null {
  if (typeof texto !== 'string') return null;
  const partes = texto.trim().split(':');
  if (partes.length < 2 || partes.length > 3) return null;
  let total = 0;
  for (const p of partes) {
    if (!/^\d{1,2}$/.test(p.trim())) return null;
    total = total * 60 + Number(p);
  }
  return total > 0 ? total : null;
}

/**
 * Tira as estrelas com que as folhas marcam os destaques.
 *
 * Ficam as versões (`[V4]`) e o resto do título: são elas que distinguem duas
 * gravações da mesma música, e apagá-las aqui era perder informação que a
 * pessoa quer ver.
 */
export function tituloLimpo(bruto: unknown): string {
  if (typeof bruto !== 'string') return '';
  return bruto.replace(/[⭐️★☆✨]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Achata a resposta de uma aba em faixas, com a era de cada uma.
 *
 * Tolerante de propósito: é uma folha de cálculo mantida à mão por dezenas de
 * pessoas, e uma linha estranha não pode deitar abaixo a lista toda.
 */
export function faixasDoTracker(resposta: unknown): FaixaDoTracker[] {
  const eras = (resposta as any)?.eras;
  if (!Array.isArray(eras)) return [];
  const saida: FaixaDoTracker[] = [];
  for (const era of eras) {
    const nomeDaEra = typeof era?.name === 'string' ? era.name.trim() : '';
    const faixas = Array.isArray(era?.tracks) ? era.tracks : [];
    for (const f of faixas) {
      const titulo = tituloLimpo(f?.name?.title ?? f?.name?.raw);
      if (!titulo) continue;
      saida.push({
        titulo,
        creditos: Array.isArray(f?.creditos) ? f.creditos
          : Array.isArray(f?.name?.credits) ? f.name.credits.filter((c: unknown) => typeof c === 'string')
          : [],
        era: nomeDaEra,
        duracaoSegundos: segundosDoTempo(f?.track_length),
        dataDoLeak: typeof f?.leak_date === 'string' ? f.leak_date : null,
        disponibilidade: typeof f?.available_length === 'string' ? f.available_length : null,
        qualidade: typeof f?.quality === 'string' ? f.quality : null,
        tipo: typeof f?.type === 'string' ? f.type : null,
      });
    }
  }
  return saida;
}

/**
 * Esta faixa do tracker é uma que já se tem?
 *
 * A comparação é mais frouxa do que a do catálogo do Deezer, e de propósito:
 * ali um engano escreve `P!nk` por cima de uma faixa e estraga a biblioteca;
 * aqui um engano só esconde uma sugestão. O erro barato é esconder de mais, e
 * é para esse lado que isto se inclina.
 *
 * O que trava o exagero é o comprimento. Títulos como `Cry` ou `Yeah` aparecem
 * dentro de meio mundo de títulos do YouTube, por isso abaixo de cinco letras
 * exige-se que a DURAÇÃO confirme. Acima disso o título chega — os títulos do
 * YouTube destas faixas são um caos (`[LEAK] carti new song 2019 CDQ`) e é
 * precisamente por dentro deles que o nome verdadeiro aparece.
 */
export function jaTens(guardada: FaixaGuardada, doTracker: FaixaDoTracker): boolean {
  const t = normalizar(doTracker.titulo);
  const g = normalizar(guardada.titulo);
  if (!t || !g) return false;

  const bateOTitulo = g === t || g.includes(t);
  if (!bateOTitulo) return false;

  const duracoesBatem = duracoesCasam(guardada.duracaoSegundos, doTracker.duracaoSegundos);
  if (t.length < 5) return duracoesBatem;
  return true;
}

/**
 * O que o tracker tem e a biblioteca não.
 *
 * É a lista que mais ninguém consegue construir: precisa do tracker E da
 * biblioteca desta pessoa. Mantém a ordem em que a comunidade as pôs, que é
 * por era e por interesse — ordenar por outra coisa seria deitar fora uma
 * curadoria feita à mão.
 */
export function porOuvir(
  doTracker: readonly FaixaDoTracker[],
  biblioteca: readonly FaixaGuardada[],
): FaixaDoTracker[] {
  return doTracker.filter((f) => !biblioteca.some((g) => jaTens(g, f)));
}

/** O que se manda procurar ao YouTube para uma destas. */
export function procuraNoYouTube(artista: string, f: FaixaDoTracker): string {
  const versao = /\[[^\]]*\]/.test(f.titulo) ? f.titulo : `${f.titulo} ${f.era}`.trim();
  return `${artista} ${versao}`.replace(/\s+/g, ' ').trim();
}
