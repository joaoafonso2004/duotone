/**
 * O ícone da app à escolha (26/11, item 9 do plano): os cinco ícones, os nomes
 * iguais nos três sítios (a lista da app, o plugin que os põe no catálogo do iOS e
 * as miniaturas), os ficheiros como o iOS os quer, e a opção só com o módulo.
 *
 * A troca em si só se vê no iPhone (uma build).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { ICONES_DA_APP, iconeEmUso } from '../src/lib/iconeDaApp.ts';
import { FR } from '../src/i18n/fr.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const raiz = new URL('../', import.meta.url);
const require = createRequire(import.meta.url);

/** Largura, altura e se tem transparência, do cabeçalho do PNG. */
function png(f: string) {
  const b = readFileSync(new URL(f, raiz));
  assert.equal(b.toString('ascii', 1, 4), 'PNG', `${f} é um PNG`);
  return { largura: b.readUInt32BE(16), altura: b.readUInt32BE(20), tipo: b[25] };
}

caso('o de sempre e os quatro da maquete, pela ordem', () => {
  assert.deepEqual(ICONES_DA_APP.map((i) => i.nome), ['Original', 'Metal', 'Two-tone', 'Light', 'Night']);
  assert.equal(ICONES_DA_APP[0].id, null);
  assert.equal(iconeEmUso(null).nome, 'Original');
  assert.equal(iconeEmUso('AppIconNight').nome, 'Night');
  assert.equal(iconeEmUso('UmQueJaNaoExiste').nome, 'Original');
});

caso('o plugin põe no catálogo exatamente os da app, com os mesmos nomes', () => {
  const { ICONES } = require('../plugins/icones-alternativos.js') as { ICONES: Record<string, string> };
  const daApp = Object.fromEntries(ICONES_DA_APP.filter((i) => i.id).map((i) => [i.id, i.ficheiro]));
  assert.deepEqual(ICONES, daApp);
  assert.match(ler('app.json'), /"\.\/plugins\/icones-alternativos"/);
  const plugin = ler('plugins/icones-alternativos.js');
  assert.match(plugin, /ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES/);
  assert.match(plugin, /getFirstTarget\(\)\.firstTarget/, 'só o alvo da app');
});

caso('os ícones: 1024 × 1024, sem transparência (o iOS recusa um ícone com alfa)', () => {
  for (const i of ICONES_DA_APP) {
    if (!i.ficheiro) continue;
    const p = png(i.ficheiro);
    assert.equal(p.largura, 1024); assert.equal(p.altura, 1024);
    assert.equal(p.tipo, 2, `${i.ficheiro} em RGB, sem alfa`);
  }
});

caso('cada ícone tem a sua miniatura no ecrã', () => {
  const ecra = ler('src/components/EscolherIconeDaApp.tsx');
  for (const i of ICONES_DA_APP) {
    const chave = i.id ?? 'original';
    const m = ecra.match(new RegExp(`${chave}: require\\('\\.\\./\\.\\./(assets/icones/previa-[a-z]+\\.png)'\\)`));
    assert.ok(m, `miniatura de ${i.nome}`);
    assert.ok(existsSync(new URL(m![1], raiz)), m![1]);
  }
});

caso('só aparece com o módulo, e num iPhone que troca ícones; a escolha é do iOS', () => {
  const ecra = ler('src/components/EscolherIconeDaApp.tsx');
  assert.match(ecra, /if \(!iconeNativo \|\| !estado\?\.pode\) return null;/);
  assert.match(ecra, /avisarErro\("Couldn't change the icon\."\)/);
  assert.doesNotMatch(ecra, /AsyncStorage|setPref|useAparencia/, 'não se guarda na app: o iOS guarda');
  assert.match(ler('src/screens/PersonalizarScreen.tsx'), /<EscolherIconeDaApp \/>/);
  const swift = ler('modules/duotone-icone/ios/DuotoneIconeModule.swift');
  assert.match(swift, /setAlternateIconName\(nome\)/);
  assert.match(swift, /supportsAlternateIcons/);
});

caso('os textos novos em francês', () => {
  for (const t of ['App icon', 'Two-tone', 'Night', 'iOS shows a short notice when the icon changes.', "Couldn't change the icon."]) {
    assert.ok(FR[t], t);
  }
});

console.log(falhas ? `\n  ${falhas} caso(s) falharam.\n` : '\n  Todos os casos passaram.\n');
process.exit(falhas ? 1 : 0);
