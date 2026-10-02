import {
  FOLGA_DAS_NOVAS_MS, fundirRecebidas, fundirVistos, haQuantoTempo, marcaDasNovas, naoLidasPorAmigo, totalNaoLidas,
  ultimasPorLer,
} from '../src/lib/social.ts';

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

// A inbox às novas (27/9).
const m = (id: string, createdAt: string) => ({ id, createdAt });
check('novas: sem mensagens, lê-se tudo', marcaDasNovas([]) === null);
check('novas: pede-se da mais recente, com folga para trás',
  marcaDasNovas([m('a', '2026-09-27T10:00:00.000Z'), m('b', '2026-09-27T12:00:00.000Z')])
    === new Date(Date.parse('2026-09-27T12:00:00.000Z') - FOLGA_DAS_NOVAS_MS).toISOString());
check('novas: uma data por perceber não estraga a marca',
  marcaDasNovas([m('a', 'nao-e-data'), m('b', '2026-09-27T12:00:00.000Z')]) !== null);
check('fundir recebidas: a mesma mensagem conta uma vez, e a nova ganha', (() => {
  const juntas = fundirRecebidas([{ ...m('a', '2026-09-27T10:00:00Z'), v: 1 }], [{ ...m('a', '2026-09-27T10:00:00Z'), v: 2 }]);
  return juntas.length === 1 && juntas[0].v === 2;
})());
check('fundir recebidas: da mais recente para a mais antiga',
  fundirRecebidas([m('a', '2026-09-27T10:00:00Z'), m('c', '2026-09-27T08:00:00Z')], [m('b', '2026-09-27T11:00:00Z')])
    .map((r) => r.id).join() === 'b,a,c');
check('fundir recebidas: não mexe nas listas que recebe', (() => {
  const antigas = [m('a', '2026-09-27T10:00:00Z')];
  fundirRecebidas(antigas, [m('b', '2026-09-27T11:00:00Z')]);
  return antigas.length === 1;
})());

console.log('\na última por ler de cada conversa (a linha da lista, 2/10)');
{
  const ms = [
    { id: 'a1', sender: { id: 'ana' }, createdAt: '2026-10-02T10:00:00Z' },
    { id: 'a2', sender: { id: 'ana' }, createdAt: '2026-10-02T10:05:00Z' },
    { id: 'b1', sender: { id: 'bea' }, createdAt: '2026-10-02T09:00:00Z' },
    { id: 'g1', sender: { id: 'ana' }, groupId: 'g', createdAt: '2026-10-02T11:00:00Z' },
  ];
  const u = ultimasPorLer(ms, {});
  eq('a mais recente de cada pessoa, seja qual for a ordem', u.get('ana')?.id, 'a2');
  eq('um grupo é uma conversa à parte', u.get('group:g')?.id, 'g1');
  eq('quem já viste não tem última por ler', ultimasPorLer(ms, { bea: '2026-10-02T09:30:00Z' }).has('bea'), false);
  eq('vista a meio: a última continua a ser a nova', ultimasPorLer(ms, { ana: '2026-10-02T10:01:00Z' }).get('ana')?.id, 'a2');
  eq('e a contagem bate com a mesma regra', naoLidasPorAmigo(ms, { ana: '2026-10-02T10:01:00Z' }).get('ana'), 1);
  eq('as mesmas conversas nos dois', [...u.keys()].sort().join(), [...naoLidasPorAmigo(ms, {}).keys()].sort().join());
}

console.log('\nhá quanto tempo');
{
  const agora = Date.parse('2026-10-02T12:00:00Z');
  eq('agora mesmo', haQuantoTempo('2026-10-02T11:59:40Z', agora), 'now');
  eq('minutos', haQuantoTempo('2026-10-02T11:46:00Z', agora), '14m');
  eq('horas', haQuantoTempo('2026-10-02T09:00:00Z', agora), '3h');
  eq('dias', haQuantoTempo('2026-09-30T12:00:00Z', agora), '2d');
  eq('do futuro (relógio adiantado) não fica negativo', haQuantoTempo('2026-10-02T12:03:00Z', agora), 'now');
  eq('sem data não diz nada', haQuantoTempo('', agora), '');
}

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);
