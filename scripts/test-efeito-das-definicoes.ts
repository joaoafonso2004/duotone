/**
 * O que cada definição está a fazer agora -- src/lib/efeitoDasDefinicoes.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-efeito-das-definicoes.ts
 */
import assert from 'node:assert/strict';
import {
  efeitoDaNormalizacao, efeitoDaQualidade, efeitoDeLimparACache, efeitoDeManterOEcra,
  efeitoDoCrossfade, efeitoDoDiscord, efeitoDoPadrao, efeitoDoPoToken, efeitoDoRadio,
  efeitoDoTemporizador, tamanho,
} from '../src/lib/efeitoDasDefinicoes.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

console.log('\na qualidade diz o que está a tocar, e não só o que se pediu');
caso('do player do YouTube, a escolha não manda', () => {
  assert.match(efeitoDaQualidade({ escolha: 'high', motor: 'webview', descarregada: false, kbps: 128, codec: 'AAC' }), /YouTube picks/);
});
caso('de um download não gasta dados', () => {
  assert.match(efeitoDaQualidade({ escolha: 'saver', motor: 'native', descarregada: true, kbps: null, codec: null }), /download/);
});
caso('da rede, com o bitrate a sério', () => {
  assert.equal(efeitoDaQualidade({ escolha: 'high', motor: 'native', descarregada: false, kbps: 129.6, codec: 'AAC' }), 'Now playing: 130 kbps AAC');
});
caso('sem nada a tocar, diz o que a escolha faz', () => {
  assert.match(efeitoDaQualidade({ escolha: 'saver', motor: null, descarregada: false, kbps: null, codec: null }), /lowest bitrate/);
  assert.match(efeitoDaQualidade({ escolha: 'high', motor: 'resolving', descarregada: false, kbps: null, codec: null }), /highest bitrate/);
});

console.log('\no crossfade com os limites dele');
caso('desligado não diz nada', () => assert.equal(efeitoDoCrossfade({ segundos: 0, repeatUma: false }), null));
caso('com repeat de uma faixa está parado, e diz porquê', () => {
  assert.match(efeitoDoCrossfade({ segundos: 6, repeatUma: true })!, /repeat one/);
});
caso('diz o limite das músicas curtas, que é o dobro do fade', () => {
  assert.match(efeitoDoCrossfade({ segundos: 6, repeatUma: false })!, /shorter than 12 s/);
});

console.log('\nos padrões valem a partir da música seguinte');
caso('a que tem ajuste próprio não muda, e diz o dela', () => {
  assert.equal(efeitoDoPadrao({ tipo: 'velocidade', temFaixa: true, temAjusteProprio: true, igualAoPadrao: false, valorDaFaixa: '1.25×' }),
    'The song playing keeps its own speed: 1.25×');
  assert.equal(efeitoDoPadrao({ tipo: 'equalizador', temFaixa: true, temAjusteProprio: true, igualAoPadrao: false }),
    'The song playing keeps its own equaliser');
});
caso('mexer no padrão não muda a que toca: diz que é na seguinte', () => {
  assert.match(efeitoDoPadrao({ tipo: 'velocidade', temFaixa: true, temAjusteProprio: false, igualAoPadrao: false }), /next one/);
});
caso('quando a que toca já usa o padrão, diz isso', () => {
  assert.match(efeitoDoPadrao({ tipo: 'equalizador', temFaixa: true, temAjusteProprio: false, igualAoPadrao: true }), /uses this equaliser/);
});
caso('sem música, diz a quem se aplica', () => {
  assert.match(efeitoDoPadrao({ tipo: 'velocidade', temFaixa: false, temAjusteProprio: false, igualAoPadrao: true }), /no speed of its own/);
});

console.log('\no resto');
caso('o temporizador diz a hora a que para', () => {
  assert.equal(efeitoDoTemporizador({ restanteS: 15 * 60, agora: new Date(2026, 8, 11, 23, 25) }), 'Stops at 23:40');
  assert.equal(efeitoDoTemporizador({ restanteS: 30 * 60, agora: new Date(2026, 8, 11, 23, 45) }), 'Stops at 00:15');
  assert.equal(efeitoDoTemporizador({ restanteS: 0, agora: new Date() }), null);
});
caso('a normalização diz quanto baixou esta música', () => {
  assert.equal(efeitoDaNormalizacao({ ligada: true, temFaixa: true, loudnessDb: 3.24 }), 'This song: −3.2 dB');
});
caso('e que só baixa: uma mais baixa fica como está', () => {
  assert.match(efeitoDaNormalizacao({ ligada: true, temFaixa: true, loudnessDb: -2 })!, /unchanged/);
});
caso('uma descarregada antes da normalização toca a 100%, e diz porquê', () => {
  assert.match(efeitoDaNormalizacao({ ligada: true, temFaixa: true, loudnessDb: null })!, /No loudness data/);
});
caso('desligada não diz nada', () => assert.equal(efeitoDaNormalizacao({ ligada: false, temFaixa: true, loudnessDb: 3 }), null));
caso('o rádio diz de onde vêm as músicas, pela ordem da cascata', () => {
  assert.match(efeitoDoRadio({ ligado: true, aTocarRadio: false }), /library first, then Flow, then YouTube/);
  assert.match(efeitoDoRadio({ ligado: true, aTocarRadio: true }), /playing now/);
  assert.match(efeitoDoRadio({ ligado: false, aTocarRadio: false }), /stops/);
});
caso('manter o ecrã ligado', () => {
  assert.ok(efeitoDeManterOEcra(true));
  assert.equal(efeitoDeManterOEcra(false), null);
});
caso('limpar a cache avisa que também leva os downloads', () => {
  assert.equal(efeitoDeLimparACache({ bytes: 412 * 1024 * 1024, downloads: 12 }), 'Frees 412 MB · also removes your 12 downloads');
  assert.equal(efeitoDeLimparACache({ bytes: 5 * 1024 * 1024, downloads: 1 }), 'Frees 5.0 MB · also removes your 1 download');
  assert.match(efeitoDeLimparACache({ bytes: 5 * 1024 * 1024, downloads: 0 }), /download again/);
  assert.match(efeitoDeLimparACache({ bytes: 0, downloads: 0 }), /Nothing stored/);
});
caso('tamanhos legíveis', () => {
  assert.equal(tamanho(1.5 * 1024 * 1024 * 1024), '1.5 GB');
  assert.equal(tamanho(0), '0 MB');
});
caso('o PO Token pelo último teste', () => {
  assert.match(efeitoDoPoToken({ url: '', ultimoTeste: null })!, /without it/);
  assert.equal(efeitoDoPoToken({ url: 'http://x', ultimoTeste: null }), 'Not tested yet');
  assert.equal(efeitoDoPoToken({ url: 'http://x', ultimoTeste: { ok: true, ms: 180.4 } }), 'Last test: reachable · 180 ms');
  assert.match(efeitoDoPoToken({ url: 'http://x', ultimoTeste: { ok: false, ms: null } })!, /not reachable/);
});
caso('o Discord: a escuta privada cala-o, e isso diz-se', () => {
  assert.equal(efeitoDoDiscord({ ligado: false, privada: false, estado: null }), null);
  assert.match(efeitoDoDiscord({ ligado: true, privada: true, estado: 'a-mostrar' })!, /private listening/);
  assert.match(efeitoDoDiscord({ ligado: true, privada: false, estado: 'discord-fechado' })!, /closed/);
  assert.match(efeitoDoDiscord({ ligado: true, privada: false, estado: 'a-mostrar' })!, /Showing/);
});

console.log('\ntodas curtas e em inglês');
caso('nenhuma frase passa de 80 caracteres nem traz português', () => {
  const PT = /[ãõçáéíóúâêô]|música|faixa|descarreg|ligad/i;
  const frases = [
    efeitoDaQualidade({ escolha: 'high', motor: 'webview', descarregada: false, kbps: null, codec: null }),
    efeitoDaQualidade({ escolha: 'high', motor: 'native', descarregada: true, kbps: null, codec: null }),
    efeitoDoCrossfade({ segundos: 9, repeatUma: false }),
    efeitoDoPadrao({ tipo: 'equalizador', temFaixa: false, temAjusteProprio: false, igualAoPadrao: true }),
    efeitoDaNormalizacao({ ligada: true, temFaixa: true, loudnessDb: null }),
    efeitoDoRadio({ ligado: true, aTocarRadio: true }),
    efeitoDeLimparACache({ bytes: 999 * 1024 * 1024 * 1024, downloads: 1234 }),
    efeitoDoDiscord({ ligado: true, privada: false, estado: 'discord-fechado' }),
  ].filter((f): f is string => !!f);
  for (const f of frases) {
    assert.ok(f.length <= 80, `${f.length}: ${f}`);
    assert.ok(!PT.test(f), f);
  }
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');
