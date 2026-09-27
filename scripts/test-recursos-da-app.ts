/**
 * A secção "resources" do relatório do PC -- src/lib/recursosDaApp.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-recursos-da-app.ts
 */
import assert from 'node:assert/strict';
import { textoDosRecursos } from '../src/lib/recursosDaApp.ts';

const processos = [
  { tipo: 'Tab', nome: '', cpu: 1.2, memoriaMB: 300, privadaMB: 310 },
  { tipo: 'GPU', nome: '', cpu: 0.5, memoriaMB: 120, privadaMB: 390 },
  { tipo: 'Browser', nome: '', cpu: 0.1, memoriaMB: 65, privadaMB: 80 },
];

const texto = textoDosRecursos({
  janela: 'visivel', processos, youtube: [{ largura: 256, altura: 144, aTocar: true }, null],
  escondida: { janela: 'minimizada', em: '2026-09-27T10:00:00Z', processos, youtube: [] },
})!;

assert.match(texto, /^== resources ==/);
assert.match(texto, /Tab: 300 MB \(private 310 MB\), CPU 1\.2%/);
assert.ok(texto.indexOf('Tab:') < texto.indexOf('GPU:'), 'o que gasta mais memória vem primeiro');
assert.match(texto, /total: 485 MB, CPU 1\.8%/, 'soma memória e CPU');
assert.match(texto, /YouTube player 1: 256x144 video, playing/, 'diz o tamanho do vídeo descodificado');
assert.match(texto, /YouTube player 2: no video/);
assert.match(texto, /last minute hidden \(window minimizada, 2026-09-27T10:00:00Z\)/);

const semAmostra = textoDosRecursos({ janela: 'visivel', processos, youtube: [], escondida: null })!;
assert.match(semAmostra, /no sample yet/, 'sem amostra escondida diz como a obter');

assert.equal(textoDosRecursos(null), null, 'no browser não há secção');
assert.equal(textoDosRecursos({ janela: 'visivel', processos: [], youtube: [] }), null);

console.log('Recursos da app no relatório: passou.');
