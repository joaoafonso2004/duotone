import { capaDeRecurso, capaGrandeDaFaixa, desfoqueLeve } from '../src/lib/capaGrande.ts';

let mau = 0;
const eq = (rotulo: string, veio: unknown, esperado: unknown) => {
  const ok = JSON.stringify(veio) === JSON.stringify(esperado);
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${ok ? '' : `  -> esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(veio)}`}`);
};

const yt = { source: 'youtube', sourceId: 'abc123', artworkUrl: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg' };

console.log('\na capa grande do leitor');
eq('uma faixa do YouTube pede a maxres', capaGrandeDaFaixa(yt, new Set()), 'https://i.ytimg.com/vi/abc123/maxresdefault.jpg');
// A mesma URL que o pré-carregamento pediu: senão a cache não servia de nada.
eq('é sempre a mesma para a mesma faixa', capaGrandeDaFaixa(yt, new Set()), capaGrandeDaFaixa({ ...yt }, new Set()));
eq('quem não tem maxres vai direto à hq', capaGrandeDaFaixa(yt, new Set(['abc123'])), 'https://i.ytimg.com/vi/abc123/hqdefault.jpg');
eq('fora do YouTube fica a capa que a faixa traz',
  capaGrandeDaFaixa({ source: 'spotify', sourceId: 'x', artworkUrl: 'https://img/x.jpg' }, new Set()), 'https://img/x.jpg');
eq('sem capa nenhuma não inventa', capaGrandeDaFaixa({ source: 'spotify', sourceId: 'x', artworkUrl: null }, new Set()), null);

console.log('\na de recurso');
eq('no YouTube é a hqdefault', capaDeRecurso(yt), 'https://i.ytimg.com/vi/abc123/hqdefault.jpg');
eq('fora dele é a mesma da faixa', capaDeRecurso({ source: 'spotify', sourceId: 'x', artworkUrl: 'https://img/x.jpg' }), 'https://img/x.jpg');

console.log('\no desfoque');
eq('a maxres desfoca-se pela mqdefault, com 1/4 do raio', desfoqueLeve('https://i.ytimg.com/vi/abc123/maxresdefault.jpg', 64), { uri: 'https://i.ytimg.com/vi/abc123/mqdefault.jpg', raio: 16 });
eq('a hqdefault também, na proporção dela', desfoqueLeve('https://i.ytimg.com/vi/abc123/hqdefault.jpg', 28), { uri: 'https://i.ytimg.com/vi/abc123/mqdefault.jpg', raio: 19 });
eq('a mqdefault fica igual', desfoqueLeve('https://i.ytimg.com/vi/abc123/mqdefault.jpg', 28), { uri: 'https://i.ytimg.com/vi/abc123/mqdefault.jpg', raio: 28 });
eq('fora do YouTube não mexe', desfoqueLeve('https://img/x.jpg', 64), { uri: 'https://img/x.jpg', raio: 64 });
eq('sem capa, nada', desfoqueLeve(null, 64), null);
eq('nunca raio zero', desfoqueLeve('https://i.ytimg.com/vi/abc123/maxresdefault.jpg', 1)?.raio, 1);

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);
