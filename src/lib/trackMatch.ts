/**
 * Correspondência entre uma faixa conhecida (Spotify) e um vídeo do YouTube.
 *
 * O Spotify não dá áudio pela API — só a ficha da faixa. Para a ouvir no
 * Duotone é preciso encontrar o mesmo tema no YouTube, que já é a fonte de
 * áudio da app. Este módulo decide qual dos resultados é o certo.
 *
 * É lógica pura, sem rede: dá para testar sem tocar na app.
 *
 * A regra que guia os pesos: é melhor marcar uma faixa para revisão do que
 * escolher a errada com confiança. Um erro assinalado corrige-se num toque;
 * um erro silencioso fica na playlist até alguém dar por ele.
 */

export interface MatchTarget {
  title: string;
  artist: string;
  /** Duração da gravação original, em segundos (o Spotify dá `duration_ms`). */
  durationSec: number | null;
  /** Só serve para desbloquear pesquisas suprimidas — ver `buildSearchQueries`. */
  album?: string | null;
}

export interface MatchCandidate {
  id: string;
  title: string;
  channel: string;
  /** Duração em segundos, ou null se desconhecida. */
  durationSec: number | null;
}

export interface ScoredCandidate extends MatchCandidate {
  score: number;
}

export interface MatchResult {
  best: ScoredCandidate | null;
  ranked: ScoredCandidate[];
  /**
   * A escolha é boa o suficiente para importar sem perguntar. A false, a
   * faixa deve ir para o ecrã de revisão em vez de entrar às cegas.
   */
  confident: boolean;
}

/** Padrões que denunciam uma versão que não é a gravação original. */
const NOISE: [RegExp, number][] = [
  [/\blive\b|\bao vivo\b|\bconcert\b|\bsession\b|\bfestival\b|\blollapalooza\b/i, -45],
  [/\bcover\b|\bcovered by\b/i, -50],
  [/\bremix\b|\bmashup\b|\bbootleg\b|\bflip\b/i, -35],
  [/\bsped ?up\b|\bslowed\b|\breverb\b|\b8d\b|\bnightcore\b/i, -55],
  [/\bkaraoke\b|\binstrumental\b|\bbacking ?track\b/i, -50],
  [/\breaction\b|\breview\b|\btutorial\b/i, -60],
  [/\blyrics?\b|\bletra\b|\blegendado\b|\btradu[çc][ãa]o\b/i, -18],

  // Estes vieram de um caso real: "Instant Crush (Drumless Edition)" no canal
  // oficial dos Daft Punk ganhava COM CONFIANÇA, porque `\bedit\b` não apanha
  // "Edition" por causa do limite de palavra. Versões alteradas saídas do
  // canal certo são o pior caso: têm todos os sinais bons e o áudio errado.
  [/\bdrumless\b|\bbassless\b|\bguitarless\b|\bno ?vocals?\b/i, -70],
  [/\bacapella\b|\ba cappella\b|\bvocals? only\b/i, -70],
  [/\bbass ?boosted\b|\bloop(ed)?\b|\bstems?\b/i, -55],
  [/\bedition\b/i, -40],
  [/\banimatic\b|\bvisuali[sz]er\b|\bteaser\b|\btrailer\b/i, -35],
];

/**
 * Marcas que mudam a GRAVAÇÃO, e não só a qualidade do upload.
 *
 * Não é a mesma lista do `NOISE`, de propósito. O `NOISE` desconta pontos a
 * uploads piores -- um vídeo de letras tem o áudio original, só traz texto por
 * cima. Estas são outra coisa: um ao vivo, uma acústica ou um remix são outra
 * gravação, e trocá-los pela de estúdio é dar a música errada a quem a pediu.
 *
 * Servem para comparar o que se PROCURA com o que se ENCONTROU, nos dois
 * sentidos. Uma soma de pontos não chega: um "(Live Aid 1985)" no canal
 * oficial com a duração exacta junta pontos que tapam a penalização e passa o
 * limiar. E ao contrário também falhava -- pedir "- Live" e receber a de
 * estúdio dava confiança total, porque nada no cálculo dava pela falta.
 */
const VERSAO: [string, RegExp][] = [
  ['live', /\blive\b|\bao vivo\b|\bconcert\b|\bunplugged\b|\bsession\b|\bfestival\b/i],
  ['cover', /\bcover\b|\bcovered by\b/i],
  ['remix', /\bremix\b|\bmashup\b|\bbootleg\b|\bflip\b/i],
  ['ritmo', /\bsped ?up\b|\bslowed\b|\breverb\b|\b8d\b|\bnightcore\b/i],
  ['karaoke', /\bkaraoke\b|\binstrumental\b|\bbacking ?track\b/i],
  ['semparte', /\bdrumless\b|\bbassless\b|\bguitarless\b|\bno ?vocals?\b|\bacapella\b|\ba cappella\b|\bvocals? only\b/i],
  ['acustica', /\bacoustic[ao]?\b|\bac[uú]stic[ao]\b/i],
  ['demo', /\bdemo\b/i],
  ['edicao', /\bedition\b|\bstems?\b|\bbass ?boosted\b/i],
];

/**
 * As marcas de versão de um título, em texto comparável.
 *
 * A ordem vem da lista e não do título, para "Live Acoustic" e "Acoustic Live"
 * darem a mesma assinatura.
 */
function marcasDeVersao(titulo: string): string {
  return VERSAO.filter(([, padrao]) => padrao.test(titulo)).map(([nome]) => nome).join('+');
}

/** Reduz um título a palavras comparáveis, sem ruído editorial. */
function normalise(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\b(official|video|audio|music|hd|4k|mv)\b/g, ' ')
    // O apóstrofo cola, não parte: "Don't" e "Dont" são a mesma palavra, e a
    // separar dava "don t" contra "dont" -- duas coisas diferentes para uma
    // comparação por texto, e lá se ia o bónus de o título bater certo.
    .replace(/['\u2019\u02bc\u0060]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sufixos do Spotify que são a MESMA gravação, reeditada.
 *
 * O Spotify escreve "Bohemian Rhapsody - Remastered 2011", e o YouTube tem-na
 * como "Bohemian Rhapsody". A comparação de títulos é tudo-ou-nada, por isso
 * o sufixo fazia perder 30 pontos de uma vez -- medido: de 20 faixas comuns,
 * três iam a revisão só por causa disto, com a escolha certa em primeiro.
 *
 * A lista é curta de propósito, e o que fica de fora é o que interessa: um
 * "- Live", "- Acoustic", "- Demo", "- Remix" ou "- Radio Edit" é OUTRA
 * gravação. Apagar esses casaria a de estúdio com a ao vivo em silêncio, que
 * é o erro que não se pode cometer. Esses continuam a comparar-se inteiros, e
 * as penalizações de ruído continuam a apanhá-los.
 */
const REEDICAO =
  /\s[-\u2013]\s(?:\d{4}\s)?(?:digital\s|album\s)?(?:remaster(?:ed)?|remasterizad[oa])(?:\s\d{4})?$|\s[-\u2013]\s(?:bonus\stracks?|original\smix|single\sversion|album\sversion)$/i;

/**
 * O título sem o sufixo do Spotify. Devolve-o intacto se não houver nenhum.
 *
 * Serve só para COMPARAR títulos, e é seguro tirar aqui também as marcas de
 * versão: quem decide se a gravação é a mesma é o `marcasDeVersao`, que lê o
 * título inteiro. Separar as duas coisas é o que permite ser generoso na
 * comparação sem abrir a porta a trocar uma versão pela outra -- "Bohemian
 * Rhapsody - Live" e "Bohemian Rhapsody (Live Aid 1985)" têm o mesmo núcleo,
 * batem certo, e continuam a ser as duas ao vivo.
 *
 * A lista é fechada de propósito: um travessão faz parte de muitos títulos a
 * sério, e só sai o que se reconhece.
 */
export function nucleoDoTitulo(titulo: string): string {
  let limpo = titulo.replace(REEDICAO, '').trim();

  // Sufixo de versão: "Song - Live at Wembley", "Song - Acoustic".
  const corte = limpo.search(/\s[-\u2013]\s[^-\u2013]*$/);
  if (corte > 0) {
    const sufixo = limpo.slice(corte);
    if (sufixo.length <= 40 && VERSAO.some(([, padrao]) => padrao.test(sufixo))) {
      limpo = limpo.slice(0, corte).trim();
    }
  }

  // Um título que É só o sufixo ficaria vazio e passava a bater com tudo.
  return limpo.length >= 2 ? limpo : titulo;
}

export function scoreCandidate(candidate: MatchCandidate, target: MatchTarget): number {
  let score = 0;
  const { title, channel } = candidate;
  const nTitle = normalise(title);
  const nChannel = normalise(channel);
  const nArtist = normalise(target.artist);
  const nName = normalise(nucleoDoTitulo(target.title));

  // Canal " - Topic": upload automático da editora, alinhado com o catálogo
  // do Spotify. É o sinal mais fiável que existe.
  if (/- Topic$/.test(channel)) score += 55;
  else if (nChannel && nArtist && (nChannel.includes(nArtist) || nArtist.includes(nChannel)))
    score += 40;
  if (/vevo/i.test(channel)) score += 20;

  if (nName && nTitle.includes(nName)) score += 30;
  if (nArtist && nTitle.includes(nArtist)) score += 12;

  // A duração é o desempate. Sozinha engana — há re-uploads com a duração
  // exacta — mas combinada com o canal resolve quase tudo.
  if (candidate.durationSec && target.durationSec) {
    const delta = Math.abs(candidate.durationSec - target.durationSec);
    if (delta <= 2) score += 45;
    else if (delta <= 5) score += 32;
    else if (delta <= 10) score += 12;
    else if (delta <= 25) score -= 10;
    else score -= 45;
  }

  // O vídeo oficial costuma trazer intro e ficar mais longo que a faixa.
  if (/official audio|full audio/i.test(title)) score += 18;
  else if (/official video|music video/i.test(title)) score -= 6;

  return score + noisePenalty(title);
}

/** Total das penalizações de ruído de um título (0 quando está limpo). */
function noisePenalty(title: string): number {
  let total = 0;
  for (const [pattern, penalty] of NOISE) {
    if (pattern.test(title)) total += penalty;
  }
  return total;
}

/**
 * Consultas a tentar, por ordem, até uma devolver resultados.
 *
 * A segunda existe por um caso real: a pesquisa `EDEN sex` devolve ZERO
 * resultados na Data API — a query é suprimida por parecer procura de
 * conteúdo adulto, e nem `safeSearch=none` a destrava. Com o álbum colado
 * ao fim (`EDEN sex i think you think too much of me`) voltam 25 resultados,
 * com o vídeo oficial em primeiro. Títulos de uma palavra são o caso comum
 * disto, e o CSV do Spotify já traz o álbum.
 */
export function buildSearchQueries(target: MatchTarget): string[] {
  const base = `${target.artist} ${target.title}`.trim();
  const queries = [base];
  const album = target.album?.trim();
  // Álbum igual ao título (singles) não acrescenta contexto nenhum.
  if (album && album.toLowerCase() !== target.title.trim().toLowerCase()) {
    queries.push(`${base} ${album}`);
  }
  return queries;
}

/** Pontuação mínima para aceitar sem perguntar. */
const CONFIDENT_SCORE = 70;
/** Distância mínima para o segundo lugar — empates vão a revisão. */
const CONFIDENT_MARGIN = 12;

/**
 * Dois uploads da mesma gravação (canal "- Topic" e canal do artista, ou dois
 * re-uploads) empatam quase sempre. Tratá-los como ambiguidade mandava para
 * revisão faixas em que ambas as escolhas estão certas — o utilizador confirma
 * duas vezes a mesma música sem ganhar nada.
 *
 * A duração é o que separa gravações diferentes: versões alteradas (remix,
 * ao vivo, editadas) mudam de comprimento. Igual ao segundo e igual ao título
 * procurado é a mesma coisa vista duas vezes.
 *
 * Salvaguarda: karaoke e instrumental têm a duração exacta do original. Se um
 * dos dois traz marcas de ruído que o outro não traz, não são a mesma coisa —
 * têm o mesmo comprimento e áudio diferente, que é precisamente o caso em que
 * a revisão faz falta.
 */
function sameRecording(a: ScoredCandidate, b: ScoredCandidate, target: MatchTarget): boolean {
  if (a.durationSec == null || b.durationSec == null) return false;
  if (Math.abs(a.durationSec - b.durationSec) > 2) return false;
  if (noisePenalty(a.title) !== noisePenalty(b.title)) return false;
  const name = normalise(nucleoDoTitulo(target.title));
  if (!name) return false;
  return normalise(a.title).includes(name) && normalise(b.title).includes(name);
}

export function pickBest(candidates: MatchCandidate[], target: MatchTarget): MatchResult {
  const ranked = candidates
    .map((candidate) => ({ ...candidate, score: scoreCandidate(candidate, target) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0] ?? null;
  // A margem mede-se contra o primeiro concorrente que seja mesmo outra coisa.
  const rival = best ? ranked.slice(1).find((c) => !sameRecording(best, c, target)) : undefined;

  /**
   * A versão encontrada tem de ser a versão procurada.
   *
   * Compara-se nos dois sentidos porque falhava nos dois: um ao vivo a entrar
   * como estúdio, e o estúdio a entrar quando se pediu o ao vivo. Quem pede
   * "- Live" recebe o ao vivo -- as marcas batem certo e a faixa entra
   * sozinha; o que não acontece é uma trocar pela outra sem ninguém ver.
   */
  const outraVersao = !!best && marcasDeVersao(best.title) !== marcasDeVersao(target.title);

  return {
    best,
    ranked,
    confident:
      !!best &&
      best.score >= CONFIDENT_SCORE &&
      !outraVersao &&
      (!rival || best.score - rival.score >= CONFIDENT_MARGIN),
  };
}
