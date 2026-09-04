import { fundirVistos, naoLidasPorAmigo, totalNaoLidas } from '../src/lib/social.ts';

let mau = 0;
const check = (rotulo: string, ok: boolean, extra = '') => {
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${extra ? '  -> ' + extra : ''}`);
};
const eq = (rotulo: string, veio: unknown, esperado: unknown) =>
  check(rotulo, veio === esperado, veio === esperado ? '' : `esperado "${esperado}", veio "${veio}"`);

const de = (id: string, quando: string) => ({ sender: { id }, createdAt: quando });

console.log('\no que substitui a aba Inbox');
// A Inbox era um sitio a mais, mas fazia uma coisa util: dizer que chegou
// coisa nova. Tirando-a sem isto, as partilhas aterravam em silencio.
const recebidas = [
  de('ana', '2026-09-01T10:00:00Z'),
  de('ana', '2026-09-01T12:00:00Z'),
  de('bruno', '2026-09-01T09:00:00Z'),
];

const nenhumaAberta = naoLidasPorAmigo(recebidas, {});
eq('uma conversa nunca aberta conta tudo', nenhumaAberta.get('ana'), 2);
eq('e a do outro tambem', nenhumaAberta.get('bruno'), 1);
eq('o total e a soma', totalNaoLidas(nenhumaAberta), 3);

const aberta = naoLidasPorAmigo(recebidas, { ana: '2026-09-01T11:00:00Z' });
eq('so conta o que chegou DEPOIS de abrir', aberta.get('ana'), 1);
check('quem nao foi aberto nao e afectado', aberta.get('bruno') === 1);

const tudoVisto = naoLidasPorAmigo(recebidas, {
  ana: '2026-09-01T23:00:00Z', bruno: '2026-09-01T23:00:00Z',
});
eq('depois de abrir tudo nao sobra nada', totalNaoLidas(tudoVisto), 0);
check('e quem esta a zero nem aparece no mapa', !tudoVisto.has('ana'));

// O limite exacto: abrir a conversa no instante da mensagem conta como vista.
eq('a mensagem do proprio instante da abertura fica lida',
  naoLidasPorAmigo([de('ana', '2026-09-01T10:00:00Z')], { ana: '2026-09-01T10:00:00Z' }).size, 0);

console.log('\nnao esconde nada por engano');
// Uma data que nao se percebe nao pode fazer desaparecer uma mensagem: na
// duvida conta-se, que o pior e um ponto a mais e nao uma partilha perdida.
eq('data ilegivel na marca conta na mesma',
  naoLidasPorAmigo([de('ana', '2026-09-01T10:00:00Z')], { ana: 'nao e uma data' }).get('ana'), 1);
eq('data ilegivel na mensagem conta na mesma',
  naoLidasPorAmigo([de('ana', 'lixo')], { ana: '2026-09-01T10:00:00Z' }).get('ana'), 1);

console.log('\nnao rebenta');
eq('sem nada recebido', totalNaoLidas(naoLidasPorAmigo([], {})), 0);
eq('sem remetente e ignorado',
  naoLidasPorAmigo([{ sender: { id: '' }, createdAt: '2026-09-01T10:00:00Z' }], {}).size, 0);
eq('total de um mapa vazio', totalNaoLidas(new Map()), 0);

// --- Marca de leitura partilhada entre o PC e o telemovel ---
const LIDO_CEDO = '2026-09-04T10:00:00.000Z';
const LIDO_TARDE = '2026-09-04T12:00:00.000Z';
check('fundir: a conta esta a frente do aparelho',
  fundirVistos({ amigo: LIDO_CEDO }, { amigo: LIDO_TARDE }).amigo === LIDO_TARDE);
check('fundir: o aparelho esta a frente da conta',
  fundirVistos({ amigo: LIDO_TARDE }, { amigo: LIDO_CEDO }).amigo === LIDO_TARDE);
check('fundir: conversa que so existe na conta entra',
  fundirVistos({}, { amigo: LIDO_CEDO }).amigo === LIDO_CEDO);
check('fundir: conversa que so existe no aparelho fica',
  fundirVistos({ amigo: LIDO_CEDO }, {}).amigo === LIDO_CEDO);
check('fundir: data por perceber nao apaga a marca boa',
  fundirVistos({ amigo: LIDO_CEDO }, { amigo: 'nao-e-data' }).amigo === LIDO_CEDO);
check('fundir: grupos usam a mesma chave',
  fundirVistos({}, { 'group:xyz': LIDO_TARDE })['group:xyz'] === LIDO_TARDE);
check('fundir: nao altera o mapa que recebe', (() => {
  const local = { amigo: LIDO_CEDO };
  fundirVistos(local, { amigo: LIDO_TARDE });
  return local.amigo === LIDO_CEDO;
})());

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);
