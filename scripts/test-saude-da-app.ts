// A app a ver-se a si própria: o que se guarda de um erro, e o que NÃO pode sair.
import assert from 'node:assert/strict';
import {
  MAX_INCIDENTES, REPETIDO_MS, assinatura, dadosDoEvento, descreverIncidente,
  incidenteDaSessaoAnterior, incidenteDeErro, incidenteDoMetricKit, juntarIncidente,
  lerIncidentes, lerSessao, limparMensagem, medidaDoArranque, nomeDoErro, nomeDoEvento,
  topoDaPilha, type Incidente,
} from '../src/lib/saudeDaApp.ts';

const agora = 1_800_000_000_000;

// --- nada de conteúdo -------------------------------------------------------
const sujo = [
  'Failed to load https://rr3---sn.googlevideo.com/videoplayback?id=abc&ip=1.2.3.4',
  'for "Juice WRLD - Lucid Dreams" in playlist \'Treino\'',
  'user joao@example.com',
  'at /var/mobile/Containers/Data/Application/1234/Documents/yt-audio-dQw4w9WgXcQ.m4a',
  'C:\\Users\\Joao Afonso\\AppData\\Roaming\\Duotone\\x.json',
  'video dQw4w9WgXcQ not found (uuid 550e8400-e29b-41d4-a716-446655440000)',
].join(' ');
const limpo = limparMensagem(sujo);
for (const proibido of ['googlevideo', 'Juice', 'Lucid', 'Treino', 'joao', 'example', 'Joao', 'Afonso', 'dQw4w9WgXcQ', '550e8400', '1.2.3.4', 'mobile']) {
  assert.ok(!limpo.includes(proibido), `"${proibido}" escapou: ${limpo}`);
}
assert.ok(limpo.length <= 120, 'a mensagem tem teto');
assert.equal(
  limparMensagem('ENOENT at /var/mobile/Containers/Data/x.m4a then C:\\Users\\Joao Afonso\\AppData\\x.json not found'),
  'ENOENT at <caminho> then <caminho><caminho> not found',
  'os caminhos saem, o resto da frase fica',
);
assert.equal(limparMensagem('open /Users/joao/Music/a.m4a failed'), 'open <caminho><caminho> failed');
assert.equal(
  limparMensagem("undefined is not an object (evaluating 'track.title')"),
  'undefined is not an object (evaluating <txt>)',
);
assert.equal(limparMensagem('Chunk download failed (HTTP 403) at byte 1048576'), 'Chunk download failed (HTTP #) at byte #');
assert.equal(limparMensagem('Maximum update depth exceeded'), 'Maximum update depth exceeded', 'uma mensagem normal fica legível');
assert.equal(limparMensagem('Cannot read property of undefined'), 'Cannot read property of undefined');
assert.equal(limparMensagem(null), '');
assert.equal(limparMensagem({ toString: () => 'objeto 12' }), 'objeto #');

assert.equal(nomeDoErro(new TypeError('x')), 'TypeError');
assert.equal(nomeDoErro('texto'), 'string');
assert.equal(nomeDoErro(null), 'object');
assert.equal(nomeDoErro({ name: 'Bad<script>' }), 'Badscript');

// --- a pilha, sem caminhos --------------------------------------------------
assert.deepEqual(topoDaPilha([
  'TypeError: x is undefined',
  '    at renderTrack (http://localhost:18081/_expo/static/js/web/index-4f2a.js?platform=web:12:3456)',
  '    at C:\\Users\\Joao\\app\\main.cjs:10:5',
  '    at anonymous (address at /var/containers/Bundle/Application/X/Duotone.app/main.jsbundle:1:98765)',
  '    at another (main.jsbundle:1:5)',
].join('\n')), [
  'renderTrack (index-4f2a.js:12:3456)',
  '? (main.cjs:10:5)',
  'anonymous (main.jsbundle:1:98765)',
]);
assert.deepEqual(topoDaPilha('render@http://x/y/bundle.js:1:2\nfoo'), ['render (bundle.js:1:2)']);
assert.deepEqual(topoDaPilha(undefined), []);

// --- a assinatura agrupa o igual e separa o diferente ------------------------
const erroEm = (msg: string, linha: number) => {
  const e = new TypeError(msg);
  e.stack = `TypeError: ${msg}\n    at f (bundle.js:1:${linha})`;
  return incidenteDeErro(e, { fatal: false, onde: 'ecra:Search', quando: agora, versao: '3.5.1' });
};
assert.equal(erroEm('bad "Faixa A"', 10).assinatura, erroEm('bad "Faixa B"', 10).assinatura, 'o conteúdo não separa erros iguais');
assert.notEqual(erroEm('bad', 10).assinatura, erroEm('bad', 11).assinatura, 'outro sítio é outro erro');
assert.match(assinatura(['a']), /^[0-9a-f]{8}$/);
const i1 = erroEm('bad "Faixa A"', 10);
assert.equal(i1.tipo, 'erro-js');
assert.equal(i1.mensagem, 'bad <txt>');
assert.equal(i1.onde, 'ecra:Search');

// --- a lista guardada ---------------------------------------------------------
let lista: Incidente[] = [];
for (let k = 0; k < 50; k++) lista = juntarIncidente(lista, { ...i1, quando: agora + k * 1000 });
assert.equal(lista.length, 1, 'um erro num ciclo é uma linha');
assert.equal(lista[0].vezes, 50);
lista = juntarIncidente(lista, { ...i1, quando: agora + 49_000 + REPETIDO_MS });
assert.equal(lista.length, 2, 'passado o minuto, é outro episódio');
for (let k = 0; k < 40; k++) lista = juntarIncidente(lista, { tipo: 'bloqueio', quando: agora + k });
assert.equal(lista.length, MAX_INCIDENTES, 'a lista tem teto');
assert.equal(lista[lista.length - 1].tipo, 'bloqueio', 'fica o mais recente');

assert.deepEqual(lerIncidentes(JSON.stringify(lista)), lista, 'ida e volta');
assert.deepEqual(lerIncidentes('lixo'), []);
assert.deepEqual(lerIncidentes('{}'), []);
assert.deepEqual(lerIncidentes(JSON.stringify([{ tipo: 'outro', quando: 1 }, { tipo: 'gpu' }, { tipo: 'gpu', quando: 5 }])), [{ tipo: 'gpu', quando: 5 }]);

// --- o evento ---------------------------------------------------------------
assert.equal(nomeDoEvento(i1), 'erro_js');
assert.equal(nomeDoEvento({ tipo: 'bloqueio', quando: 0 }), 'bloqueio');
assert.equal(nomeDoEvento({ tipo: 'renderer', quando: 0 }), 'crash');
assert.equal(nomeDoEvento({ tipo: 'sessao-interrompida', quando: 0 }), 'crash');
const dados = dadosDoEvento({ ...i1, vezes: 3, motivo: 'crashed at https://x.y/z' }, agora + 5 * 60_000);
assert.deepEqual(dados, {
  tipo: 'erro-js', fatal: false, onde: 'ecra:Search', nome: 'TypeError', mensagem: 'bad <txt>',
  assinatura: i1.assinatura!, motivo: 'crashed at <url>', versao_do_incidente: '3.5.1', vezes: 3, ha_min: 5,
});
// Mesmo um incidente vindo de fora (Swift, processo principal) é limpo aqui.
const deFora = dadosDoEvento({ tipo: 'principal', quando: agora, mensagem: 'ENOENT C:\\Users\\Joao\\x\\y.json', onde: 'principal' }, agora);
assert.ok(!String(deFora.mensagem).includes('Joao'), String(deFora.mensagem));
for (const v of Object.values(dadosDoEvento({ ...i1, codigo: 1.7, vezes: 1 }, agora))) {
  assert.ok(['string', 'number', 'boolean'].includes(typeof v));
}
assert.equal(dadosDoEvento({ ...i1, codigo: 1.7 }, agora).codigo, 1);
assert.equal('vezes' in dadosDoEvento({ ...i1, vezes: 1 }, agora), false);

// --- a sessão anterior ------------------------------------------------------
assert.equal(incidenteDaSessaoAnterior(null), null, 'primeira abertura');
assert.equal(incidenteDaSessaoAnterior({ aberta: false, desde: agora, versao: '1' }), null, 'fechou em segundo plano');
assert.deepEqual(incidenteDaSessaoAnterior({ aberta: true, desde: agora, versao: '3.5.0' }), {
  tipo: 'sessao-interrompida', quando: agora, fatal: true, versao: '3.5.0',
});
assert.deepEqual(lerSessao(JSON.stringify({ aberta: true, desde: 5, versao: 'x' })), { aberta: true, desde: 5, versao: 'x' });
assert.equal(lerSessao('{"aberta":"sim","desde":1}'), null);
assert.equal(lerSessao('nope'), null);
assert.equal(lerSessao(null), null);

// --- o arranque -------------------------------------------------------------
assert.deepEqual(medidaDoArranque({ agora: 1500, processo: 100, runtime: 400, js: 900 }), { ms: 1400, desde: 'processo' });
assert.deepEqual(medidaDoArranque({ agora: 1500, processo: null, runtime: 400, js: 900 }), { ms: 1100, desde: 'runtime' });
assert.deepEqual(medidaDoArranque({ agora: 1500, processo: Number.NaN, js: 900 }), { ms: 600, desde: 'js' });
assert.deepEqual(medidaDoArranque({ agora: 1500, processo: 2000, js: 900 }), { ms: 600, desde: 'js' }, 'um início no futuro não serve');
assert.equal(medidaDoArranque({ agora: 500_000, js: 1 }), null, 'mais de dois minutos não é um arranque');
assert.equal(medidaDoArranque({ agora: 10 }), null);
assert.deepEqual(medidaDoArranque({ agora: 800, processo: -1200, js: 5 }), { ms: 2000, desde: 'processo' }, 'o processo do PC começa antes da página');

// --- o MetricKit ------------------------------------------------------------
const crash = incidenteDoMetricKit({
  tipo: 'crash', quando: agora, sinal: 11, excecao: 1, codigo: 0, binario: 'hermes',
  razao: 'Namespace SIGNAL, Code 11 for /private/var/x/y', versao: '3.5.1', pilha: ['hermes+123', 'Duotone+9'],
});
assert.equal(crash?.tipo, 'crash-nativo');
assert.equal(crash?.motivo, 'sinal 11, excecao 1, em hermes');
assert.ok(!crash?.mensagem?.includes('private'));
assert.equal(crash?.fatal, true);
const bloqueio = incidenteDoMetricKit({ tipo: 'bloqueio', quando: agora, duracaoMs: 2500.4, binario: 'UIKitCore' });
assert.equal(bloqueio?.tipo, 'bloqueio');
assert.equal(bloqueio?.motivo, 'em UIKitCore, 2500 ms');
assert.equal(incidenteDoMetricKit({ tipo: 'outro', quando: 1 }), null);
assert.equal(incidenteDoMetricKit({ tipo: 'crash' }), null);
assert.equal(incidenteDoMetricKit('x'), null);
assert.notEqual(
  incidenteDoMetricKit({ tipo: 'crash', quando: 1, sinal: 11, binario: 'a' })?.assinatura,
  incidenteDoMetricKit({ tipo: 'crash', quando: 1, sinal: 6, binario: 'a' })?.assinatura,
);

// --- o relatório ------------------------------------------------------------
assert.equal(
  descreverIncidente({ ...i1, vezes: 2 }),
  `erro-js · ecra:Search · TypeError · bad <txt> · x2 · v3.5.1 · #${i1.assinatura}`,
);

console.log('Saúde da app: erros agrupados sem conteúdo, sessões interrompidas, arranque e MetricKit.');
