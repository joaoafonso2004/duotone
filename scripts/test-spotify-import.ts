import {
  importSpotifyCsv,
  confidentTracks,
  uncertainResults,
  missingResults,
  type SearchHit,
} from '../src/lib/spotifyImport.ts';
import type { SpotifyCsvRow } from '../src/lib/spotifyCsv.ts';

let bad = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (!cond) bad++;
  console.log(`  ${cond ? 'ok   ' : 'FALHA'} ${label}${extra ? '  -> ' + extra : ''}`);
};

const row = (title: string, artist = 'Artista', uri = `spotify:track:${title}`): SpotifyCsvRow => ({
  title,
  artist,
  album: 'Album',
  durationMs: 200_000,
  uri,
});

/** Pesquisa falsa: devolve um resultado perfeito para o título pedido. */
const hit = (title: string, artist: string, durationSec: number, channel: string): SearchHit => ({
  channel,
  track: {
    source: 'youtube',
    sourceId: 'id-' + title,
    title: `${artist} - ${title}`,
    artist,
    album: null,
    artworkUrl: null,
    durationSeconds: durationSec,
  },
});

async function main() {
  // 1. Caminho normal: tudo encontrado com confiança.
  const rows = [row('Uma'), row('Duas'), row('Tres'), row('Quatro'), row('Cinco')];
  let calls = 0;
  const good = await importSpotifyCsv({
    rows,
    search: async (q) => {
      calls++;
      const name = q.split(' ').slice(1).join(' ');
      return [hit(name, 'Artista', 200, 'Artista - Topic')];
    },
  });
  check('processa todas as linhas', good.length === 5, String(good.length));
  check('todas confiantes', confidentTracks(good).length === 5, String(confidentTracks(good).length));
  check('uma pesquisa por faixa', calls === 5, String(calls));

  // 2. Sem resultados -> conta como em falta, não rebenta.
  const empty = await importSpotifyCsv({ rows: [row('Fantasma')], search: async () => [] });
  check('sem resultados vira "em falta"', missingResults(empty).length === 1);
  check('sem resultados não conta como confiante', confidentTracks(empty).length === 0);

  // 3. Erro de rede numa faixa não derruba a importação.
  const flaky = await importSpotifyCsv({
    rows: [row('Boa'), row('Falha'), row('Outra')],
    search: async (q) => {
      if (q.includes('Falha')) throw new Error('rede em baixo');
      const name = q.split(' ').slice(1).join(' ');
      return [hit(name, 'Artista', 200, 'Artista - Topic')];
    },
  });
  check('continua depois de um erro', flaky.length === 3, String(flaky.length));
  check('a que falhou fica em falta', missingResults(flaky).length === 1);
  check('as outras entram na mesma', confidentTracks(flaky).length === 2);

  // 4. Correspondência fraca -> revisão, não entra às cegas.
  //
  // A primeira versão deste teste usava dois candidatos e chamava-lhe
  // "ambíguo", mas não era: título, artista e duração exatos contra uma
  // versão ao vivo 140s mais longa é uma escolha óbvia, e o código acertava.
  // A incerteza a sério é o melhor candidato ser fraco -- foi o que
  // aconteceu com faixas reais em que o YouTube só tem re-uploads.
  const weak = await importSpotifyCsv({
    rows: [row('Dupla')],
    search: async () => [hit('Outra Coisa', 'Artista', 320, 'Canal Aleatorio')],
  });
  check('correspondência fraca vai para revisão', uncertainResults(weak).length === 1);
  check('correspondência fraca não entra sozinha', confidentTracks(weak).length === 0);

  // As alternativas viajam com o resultado, para a revisão não voltar à rede.
  const withAlts = await importSpotifyCsv({
    rows: [row('Dupla')],
    search: async () => [
      hit('Outra Coisa', 'Artista', 320, 'Canal A'),
      hit('Mais Outra', 'Artista', 310, 'Canal B'),
      hit('Terceira', 'Artista', 300, 'Canal C'),
    ],
  });
  check('guarda alternativas', withAlts[0]!.alternatives.length === 2, String(withAlts[0]!.alternatives.length));
  check(
    'a escolhida não se repete nas alternativas',
    !withAlts[0]!.alternatives.some((a) => a.sourceId === withAlts[0]!.track?.sourceId)
  );

  // Título, artista e duração exatos entram, mesmo sem canal oficial: é a
  // duração que separa gravações, e bater ao segundo é sinal forte.
  const exact = await importSpotifyCsv({
    rows: [row('Dupla')],
    search: async () => [
      hit('Dupla', 'Artista', 200, 'Canal Aleatorio'),
      hit('Dupla ao vivo', 'Artista', 340, 'Outro Canal'),
    ],
  });
  check('exata entra apesar do canal desconhecido', confidentTracks(exact).length === 1);

  // 5. Progresso: chega ao fim com os números certos.
  const seen: number[] = [];
  let last: any = null;
  await importSpotifyCsv({
    rows,
    search: async (q) => [hit(q.split(' ').slice(1).join(' '), 'Artista', 200, 'Artista - Topic')],
    onProgress: (p) => {
      seen.push(p.done);
      last = p;
    },
  });
  check('progresso é monótono', seen.every((v, i) => i === 0 || v > seen[i - 1]!), seen.join(','));
  check('progresso acaba no total', last?.done === 5 && last?.total === 5);
  check('contagem de confiantes certa', last?.confident === 5, String(last?.confident));

  // 6. Cancelamento a meio.
  const controller = new AbortController();
  const many = Array.from({ length: 30 }, (_, i) => row('T' + i));
  const cancelled = await importSpotifyCsv({
    rows: many,
    signal: controller.signal,
    search: async (q) => {
      if (controller.signal.aborted) return [];
      controller.abort();
      return [hit(q.split(' ').slice(1).join(' '), 'Artista', 200, 'Artista - Topic')];
    },
  });
  check('cancelar interrompe cedo', cancelled.length < many.length, `${cancelled.length}/${many.length}`);

  // 7. Retoma: as já resolvidas não voltam à rede.
  let networkCalls = 0;
  const cache = new Map(
    good.slice(0, 3).map((r) => [r.row.uri!, r] as const)
  );
  const resumed = await importSpotifyCsv({
    rows,
    resumeFrom: cache,
    search: async (q) => {
      networkCalls++;
      return [hit(q.split(' ').slice(1).join(' '), 'Artista', 200, 'Artista - Topic')];
    },
  });
  check('retoma devolve tudo', resumed.length === 5, String(resumed.length));
  check('retoma só pesquisa o que falta', networkCalls === 2, String(networkCalls));

  // 8. A pesquisa em baixo pára a importação, em vez de dizer que não
  //    encontrou nada. Era isto: um erro de CORS no Electron fazia rebentar
  //    todas as pesquisas, e como cada falha virava "not found", duas mil
  //    faixas davam duas mil não-encontradas sem um único erro à vista.
  let tentativas = 0;
  let rebentou = '';
  try {
    await importSpotifyCsv({
      rows: Array.from({ length: 60 }, (_, i) => row('Faixa' + i)),
      search: async () => {
        tentativas++;
        throw new Error('InnerTube HTTP 403');
      },
    });
  } catch (e: any) {
    rebentou = e?.message ?? '';
  }
  check('pesquisa sempre em baixo pára a importação', !!rebentou, rebentou);
  check('pára cedo, não percorre as 60 faixas', tentativas < 60, String(tentativas));

  // E o contador reinicia: falhas espalhadas pelo meio não são uma avaria.
  let n = 0;
  const intermitente = await importSpotifyCsv({
    rows: Array.from({ length: 30 }, (_, i) => row('Salta' + i)),
    search: async (q) => {
      n++;
      if (n % 2 === 0) throw new Error('rede');
      return [hit(q.split(' ').slice(1).join(' '), 'Artista', 200, 'Artista - Topic')];
    },
  });
  check('falhas alternadas não param nada', intermitente.length === 30, String(intermitente.length));

  console.log(bad ? `\n  ${bad} falha(s)` : `\n  Todos os casos passaram.`);
  process.exit(bad ? 1 : 0);
}

main();
