/**
 * A identidade de uma MÚSICA, para lá do upload.
 *
 * O Smart Shuffle usa isto para não sugerir o que ele já guardou, o que já lhe
 * sugeriu e o que já está na fila -- noutro vídeo do YouTube. A receita antiga
 * era `artista|título` com a normalização do catálogo, e medida a 14/9 contra 31
 * pares de títulos reais só reconhecia 24: deixava passar uma favorita com
 * `ft. Drake` fora de parênteses, "Official Video" ou "Audio" sem parênteses,
 * `| Official Video`, `prod. Nick Mira`, artistas separados por vírgula
 * ("Drake, 21 Savage - Rich Flex") e títulos invertidos num canal de letras
 * ("Robbery - Juice WRLD"). Testado em `scripts/test-identidade-da-musica.ts`.
 *
 * Três ideias, todas para o lado de reconhecer MAIS a mesma música sem juntar
 * músicas diferentes (os pares de controlo do teste prendem isso):
 *  - o título perde as caudas de créditos e as marcas de upload;
 *  - há uma chave por cada artista possível (cada um de uma colaboração, e o
 *    canal sem "- Topic"/VEVO), e basta uma coincidir;
 *  - a ordem artista/título não conta, que é o que apanha os títulos invertidos
 *    que o extractor lê ao contrário.
 */
import { chaveDeArtista, displayArtist, tituloDaFaixa } from './artistName';
import { normalizar } from './catalogoDaFaixa';
import { chavesDaSugestao } from './smartShuffle';
import { trackKey } from './shuffle';
import type { Track } from '../types';

export type FaixaParaIdentificar = Pick<Track, 'source' | 'sourceId' | 'title' | 'artist'>;

/** Já normalizado (minúsculas, sem pontuação): o que vem a seguir não é o título. */
const CAUDA_DE_CREDITOS = /\s(?:ft|feat|featuring|prod|produced by)\s.*$/;
/** Uma marca de upload no FIM, fora de parênteses (esses o `normalizar` já tira). */
const MARCA_NO_FIM = /\s(?:official\s)?(?:music\s)?(?:video|audio|visualizer|lyric video|lyrics?|videoclip(?:\soficial)?|clipe(?:\soficial)?)$/;
/** Onde se corta uma colaboração. A vírgula entra aqui e só aqui: "Tyler, The
 *  Creator" ganha duas chaves a mais, o que só alarga o reconhecimento. */
const SEPARADOR_DE_ARTISTAS = /\s*(?:,|&|\sx\s|\sfeat\.?\s|\sft\.?\s)\s*/i;

export function tituloDeIdentidade(bruto: string): string {
  let t = normalizar(((bruto ?? '').split(/\s+\|\s+/)[0]) ?? '');
  const semCreditos = t.replace(CAUDA_DE_CREDITOS, '').trim();
  if (semCreditos) t = semCreditos;
  // Nunca até ficar vazio: uma música que se chama "Audio" continua a ter nome.
  for (let i = 0; i < 3; i++) {
    const semMarca = t.replace(MARCA_NO_FIM, '').trim();
    if (!semMarca || semMarca === t) break;
    t = semMarca;
  }
  return t;
}

function artistasPossiveis(track: FaixaParaIdentificar): Set<string> {
  const desconhecido = chaveDeArtista('Unknown artist');
  const chaves = new Set<string>();
  for (const bruto of [displayArtist(track), track.artist]) {
    if (!bruto) continue;
    const limpo = bruto.replace(/\s*-\s*topic$/i, '').replace(/\s*vevo$/i, '').trim();
    for (const parte of [limpo, ...limpo.split(SEPARADOR_DE_ARTISTAS)]) {
      const k = chaveDeArtista(parte);
      if (k && k !== desconhecido) chaves.add(k);
    }
  }
  return chaves;
}

/**
 * Todas as chaves de uma faixa: o upload, a chave no formato de antes (é o que
 * a memória dos 30 dias já tem guardado) e as variantes novas. Duas faixas são
 * a mesma música quando partilham uma chave que não seja o upload.
 */
export function chavesDaMusica(track: FaixaParaIdentificar): string[] {
  const antigas = chavesDaSugestao(
    trackKey(track),
    chaveDeArtista(displayArtist(track)) ?? '',
    normalizar(tituloDaFaixa(track)),
  );
  const titulo = tituloDeIdentidade(tituloDaFaixa(track));
  const novas = new Set<string>();
  if (titulo) {
    for (const artista of artistasPossiveis(track)) {
      const titulos = [titulo];
      const semArtista = semOArtistaAFrente(titulo, artista);
      if (semArtista) titulos.push(semArtista);
      for (const t of titulos) {
        // Sem espaços dos DOIS lados: "blink-182" dá "blink 182" num sítio e
        // "blink182" noutro, e a ordem artista/título tem de continuar a não
        // contar para os títulos invertidos.
        const a = compacto(artista), m = compacto(t);
        if (!a || !m) continue;
        const [p, q] = a <= m ? [a, m] : [m, a];
        novas.add(`musica2:${p}|${q}`);
      }
    }
  }
  return [...new Set([...antigas, ...novas])];
}

const compacto = (s: string) => s.replace(/\s+/g, '');

/**
 * O título sem o nome do artista à frente, quando o upload não pôs hífen:
 * `Juice WRLD "Righteous"` dá "juice wrld righteous". Compara sem espaços, para
 * "blink 182 all the small things" largar o artista "blink182". Só corta em
 * fronteira de palavra, e nunca o título inteiro.
 */
function semOArtistaAFrente(titulo: string, artista: string): string | null {
  const alvo = compacto(artista);
  if (!alvo) return null;
  const palavras = titulo.split(' ');
  let acumulado = '';
  for (let i = 0; i < palavras.length - 1; i++) {
    acumulado += palavras[i];
    if (acumulado === alvo) return palavras.slice(i + 1).join(' ');
    if (!alvo.startsWith(acumulado)) return null;
  }
  return null;
}
