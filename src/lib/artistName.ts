/**
 * Extração do artista REAL de faixas do YouTube.
 *
 * Problema: o YouTube devolve o nome do CANAL como "artista" — a mesma música
 * postada por canais diferentes cria "artistas" diferentes na biblioteca, e a
 * página de Artistas fragmenta-se (um artista por canal).
 *
 * Heurísticas, por ordem de fiabilidade:
 *  1. Canais auto-gerados "<Artista> - Topic" — o YouTube gera-os a partir dos
 *     metadados oficiais da editora; o nome antes de " - Topic" É o artista.
 *  2. Convenção dominante nos títulos: "Artista - Título (…)". O lado esquerdo
 *     do primeiro " - " (ou en/em dash) é o artista. Cortamos "feat./ft." para
 *     o artista principal agrupar com as músicas a solo.
 *  3. Canais VEVO ("TheWeekndVEVO") — remove o sufixo e separa o CamelCase.
 *  4. Fallback: o próprio canal, limpo de sufixos comuns ("Official", etc.).
 *
 * Funções puras (testáveis em Node puro — ver scripts/test-artist-name.mjs).
 */

const FEAT_RE = /\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i;

function clean(s: string): string {
  return s
    .replace(/[«»“”„]/g, '')
    .replace(FEAT_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function extractArtist(title: string | null, channel: string | null): string | null {
  // 1) Canal auto-gerado "Artista - Topic" — a fonte mais fiável
  if (channel && / - Topic$/.test(channel)) {
    const name = clean(channel.replace(/ - Topic$/, ''));
    if (name) return name;
  }

  // 2) Título "Artista - Título" (dash com espaços à volta, para não partir
  //    palavras hifenizadas; aceita hífen, en dash e em dash)
  if (title) {
    const m = title.match(/^(.{2,60}?)\s+[-–—]\s+.+$/);
    if (m) {
      const candidate = clean(m[1]);
      // rejeita candidatos que claramente não são nomes (só dígitos, vazio)
      if (candidate.length >= 2 && !/^\d+$/.test(candidate)) {
        return candidate;
      }
    }
  }

  if (channel) {
    // 3) Canais VEVO: "TheWeekndVEVO" -> "The Weeknd"
    const vevo = channel.match(/^(.+?)\s*VEVO$/i);
    if (vevo) {
      const name = clean(vevo[1].replace(/([a-z])([A-Z])/g, '$1 $2'));
      if (name) return name;
    }
    // 4) Fallback: canal limpo de sufixos de marketing comuns
    const name = clean(channel.replace(/\s*[-–—|]?\s*(?:official|oficial)\s*$/i, ''));
    if (name) return name;
  }

  return null;
}

/** Nome de artista a mostrar/agrupar para uma faixa (qualquer fonte).
 * Para faixas do Spotify o artist já é fiável; a extração só se aplica ao
 * YouTube (onde artist = canal). */
export function displayArtist(t: {
  source?: string;
  title: string;
  artist: string | null;
}): string {
  if (t.source && t.source !== 'youtube') return t.artist ?? 'Unknown artist';
  return extractArtist(t.title, t.artist) ?? t.artist ?? 'Unknown artist';
}
