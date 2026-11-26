/**
 * A Live Activity do Duotone (26/11, item 8 do plano, a opção B): o que o cartão
 * diz, quando existe, e que o Swift dos dois lados fala do mesmo estado.
 *
 * O cartão em si só se vê no iPhone (uma build). Aqui confirma-se que sem Jam, sem
 * temporizador e sem passagem não há atividade, que os textos se traduzem, e que os
 * campos do JavaScript são os do Swift (a app e a extensão têm de ter o MESMO tipo).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  chaveDaAtividade, corDaPessoa, curtaDaLegenda, estadoDaAtividade, inicial, type EstadoDaAtividade,
} from '../src/lib/atividadeAoVivo.ts';
import { FR } from '../src/i18n/fr.ts';
import { criarTradutor } from '../src/i18n/motor.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const agora = 1_800_000_000_000;
const jam = {
  outros: [{ id: 'ana', nome: 'Ana' }, { id: 'rui', nome: 'Rui' }],
  ouvintes: 3,
  quemJuntou: { nome: 'Rui', souEu: false },
  anfitriao: { nome: 'Ana', souEu: false },
};

console.log('\nquando há atividade');
caso('sem Jam, sem temporizador e sem passagem: nenhuma (o ecrã bloqueado como era)', () => {
  assert.equal(estadoDaAtividade({ jam: null, temporizador: null, mistura: null }, agora), null);
  assert.equal(chaveDaAtividade(null), '');
});
caso('um temporizador ou uma passagem que já acabou não conta', () => {
  assert.equal(estadoDaAtividade({ jam: null, temporizador: { inicioMs: agora - 60_000, fimMs: agora - 1 }, mistura: null }, agora), null);
  assert.equal(estadoDaAtividade({ jam: null, temporizador: null, mistura: { para: 'X', legenda: null, cores: ['#111111', '#222222'], acabaEmMs: agora } }, agora), null);
});

console.log('\no que diz');
caso('a Jam: com quem, quem juntou a música, quantos ouvem, as caras', () => {
  const e = estadoDaAtividade({ jam, temporizador: null, mistura: null }, agora)!;
  assert.equal(e.jamTitulo, 'Jam with Ana and Rui');
  assert.equal(e.jamLinha, 'Rui added this song');
  assert.equal(e.jamOuvintes, '3 listening');
  assert.deepEqual(e.jamCaras, [`A${corDaPessoa('ana')}`, `R${corDaPessoa('rui')}`]);
  assert.equal(e.temporizadorTitulo, null); assert.equal(e.misturaTitulo, null);
  const sozinho = estadoDaAtividade({ jam: { outros: [], ouvintes: 1, quemJuntou: null, anfitriao: { nome: 'You', souEu: true } }, temporizador: null, mistura: null }, agora)!;
  assert.equal(sozinho.jamTitulo, 'Your Jam'); assert.equal(sozinho.jamLinha, "You're hosting"); assert.equal(sozinho.jamOuvintes, null);
  const muitos = estadoDaAtividade({ jam: { ...jam, outros: [...jam.outros, { id: 'eva', nome: 'Eva' }, { id: 'zé', nome: 'Zé' }] }, temporizador: null, mistura: null }, agora)!;
  assert.equal(muitos.jamTitulo, 'Jam with Ana, Rui and 2 more');
  assert.equal(muitos.jamCaras.length, 3, 'três caras no máximo');
});
caso('o temporizador: o intervalo em segundos (o iOS conta), ou no fim da música', () => {
  const e = estadoDaAtividade({ jam: null, temporizador: { inicioMs: agora - 30_000, fimMs: agora + 600_000 }, mistura: null }, agora)!;
  assert.equal(e.temporizadorTitulo, 'Music stops in');
  assert.equal(e.temporizadorLinha, 'Sleep timer');
  assert.equal(e.temporizadorInicio, Math.round((agora - 30_000) / 1000));
  assert.equal(e.temporizadorFim, Math.round((agora + 600_000) / 1000));
  assert.equal(e.velhaEmS, Math.round((agora + 600_000) / 1000 + 5));
  const fimDaFaixa = estadoDaAtividade({ jam: null, temporizador: { inicioMs: agora, fimMs: null }, mistura: null }, agora)!;
  assert.equal(fimDaFaixa.temporizadorTitulo, 'Music stops after this song');
  assert.equal(fimDaFaixa.temporizadorFim, null); assert.equal(fimDaFaixa.velhaEmS, null);
});
caso('a passagem do AutoMix: para onde, a legenda, o curto da ilha e as duas cores', () => {
  const e = estadoDaAtividade({ jam, temporizador: null, mistura: { para: 'Low Orbit', legenda: '124 → 128 BPM · 8A → 9A', cores: ['#4a6a8a', '#7a3b5a'], acabaEmMs: agora + 9000 } }, agora)!;
  assert.equal(e.misturaTitulo, 'Mixing into Low Orbit');
  assert.equal(e.misturaLinha, '124 → 128 BPM · 8A → 9A');
  assert.equal(e.misturaCurta, '124→128');
  assert.deepEqual(e.misturaCores, ['#4a6a8a', '#7a3b5a']);
  assert.ok(e.jamTitulo, 'a Jam fica por baixo');
  assert.equal(curtaDaLegenda('8A → 9A'), null);
  const semBpm = estadoDaAtividade({ jam: null, temporizador: null, mistura: { para: 'X', legenda: null, cores: ['#111111', '#222222'], acabaEmMs: agora + 1 } }, agora)!;
  assert.equal(semBpm.misturaCurta, 'AutoMix');
});
caso('as caras: a inicial maiúscula e a cor da pessoa, sempre a mesma', () => {
  assert.equal(inicial('  ana'), 'A'); assert.equal(inicial('élio'), 'É'); assert.equal(inicial(''), '?');
  assert.equal(corDaPessoa('ana'), corDaPessoa('ana'));
  assert.match(corDaPessoa('qualquer'), /^#[0-9a-f]{6}$/);
});

console.log('\nem francês');
caso('os textos montados traduzem-se (os nomes e os títulos ficam)', () => {
  const t = criarTradutor(FR);
  const e = estadoDaAtividade({ jam, temporizador: { inicioMs: agora, fimMs: agora + 60_000 }, mistura: { para: 'Low Orbit', legenda: null, cores: ['#111111', '#222222'], acabaEmMs: agora + 1 } }, agora, t)!;
  assert.equal(e.jamTitulo, 'Jam avec Ana et Rui');
  assert.equal(e.jamLinha, 'Rui a ajouté ce titre');
  assert.equal(e.jamOuvintes, "3 à l'écoute");
  assert.equal(e.temporizadorTitulo, "La musique s'arrête dans");
  assert.equal(e.temporizadorLinha, 'Minuteur de veille');
  assert.equal(e.misturaTitulo, 'Enchaînement vers Low Orbit');
  assert.equal(t('Jam with Ana, Rui and 2 more'), 'Jam avec Ana, Rui et 2 autres');
  assert.equal(t('Your Jam'), 'Votre Jam');
});

console.log('\no Swift');
caso('a app e a extensão têm o MESMO tipo, com os campos do JavaScript', () => {
  const doModulo = ler('modules/duotone-atividade/ios/DuotoneAtividadeAttributes.swift');
  const doAlvo = ler('targets/controlos/DuotoneAtividadeAttributes.swift');
  const corpo = (s: string) => s.slice(s.indexOf('struct DuotoneAtividadeAttributes'));
  assert.equal(corpo(doModulo), corpo(doAlvo), 'os dois tipos são iguais');
  const campos = [...corpo(doModulo).matchAll(/var (\w+): /g)].map((m) => m[1]).filter((c) => c !== 'nome');
  const doJs: (keyof EstadoDaAtividade)[] = [
    'jamTitulo', 'jamLinha', 'jamOuvintes', 'jamCaras', 'temporizadorTitulo', 'temporizadorLinha', 'temporizadorInicio',
    'temporizadorFim', 'misturaTitulo', 'misturaLinha', 'misturaCurta', 'misturaCores',
  ];
  assert.deepEqual(campos, doJs);
  const modulo = ler('modules/duotone-atividade/ios/DuotoneAtividadeModule.swift');
  for (const c of [...doJs, 'velhaEmS']) assert.match(modulo, new RegExp(`@Field var ${c}:`), c);
  // A vista no alvo dos botões, sem App Group, e a app diz ao iOS que tem atividades.
  assert.match(ler('targets/controlos/index.swift'), /AtividadeDoDuotone\(\)/);
  assert.doesNotMatch(ler('targets/controlos/expo-target.config.js'), /entitlements|appGroup|application-groups/);
  assert.match(ler('app.json'), /"NSSupportsLiveActivities": true/);
  // Começar só com a app à frente: a que falhou tenta-se quando ela volta.
  const gancho = ler('src/hooks/useAtividadeAoVivo.ts');
  assert.match(gancho, /a !== 'active' \|\| !falhou\.current/);
  assert.doesNotMatch(gancho, /setInterval/, 'nada corre por segundo');
  assert.match(ler('App.tsx'), /<AtividadeAoVivo \/>/);
});

console.log(falhas ? `\n  ${falhas} caso(s) falharam.\n` : '\n  Todos os casos passaram.\n');
process.exit(falhas ? 1 : 0);
