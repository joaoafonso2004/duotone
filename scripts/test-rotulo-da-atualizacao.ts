/**
 * A linha "Check for updates" do About do PC diz quanto falta ao download (20/10).
 * Correr: node --experimental-strip-types scripts/test-rotulo-da-atualizacao.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lerDescarga, rotuloDaProcuraDeAtualizacoes as rotulo } from '../src/lib/rotuloDaAtualizacao.ts';

const base = { descarga: null, versaoNova: null, instalaNaApp: true, aProcurar: false };

assert.equal(rotulo(base), 'Check for updates');
assert.equal(rotulo({ ...base, aProcurar: true }), 'Checking for updates…', 'a procurar, ainda sem download');
assert.equal(rotulo({ ...base, aProcurar: true, descarga: { versao: '5.3.0', fracao: 0.362 } }), 'Downloading Duotone 5.3.0… 36%', 'o download ganha ao "Checking"');
assert.equal(rotulo({ ...base, descarga: { versao: '5.3.0', fracao: 0 } }), 'Downloading Duotone 5.3.0… 0%', 'o automático, sem ninguém ter carregado');
assert.equal(rotulo({ ...base, descarga: { versao: '5.3.0', fracao: 0.999 } }), 'Downloading Duotone 5.3.0… 99%', 'nunca 100% a meio');
assert.equal(rotulo({ ...base, versaoNova: '5.3.0' }), 'Update to Duotone 5.3.0');
assert.equal(rotulo({ ...base, versaoNova: '5.3.0', instalaNaApp: false }), 'Download Duotone 5.3.0');

assert.deepEqual(lerDescarga({ versao: '5.3.0', fracao: 0.5 }), { versao: '5.3.0', fracao: 0.5 });
assert.deepEqual(lerDescarga({ versao: '5.3.0', fracao: 7 }), { versao: '5.3.0', fracao: 1 });
assert.deepEqual(lerDescarga({ versao: '5.3.0', fracao: 'x' }), { versao: '5.3.0', fracao: 0 });
assert.equal(lerDescarga(null), null, 'acabou');
assert.equal(lerDescarga({ versao: '<b>', fracao: 0.5 }), null, 'só versões x.y.z');

// As peças: o processo principal manda, a ponte limpa, o About ouve.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const main = ler('electron/main.cjs');
assert.match(main, /aoProgresso: \(fracao\) => \{ estadoDaDescarga = \{ versao: alvo\.versao, fracao \}; avisarDescarga\(\); \}/);
assert.match(main, /ipcMain\.handle\('atualizacao:descarga', \(event\) => \(daJanelaPrincipal\(event\) \? estadoDaDescarga : null\)\);/);
const preload = ler('electron/preload.cjs');
assert.match(preload, /onDescargaDaAtualizacao: \(listener\) => \{/);
const definicoes = ler('src/desktop/paginas/SettingsPage.web.tsx');
assert.match(definicoes, /rotuloDaProcuraDeAtualizacoes\(\{ descarga, versaoNova: update\?\.version \?\? null, instalaNaApp, aProcurar: checkingUpdate \}\)/);

console.log('Rótulo da atualização: o download diz quanto falta, e o resto como antes.');
