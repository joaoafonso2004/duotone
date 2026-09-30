import { candidatasDaCapaGrande, capaDeRecurso, capaGrandeDaFaixa, desfoqueLeve } from '../src/lib/capaGrande.ts';

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
const maxres = 'https://i.ytimg.com/vi/abc123/maxresdefault.jpg';
const hq720 = 'https://i.ytimg.com/vi/abc123/hq720.jpg';
const mq = 'https://i.ytimg.com/vi/abc123/mqdefault.jpg';
eq('quem não tem maxres vai à hq720', capaGrandeDaFaixa(yt, new Set([maxres])), hq720);
eq('sem nenhuma das grandes, a mqdefault', capaGrandeDaFaixa(yt, new Set([maxres, hq720])), mq);
eq('a mqdefault nunca se perde, nem marcada', capaGrandeDaFaixa(yt, new Set([maxres, hq720, mq])), mq);
eq('fora do YouTube fica a capa que a faixa traz',
  capaGrandeDaFaixa({ source: 'spotify', sourceId: 'x', artworkUrl: 'https://img/x.jpg' }, new Set()), 'https://img/x.jpg');
eq('sem capa nenhuma não inventa', capaGrandeDaFaixa({ source: 'spotify', sourceId: 'x', artworkUrl: null }, new Set()), null);

console.log('\na de recurso');
eq('no YouTube é a mqdefault', capaDeRecurso(yt), mq);
eq('fora dele é a mesma da faixa', capaDeRecurso({ source: 'spotify', sourceId: 'x', artworkUrl: 'https://img/x.jpg' }), 'https://img/x.jpg');

// 30/9: a hqdefault e a sddefault são 4:3, com barras pretas em cima e em
// baixo -- o recorte quadrado do leitor apanhava-as ao tocar numa música.
console.log('\nnunca uma miniatura 4:3');
eq('nenhuma candidata é 4:3', candidatasDaCapaGrande(yt).filter((u) => /\/(hq|sd)?default\.jpg$/.test(u)), []);
eq('nem depois de falharem as grandes', [capaGrandeDaFaixa(yt, new Set([maxres])), capaGrandeDaFaixa(yt, new Set([maxres, hq720])), capaDeRecurso(yt)]
  .filter((u) => /\/(hq|sd)?default\.jpg$/.test(u ?? '')), []);

console.log('\no desfoque');
eq('a maxres desfoca-se pela mqdefault, com 1/4 do raio', desfoqueLeve('https://i.ytimg.com/vi/abc123/maxresdefault.jpg', 64), { uri: 'https://i.ytimg.com/vi/abc123/mqdefault.jpg', raio: 16 });
eq('a hqdefault também, na proporção dela', desfoqueLeve('https://i.ytimg.com/vi/abc123/hqdefault.jpg', 28), { uri: 'https://i.ytimg.com/vi/abc123/mqdefault.jpg', raio: 19 });
eq('a mqdefault fica igual', desfoqueLeve('https://i.ytimg.com/vi/abc123/mqdefault.jpg', 28), { uri: 'https://i.ytimg.com/vi/abc123/mqdefault.jpg', raio: 28 });
eq('fora do YouTube não mexe', desfoqueLeve('https://img/x.jpg', 64), { uri: 'https://img/x.jpg', raio: 64 });
eq('sem capa, nada', desfoqueLeve(null, 64), null);
eq('nunca raio zero', desfoqueLeve('https://i.ytimg.com/vi/abc123/maxresdefault.jpg', 1)?.raio, 1);

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);
