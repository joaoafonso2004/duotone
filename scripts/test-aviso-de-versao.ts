import { resumirNotas, rotuloDaAtualizacao } from '../src/lib/avisoDeVersao.ts';

let mau = 0;
const eq = (rotulo: string, veio: unknown, esperado: unknown) => {
  const ok = veio === esperado;
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${ok ? '' : `  -> esperado "${esperado}", veio "${veio}"`}`);
};

console.log('\nas notas');
// As notas da 3.2.0 como o aviso as mostrou (14/9): só a linha do meio é da versão.
eq('as linhas do git saem',
  resumirNotas('- release: Duotone 3.2.0\n- Responder a mensagens\n\nComparar com win-v3.1.0: https://github.com/x/compare/a...b').join('|'),
  'Responder a mensagens');
eq('o título da versão sai', resumirNotas('Duotone 3.2.0\n\n- Uma coisa nova').join('|'), 'Uma coisa nova');
eq('as marcas de markdown saem', resumirNotas('## **Nova** `coisa`').join('|'), 'Nova coisa');
eq('um link solto sai', resumirNotas('- A coisa\nhttps://exemplo.test').join('|'), 'A coisa');
eq('no máximo quatro linhas', resumirNotas('- a\n- b\n- c\n- d\n- e').length, 4);
eq('sem notas não rebenta', resumirNotas('').length, 0);

console.log('\no botão');
eq('antes de carregar', rotuloDaAtualizacao('parada', 0), 'Update now');
eq('a descarregar mostra a percentagem', rotuloDaAtualizacao('a-descarregar', 0.426), 'Downloading… 43%');
eq('a percentagem não passa dos 100', rotuloDaAtualizacao('a-descarregar', 1.4), 'Downloading… 100%');
eq('um progresso estragado fica a 0', rotuloDaAtualizacao('a-descarregar', Number.NaN), 'Downloading… 0%');
eq('a instalar diz que reabre', rotuloDaAtualizacao('a-instalar', 1), 'Installing — Duotone will reopen');
eq('depois de falhar', rotuloDaAtualizacao('falhou', 0.3), 'Try again');

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);
