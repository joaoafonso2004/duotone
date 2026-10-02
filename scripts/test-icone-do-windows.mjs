// O ícone do Duotone no Windows (2/10): electron/icone.ico, gerado por
// scripts/gerar-icone-do-tabuleiro.py a partir do logo_windows.png.
//
// Correr: node scripts/test-icone-do-windows.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ler = (f) => readFileSync(new URL(`../${f}`, import.meta.url));

// Cada tamanho à parte, como PNG: o Windows escolhe o do DPI. O PNG de 1254 px
// encolhido por ele ficava serrilhado no tabuleiro.
const ico = ler('electron/icone.ico');
assert.equal(ico.readUInt16LE(2), 1, 'é um .ico');
const n = ico.readUInt16LE(4);
const lados = [];
for (let i = 0; i < n; i++) {
  const lado = ico[6 + 16 * i] || 256;
  const tamanho = ico.readUInt32LE(6 + 16 * i + 8), pos = ico.readUInt32LE(6 + 16 * i + 12);
  assert.ok(pos + tamanho <= ico.length, `a entrada de ${lado} px cabe no ficheiro`);
  assert.equal(ico.subarray(pos, pos + 8).toString('hex'), '89504e470d0a1a0a', `a entrada de ${lado} px é um PNG`);
  assert.equal(ico.readUInt32BE(pos + 16), lado, `o PNG de ${lado} px tem ${lado} px`);
  lados.push(lado);
}
for (const lado of [16, 20, 24, 32, 48, 256]) assert.ok(lados.includes(lado), `tem ${lado} px`);

// O tabuleiro e as janelas usam-no no Windows; o pacote leva-o (electron/**).
const principal = ler('electron/main.cjs').toString();
assert.match(principal, /const ICONE = process\.platform === 'win32'\s*\? path\.join\(__dirname, 'icone\.ico'\)/);
assert.match(principal, /tray = new Tray\(ICONE\)/);
assert.doesNotMatch(principal, /icon: path\.join\(__dirname, '\.\.', 'logo_windows\.png'\)/, 'as janelas também usam o .ico');
const pacote = JSON.parse(ler('package.json').toString());
assert.ok(pacote.build.files.includes('electron/**/*'), 'o .ico entra no pacote');
assert.equal(pacote.build.win.icon, 'logo_windows.png', 'o executável e o instalador continuam no logo (CLAUDE.md)');

console.log(`Ícone do Windows: ${lados.sort((a, b) => a - b).join(', ')} px, no tabuleiro e nas janelas.`);
