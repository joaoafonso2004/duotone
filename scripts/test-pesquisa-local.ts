/**
 * A pesquisa na própria biblioteca.
 *
 * Os títulos aqui são do género que esta biblioteca tem mesmo: títulos crus do
 * YouTube, com o nome do artista lá dentro e sufixos por todo o lado. É contra
 * eles que a ordenação tem de fazer sentido.
 */
import {
  pesquisarNaBiblioteca, pontuarNaPesquisa, type FaixaPesquisavel,
} from '../src/lib/pesquisaLocal.ts';

let mau = 0;
const check = (rotulo: string, ok: boolean, extra = '') => {
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${extra ? '  -> ' + extra : ''}`);
};
const eq = (rotulo: string, veio: unknown, esperado: unknown) =>
  check(rotulo, veio === esperado, veio === esperado ? '' : `esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(veio)}`);

const f = (title: string, artist: string | null = 'Playboi Carti', album: string | null = null): FaixaPesquisavel =>
  ({ title, artist, album });

console.log('\na pontuação');
eq('título igual vale tudo', pontuarNaPesquisa('magnolia', f('Magnolia')), 100);
eq('acentos e caixa não contam', pontuarNaPesquisa('MAGNÓLIA', f('magnolia')), 100);
check('título que começa pela pesquisa vale mais do que o que só a contém',
  pontuarNaPesquisa('magnolia', f('Magnolia (Official Video)'))
  > pontuarNaPesquisa('magnolia', f('Playboi Carti - Magnolia')));
eq('nada a ver dá zero', pontuarNaPesquisa('magnolia', f('Sky')), 0);
eq('pesquisa vazia dá zero', pontuarNaPesquisa('   ', f('Magnolia')), 0);
eq('o álbum também conta, por último', pontuarNaPesquisa('die lit', f('Sky', 'Playboi Carti', 'Die Lit')), 15);

// A regra que decide a ordem, e a razão de ela existir: os títulos crus do
// YouTube trazem o nome do artista lá dentro, por isso procurar um artista
// casa com o título de TODAS as faixas dele. Se isso ganhasse ao nome do
// artista, a ordem dentro do artista passava a ser sorte.
console.log('\num artista certo vale mais do que um título por acaso');
check('artista exacto ganha a título que só contém',
  pontuarNaPesquisa('playboi carti', f('Sky', 'Playboi Carti'))
  > pontuarNaPesquisa('playboi carti', f('Playboi Carti - Sky (Audio)', 'Alguém')));

console.log('\na ordem dos resultados');
{
  const biblioteca = [
    f('Playboi Carti - Magnolia (Official Video)'),
    f('Sky'),
    f('Magnolia'),
    f('Magnolia (slowed + reverb)'),
  ];
  const r = pesquisarNaBiblioteca('magnolia', biblioteca);
  eq('as que não respondem ficam de fora', r.length, 3);
  eq('a igual vem primeiro', r[0].title, 'Magnolia');
  eq('depois a que começa pela pesquisa', r[1].title, 'Magnolia (slowed + reverb)');
  eq('e por fim a que só a contém', r[2].title, 'Playboi Carti - Magnolia (Official Video)');
}

console.log('\nentre iguais, fica a ordem que vinha');
{
  // A biblioteca chega com o mais recente primeiro. Entre dois `Magnolia`, o
  // de ontem interessa mais do que o de há três anos.
  const r = pesquisarNaBiblioteca('magnolia', [f('Magnolia', 'Recente'), f('Magnolia', 'Antiga')]);
  eq('a mais recente mantém-se à frente', r[0].artist, 'Recente');
}

console.log('\nos limites');
{
  const muitas = Array.from({ length: 40 }, (_, i) => f(`Carti ${i}`, 'Playboi Carti'));
  eq('não devolve a biblioteca toda', pesquisarNaBiblioteca('carti', muitas).length, 12);
  eq('e respeita um limite dado', pesquisarNaBiblioteca('carti', muitas, 3).length, 3);
}
eq('pesquisa vazia não devolve nada', pesquisarNaBiblioteca('', [f('Magnolia')]).length, 0);
eq('biblioteca vazia não rebenta', pesquisarNaBiblioteca('magnolia', []).length, 0);
check('artista nulo não rebenta', pesquisarNaBiblioteca('magnolia', [f('Magnolia', null)]).length === 1);

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);
