/**
 * O gosto lido do Spotify -- src/lib/gostoDoSpotify.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-gosto-do-spotify.ts
 */
import assert from 'node:assert/strict';
import {
  ARTISTAS_DO_SPOTIFY, PESO_MAXIMO, gostoAPartirDoSpotify, juntarComOSpotify, mensagemDoSpotify,
  type FalhaDoSpotify,
} from '../src/lib/gostoDoSpotify.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

const chave = (nome: string) => nome.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const vazio = { curto: [], medio: [], longo: [], recentes: [] };

console.log('\nde listas do Spotify a pesos');

caso('quem está no topo do mês e dos seis meses fica à frente, com o peso máximo', () => {
  const g = gostoAPartirDoSpotify({
    ...vazio,
    curto: ['Juice WRLD', 'Dillaz', 'Bispo'],
    medio: ['Juice WRLD', 'Bispo'],
    longo: ['Eminem'],
  }, chave, 1000);
  assert.equal(g.artistas[0].name, 'Juice WRLD');
  assert.equal(g.artistas[0].plays, PESO_MAXIMO);
  assert.equal(g.lidoEm, 1000);
});

caso('o que se ouve agora pesa mais do que o "desde sempre"', () => {
  const g = gostoAPartirDoSpotify({ ...vazio, curto: ['Agora'], longo: ['Antigo'] }, chave, 0);
  assert.deepEqual(g.artistas.map((a) => a.name), ['Agora', 'Antigo']);
  assert.ok(g.artistas[0].plays > g.artistas[1].plays);
});

caso('o mesmo artista com outra grafia conta uma vez, com a primeira grafia vista', () => {
  const g = gostoAPartirDoSpotify({ ...vazio, curto: ['Amália'], medio: ['amalia'] }, chave, 0);
  assert.equal(g.artistas.length, 1);
  assert.equal(g.artistas[0].name, 'Amália');
});

caso('as últimas músicas também contam, mesmo fora dos tops', () => {
  const g = gostoAPartirDoSpotify({ ...vazio, curto: ['Top'], recentes: ['Novo', 'Novo', 'Novo'] }, chave, 0);
  const novo = g.artistas.find((a) => a.name === 'Novo');
  assert.ok(novo && novo.plays >= 1);
});

caso('nunca passa do limite, e todos os pesos são escutas inteiras de pelo menos 1', () => {
  const muitos = Array.from({ length: 50 }, (_, i) => `Artista ${i}`);
  const g = gostoAPartirDoSpotify({ ...vazio, curto: muitos, longo: muitos }, chave, 0);
  assert.equal(g.artistas.length, ARTISTAS_DO_SPOTIFY);
  assert.ok(g.artistas.every((a) => Number.isInteger(a.plays) && a.plays >= 1));
});

caso('uma conta sem nada devolve nada, sem rebentar', () => {
  assert.deepEqual(gostoAPartirDoSpotify(vazio, chave, 5).artistas, []);
});

console.log('\njuntar ao histórico da app');

caso('um artista nos dois soma, e a grafia da app ganha', () => {
  const r = juntarComOSpotify([{ name: 'Juice WRLD', plays: 3 }], [{ name: 'juice wrld', plays: 20 }], chave, 10);
  assert.deepEqual(r, [{ name: 'Juice WRLD', plays: 23 }]);
});

caso('para quem ainda não ouviu nada na app, o Spotify manda', () => {
  const r = juntarComOSpotify([{ name: 'Único', plays: 1 }], [{ name: 'Dillaz', plays: 20 }, { name: 'Bispo', plays: 12 }], chave, 10);
  assert.deepEqual(r.map((a) => a.name), ['Dillaz', 'Bispo', 'Único']);
});

caso('para quem ouve todos os dias, as escutas a sério passam à frente', () => {
  const r = juntarComOSpotify([{ name: 'Diário', plays: 400 }], [{ name: 'Do Spotify', plays: 20 }], chave, 10);
  assert.equal(r[0].name, 'Diário');
});

caso('respeita o limite e não mexe no histórico que recebeu', () => {
  const historico = [{ name: 'A', plays: 5 }];
  const r = juntarComOSpotify(historico, [{ name: 'A', plays: 5 }, { name: 'B', plays: 4 }, { name: 'C', plays: 3 }], chave, 2);
  assert.equal(r.length, 2);
  assert.equal(historico[0].plays, 5);
});

console.log('\nas mensagens');

caso('cancelar não diz nada; o resto é curto e sem jargão', () => {
  assert.equal(mensagemDoSpotify('cancelado'), null);
  for (const tipo of ['sem-configuracao', 'sem-acesso', 'rede', 'vazio'] as FalhaDoSpotify[]) {
    const m = mensagemDoSpotify(tipo)!;
    assert.ok(m.length <= 64, `${m.length}: ${m}`);
    assert.ok(!/token|oauth|pkce|403|http|client/i.test(m), m);
  }
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');
