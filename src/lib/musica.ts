/**
 * Isto parece uma música, ou é um vídeo qualquer?
 *
 * A pesquisa do YouTube devolve **vídeos**, não faixas. Nas recomendações
 * apareciam reações, entrevistas e compilações de duas horas ao lado das
 * músicas — e uma recomendação que não é música é pior do que recomendação
 * nenhuma.
 *
 * Não há campo que diga "isto é música": há sinais. O mais forte de longe é a
 * **duração** — quase nenhuma música dura menos de um minuto ou mais de um
 * quarto de hora, e é isso que apanha podcasts, diretos e "1 hour loop".
 *
 * Sem imports de runtime, testável em Node puro (`scripts/test-musica.ts`).
 */

/** Mais curto do que isto é um clipe, um teaser ou um Short. */
export const MINIMO_S = 60;
/**
 * Mais longo do que isto é um álbum inteiro, um DJ set ou um podcast.
 *
 * Quinze minutos deixa passar as músicas longas de verdade (um progressivo, um
 * ao vivo estendido) e corta o que interessa cortar. Uma música de vinte
 * minutos existe; numa lista de descoberta é a exceção que não vale o ruído.
 */
export const MAXIMO_S = 15 * 60;

/**
 * Palavras que dizem que aquilo não é uma faixa.
 *
 * Fechada de propósito, e cada uma pesada: "live" fica de FORA porque metade
 * das versões ao vivo são música a sério; "mix" também, porque no género que o
 * utilizador ouve um mix É a faixa.
 */
const NAO_E_MUSICA = [
  // As outras formas de reação estão no REACAO, por palavra inteira (31/10):
  // 'react' como pedaço de palavra deitava fora "Reactor".
  'reaction',
  'interview', 'entrevista',
  'podcast', 'episode', 'episodio',
  'tutorial', 'how to', 'como fazer',
  'gameplay', 'walkthrough', 'speedrun',
  'vlog', 'blog',
  'trailer', 'teaser',
  'documentary', 'documentario',
  'review', 'analise', 'unboxing',
  'explained', 'explicado',
  'news', 'noticias',
  'behind the scenes', 'making of',
  'karaoke', 'instrumental tutorial',
  'compilation', 'compilado',
  'full album', 'album completo',
  'radio show',
];

/** Marcas de que aquilo é uma sessão longa e não uma faixa. */
const DURACAO_NO_TITULO = /\b(\d+\s*(hour|hora|hr)s?|1\s*h\b|\d+\s*min\s*mix)\b/i;

/** Uma época e uma montagem: "Best of Alexander Isak (2025/2026)". */
const EPOCA = /\b(?:19|20)\d{2}\s*[/–-]\s*(?:(?:19|20)\d{2}|\d{2})\b/;
const MONTAGEM = /\b(?:best of|melhores momentos|highlights?|goals?|golos?|skills?|dribles?|saves?)\b/;
/**
 * Sinais conjuntos de desporto, não palavras soltas: "Goals", "Highlights"
 * e "Best of You" também podem ser títulos de músicas. Não usam a duração:
 * uma montagem de golos costuma durar os mesmos quatro minutos de uma faixa.
 */
const DESPORTO_NO_TITULO = [
  /\b(?:match|football|soccer|basketball|nba|nfl)\s+highlights?\b/,
  /\b(?:resumo|melhores momentos)\s+d[oa]\s+(?:jogo|partida)\b/,
  /\bmelhores\s+(?:golos|dribles|jogadas)\b/,
  /\b(?:goals?|golos?|skills?|dribles?)\s*(?:&|and|e|\+|\/)\s*(?:goals?|golos?|assists?|assistencias?|skills?|dribles?)\b/,
];

/**
 * Uma reação, em inglês, português e espanhol (31/10: "TJI REAGE A VÍCIOS"
 * chegou a um amigo do João pelas recomendações -- a lista só tinha "reaction",
 * "react" e "reagindo"). Por palavra inteira, e também no NOME DO CANAL: há
 * canais de reações que publicam com o título da música a que reagem. As outras
 * palavras não se procuram no canal: "Huey Lewis and the News" é música.
 */
const REACAO = /\b(?:reage|reagem|reagi|reagimos|reagir|reagindo|reacao|reacoes|reacciono|reaccionamos|reacciona|reaccionan|reaccionando|reaccion|reaction|reactions|reacts|reacting|react to)\b/;

const semAcentos = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export type FaixaParaAvaliar = {
  title: string;
  durationSeconds?: number | null;
  /** O artista ou o canal, quando se sabe. */
  artist?: string | null;
};

export function pareceMusica(t: FaixaParaAvaliar): boolean {
  const titulo = (t.title ?? '').toLowerCase();
  if (!titulo.trim()) return false;

  // A duração é o sinal forte. Quando é desconhecida NÃO se rejeita: muitos
  // resultados vêm sem ela, e descartá-los deixava a lista vazia.
  const d = t.durationSeconds;
  if (typeof d === 'number' && d > 0) {
    if (d < MINIMO_S || d > MAXIMO_S) return false;
  }

  const limpo = semAcentos(titulo);
  if (REACAO.test(limpo) || REACAO.test(semAcentos(t.artist ?? ''))) return false;
  if ((EPOCA.test(limpo) && MONTAGEM.test(limpo))
    || DESPORTO_NO_TITULO.some((sinal) => sinal.test(limpo))) return false;
  if (DURACAO_NO_TITULO.test(titulo)) return false;
  // Sem acentos (31/10): "An\u00e1lise", "Not\u00edcias" e "Epis\u00f3dio" passavam, porque a
  // lista est\u00e1 escrita sem eles.
  for (const palavra of NAO_E_MUSICA) {
    if (limpo.includes(palavra)) return false;
  }
  return true;
}
