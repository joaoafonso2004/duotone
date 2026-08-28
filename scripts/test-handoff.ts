import {
  extrapolatedPositionMs,
  isSessionFresh,
  pickHandoffSession,
  shouldOfferHandoff,
  trimQueueForSync,
  SESSION_TTL_MS,
  type RemoteSession,
} from '../src/lib/handoff.ts';
import type { Track } from '../src/types.ts';

let bad = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (!cond) bad++;
  console.log(`  ${cond ? 'ok   ' : 'FALHA'} ${label}${extra ? '  -> ' + extra : ''}`);
};

const NOW = 1_700_000_000_000;
const track = (id: string, durationSeconds: number | null = 200): Track => ({
  source: 'youtube', sourceId: id, title: `Faixa ${id}`, artist: 'Alguém',
  album: null, artworkUrl: null, durationSeconds,
});

const session = (over: Partial<RemoteSession> = {}): RemoteSession => ({
  deviceId: 'iphone', deviceName: 'iPhone', deviceKind: 'ios',
  track: track('a'), queue: [track('a')], queueIndex: 0,
  positionMs: 30_000, isPlaying: true,
  updatedAt: new Date(NOW - 10_000).toISOString(),
  ...over,
});

// --- frescura ---------------------------------------------------------------
check('sessão recente é fresca', isSessionFresh(session(), NOW));
check(
  'sessão para lá do TTL não é fresca',
  !isSessionFresh(session({ updatedAt: new Date(NOW - SESSION_TTL_MS - 1000).toISOString() }), NOW)
);
check('updatedAt inválido não é fresco', !isSessionFresh(session({ updatedAt: 'nao-e-data' }), NOW));
// Relógio deste dispositivo atrasado face a quem escreveu: não esconder.
check('escrita "no futuro" conta como fresca', isSessionFresh(session({ updatedAt: new Date(NOW + 5000).toISOString() }), NOW));

// --- escolha da sessão ------------------------------------------------------
check('sem sessões não há handoff', pickHandoffSession([], 'pc', NOW) === null);
// O caso que motiva o deviceId: o PC não se pode oferecer a si próprio.
check(
  'ignora o próprio dispositivo',
  pickHandoffSession([session({ deviceId: 'pc' })], 'pc', NOW) === null
);
check(
  'ignora sessões velhas',
  pickHandoffSession(
    [session({ updatedAt: new Date(NOW - SESSION_TTL_MS - 1).toISOString() })],
    'pc', NOW
  ) === null
);
const escolhida = pickHandoffSession(
  [
    session({ deviceId: 'ipad', isPlaying: false, updatedAt: new Date(NOW - 1000).toISOString() }),
    session({ deviceId: 'iphone', isPlaying: true, updatedAt: new Date(NOW - 40_000).toISOString() }),
  ],
  'pc', NOW
);
check('a tocar ganha a mais recente em pausa', escolhida?.deviceId === 'iphone', String(escolhida?.deviceId));
const maisRecente = pickHandoffSession(
  [
    session({ deviceId: 'ipad', updatedAt: new Date(NOW - 50_000).toISOString() }),
    session({ deviceId: 'iphone', updatedAt: new Date(NOW - 5_000).toISOString() }),
  ],
  'pc', NOW
);
check('entre duas a tocar ganha a mais recente', maisRecente?.deviceId === 'iphone', String(maisRecente?.deviceId));

// --- extrapolação da posição -----------------------------------------------
check(
  'posição avança com o tempo decorrido',
  extrapolatedPositionMs(session({ positionMs: 30_000, updatedAt: new Date(NOW - 12_000).toISOString() }), NOW) === 42_000
);
check(
  'em pausa a posição fica onde estava',
  extrapolatedPositionMs(session({ positionMs: 30_000, isPlaying: false, updatedAt: new Date(NOW - 60_000).toISOString() }), NOW) === 30_000
);
// O caso mau: o telemóvel morreu e a sessão ficou parada. O clamp à duração
// impede pedir um seek para lá do fim da faixa.
check(
  'nunca passa da duração da faixa',
  extrapolatedPositionMs(
    session({ track: track('a', 100), positionMs: 90_000, updatedAt: new Date(NOW - 170_000).toISOString() }),
    NOW
  ) === 100_000
);
check(
  'duração desconhecida não impede a extrapolação',
  extrapolatedPositionMs(session({ track: track('a', null), positionMs: 1_000, updatedAt: new Date(NOW - 4_000).toISOString() }), NOW) === 5_000
);
check(
  'relógio adiantado não recua a posição',
  extrapolatedPositionMs(session({ positionMs: 30_000, updatedAt: new Date(NOW + 9_000).toISOString() }), NOW) === 30_000
);

// --- recorte da fila --------------------------------------------------------
const fila = Array.from({ length: 500 }, (_, i) => track(`t${i}`));
const recortada = trimQueueForSync(fila, 300);
check('a fila não viaja inteira', recortada.queue.length === 96, String(recortada.queue.length));
check('o índice aponta para a faixa certa', recortada.queue[recortada.queueIndex].sourceId === 't300', recortada.queue[recortada.queueIndex].sourceId);
const inicio = trimQueueForSync(fila, 0);
check('no início não recua abaixo de zero', inicio.queueIndex === 0 && inicio.queue[0].sourceId === 't0');
const fim = trimQueueForSync(fila, 499);
check('no fim aponta para a última', fim.queue[fim.queueIndex].sourceId === 't499', fim.queue[fim.queueIndex].sourceId);
check('fila vazia degrada em silêncio', trimQueueForSync([], 0).queue.length === 0);
check('índice fora de alcance é preso ao fim', trimQueueForSync(fila, 9999).queue[trimQueueForSync(fila, 9999).queueIndex].sourceId === 't499');

// --- quando oferecer o banner ----------------------------------------------
check('sem sessao nao se oferece nada', !shouldOfferHandoff(null, null));
check('com o player parado oferece-se', shouldOfferHandoff(session(), null));
check('a tocar outra coisa oferece-se', shouldOfferHandoff(session(), track('b')));
// O incomodo que isto mata: logo a seguir ao "Continuar aqui", a sessao do
// telemovel continua fresca durante minutos e o banner voltava a insistir.
check(
  'ja a tocar a mesma faixa nao se oferece',
  !shouldOfferHandoff(session({ track: track('a') }), track('a'))
);
check(
  'mesmo sourceId noutra fonte ainda se oferece',
  shouldOfferHandoff(session({ track: track('a') }), { source: 'spotify', sourceId: 'a' })
);

console.log(bad ? `\n  ${bad} falha(s)` : `\n  Todos os casos passaram.`);
process.exit(bad ? 1 : 0);
