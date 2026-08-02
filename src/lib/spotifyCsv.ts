import type { MatchTarget } from './trackMatch';

/**
 * Leitura de CSV exportado do Spotify (formato do Exportify).
 *
 * O Duotone não fala com o Spotify: o utilizador exporta as playlists dele
 * numa ferramenta externa e a app lê o ficheiro. É isso que evita
 * credenciais dentro da app, o limite de utilizadores em Development Mode,
 * o tecto de 100 faixas e a exigência de Premium.
 *
 * As colunas são detetadas pelo NOME, nunca pela posição: o Exportify tem
 * campos opcionais (géneros, audio features) que deslocam tudo conforme as
 * caixas que o utilizador escolheu na exportação.
 *
 * Os cabeçalhos vêm no idioma da conta Spotify — um export português diz
 * "Nome da faixa", não "Track Name". Como não dá para listar todos os
 * idiomas, há um segundo mecanismo que identifica as colunas pelo CONTEÚDO
 * (`spotify:track:`, `spotify:artist:`, ...), que é igual em toda a parte.
 */

/** Uma linha do CSV já interpretada, antes de virar faixa. */
export interface SpotifyCsvRow {
  title: string;
  artist: string;
  album: string | null;
  durationMs: number | null;
  /** `spotify:track:...` — serve de chave estável para cache e deduplicação. */
  uri: string | null;
}

export interface ParseResult {
  rows: SpotifyCsvRow[];
  /** Linhas ignoradas por não terem título ou artista. */
  skipped: number;
  /** Cabeçalhos encontrados, para diagnóstico quando algo corre mal. */
  headers: string[];
  /**
   * Só preenchido quando a leitura falha por inteiro. Distingue "o ficheiro
   * não serve" de "o ficheiro está vazio" — sem isto, um export num idioma
   * desconhecido aparecia como uma playlist de zero faixas, sem explicação.
   */
  problem?: 'empty' | 'unrecognised-columns';
}

/**
 * Divide texto CSV em células, respeitando aspas.
 *
 * Um `split(',')` ingénuo parte em qualquer título com vírgula — e há muitos.
 * As aspas também podem conter quebras de linha, por isso a divisão em linhas
 * tem de acontecer aqui dentro, e não antes.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  // BOM: o Excel adiciona-o e ele cola-se ao primeiro cabeçalho, fazendo
  // com que "Track Name" deixe de corresponder.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        // Aspas duplicadas dentro de um campo representam uma aspa literal.
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      // \r\n conta como uma quebra só.
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/**
 * Sem acentos e sem maiúsculas.
 *
 * O acento é retirado por dois motivos: para "album" encontrar "álbum", e
 * porque o mesmo caractere pode vir composto (á) ou decomposto (a + acento)
 * conforme o sistema onde o ficheiro foi gravado — visualmente idênticos,
 * diferentes para o `===`.
 */
const COMBINING_FIRST = 0x0300;
const COMBINING_LAST = 0x036f;

const stripAccents = (s: string) =>
  s
    .normalize('NFD')
    .split('')
    .filter((c) => {
      const code = c.charCodeAt(0);
      return code < COMBINING_FIRST || code > COMBINING_LAST;
    })
    .join('');

const normaliseHeader = (h: string) =>
  stripAccents(h).trim().toLowerCase().replace(/\s+/g, ' ');

/** Primeiro cabeçalho que corresponde a um dos nomes aceites. */
function findColumn(headers: string[], candidates: string[]): number {
  const normalised = headers.map(normaliseHeader);
  for (const candidate of candidates) {
    const index = normalised.indexOf(candidate);
    if (index !== -1) return index;
  }
  // Segunda tentativa, por prefixo: apanha variações como
  // "Track Duration (ms)" quando se procura "track duration".
  for (const candidate of candidates) {
    const index = normalised.findIndex((h) => h.startsWith(candidate));
    if (index !== -1) return index;
  }
  return -1;
}

/**
 * Identifica as colunas pelo que está lá dentro, quando o cabeçalho vem num
 * idioma que não conhecemos.
 *
 * Os URIs do Spotify (`spotify:track:`, `spotify:artist:`, `spotify:album:`)
 * não são traduzidos, e no export cada URI é imediatamente seguido do nome
 * correspondente. Isso chega para localizar título, artista e álbum sem
 * perceber uma palavra do cabeçalho.
 */
function detectByContent(table: string[][]): {
  title: number;
  artist: number;
  album: number;
  duration: number;
  uri: number;
} {
  // Uma amostra chega e evita percorrer ficheiros de milhares de linhas.
  const sample = table.slice(1, 51);
  const columnCount = table.reduce((max, r) => Math.max(max, r.length), 0);

  const values = (col: number) =>
    sample.map((r) => (r[col] ?? '').trim()).filter((v) => v !== '');

  /** Coluna em que a esmagadora maioria dos valores obedece ao padrão. */
  const columnMatching = (re: RegExp) => {
    for (let c = 0; c < columnCount; c++) {
      const vals = values(c);
      if (!vals.length) continue;
      if (vals.filter((v) => re.test(v)).length / vals.length > 0.8) return c;
    }
    return -1;
  };

  /** O nome vem logo a seguir ao URI — desde que não seja outro URI/link. */
  const nameAfter = (uriCol: number) => {
    if (uriCol === -1) return -1;
    const candidate = uriCol + 1;
    const vals = values(candidate);
    if (!vals.length) return -1;
    return vals.every((v) => !/^(spotify:|https?:)/i.test(v)) ? candidate : -1;
  };

  const uri = columnMatching(/^spotify:track:/i);
  const artistUri = columnMatching(/^spotify:artist:/i);
  const albumUri = columnMatching(/^spotify:album:/i);

  // Duração: números na ordem de grandeza de uma faixa (20s a 30min). O
  // intervalo exclui popularidade (0-100), número de faixa e ano.
  let duration = -1;
  for (let c = 0; c < columnCount; c++) {
    const vals = values(c);
    if (!vals.length) continue;
    if (!vals.every((v) => /^\d+$/.test(v))) continue;
    const nums = vals.map(Number).sort((a, b) => a - b);
    const median = nums[Math.floor(nums.length / 2)]!;
    if (median >= 20_000 && median <= 1_800_000) {
      duration = c;
      break;
    }
  }

  return {
    title: nameAfter(uri),
    artist: nameAfter(artistUri),
    album: nameAfter(albumUri),
    duration,
    uri,
  };
}

export function parseSpotifyCsv(text: string): ParseResult {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], skipped: 0, headers: [], problem: 'empty' };

  const headers = table[0];
  let iTitle = findColumn(headers, ['track name', 'nome da faixa', 'name', 'title', 'song']);
  let iArtist = findColumn(headers, [
    'artist name(s)',
    'nome(s) do artista',
    'artist name',
    'nome do artista',
    'artist',
    'artists',
  ]);
  let iAlbum = findColumn(headers, ['album name', 'nome do album', 'album']);
  let iDuration = findColumn(headers, [
    'track duration (ms)',
    'duracao da faixa (ms)',
    'track duration',
    'duration (ms)',
    'duration',
    'duracao',
  ]);
  let iUri = findColumn(headers, ['track uri', 'uri da faixa', 'uri', 'spotify uri']);

  // O cabeçalho vem no idioma da conta. Quando não o reconhecemos, o
  // conteúdo diz-nos o que o nome não disse.
  if (iTitle === -1 || iArtist === -1) {
    const guess = detectByContent(table);
    if (iTitle === -1) iTitle = guess.title;
    if (iArtist === -1) iArtist = guess.artist;
    if (iAlbum === -1) iAlbum = guess.album;
    if (iDuration === -1) iDuration = guess.duration;
    if (iUri === -1) iUri = guess.uri;
  }

  if (iTitle === -1 || iArtist === -1) {
    return { rows: [], skipped: 0, headers, problem: 'unrecognised-columns' };
  }

  const rows: SpotifyCsvRow[] = [];
  let skipped = 0;

  for (let i = 1; i < table.length; i++) {
    const cells = table[i];
    const title = (cells[iTitle] ?? '').trim();
    // O Exportify junta vários artistas com vírgula dentro do mesmo campo.
    // Para pesquisar, o primeiro chega e evita consultas demasiado longas.
    const artistRaw = (cells[iArtist] ?? '').trim();
    const artist = artistRaw.split(',')[0]?.trim() ?? '';

    if (!title || !artist) {
      skipped++;
      continue;
    }

    const durationRaw = (cells[iDuration] ?? '').trim();
    const durationMs = /^\d+$/.test(durationRaw) ? Number(durationRaw) : null;

    rows.push({
      title,
      artist,
      album: (cells[iAlbum] ?? '').trim() || null,
      durationMs,
      uri: (cells[iUri] ?? '').trim() || null,
    });
  }

  return { rows, skipped, headers };
}

/** Converte para o formato que o `trackMatch` espera. */
export function toMatchTarget(row: SpotifyCsvRow): MatchTarget {
  return {
    title: row.title,
    artist: row.artist,
    durationSec: row.durationMs != null ? Math.round(row.durationMs / 1000) : null,
    album: row.album,
  };
}
