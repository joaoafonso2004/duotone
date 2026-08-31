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
  'reaction', 'reagindo', 'react',
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

export type FaixaParaAvaliar = {
  title: string;
  durationSeconds?: number | null;
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

  if (DURACAO_NO_TITULO.test(titulo)) return false;
  for (const palavra of NAO_E_MUSICA) {
    if (titulo.includes(palavra)) return false;
  }
  return true;
}
