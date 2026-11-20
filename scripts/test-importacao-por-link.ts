// Importar uma playlist por link (lib/importacaoPorLink.ts), sem rede.
import assert from 'node:assert/strict';
import { ErroDaImportacao, importarPorLink, lerPlaylist, type Dependencias, type Progresso } from '../src/lib/importacaoPorLink.ts';
import { frasesDaImportacao } from '../src/lib/frasesDaImportacao.ts';

let falhas = 0;
const caso = async (nome: string, fn: () => Promise<void>) => {
  try { await fn(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
};
const faixa = (id: string) => ({ source: 'youtube' as const, sourceId: id, title: id, artist: null, album: null, artworkUrl: null, durationSeconds: 200 });

function duplo(over: Partial<Dependencias> = {}) {
  const criadas: string[] = [];
  const adicionadas: Record<string, string[]> = {};
  const deps: Dependencias = {
    lerSpotify: async () => ({ nome: 'Rap PT', capa: null, faixas: ['a', 'b', 'c', 'd'].map((t) => ({ title: t, artist: 'X', album: null, durationMs: 1, uri: `spotify:track:${t}` })) }),
    lerYouTube: async () => ({ title: 'Mix', items: [{ videoId: 'v1', title: 'V1', channel: 'C' }, { videoId: 'v2', title: 'V2' }] }),
    resolver: async (linhas, aoAvancar) => {
      linhas.forEach((_, i) => aoAvancar(i + 1));
      return [
        { track: faixa('A'), confident: true },
        { track: faixa('B'), confident: false },
        { track: null, confident: false },
        { track: faixa('A'), confident: true },
      ];
    },
    criarPlaylist: async (nome) => { criadas.push(nome); return { id: `pl-${criadas.length}` }; },
    adicionar: async (id, fs) => { adicionadas[id] = fs.map((f) => f.sourceId); },
    ...over,
  };
  return { deps, criadas, adicionadas };
}

await caso('Spotify: só as de confiança entram, sem repetidas, e diz quantas ficaram de fora', async () => {
  const { deps, criadas, adicionadas } = duplo();
  const passos: Progresso[] = [];
  const r = await importarPorLink({ tipo: 'spotify', id: 'x' }, deps, (p) => passos.push(p));
  assert.deepEqual(criadas, ['Rap PT']);
  assert.deepEqual(adicionadas['pl-1'], ['A']);
  assert.deepEqual({ ad: r.adicionadas, fora: r.deFora, cortada: r.cortada }, { ad: 1, fora: 3, cortada: false });
  assert.equal(passos[0].fase, 'a-ler');
  assert.ok(passos.some((p) => p.fase === 'a-procurar' && p.feitas === 4 && p.total === 4), 'o progresso chega ao total');
  assert.equal(passos.at(-1)!.fase, 'a-guardar');
});
await caso('Spotify privada ou página mudada: erro claro e nenhuma playlist criada', async () => {
  const { deps, criadas } = duplo({ lerSpotify: async () => null });
  await assert.rejects(importarPorLink({ tipo: 'spotify', id: 'x' }, deps, () => {}), (e: any) => e instanceof ErroDaImportacao && e.motivo === 'privada-ou-mudou');
  assert.equal(criadas.length, 0);
});
await caso('nada encontrado: não deixa uma playlist vazia', async () => {
  const { deps, criadas } = duplo({ resolver: async () => [{ track: null, confident: false }] });
  await assert.rejects(importarPorLink({ tipo: 'spotify', id: 'x' }, deps, () => {}), (e: any) => e.motivo === 'nada-encontrado');
  assert.equal(criadas.length, 0);
});
await caso('uma playlist de 100 diz que pode ter sido cortada', async () => {
  const cem = Array.from({ length: 100 }, (_, i) => ({ title: `t${i}`, artist: 'X', album: null, durationMs: 1, uri: null }));
  const { deps } = duplo({
    lerSpotify: async () => ({ nome: 'Grande', capa: null, faixas: cem }),
    resolver: async (l) => l.map((_, i) => ({ track: faixa(`y${i}`), confident: true })),
  });
  const r = await importarPorLink({ tipo: 'spotify', id: 'x' }, deps, () => {});
  assert.equal(r.adicionadas, 100);
  assert.equal(r.cortada, true);
});
await caso('Spotify para lá das 100 (20/11): o leitor web lê o resto, e o nome fica o do embed', async () => {
  const linhas = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `t${i}`, artist: 'X', album: null, durationMs: 1, uri: null }));
  const pedidos: string[] = [];
  const base = {
    lerSpotify: async () => ({ nome: 'Grande', capa: 'capa.jpg', faixas: linhas(100) }),
    resolver: async (l: unknown[]) => l.map((_, i) => ({ track: faixa(`y${i}`), confident: true })),
  };
  const { deps, criadas } = duplo({ ...base, lerSpotifyInteira: async (id) => { pedidos.push(id); return { linhas: linhas(342), total: 342 }; } });
  const l = await lerPlaylist({ tipo: 'spotify', id: 'abc' }, deps);
  assert.deepEqual(pedidos, ['abc']);
  assert.deepEqual({ nome: l.nome, capa: l.capa, total: l.total, cortada: l.cortada, limite: l.limite },
    { nome: 'Grande', capa: 'capa.jpg', total: 342, cortada: false, limite: null });
  const r = await importarPorLink({ tipo: 'spotify', id: 'abc' }, deps, () => {});
  assert.deepEqual({ ad: r.adicionadas, cortada: r.cortada }, { ad: 342, cortada: false });
  assert.deepEqual(criadas, ['Grande']);

  // Mais de 1000: as primeiras 1000, e diz-se que foi o máximo por importação.
  const mil = duplo({ ...base, lerSpotifyInteira: async () => ({ linhas: linhas(1000), total: 1530 }) });
  const lm = await lerPlaylist({ tipo: 'spotify', id: 'abc' }, mil.deps);
  assert.deepEqual({ total: lm.total, cortada: lm.cortada, limite: lm.limite }, { total: 1000, cortada: true, limite: 1000 });

  // Exatamente 100: o leitor confirma, e já não se diz que foi cortada.
  const cem = duplo({ ...base, lerSpotifyInteira: async () => ({ linhas: linhas(100), total: 100 }) });
  const lc = await lerPlaylist({ tipo: 'spotify', id: 'abc' }, cem.deps);
  assert.deepEqual({ total: lc.total, cortada: lc.cortada }, { total: 100, cortada: false });
});
await caso('Spotify: o leitor web falha ou lê menos do que o embed, e ficam as 100 como antes', async () => {
  const linhas = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `t${i}`, artist: 'X', album: null, durationMs: 1, uri: null }));
  const lerSpotify = async () => ({ nome: 'Grande', capa: null, faixas: linhas(100) });
  for (const lerSpotifyInteira of [
    async () => { throw new Error('desligado'); },
    async () => null,
    async () => ({ linhas: linhas(40), total: 342 }),
  ]) {
    const { deps } = duplo({ lerSpotify, lerSpotifyInteira });
    const l = await lerPlaylist({ tipo: 'spotify', id: 'abc' }, deps);
    assert.deepEqual({ total: l.total, cortada: l.cortada, limite: l.limite }, { total: 100, cortada: true, limite: 100 });
  }
});
await caso('Spotify abaixo das 100: o leitor web nem se abre', async () => {
  let abriu = false;
  const { deps } = duplo({ lerSpotifyInteira: async () => { abriu = true; return null; } });
  const l = await lerPlaylist({ tipo: 'spotify', id: 'abc' }, deps);
  assert.equal(abriu, false);
  assert.equal(l.total, 4);
});
await caso('YouTube: os vídeos entram todos, sem procurar nada', async () => {
  let procurou = false;
  const { deps, criadas, adicionadas } = duplo({ resolver: async () => { procurou = true; return []; } });
  const r = await importarPorLink({ tipo: 'youtube', id: 'PLx' }, deps, () => {});
  assert.equal(procurou, false);
  assert.deepEqual(criadas, ['Mix']);
  assert.deepEqual(adicionadas['pl-1'], ['v1', 'v2']);
  assert.equal(r.adicionadas, 2);
});

await frases();
console.log(falhas ? `\n  ${falhas} falha(s)` : '\n  Importação por link: todos os casos passaram.');
process.exit(falhas ? 1 : 0);

async function frases() {
  await caso('a barra diz onde vai, e no fim o que entrou', async () => {
    const base = { tipo: 'spotify' as const, nome: 'Rap PT', feitas: 34, total: 87 };
    const a = frasesDaImportacao({ ...base, estado: 'a-procurar' }, 1);
    assert.equal(a.titulo, 'Importing Rap PT');
    assert.equal(a.linha, '34 of 87 songs · 1 more after this');
    assert.ok(Math.abs(a.fracao! - 34 / 87) < 1e-9);
    const f = frasesDaImportacao({ ...base, estado: 'feita', resultado: { adicionadas: 80, deFora: 7, cortada: false } }, 0);
    assert.equal(f.titulo, 'Rap PT is in your playlists');
    assert.equal(f.linha, '80 songs · 7 not found');
    assert.equal(frasesDaImportacao({ ...base, estado: 'feita', resultado: { adicionadas: 1, deFora: 0, cortada: true } }, 0).linha, '1 song · first 100 only');
    assert.equal(frasesDaImportacao({ ...base, nome: null, estado: 'a-ler' }, 0).titulo, 'Importing Spotify playlist');
    assert.equal(frasesDaImportacao({ ...base, estado: 'falhou', erro: 'Nope.' }, 0).linha, 'Nope.');
  });
}
