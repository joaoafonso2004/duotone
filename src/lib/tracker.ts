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
  /**
   * A cor que a comunidade deu a esta era, e a que escolheu para o texto por
   * cima. Não é decoração: é a única imagem que este material tem, e o par vem
   * escolhido de origem, por isso o contraste já está resolvido.
   */
  cor: string | null;
  corDoTexto: string | null;
  qualidade: string | null;
  tipo: string | null;
}

/** O que é preciso saber de uma faixa da biblioteca para a comparar. */
export interface FaixaGuardada {
  titulo: string;
  duracaoSegundos?: number | null;
  /** A capa que a faixa já tem, quando a há. Ver `capasPorEra`. */
  capa?: string | null;
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
    const cor = typeof era?.color === 'string' ? era.color : null;
    const corDoTexto = typeof era?.text_color === 'string' ? era.text_color : null;
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
        cor,
        corDoTexto,
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

/**
 * O que NÃO é a faixa, por muito que o título pareça.
 *
 * Procurar `Ken Carson Dream [V2]` no YouTube devolve, entre outras coisas,
 * `|FREE| Ken Carson x Destroy Lonely x Playboicarti Type beat`. Traz o nome
 * do artista, traz palavras do título, e o `pickBest` -- que foi feito para a
 * importação do Spotify, onde a procura devolve a faixa a sério -- dá-lhe
 * pontos por isso e confirma-a. Medido: em 15 procuras, 11 "confirmadas" e 5
 * delas eram type beats ou outra música.
 *
 * Estas marcas não aparecem no título de uma faixa verdadeira.
 */
const NAO_E_A_FAIXA = /\b(type ?beat|beat ?pack|loop ?kit|drum ?kit|sample ?pack|instrumental|karaoke|reaction|reacts|tutorial|how to (make|rap))\b/i;

/**
 * Este vídeo é mesmo a faixa do tracker?
 *
 * Uma porta, e não uma pontuação. O `pickBest` fica onde está -- continua a
 * escolher o melhor entre os resultados -- mas o que ele devolve tem ainda de
 * passar por aqui, e aqui a DURAÇÃO é obrigatória dos dois lados.
 *
 * Ser obrigatória é o ponto: sem ela um type beat com o nome do artista no
 * título passa. 97% das faixas das abas curadas trazem duração (medido em três
 * trackers), por isso exigi-la custa quase nada -- e o que se perde é uma
 * sugestão, enquanto o que se evita é uma prateleira de lixo com o nome
 * "nunca lançado" por cima.
 */
export function aceitarDoYouTube(
  f: FaixaDoTracker,
  candidato: { titulo: string; duracaoSegundos?: number | null },
): boolean {
  if (NAO_E_A_FAIXA.test(candidato.titulo)) return false;

  // O TÍTULO tem de lá estar. Só a duração não chega: `Living Reckless [V2]`
  // saía como `Playboi Carti - SOUTH ATLANTA BABY` porque o `pickBest` dá
  // pontos por o artista bater e a duração calhou dentro da tolerância. Dois
  // títulos sem uma palavra em comum não são a mesma faixa, dure o que durar.
  const alvo = normalizar(f.titulo);
  const achado = normalizar(candidato.titulo);
  if (!alvo || !achado || !achado.includes(alvo)) return false;

  return duracoesCasam(candidato.duracaoSegundos, f.duracaoSegundos);
}

/** O que se manda procurar ao YouTube para uma destas. */
export function procuraNoYouTube(artista: string, f: FaixaDoTracker): string {
  const versao = /\[[^\]]*\]/.test(f.titulo) ? f.titulo : `${f.titulo} ${f.era}`.trim();
  return `${artista} ${versao}`.replace(/\s+/g, ' ').trim();
}

/**
 * As iniciais de uma era, para o mosaico.
 *
 * Duas letras, das primeiras palavras que contem letras -- `Die Lit` dá `DL`,
 * `death in tune` dá `DT`, `Sen$ation` dá `SE`. Palavras de ligação ficam de
 * fora, senão metade das eras dava `TH` do `The`.
 */
export function iniciaisDaEra(era: string): string {
  const LIGACAO = new Set(['the', 'a', 'of', 'in', 'and', 'to', 'de', 'da', 'do']);
  // Corta nos ESPAÇOS e só depois limpa cada palavra. Cortar em tudo o que
  // não é letra partia `Sen$ation` em `Sen` + `ation` e dava `SA` -- e nestes
  // nomes o `$` é um `s`, não um separador. `Ca$h Carti` é uma palavra e meia,
  // não três.
  const palavras = (era || '')
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}\p{N}]+/gu, ''))
    .filter((p) => p && /\p{L}/u.test(p))
    .filter((p, _i, todas) => todas.length === 1 || !LIGACAO.has(p.toLowerCase()));
  if (palavras.length === 0) return '?';
  if (palavras.length === 1) return palavras[0].slice(0, 2).toUpperCase();
  return (palavras[0][0] + palavras[1][0]).toUpperCase();
}

/**
 * A capa de cada era, tirada da PRÓPRIA biblioteca.
 *
 * A ideia: se já tens faixas de uma era, elas trazem a capa dela. `Die Lit` e
 * `Whole Lotta Red` saíram e tu tens música delas, portanto têm capa a sério;
 * `death in tune` e `Sen$ation` nunca saíram e não têm capa nenhuma no mundo,
 * portanto ficam com o mosaico da cor.
 *
 * Isso é exactamente a distinção que interessa ver de relance -- o que saiu
 * contra o que nunca saiu -- e sai de graça: nem uma ida à rede, nem um
 * catálogo a consultar, nem nomes de álbuns a adivinhar. É só cruzar o que já
 * cá está.
 */
export function capasPorEra(
  doTracker: readonly FaixaDoTracker[],
  biblioteca: readonly FaixaGuardada[],
): Map<string, string> {
  const capas = new Map<string, string>();
  for (const f of doTracker) {
    if (!f.era || capas.has(f.era)) continue;
    const igual = biblioteca.find((g) => !!g.capa && jaTens(g, f));
    if (igual?.capa) capas.set(f.era, igual.capa);
  }
  return capas;
}
