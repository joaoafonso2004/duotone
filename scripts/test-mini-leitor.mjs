/**
 * electron/miniLeitor.cjs: onde fica o mini leitor do PC, e o que passa entre
 * as duas janelas. Correr: node scripts/test-mini-leitor.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const m = require('../electron/miniLeitor.cjs');

let falhas = 0;
function caso(nome, fn) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${e.message}`); }
}

// Um 1080p com a barra de tarefas em baixo (48 px) e um segundo monitor à direita.
const principal = { x: 0, y: 0, width: 1920, height: 1032 };
const segundo = { x: 1920, y: 0, width: 1280, height: 1024 };
const { compacto, expandido } = m.TAMANHOS;

console.log('\nabrir');
caso('a primeira vez: canto de baixo à direita, acima da barra de tarefas', () => {
  assert.deepEqual(m.ondeAbrir(null, compacto, [principal, segundo], principal), { x: 1920 - 360 - 16, y: 1032 - 88 - 16 });
});
caso('depois: onde ficou, no monitor onde ficou', () => {
  const g = m.lembrar(null, { x: 2000, y: 100 }, segundo);
  assert.deepEqual(m.ondeAbrir(g, compacto, [principal, segundo], principal), { x: 2000, y: 100 });
});
caso('com esse monitor desligado, volta ao principal', () => {
  const g = m.lembrar(null, { x: 2000, y: 100 }, segundo);
  assert.deepEqual(m.ondeAbrir(g, compacto, [principal], principal), m.posicaoInicial(principal, compacto));
});
caso('uma posição guardada fora do ecrã é trazida para dentro', () => {
  const g = m.lembrar(null, { x: 1900, y: 1020 }, principal);
  assert.deepEqual(m.ondeAbrir(g, compacto, [principal], principal), { x: 1920 - 360, y: 1032 - 88 });
});

console.log('\na barra recolhida');
caso('encostado em baixo, a barra fica em baixo e abre para cima', () => {
  const pos = m.posicaoInicial(principal, compacto);
  assert.equal(m.ancoraDoMini(pos, compacto, principal), 'baixo');
});
caso('encostado em cima, abre para baixo', () => {
  assert.equal(m.ancoraDoMini({ x: 100, y: 16 }, compacto, principal), 'cima');
});
caso('sem área conhecida, em baixo', () => {
  assert.equal(m.ancoraDoMini({ x: 0, y: 0 }, compacto, null), 'baixo');
});

console.log('\no tamanho (a pega)');
caso('a escala tem limites', () => {
  assert.equal(m.escalaValida(0.2), m.ESCALA_MINIMA);
  assert.equal(m.escalaValida(9), m.ESCALA_MAXIMA);
  assert.equal(m.escalaValida('x'), 1);
});
caso('tudo cresce na mesma proporção', () => {
  assert.deepEqual(m.comEscala(compacto, 1.5), { width: 540, height: 132 });
});
caso('em baixo à direita, o canto de baixo à direita fica parado', () => {
  const pos = m.posicaoInicial(principal, compacto);
  const lados = m.ladosFixos(pos, compacto, principal);
  assert.deepEqual(lados, { direita: true, baixo: true });
  const fixo = { x: pos.x + compacto.width, y: pos.y + compacto.height };
  const r = m.arrastarPega(fixo, { x: fixo.x - 540, y: 0 }, compacto, lados);
  assert.equal(r.escala, 1.5);
  assert.deepEqual(r.bounds, { x: fixo.x - 540, y: fixo.y - 132, width: 540, height: 132 });
});
caso('encostado à esquerda e em cima, cresce para a direita e para baixo', () => {
  const lados = m.ladosFixos({ x: 20, y: 20 }, compacto, principal);
  const r = m.arrastarPega({ x: 20, y: 20 }, { x: 20 + 288, y: 0 }, compacto, lados);
  assert.equal(r.escala, 0.8);
  assert.deepEqual(r.bounds, { x: 20, y: 20, width: 288, height: 70 });
});

console.log('\nmexer');
caso('perto de uma borda encosta à margem', () => {
  assert.deepEqual(m.encostar({ x: 1920 - 360 - 16 - 7, y: 400 }, compacto, principal), { x: 1920 - 360 - 16, y: 400 });
  assert.deepEqual(m.encostar({ x: 20, y: 25 }, compacto, principal), { x: 16, y: 16 });
});
caso('longe das bordas fica onde foi largado', () => {
  assert.deepEqual(m.encostar({ x: 700, y: 400 }, compacto, principal), { x: 700, y: 400 });
});
caso('arrastado para fora do ecrã volta para dentro', () => {
  assert.deepEqual(m.encostar({ x: -200, y: 2000 }, compacto, principal), { x: 0, y: 1032 - 88 });
});
caso('a área certa é a do centro da janela, entre dois monitores', () => {
  assert.equal(m.areaDe({ x: 1900, y: 100 }, compacto, [principal, segundo]), segundo);
  assert.equal(m.areaDe({ x: 1500, y: 100 }, compacto, [principal, segundo]), principal);
  assert.equal(m.areaDe({ x: 5000, y: 100 }, compacto, [principal, segundo]), segundo, 'fora de todos: o mais perto');
});

console.log('\nexpandir');
caso('encostado em baixo à direita cresce para cima e para a esquerda', () => {
  const pos = m.posicaoInicial(principal, compacto);
  const novo = m.mudarDeTamanho(pos, compacto, expandido, principal);
  assert.equal(novo.x + expandido.width, pos.x + compacto.width);
  assert.equal(novo.y + expandido.height, pos.y + compacto.height);
});
caso('encostado em cima à esquerda cresce para baixo e para a direita', () => {
  assert.deepEqual(m.mudarDeTamanho({ x: 16, y: 16 }, compacto, expandido, principal), { x: 16, y: 16 });
});

console.log('\nentre as janelas');
caso('só passam comandos da lista, e o seek é um número com juízo', () => {
  assert.deepEqual(m.comandoValido({ tipo: 'seguinte', extra: 'x' }), { tipo: 'seguinte' });
  assert.deepEqual(m.comandoValido({ tipo: 'alternar-duotone' }), { tipo: 'alternar-duotone' }, 'o botão ao lado do X mostra e esconde a app');
  assert.deepEqual(m.comandoValido({ tipo: 'procurar', ms: 61234.6 }), { tipo: 'procurar', ms: 61235 });
  assert.equal(m.comandoValido({ tipo: 'procurar', ms: -1 }), null);
  assert.equal(m.comandoValido({ tipo: 'eval' }), null);
  assert.equal(m.comandoValido('seguinte'), null);
});
caso('o resumo só leva os campos do mini, e a capa só em https', () => {
  const r = m.resumoValido({ titulo: 'Boondocks', artista: 'Juice WRLD', capa: 'https://i.ytimg.com/vi/x/mqdefault.jpg',
    aTocar: true, guardada: false, posicaoMs: 1000.4, duracaoMs: 182000, sessao: 'segredo' });
  assert.deepEqual(Object.keys(r).sort(), ['aTocar', 'artista', 'capa', 'duracaoMs', 'guardada', 'posicaoMs', 'titulo']);
  assert.equal(r.posicaoMs, 1000);
  assert.equal(m.resumoValido({ capa: 'file:///C:/x.png' }).capa, null);
  assert.equal(m.resumoValido({ capa: 'javascript:alert(1)' }).capa, null);
  assert.equal(m.resumoValido(null), null);
});

if (falhas) { console.error(`\n  ${falhas} caso(s) a falhar.\n`); process.exit(1); }
console.log('\n  Mini leitor: abrir, mexer, expandir e o que passa entre janelas passaram.\n');
