/**
 * Os presets do Customise (26/11, o João: "não tem como guardar preset de
 * customize"): o aspeto de agora com um nome (`lib/presetsDaAparencia.ts`), no
 * aparelho (`state/presetsDaAparencia.ts`), na faixa dos temas do Customise.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-presets-da-aparencia.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aplicarTema, PADRAO, type Aparencia } from '../src/lib/aparencia.ts';
import {
  chaveDoAspeto, comAspetoNovo, comNomeNovo, comPresetNovo, comPresetReposto, lerPresets, MAXIMO_DE_PRESETS,
  nomeDoPreset, nomeSugerido, presetEmUso, semPreset,
} from '../src/lib/presetsDaAparencia.ts';
import { FR } from '../src/i18n/fr.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const minimal: Aparencia = aplicarTema('minimal');
const comMola: Aparencia = { ...PADRAO, molaNaLetra: true, botoes: [...PADRAO.botoes] };

caso('guardar: com nome limpo, até 10, e sem ids repetidos', () => {
  let ps = comPresetNovo([], 'a', '  Noite   escura  ', minimal, 'simple');
  assert.equal(ps.length, 1);
  assert.equal(ps[0].nome, 'Noite escura');
  assert.equal(ps[0].capa, 'simple');
  assert.equal(comPresetNovo(ps, 'b', '   ', PADRAO, 'floating').length, 1, 'sem nome não guarda');
  assert.equal(comPresetNovo(ps, 'a', 'Outro', PADRAO, 'floating').length, 1, 'id repetido não guarda');
  for (let i = 0; i < 20; i++) ps = comPresetNovo(ps, `x${i}`, `P${i}`, PADRAO, 'floating');
  assert.equal(ps.length, MAXIMO_DE_PRESETS);
  assert.equal(nomeDoPreset('x'.repeat(40)).length, 24);
});

caso('o preset em uso é o que tem o aspeto e a capa de agora', () => {
  const ps = comPresetNovo(comPresetNovo([], 'a', 'Minimal meu', minimal, 'simple'), 'b', 'Com mola', comMola, 'floating');
  assert.equal(presetEmUso(ps, minimal, 'simple'), 'a');
  assert.equal(presetEmUso(ps, minimal, 'full'), null, 'a capa conta');
  assert.equal(presetEmUso(ps, comMola, 'floating'), 'b');
  assert.equal(presetEmUso(ps, PADRAO, 'floating'), null);
  // A ordem das chaves não conta (o lerAparencia põe-nas sempre iguais).
  const baralhado = Object.fromEntries(Object.entries(minimal).reverse()) as Aparencia;
  assert.equal(chaveDoAspeto(baralhado, 'simple'), chaveDoAspeto(minimal, 'simple'));
});

caso('ler o que está guardado: lixo fora, opções inválidas voltam ao de sempre', () => {
  assert.deepEqual(lerPresets(null), []);
  assert.deepEqual(lerPresets({ a: 1 }), []);
  const ps = lerPresets([
    { id: 'a', nome: 'Bom', aparencia: { ...minimal }, capa: 'simple' },
    { id: 'a', nome: 'Repetido', aparencia: {}, capa: 'simple' },
    { id: 'b', nome: '', aparencia: {}, capa: 'simple' },
    { id: 'c', nome: 'Capa estranha', aparencia: { listas: 'enorme' }, capa: 'holograma' },
    'lixo',
  ]);
  assert.deepEqual(ps.map((p) => p.id), ['a', 'c']);
  assert.equal(ps[0].aparencia.listas, 'compact');
  assert.equal(ps[1].aparencia.listas, PADRAO.listas);
  assert.equal(ps[1].capa, 'floating');
});

caso('mudar o nome, pôr o aspeto de agora, tirar e repor no mesmo sítio', () => {
  let ps = comPresetNovo(comPresetNovo(comPresetNovo([], 'a', 'A', PADRAO, 'floating'), 'b', 'B', minimal, 'simple'), 'c', 'C', comMola, 'full');
  ps = comNomeNovo(ps, 'b', '  Bê ');
  assert.equal(ps[1].nome, 'Bê');
  assert.equal(comNomeNovo(ps, 'b', '   ')[1].nome, 'Bê', 'um nome vazio não apaga o nome');
  ps = comAspetoNovo(ps, 'a', minimal, 'poster');
  assert.equal(presetEmUso(ps, minimal, 'poster'), 'a');
  assert.equal(ps[0].nome, 'A', 'o nome fica');
  const tirado = ps[1];
  const sem = semPreset(ps, 'b');
  assert.deepEqual(sem.map((p) => p.id), ['a', 'c']);
  assert.deepEqual(comPresetReposto(sem, tirado, 1).map((p) => p.id), ['a', 'b', 'c']);
  assert.equal(comPresetReposto(ps, tirado, 1).length, 3, 'repor o que já lá está não duplica');
});

caso('o nome sugerido é o primeiro "Preset N" livre', () => {
  assert.equal(nomeSugerido([]), 'Preset 1');
  const ps = comPresetNovo(comPresetNovo([], 'a', 'Preset 1', PADRAO, 'floating'), 'b', 'preset 2', PADRAO, 'floating');
  assert.equal(nomeSugerido(ps), 'Preset 3');
});

caso('a store: no aparelho, e aplicar põe as opções e o estilo da capa', () => {
  const s = ler('src/state/presetsDaAparencia.ts');
  assert.match(s, /const CHAVE = 'pref:presetsDaAparencia';/);
  assert.doesNotMatch(s, /supabase/i, 'só no aparelho, como a aparência');
  assert.match(s, /useAparencia\.getState\(\)\.restaurar\(p\.aparencia\);/);
  assert.match(s, /useCapaIOS\.getState\(\)\.setStyle\(p\.capa\)/);
  const ap = ler('src/state/aparencia.ts');
  assert.match(ap, /restaurar: _r, \.\.\.a \} = s;/, 'a função não entra no aspeto guardado');
  assert.match(ap, /restaurar: \(a\) => \{\n\s+set\(lerAparencia\(a\)\);\n\s+guardar\(soAparencia\(get\(\)\)\);/);
});

caso('no Customise: os presets na faixa dos temas, segurar abre o menu, e a caixa do nome depois de ele fechar', () => {
  const c = ler('src/screens/PersonalizarScreen.tsx');
  assert.match(c, /onLongPress=\{segurarPreset\(p\.id\)\}/);
  // Segurar fechava a app (27/11): no toque longo o `currentTarget` já é null.
  assert.doesNotMatch(c, /e\.currentTarget/);
  assert.match(c, /medirNoEcra\(vistasDosPresets\.current\.get\(id\) \?\? null\)/);
  assert.match(c, /usePresetsDaAparencia\.getState\(\)\.aplicar\(p\.id\)/);
  // A caixa do nome é outro Modal: abre no aoFechado do menu, nunca com ele aberto.
  assert.match(c, /aoFechado=\{\(\) => \{ const f = depoisDoMenu\.current; depoisDoMenu\.current = null; f\?\.\(\); \}\}/);
  assert.match(c, /label: 'Rename', icon: 'pencil-outline', onPress: \(\) => fechar\(\(\) => setNomear/);
  assert.match(c, /avisarRemocao\(\{ texto: 'Preset deleted', detalhe: p\.nome, desfazer: repor \}\)/, 'apagar com Undo');
  assert.match(c, /\{!emUso && !cheioDePresets \? \(/, 'o Save só quando o aspeto ainda não é um preset');
  assert.match(c, /<PromptSheet\n\s+visible=\{!!nomear\}/);
});

caso('os textos novos em francês', () => {
  for (const t of ['Save preset', 'Rename preset', 'Update to current look', 'Delete preset', 'Preset saved', 'Preset updated', 'Preset deleted',
    'Save as preset', 'Hold for options', 'Save the look you have now as a preset.',
    'Save the look you have now. Hold a preset to rename, update or delete it.']) {
    assert.ok(FR[t], t);
  }
});

console.log(falhas ? `\n  ${falhas} caso(s) falharam.\n` : '\n  Todos os casos passaram.\n');
process.exit(falhas ? 1 : 0);
