// O que sobra no campo depois de a mensagem seguir.
//
// A guarda anterior comparava a string inteira com o rascunho capturado, e o
// que seguia era o `trim` dele: bastava um espaço de diferença -- o corrector
// a fechar uma palavra ao carregar em Send -- para nada ser limpo.
import assert from 'node:assert/strict';

/** A mesma conta do `send` no SocialHub. */
function sobraNoCampo(agora: string, rascunho: string): string {
  const enviado = rascunho.trim();
  return agora.trim() === enviado ? ''
    : agora.startsWith(rascunho) ? agora.slice(rascunho.length).trimStart()
    : agora;
}

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

verificar('o caso normal limpa o campo', () => {
  assert.equal(sobraNoCampo('olá', 'olá'), '');
});

verificar('um espaço a mais não impede a limpeza', () => {
  // É este o bug: o corrector do iOS fecha a palavra ao enviar e acrescenta
  // um espaço depois de o rascunho ter sido capturado.
  assert.equal(sobraNoCampo('olá ', 'olá'), '');
  assert.equal(sobraNoCampo('olá', 'olá '), '');
  assert.equal(sobraNoCampo('olá\n', 'olá'), '');
});

verificar('o que se escreve DURANTE o envio fica', () => {
  // A razão de haver guarda nenhuma. Sem isto, escrever enquanto a mensagem
  // sobe apagava o que se estava a escrever.
  assert.equal(sobraNoCampo('olá e mais', 'olá'), 'e mais');
});

verificar('um campo trocado por completo não se toca', () => {
  // Apagar tudo e escrever outra coisa durante o envio: o que lá está é do
  // utilizador e não tem nada a ver com o que seguiu.
  assert.equal(sobraNoCampo('outra coisa', 'olá'), 'outra coisa');
});

verificar('campo vazio continua vazio', () => {
  assert.equal(sobraNoCampo('', 'olá'), '');
});

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log('\nRascunho: sai o que seguiu, fica o que não seguiu.');
