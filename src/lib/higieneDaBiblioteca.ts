import type { Track } from '../types';

/**
 * O "Library check": o que está mal na biblioteca, dito antes de se dar com
 * isso a tocar. Três perguntas -- está guardada duas vezes? o vídeo ainda
 * existe? a capa carrega? -- e para cada resposta uma ação que só acontece
 * quando se carrega no botão.
 *
 * Sem imports de runtime, de propósito, como o `lib/radio.ts`: os helpers dos
 * nomes (`displayArtist`, `tituloDaFaixa`, ...) entram por parâmetro. É o que
 * o mantém testável em Node puro (`scripts/test-higiene-da-biblioteca.ts`).
 * A rede e a base de dados vivem em `api/higieneDaBiblioteca.ts`.
 */

// ---------------------------------------------------------------- duplicados --

/** As durações de duas cópias da mesma gravação cabem nisto. */
export const TOLERANCIA_DE_DUPLICADO_S = 3;

export type AjudantesDaHigiene = {
  /** Chave canónica do artista (`chaveDeArtista(displayArtist(t))`), '' sem artista. */
  artistaChave: (t: Track) => string;
  /** O título sem o artista nem o ruído do upload (`tituloDaFaixa`). */
  titulo: (t: Track) => string;
  /** O núcleo comparável de um título (`normalizar(nucleoDoTitulo(t))`). */
  nucleo: (titulo: string) => string;
  /** A assinatura das marcas de versão do título inteiro (`marcasDeVersao`). */
  marcas: (titulo: string) => string;
};

export type GrupoDeDuplicados = {
  chave: string;
  /** Pela ordem em que estão na biblioteca. */
  faixas: Track[];
  /** A proposta de qual fica. Quem decide é a pessoa. */
  fica: Track;
};

/**
 * `[V2]`, `(v4)`: as versões dos leaks. O `normalizar` apaga o que está entre
 * parênteses, e sem isto duas versões diferentes da mesma música davam a mesma
 * chave -- e juntá-las era perder uma.
 */
function versoes(titulo: string): string {
  return [...titulo.matchAll(/\bv(\d{1,2})\b/gi)].map((m) => m[1]).sort().join(',');
}

/**
 * A mesma GRAVAÇÃO, não só a mesma música.
 *
 * Artista, núcleo do título, marcas de versão e versões numeradas. A chave do
 * Rare Finds (`chaveDaMusica`) junta as versões de propósito -- lá a pergunta é
 * "já conheces esta música?" --, e aqui era o erro: juntar o ao vivo com o de
 * estúdio é apagar um deles. A duração faz o resto (ver `gruposDeDuplicados`).
 */
export function chaveDeDuplicado(t: Track, aj: AjudantesDaHigiene): string {
  const artista = aj.artistaChave(t);
  const nucleo = aj.nucleo(aj.titulo(t));
  if (!artista || !nucleo) return '';
  return `${artista}|${nucleo}|${aj.marcas(t.title)}|${versoes(t.title)}`;
}

/** Canal oficial: o `- Topic` (gerado da editora) ou um VEVO. */
export function canalOficial(t: Pick<Track, 'artist'>): boolean {
  const canal = t.artist ?? '';
  return /\s-\sTopic$/i.test(canal) || /vevo/i.test(canal);
}

/**
 * Qual fica, por proposta: uma que toque, e dessas a do canal oficial -- o
 * áudio limpo, sem a intro do videoclipe. Em empate, a que foi guardada
 * primeiro, que é a que a pessoa conhece.
 */
export function escolherQueFica(faixas: readonly Track[], mortas: ReadonlySet<string> = new Set()): Track {
  const vivas = faixas.filter((t) => !mortas.has(t.sourceId));
  const escolha = vivas.length ? vivas : faixas;
  return escolha.find(canalOficial) ?? escolha[0]!;
}

/**
 * A mesma gravação guardada mais de uma vez.
 *
 * Mesma chave e durações a menos de três segundos da primeira do grupo. A
 * duração tem de existir nas duas: sem ela não se decide, e numa ação que tira
 * uma música da biblioteca é melhor não propor do que propor mal. Só entram
 * faixas com id (as que estão mesmo guardadas).
 */
export function gruposDeDuplicados(
  faixas: readonly Track[],
  aj: AjudantesDaHigiene,
  mortas: ReadonlySet<string> = new Set(),
): GrupoDeDuplicados[] {
  const ordem = new Map<Track, number>();
  const porChave = new Map<string, Track[]>();
  faixas.forEach((t, i) => {
    if (!t.id || !t.durationSeconds || t.durationSeconds <= 0) return;
    const k = chaveDeDuplicado(t, aj);
    if (!k) return;
    ordem.set(t, i);
    const lista = porChave.get(k);
    if (lista) lista.push(t);
    else porChave.set(k, [t]);
  });

  const grupos: GrupoDeDuplicados[] = [];
  for (const [chave, lista] of porChave) {
    if (lista.length < 2) continue;
    const porDuracao = [...lista].sort((a, b) => a.durationSeconds! - b.durationSeconds!);
    let atual: Track[] = [];
    let ancora = 0;
    const fechar = () => {
      if (atual.length < 2) return;
      const pelaBiblioteca = [...atual].sort((a, b) => ordem.get(a)! - ordem.get(b)!);
      grupos.push({ chave, faixas: pelaBiblioteca, fica: escolherQueFica(pelaBiblioteca, mortas) });
    };
    for (const t of porDuracao) {
      if (atual.length && t.durationSeconds! - ancora > TOLERANCIA_DE_DUPLICADO_S) {
        fechar();
        atual = [];
      }
      if (!atual.length) ancora = t.durationSeconds!;
      atual.push(t);
    }
    fechar();
  }
  return grupos.sort((a, b) => ordem.get(a.faixas[0]!)! - ordem.get(b.faixas[0]!)!);
}

// ------------------------------------------------------------ indisponíveis --

export type Disponibilidade =
  | 'ok'
  /** Removido, privado, ou um id que não existe. Não toca em lado nenhum. */
  | 'removida'
  /** O dono proibiu tocar fora do YouTube: o player do PC não a toca. */
  | 'bloqueada'
  | 'restrita-idade'
  | 'restrita-regiao'
  /** Sem resposta que sirva (rede, 429, 5xx). Não se acusa ninguém. */
  | 'nao-sei';

/**
 * O que o oEmbed do YouTube diz, pelo código HTTP. Não gasta quota e responde
 * nas duas plataformas.
 *
 * O 401 não distingue "privado" de "o dono não deixa embutir" -- o oEmbed
 * responde o mesmo aos dois. No PC é igual (o player é o embed, não toca nenhum
 * dos dois); no iPhone o extrator toca os embutíveis-não, por isso lá o 401 é
 * confirmado pelo extrator (`veredictoDoExtrator`).
 */
export function veredictoDoOEmbed(status: number | null): Disponibilidade {
  if (status == null) return 'nao-sei';
  if (status >= 200 && status < 300) return 'ok';
  if (status === 404 || status === 400) return 'removida';
  if (status === 401 || status === 403) return 'bloqueada';
  return 'nao-sei';
}

/**
 * A segunda opinião, no iPhone: o tipo de falha do extrator (`TipoFalha`), ou
 * null se resolveu -- e então toca neste telemóvel, diga o oEmbed o que disser.
 * Uma falha de transporte (bloqueio de bot, CDN) não diz nada sobre o vídeo.
 */
export function veredictoDoExtrator(tipo: string | null | undefined): Disponibilidade {
  if (tipo == null) return 'ok';
  if (tipo === 'indisponivel') return 'removida';
  if (tipo === 'restrito-idade') return 'restrita-idade';
  if (tipo === 'restrito-regiao') return 'restrita-regiao';
  return 'nao-sei';
}

/** A frase de cada uma, para a linha da lista. */
export function motivoDaIndisponivel(d: Disponibilidade): string {
  switch (d) {
    case 'removida': return 'Removed or made private on YouTube';
    case 'bloqueada': return 'The owner blocks playback outside YouTube';
    case 'restrita-idade': return 'Age-restricted on YouTube';
    case 'restrita-regiao': return 'Not available in your country';
    default: return '';
  }
}

/** Entra na lista? Só o que se sabe que não toca. */
export function naoToca(d: Disponibilidade): boolean {
  return d !== 'ok' && d !== 'nao-sei';
}

// ------------------------------------------------------------------- capas --

/** A miniatura do próprio vídeo: é o que o `corrigir_capa` escreve. */
export function capaDoVideo(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export type EstadoDaCapa = 'ok' | 'sem-capa' | 'verificar' | 'ignorar';

/**
 * O que fazer com a capa que se VÊ.
 *
 * `mostrada` é a que o ecrã desenha (`comCatalogo`): se vier do catálogo, não
 * é a da faixa, e corrigir a da faixa não mudava nada no ecrã -- fica de fora.
 * A miniatura do próprio vídeo não se verifica: existe enquanto o vídeo
 * existir, e um vídeo removido já está na lista dos indisponíveis.
 */
export function estadoDaCapa(t: Track, mostrada: string | null | undefined): EstadoDaCapa {
  if (t.source !== 'youtube' || !t.id) return 'ignorar';
  if (mostrada && mostrada !== t.artworkUrl) return 'ignorar';
  if (!mostrada) return 'sem-capa';
  const m = /^https?:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/([A-Za-z0-9_-]{11})\//.exec(mostrada);
  if (m && m[1] === t.sourceId) return 'ok';
  return 'verificar';
}

export function veredictoDaCapa(status: number | null): 'ok' | 'partida' | 'nao-sei' {
  if (status == null) return 'nao-sei';
  if (status >= 200 && status < 300) return 'ok';
  if (status === 400 || status === 403 || status === 404 || status === 410) return 'partida';
  return 'nao-sei';
}

// ------------------------------------------------------------------- resto --

/**
 * `fn` sobre cada item, no máximo `limite` de cada vez. Parar deixa de lançar
 * novos; os que já iam a meio acabam. Devolve pela ordem dos itens, com
 * `undefined` nos que não chegaram a correr.
 */
export async function emParalelo<T, R>(
  itens: readonly T[],
  limite: number,
  fn: (item: T, i: number) => Promise<R>,
  deveParar: () => boolean = () => false,
): Promise<(R | undefined)[]> {
  const saida: (R | undefined)[] = new Array(itens.length).fill(undefined);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length && !deveParar()) {
      const i = proximo++;
      saida[i] = await fn(itens[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limite, itens.length)) }, trabalhador));
  return saida;
}

/**
 * "3:59", para pôr ao lado de cada cópia: nos duplicados é a duração que diz
 * qual é qual. Sem duração, nada.
 */
export function duracaoCurta(segundos: number | null | undefined): string {
  if (segundos == null || !Number.isFinite(segundos) || segundos <= 0) return '';
  const s = Math.round(segundos);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "2 saved twice · 1 unavailable · 3 covers", ou que não há nada. */
export function resumoDoRelatorio(r: { duplicados: number; indisponiveis: number; capas: number }): string {
  const partes: string[] = [];
  if (r.duplicados) partes.push(`${r.duplicados} saved twice`);
  if (r.indisponiveis) partes.push(`${r.indisponiveis} unavailable`);
  if (r.capas) partes.push(`${r.capas} ${r.capas === 1 ? 'cover' : 'covers'}`);
  return partes.length ? partes.join(' · ') : 'Nothing to fix';
}
