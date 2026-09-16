/**
 * O gosto lido do Spotify -- src/lib/gostoDoSpotify.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-gosto-do-spotify.ts
 */
import assert from 'node:assert/strict';
import {
  ARTISTAS_DO_SPOTIFY, PESO_MAXIMO, gostoAPartirDoSpotify, juntarComOSpotify, mensagemDoSpotify,
  envelhecerGosto, falhaDaApi, falhaDaAutorizacao, GOSTO_FRESCO_MS, MEIA_VIDA_DO_GOSTO_MS, PESO_MINIMO_DO_GOSTO, pesoPelaIdade,
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

console.log('\na idade do gosto');

caso('inteiro no primeiro mês, metade 90 dias depois, nunca abaixo de um quarto', () => {
  const lido = Date.UTC(2026, 0, 1);
  assert.equal(pesoPelaIdade(lido, lido), 1);
  assert.equal(pesoPelaIdade(lido, lido + GOSTO_FRESCO_MS), 1);
  assert.ok(Math.abs(pesoPelaIdade(lido, lido + GOSTO_FRESCO_MS + MEIA_VIDA_DO_GOSTO_MS) - 0.5) < 1e-9);
  assert.equal(pesoPelaIdade(lido, lido + 5 * 365 * 86_400_000), PESO_MINIMO_DO_GOSTO);
});

caso('um gosto antigo pesa menos, mas nenhum artista desaparece', () => {
  const lido = Date.UTC(2026, 0, 1);
  const gosto = { artistas: [{ name: 'Topo', plays: 20 }, { name: 'Fundo', plays: 1 }], lidoEm: lido };
  assert.deepEqual(envelhecerGosto(gosto, lido).map((a) => a.plays), [20, 1]);
  const velho = envelhecerGosto(gosto, lido + 2 * 365 * 86_400_000);
  assert.deepEqual(velho.map((a) => a.plays), [5, 1]);
  assert.equal(gosto.artistas[0].plays, 20, 'não mexe no gosto guardado');
});

caso('com o gosto antigo, o que se ouve agora passa à frente mais cedo', () => {
  const lido = Date.UTC(2026, 0, 1);
  const gosto = { artistas: [{ name: 'Do Spotify', plays: 20 }], lidoEm: lido };
  const agora = [{ name: 'Deste mês', plays: 12 }];
  assert.equal(juntarComOSpotify(agora, envelhecerGosto(gosto, lido), chave, 5)[0].name, 'Do Spotify');
  assert.equal(juntarComOSpotify(agora, envelhecerGosto(gosto, lido + 365 * 86_400_000), chave, 5)[0].name, 'Deste mês');
});

console.log('\nas mensagens');

caso('uma conta fora da lista da app diz isso, e não "recusou"', () => {
  // O corpo que o Spotify manda em modo de desenvolvimento.
  const corpo = '{"error":{"status":403,"message":"User not registered in the Developer Dashboard"}}';
  assert.equal(falhaDaApi(403, corpo), 'nao-registado');
  assert.equal(falhaDaApi(403, '{"error":{"status":403,"message":"Forbidden"}}'), 'sem-acesso');
  assert.equal(falhaDaApi(401, ''), 'sem-acesso');
  assert.equal(falhaDaApi(500, ''), 'rede');
  assert.equal(falhaDaApi(200, ''), null);
  assert.notEqual(mensagemDoSpotify('nao-registado'), mensagemDoSpotify('sem-acesso'));
});

caso('carregar em Cancelar no Spotify é cancelar; configuração errada é da app', () => {
  assert.equal(falhaDaAutorizacao('access_denied'), 'cancelado');
  assert.equal(falhaDaAutorizacao('invalid_client'), 'sem-configuracao');
  assert.equal(falhaDaAutorizacao('invalid_grant Invalid redirect URI'), 'sem-configuracao');
  assert.equal(falhaDaAutorizacao('server_error'), 'sem-acesso');
  assert.equal(falhaDaAutorizacao(undefined), 'sem-acesso');
});

caso('cancelar não diz nada; o resto é curto e sem jargão', () => {
  assert.equal(mensagemDoSpotify('cancelado'), null);
  for (const tipo of ['sem-configuracao', 'nao-registado', 'sem-acesso', 'rede', 'vazio'] as FalhaDoSpotify[]) {
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
