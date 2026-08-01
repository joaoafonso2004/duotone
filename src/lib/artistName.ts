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

const KNOWN_ARTISTS = [
  'Juice WRLD', 'The Weeknd', 'Drake', 'Eminem', 'Billie Eilish', 
  'Travis Scott', 'Taylor Swift', 'Kanye West', 'Post Malone', 
  'Kendrick Lamar', 'J. Cole', 'Lil Baby', 'Lil Peep', 'Mac Miller', 
  'XXXTentacion', 'Justin Bieber', 'Ariana Grande', 'Ed Sheeran', 
  'Rihanna', 'Dua Lipa', 'Coldplay', 'Imagine Dragons', 'Bruno Mars',
  'Lil Uzi Vert', 'Gunna', 'Playboi Carti', 'Young Thug', 'Future',
  '21 Savage', 'A$AP Rocky', 'Tyler, The Creator', 'Frank Ocean',
  'Lana Del Rey', 'Olivia Rodrigo', 'Harry Styles', 'Shawn Mendes',
  'Selena Gomez', 'Camila Cabello', 'Halsey', 'Khalid', 'SZA',
  'Doja Cat', 'Cardi B', 'Megan Thee Stallion', 'Nicki Minaj',
  'Lil Nas X', 'DaBaby', 'Roddy Ricch', 'Jack Harlow', 'Kid Cudi'
];

export function extractArtist(title: string | null, channel: string | null): string | null {
  // 1) Canal auto-gerado "Artista - Topic" — a fonte mais fiável
  if (channel && / - Topic$/.test(channel)) {
    const name = clean(channel.replace(/ - Topic$/, ''));
    if (name) return name;
  }

  // 2) Título "Artista - Título" (dash com espaços à volta)
  if (title) {
    const m = title.match(/^(.{2,60}?)\s+[-–—]\s+.+$/);
    if (m) {
      const candidate = clean(m[1]);
      if (candidate.length >= 2 && !/^\d+$/.test(candidate)) {
        return candidate;
      }
    }
  }

  // 3) Canais VEVO: "TheWeekndVEVO" -> "The Weeknd"
  if (channel) {
    const vevo = channel.match(/^(.+?)\s*VEVO$/i);
    if (vevo) {
      const name = clean(vevo[1].replace(/([a-z])([A-Z])/g, '$1 $2'));
      if (name) return name;
    }
  }

  // 4) Título contém artista conhecido (ex: "juice wrld wishing well" sem hífen)
  if (title) {
    const titleWithoutFeat = title.replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i, '');
    for (const artist of KNOWN_ARTISTS) {
      const escaped = artist.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp('\\b' + escaped + '\\b', 'i');
      if (regex.test(titleWithoutFeat)) {
        return artist;
      }
    }
  }

  // 5) Canal contém artista conhecido (ex: "Juice WRLD Fanpage")
  if (channel) {
    for (const artist of KNOWN_ARTISTS) {
      const escaped = artist.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp('\\b' + escaped + '\\b', 'i');
      if (regex.test(channel)) {
        return artist;
      }
    }
  }

  // 6) Fallback: canal limpo de sufixos de marketing comuns
  if (channel) {
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
