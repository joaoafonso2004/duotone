// As preferencias de recomendacao, em Node puro.
//
// O que se garante aqui e a SIMETRIA: o sistema sabia dizer que nao de duas
// maneiras e nao sabia dizer que sim de nenhuma. E, sobretudo, que nao se pode
// ficar com as duas opinioes sobre o mesmo artista ao mesmo tempo.
import assert from 'node:assert/strict';
import {
  ajustarSugestoes, ESCUTAS_DE_UM_PREFERIDO, PESO_A_MAIS, PESO_A_MENOS,
  pesoDoArtista, preferidos, type Feedback,
} from '../src/lib/recommendationFeedback.ts';
import {
  GUARDAR_EVENTOS_MS, JANELA_DA_APRENDIZAGEM_MS, PESO_DE_REJEICAO_REPETIDA,
  juntarAprendizagens, lerEventos, pesoDaAprendizagem, registarEscutaAprendida,
  registarSaltoAprendido, type EventoAprendido,
} from '../src/lib/aprendizagemDeRecomendacoes.ts';

const f = (id: string, artista: string) => ({ id, artista });
const chaveDaFaixa = (t: { id: string }) => t.id;
const chaveDoArtista = (t: { artista: string }) => t.artista;

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

verificar('sem preferencias, nada se mexe', () => {
  const lista = [f('1', 'a'), f('2', 'b')];
  assert.deepEqual(ajustarSugestoes(lista, [], chaveDaFaixa, chaveDoArtista), lista);
});

verificar('uma faixa bloqueada sai', () => {
  const prefs: Feedback[] = [{ kind: 'track', key: '1', label: 'x' }];
  const r = ajustarSugestoes([f('1', 'a'), f('2', 'b')], prefs, chaveDaFaixa, chaveDoArtista);
  assert.deepEqual(r.map((t) => t.id), ['2']);
});

verificar('um artista a menos desce, e so uma faixa dele sobrevive', () => {
  const prefs: Feedback[] = [{ kind: 'artist', key: 'a', label: 'A' }];
  const lista = [f('1', 'a'), f('2', 'a'), f('3', 'b')];
  const r = ajustarSugestoes(lista, prefs, chaveDaFaixa, chaveDoArtista);
  assert.deepEqual(r.map((t) => t.id), ['3', '1']);
});

verificar('um artista a MAIS sobe a frente', () => {
  const prefs: Feedback[] = [{ kind: 'artist_more', key: 'b', label: 'B' }];
  const lista = [f('1', 'a'), f('2', 'b'), f('3', 'a'), f('4', 'b')];
  const r = ajustarSugestoes(lista, prefs, chaveDaFaixa, chaveDoArtista);
  assert.deepEqual(r.map((t) => t.id), ['2', '4', '1', '3']);
});

verificar('e ao contrario do "menos", nao ha tecto de uma por artista', () => {
  const prefs: Feedback[] = [{ kind: 'artist_more', key: 'a', label: 'A' }];
  const lista = [f('1', 'a'), f('2', 'a'), f('3', 'a')];
  assert.equal(ajustarSugestoes(lista, prefs, chaveDaFaixa, chaveDoArtista).length, 3);
});

verificar('subir nao e inventar: so entra o que ja estava na lista', () => {
  const prefs: Feedback[] = [{ kind: 'artist_more', key: 'z', label: 'Z' }];
  const lista = [f('1', 'a'), f('2', 'b')];
  const r = ajustarSugestoes(lista, prefs, chaveDaFaixa, chaveDoArtista);
  assert.deepEqual(r.map((t) => t.id), ['1', '2']);
});

verificar('os tres montes convivem, e a ordem entre eles e que manda', () => {
  const prefs: Feedback[] = [
    { kind: 'artist_more', key: 'c', label: 'C' },
    { kind: 'artist', key: 'a', label: 'A' },
    { kind: 'track', key: '9', label: 'X' },
  ];
  const lista = [f('9', 'b'), f('1', 'a'), f('2', 'b'), f('3', 'c')];
  const r = ajustarSugestoes(lista, prefs, chaveDaFaixa, chaveDoArtista);
  assert.deepEqual(r.map((t) => t.id), ['3', '2', '1'], 'preferido, normal, reduzido -- e o bloqueado fora');
});

verificar('o peso e um multiplicador, e o de um artista qualquer e um', () => {
  assert.equal(pesoDoArtista([], 'a'), 1);
  assert.equal(pesoDoArtista([{ kind: 'artist', key: 'a', label: 'A' }], 'a'), PESO_A_MENOS);
  assert.equal(pesoDoArtista([{ kind: 'artist_more', key: 'a', label: 'A' }], 'a'), PESO_A_MAIS);
});

verificar('tirar custa mais do que por -- de proposito', () => {
  // Simetrico seria 4x, e 4x esmagava o retrato: o peso normal e a RAIZ das
  // escutas, por isso 4 bate um artista com dezasseis vezes mais reproducoes.
  assert.ok(PESO_A_MAIS < 1 / PESO_A_MENOS, 'o positivo e mais contido que o negativo');
  assert.ok(PESO_A_MAIS > 1, 'mas e mesmo um aumento');
});

verificar('uma faixa de um artista bloqueado NAO e salva por ele ser preferido', () => {
  // O bloqueio e por faixa e ganha sempre: e a escolha mais especifica.
  const prefs: Feedback[] = [
    { kind: 'artist_more', key: 'a', label: 'A' },
    { kind: 'track', key: '1', label: 'X' },
  ];
  const r = ajustarSugestoes([f('1', 'a'), f('2', 'a')], prefs, chaveDaFaixa, chaveDoArtista);
  assert.deepEqual(r.map((t) => t.id), ['2']);
});

verificar('os preferidos saem com o nome como esta escrito', () => {
  const prefs: Feedback[] = [
    { kind: 'artist_more', key: 'juice wrld', label: 'Juice WRLD' },
    { kind: 'artist', key: 'outro', label: 'Outro' },
  ];
  assert.deepEqual(preferidos(prefs), [{ chave: 'juice wrld', nome: 'Juice WRLD' }]);
});

verificar('um preferido comeca a valer alguma coisa, e nao zero', () => {
  // E o ponto todo: o peso MULTIPLICA, e um artista fora da biblioteca vale
  // zero. Sem um valor de partida, dizer "mais destas" a uma descoberta nao
  // fazia nada.
  assert.ok(ESCUTAS_DE_UM_PREFERIDO > 0);
  assert.ok(Math.sqrt(ESCUTAS_DE_UM_PREFERIDO) * PESO_A_MAIS > 1);
});

verificar('um skip isolado nao decide o gosto', () => {
  const agora = Date.UTC(2026, 8, 16);
  const saltos = registarSaltoAprendido([], 'artista', 'faixa-1', agora);
  assert.equal(pesoDaAprendizagem(saltos, 'artista', agora), 1);
});

verificar('repetir o mesmo upload nao finge rejeicoes distintas', () => {
  const agora = Date.UTC(2026, 8, 16);
  let saltos: EventoAprendido[] = [];
  for (let i = 0; i < 4; i++) saltos = registarSaltoAprendido(saltos, 'artista', 'faixa-1', agora + i);
  assert.equal(pesoDaAprendizagem(saltos, 'artista', agora + 4), 1);
});

verificar('tres skips precoces distintos reduzem gradualmente o artista', () => {
  const agora = Date.UTC(2026, 8, 16);
  let saltos: EventoAprendido[] = [];
  for (let i = 1; i <= 3; i++) saltos = registarSaltoAprendido(saltos, 'artista', `faixa-${i}`, agora + i);
  assert.equal(pesoDaAprendizagem(saltos, 'artista', agora + 4), PESO_DE_REJEICAO_REPETIDA);

  const lista = [f('1', 'artista'), f('2', 'outro'), f('3', 'artista')];
  const r = ajustarSugestoes(lista, [], chaveDaFaixa, chaveDoArtista,
    (chave) => pesoDaAprendizagem(saltos, chave, agora + 4));
  assert.deepEqual(r.map((t) => t.id), ['2', '1', '3'], 'as alternativas normais aparecem primeiro sem apagar candidatas');
});

verificar('uma escuta substancial alivia a rejeicao aprendida', () => {
  const agora = Date.UTC(2026, 8, 16);
  let saltos: EventoAprendido[] = [];
  for (let i = 1; i <= 3; i++) saltos = registarSaltoAprendido(saltos, 'artista', `faixa-${i}`, agora + i);
  saltos = registarEscutaAprendida(saltos, 'artista', agora + 5);
  assert.equal(pesoDaAprendizagem(saltos, 'artista', agora + 6), 1);
});

verificar('rejeicoes antigas expiram e local/conta juntam-se sem duplicar', () => {
  const agora = Date.UTC(2026, 8, 16);
  const antiga = agora - JANELA_DA_APRENDIZAGEM_MS - 1;
  const local: EventoAprendido[] = [
    { tipo: 'salto', artista: 'artista', faixa: 'antiga', em: antiga },
    { tipo: 'salto', artista: 'artista', faixa: 'igual', em: agora - 20 },
  ];
  const conta: EventoAprendido[] = [
    { tipo: 'salto', artista: 'artista', faixa: 'igual', em: agora - 20 },
    { tipo: 'salto', artista: 'artista', faixa: 'nova', em: agora },
  ];
  const juntas = juntarAprendizagens(local, conta, agora);
  assert.equal(juntas.length, 3, 'o mesmo evento nos dois lados conta uma vez');
  assert.equal(pesoDaAprendizagem(juntas, 'artista', agora), 1, 'a de fora da janela nao conta: sao duas');
  assert.equal(lerEventos([{ tipo: 'salto', artista: 'a', faixa: 'f', em: agora - GUARDAR_EVENTOS_MS - 1 }], agora).length, 0,
    'o que passou do prazo de guarda sai');
  assert.equal(lerEventos([{ tipo: 'outro', artista: 'a', em: agora }, null, 'x'], agora).length, 0);
});

// Dois aparelhos: o perdão de um não pode ser desfeito pela junção com o outro.
verificar('uma escuta noutro aparelho continua a perdoar depois de juntar', () => {
  const agora = Date.UTC(2026, 8, 16);
  let iphone: EventoAprendido[] = [];
  for (let i = 1; i <= 3; i++) iphone = registarSaltoAprendido(iphone, 'artista', `faixa-${i}`, agora + i);
  // O PC recebe da conta e ouve uma recomendação desse artista.
  let pc = juntarAprendizagens([], iphone, agora + 10);
  pc = registarEscutaAprendida(pc, 'artista', agora + 11);
  assert.equal(pesoDaAprendizagem(pc, 'artista', agora + 12), 1);
  // O iPhone junta o que o PC mandou: com rejeições em vez de eventos, a
  // faixa perdoada voltava daqui.
  const deVolta = juntarAprendizagens(iphone, pc, agora + 13);
  assert.equal(pesoDaAprendizagem(deVolta, 'artista', agora + 14), 1);
  assert.equal(pesoDaAprendizagem(juntarAprendizagens(pc, iphone, agora + 13), 'artista', agora + 14), 1,
    'a ordem da junção não muda o resultado');
});

verificar('uma escuta nao perdoa um skip que so aconteceu depois dela', () => {
  const agora = Date.UTC(2026, 8, 16);
  let eventos: EventoAprendido[] = [];
  eventos = registarSaltoAprendido(eventos, 'artista', 'faixa-1', agora + 1);
  eventos = registarEscutaAprendida(eventos, 'artista', agora + 2);
  for (let i = 2; i <= 4; i++) eventos = registarSaltoAprendido(eventos, 'artista', `faixa-${i}`, agora + i + 1);
  assert.equal(pesoDaAprendizagem(eventos, 'artista', agora + 10), PESO_DE_REJEICAO_REPETIDA,
    'a escuta levou a faixa-1; as tres seguintes contam');
});

verificar('escutas sem nada para perdoar nao enchem a lista', () => {
  const agora = Date.UTC(2026, 8, 16);
  let eventos: EventoAprendido[] = [];
  for (let i = 0; i < 50; i++) eventos = registarEscutaAprendida(eventos, 'artista', agora + i);
  assert.equal(eventos.length, 0);
});

console.log(falhas === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
