// Regressões do validador de respostas Range — corre com `npm test`.
//
// O caso que motivou isto foi reproduzido na auditoria: pedir os bytes 4-7 e
// receber uma resposta com `Content-Range: bytes 0-3/8`. Como o TAMANHO batia
// certo, a verificação seguinte (`part.length !== expected`) não apanhava nada
// e os bytes errados iam parar ao offset errado — ficheiro corrompido, zero
// erros pelo caminho.
import assert from 'node:assert/strict';
import { validarRespostaParcial } from '../src/lib/audioRange.ts';

function resposta(status: number, cabecalhos: Record<string, string>) {
  const mapa = new Map(Object.entries(cabecalhos).map(([k, v]) => [k.toLowerCase(), v]));
  return { status, headers: { get: (n: string) => mapa.get(n.toLowerCase()) ?? null } };
}

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok - ${nome}`);
  } catch (e) {
    falhas++;
    console.log(`  FALHOU - ${nome}: ${(e as Error).message}`);
  }
}

console.log('Respostas parciais:');

verificar('o offset errado com o tamanho certo é rejeitado', () => {
  assert.throws(
    () => validarRespostaParcial(
      resposta(206, { 'content-range': 'bytes 0-3/8', 'content-length': '4' }), 4, 7, 8),
    /Content-Range/,
  );
});

verificar('o intervalo pedido é aceite', () => {
  validarRespostaParcial(
    resposta(206, { 'content-range': 'bytes 4-7/8', 'content-length': '4' }), 4, 7, 8);
});

verificar('206 sem Content-Range continua a passar', () => {
  validarRespostaParcial(resposta(206, { 'content-length': '4' }), 4, 7, 8);
});

verificar('Content-Length a menos é rejeitado', () => {
  assert.throws(
    () => validarRespostaParcial(
      resposta(206, { 'content-range': 'bytes 4-7/8', 'content-length': '3' }), 4, 7, 8),
    /Comprimento/,
  );
});

verificar('Content-Length a mais é rejeitado', () => {
  assert.throws(
    () => validarRespostaParcial(
      resposta(206, { 'content-range': 'bytes 4-7/8', 'content-length': '9' }), 4, 7, 8),
    /Comprimento/,
  );
});

verificar('200 com o ficheiro inteiro é aceite', () => {
  validarRespostaParcial(resposta(200, { 'content-length': '8' }), 0, 7, 8);
});

verificar('200 a um pedido parcial é rejeitado', () => {
  assert.throws(
    () => validarRespostaParcial(resposta(200, { 'content-length': '4' }), 4, 7, 8),
    /200/,
  );
});

verificar('um total diferente do pedido é rejeitado', () => {
  assert.throws(
    () => validarRespostaParcial(
      resposta(206, { 'content-range': 'bytes 4-7/16', 'content-length': '4' }), 4, 7, 8),
    /Content-Range/,
  );
});

verificar('intervalo fora do ficheiro é rejeitado', () => {
  assert.throws(() => validarRespostaParcial(resposta(206, {}), 4, 99, 8), /Intervalo/);
});

verificar('estado inesperado é rejeitado', () => {
  assert.throws(() => validarRespostaParcial(resposta(403, {}), 4, 7, 8), /403/);
});

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log('\nValidação de ranges: todos os casos passaram.');
