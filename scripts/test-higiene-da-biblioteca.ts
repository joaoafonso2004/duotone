/**
 * O Library check, a parte que decide -- src/lib/higieneDaBiblioteca.ts.
 * Com os helpers de nomes a sério, sobre títulos como vêm do YouTube.
 *
 * Correr: node --experimental-strip-types scripts/test-higiene-da-biblioteca.ts
 */
import assert from 'node:assert/strict';
import {
  canalOficial, capaDoVideo, chaveDeDuplicado, duracaoCurta, emParalelo, escolherQueFica, estadoDaCapa,
  gruposDeDuplicados, motivoDaIndisponivel, naoToca, resumoDoRelatorio, veredictoDaCapa,
  veredictoDoExtrator, veredictoDoOEmbed, type AjudantesDaHigiene,
} from '../src/lib/higieneDaBiblioteca.ts';
import { chaveDeArtista, displayArtist, tituloDaFaixa } from '../src/lib/artistName.ts';
import { marcasDeVersao, nucleoDoTitulo } from '../src/lib/trackMatch.ts';
import { normalizar } from '../src/lib/catalogoDaFaixa.ts';
import type { Track } from '../src/types.ts';

const aj: AjudantesDaHigiene = {
  artistaChave: (t) => chaveDeArtista(displayArtist(t)),
  titulo: (t) => tituloDaFaixa(t),
  nucleo: (titulo) => normalizar(nucleoDoTitulo(titulo)),
  marcas: (titulo) => marcasDeVersao(titulo),
};

let n = 0;
function faixa(title: string, artist: string, durationSeconds: number | null, extra: Partial<Track> = {}): Track {
  n++;
  const sourceId = extra.sourceId ?? `vid${String(n).padStart(8, '0')}`;
  return { id: `id-${n}`, source: 'youtube', sourceId, title, artist, album: null,
    artworkUrl: `https://i.ytimg.com/vi/${sourceId}/hqdefault.jpg`, durationSeconds, ...extra };
}

let falhas = 0;
async function caso(nome: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

console.log('\nduplicados: a mesma gravação, e só ela');
const topic = faixa('Lucid Dreams', 'Juice WRLD - Topic', 239);
const clipe = faixa('Juice WRLD - Lucid Dreams (Official Video)', 'Juice WRLD', 241);
await caso('o áudio do Topic e o videoclipe são a mesma música', () => {
  assert.equal(chaveDeDuplicado(topic, aj), chaveDeDuplicado(clipe, aj));
  const g = gruposDeDuplicados([clipe, topic], aj);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0]!.faixas.map((t) => t.id), [clipe.id, topic.id], 'pela ordem da biblioteca');
});
await caso('fica, por proposta, a do canal oficial', () => {
  assert.equal(gruposDeDuplicados([clipe, topic], aj)[0]!.fica.id, topic.id);
  assert.ok(canalOficial(topic));
  assert.ok(canalOficial({ artist: 'JuiceWRLDVEVO' }));
  assert.ok(!canalOficial(clipe));
});
await caso('mas nunca uma que já não toca', () => {
  assert.equal(escolherQueFica([clipe, topic], new Set([topic.sourceId])).id, clipe.id);
});
await caso('o ao vivo não é a de estúdio', () => {
  const aoVivo = faixa('Juice WRLD - Lucid Dreams (Live at Rolling Loud)', 'Juice WRLD', 240);
  assert.ok(chaveDeDuplicado(aoVivo, aj), 'a chave existe: fica de fora pela versão, não por falta de chave');
  assert.equal(gruposDeDuplicados([topic, aoVivo], aj).length, 0);
});
await caso('o slowed não é a original', () => {
  const slowed = faixa('Juice WRLD - Lucid Dreams (slowed + reverb)', 'Juice WRLD', 240);
  assert.ok(chaveDeDuplicado(slowed, aj));
  assert.equal(gruposDeDuplicados([topic, slowed], aj).length, 0);
});
await caso('duas versões de um leak não se juntam, mesmo com a mesma duração', () => {
  const v2 = faixa('Juice WRLD - At The Gate [V2]', 'Juice WRLD', 180);
  const v4 = faixa('Juice WRLD - At The Gate [V4]', 'Juice WRLD', 180);
  assert.ok(chaveDeDuplicado(v2, aj) && chaveDeDuplicado(v4, aj));
  assert.equal(gruposDeDuplicados([v2, v4], aj).length, 0);
});
await caso('durações a mais de 3 s não se juntam (a intro do videoclipe)', () => {
  const comIntro = faixa('Juice WRLD - Lucid Dreams (Official Video)', 'Juice WRLD', 250);
  assert.equal(gruposDeDuplicados([topic, comIntro], aj).length, 0);
});
await caso('sem duração, ou sem estar guardada, não se propõe', () => {
  const semDuracao = faixa('Lucid Dreams', 'Juice WRLD - Topic', null);
  const naoGuardada = faixa('Lucid Dreams', 'Juice WRLD - Topic', 240, { id: undefined });
  assert.equal(gruposDeDuplicados([clipe, semDuracao], aj).length, 0);
  assert.equal(gruposDeDuplicados([clipe, naoGuardada], aj).length, 0);
});
await caso('músicas diferentes do mesmo artista ficam separadas', () => {
  const outra = faixa('Juice WRLD - Robbery (Official Video)', 'Juice WRLD', 240);
  assert.equal(gruposDeDuplicados([topic, outra], aj).length, 0);
});
await caso('três cópias dentro da tolerância são um grupo', () => {
  const letra = faixa('Juice WRLD - Lucid Dreams (Lyrics)', 'Lyrical Lemonade', 238);
  const g = gruposDeDuplicados([topic, clipe, letra], aj);
  assert.equal(g.length, 1);
  assert.equal(g[0]!.faixas.length, 3);
});
await caso('as durações contam a partir da primeira do grupo, não em cadeia', () => {
  const a = faixa('Lucid Dreams', 'Juice WRLD - Topic', 200);
  const b = faixa('Juice WRLD - Lucid Dreams (Audio)', 'Juice WRLD', 203);
  const c = faixa('Juice WRLD - Lucid Dreams (HD)', 'Juice WRLD', 206);
  const g = gruposDeDuplicados([a, b, c], aj);
  assert.equal(g.length, 1, '206 fica de fora do grupo de 200');
  assert.deepEqual(g[0]!.faixas.map((t) => t.durationSeconds), [200, 203]);
});

console.log('\nindisponíveis');
await caso('o oEmbed: 404 removida, 401 bloqueada, o resto não se sabe', () => {
  assert.equal(veredictoDoOEmbed(200), 'ok');
  assert.equal(veredictoDoOEmbed(404), 'removida');
  assert.equal(veredictoDoOEmbed(400), 'removida');
  assert.equal(veredictoDoOEmbed(401), 'bloqueada');
  assert.equal(veredictoDoOEmbed(429), 'nao-sei', 'limite de pedidos não é culpa do vídeo');
  assert.equal(veredictoDoOEmbed(503), 'nao-sei');
  assert.equal(veredictoDoOEmbed(null), 'nao-sei', 'sem rede');
});
await caso('no iPhone manda o extrator: se resolve, toca', () => {
  assert.equal(veredictoDoExtrator(null), 'ok');
  assert.equal(veredictoDoExtrator('indisponivel'), 'removida');
  assert.equal(veredictoDoExtrator('restrito-idade'), 'restrita-idade');
  assert.equal(veredictoDoExtrator('restrito-regiao'), 'restrita-regiao');
  assert.equal(veredictoDoExtrator('bloqueio-bot'), 'nao-sei', 'o bloqueio de bot não diz nada do vídeo');
  assert.equal(veredictoDoExtrator('sem-rede'), 'nao-sei');
});
await caso('só entra na lista o que se sabe que não toca', () => {
  assert.ok(naoToca('removida') && naoToca('bloqueada') && naoToca('restrita-idade'));
  assert.ok(!naoToca('ok') && !naoToca('nao-sei'));
});
await caso('os motivos em inglês e curtos', () => {
  for (const d of ['removida', 'bloqueada', 'restrita-idade', 'restrita-regiao'] as const) {
    const m = motivoDaIndisponivel(d);
    assert.ok(m.length > 0 && m.length <= 60, m);
    assert.ok(!/[ãõçáéíóú]/i.test(m), m);
  }
});

console.log('\ncapas');
await caso('sem capa, a miniatura do vídeo, outra miniatura, e a do catálogo', () => {
  const t = faixa('X', 'Y', 100, { sourceId: 'abcdefghijk' });
  assert.equal(estadoDaCapa({ ...t, artworkUrl: null }, null), 'sem-capa');
  assert.equal(estadoDaCapa(t, t.artworkUrl), 'ok');
  assert.equal(estadoDaCapa(t, 'https://i.ytimg.com/vi_webp/abcdefghijk/maxresdefault.webp'), 'ignorar', 'não é a da faixa: veio de outro lado');
  const comWebp = { ...t, artworkUrl: 'https://i9.ytimg.com/vi_webp/abcdefghijk/mqdefault.webp' };
  assert.equal(estadoDaCapa(comWebp, comWebp.artworkUrl), 'ok');
  const doutro = { ...t, artworkUrl: 'https://i.ytimg.com/vi/ZZZZZZZZZZZ/hqdefault.jpg' };
  assert.equal(estadoDaCapa(doutro, doutro.artworkUrl), 'verificar');
  const spotify = { ...t, artworkUrl: 'https://i.scdn.co/image/ab67616d' };
  assert.equal(estadoDaCapa(spotify, spotify.artworkUrl), 'verificar');
  assert.equal(estadoDaCapa(spotify, 'https://cdn.deezer.example/capa.jpg'), 'ignorar', 'a do catálogo manda no ecrã');
  assert.equal(estadoDaCapa({ ...t, source: 'spotify' }, null), 'ignorar');
});
await caso('a capa partida é um 4xx; o resto não se sabe', () => {
  assert.equal(veredictoDaCapa(200), 'ok');
  assert.equal(veredictoDaCapa(404), 'partida');
  assert.equal(veredictoDaCapa(410), 'partida');
  assert.equal(veredictoDaCapa(500), 'nao-sei');
  assert.equal(veredictoDaCapa(null), 'nao-sei');
  assert.equal(capaDoVideo('abcdefghijk'), 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg');
});

console.log('\no resto');
await caso('em paralelo, nunca mais do que o limite, pela ordem dos itens', async () => {
  let aCorrer = 0, maximo = 0;
  const r = await emParalelo([5, 1, 4, 2, 3], 2, async (x) => {
    aCorrer++; maximo = Math.max(maximo, aCorrer);
    await new Promise((ok) => setTimeout(ok, x * 3));
    aCorrer--;
    return x * 10;
  });
  assert.equal(maximo, 2);
  assert.deepEqual(r, [50, 10, 40, 20, 30]);
});
await caso('parar deixa de lançar novos', async () => {
  let feitos = 0;
  const r = await emParalelo([1, 2, 3, 4, 5, 6], 2, async () => { feitos++; }, () => feitos >= 2);
  assert.equal(feitos, 2);
  assert.equal(r.length, 6);
});
await caso('a duração curta', () => {
  assert.equal(duracaoCurta(239), '3:59');
  assert.equal(duracaoCurta(61.4), '1:01');
  assert.equal(duracaoCurta(null), '');
  assert.equal(duracaoCurta(0), '');
});
await caso('o resumo', () => {
  assert.equal(resumoDoRelatorio({ duplicados: 0, indisponiveis: 0, capas: 0 }), 'Nothing to fix');
  assert.equal(resumoDoRelatorio({ duplicados: 2, indisponiveis: 1, capas: 1 }), '2 saved twice · 1 unavailable · 1 cover');
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');
