import {
  replayMountedSource,
  requestPause,
  requestPlay,
  restoredPlaybackState,
  samePlaybackSource,
  type PlaybackControls,
} from '../src/lib/playerLifecycle.ts';

let bad = 0;
const check = (label: string, condition: boolean, extra = '') => {
  if (!condition) bad++;
  console.log(`  ${condition ? 'ok   ' : 'FALHA'} ${label}${extra ? '  -> ' + extra : ''}`);
};

const source = (id: string, provider = 'youtube') => ({ source: provider, sourceId: id });
const calls: string[] = [];
const controls: PlaybackControls = {
  play: () => calls.push('play'),
  pause: () => calls.push('pause'),
  seek: (ms) => calls.push(`seek:${ms}`),
};

check('reconhece a mesma fonte restaurada', samePlaybackSource(source('abc'), source('abc')));
check('não confunde providers diferentes', !samePlaybackSource(source('abc'), source('abc', 'spotify')));

const mounted = replayMountedSource(source('abc'), source('abc'), controls);
check('a faixa já montada reutiliza os controlos', mounted === controls);
check('reinicia antes de tocar', calls.join(',') === 'seek:0,play', calls.join(','));

calls.length = 0;
check('uma faixa diferente não reutiliza o iframe', replayMountedSource(source('abc'), source('xyz'), controls) === null);
check('não enviou comandos à faixa errada', calls.length === 0, calls.join(','));

check(
  'controlos reutilizados não deixam o player em buffering',
  !requestPlay(controls).buffering
);

const pendingPlay = requestPlay(null);
check('play antes do onReady fica pendente', pendingPlay.isPlaying && pendingPlay.buffering && pendingPlay.autoplayOnLoad);
check('play pendente limpa o erro anterior', pendingPlay.error === null);

calls.length = 0;
const immediatePlay = requestPlay(controls);
check('play com iframe pronto não fica em buffering', !immediatePlay.buffering);
check('play com iframe pronto envia comando', calls.join(',') === 'play', calls.join(','));

calls.length = 0;
const paused = requestPause(controls);
check('pause atualiza o estado imediatamente', !paused.isPlaying && !paused.buffering);
check('pause envia comando ao iframe', calls.join(',') === 'pause', calls.join(','));

const restored = restoredPlaybackState(42_000);
check('sessão restaurada abre em pausa', !restored.isPlaying && !restored.autoplayOnLoad);
check('sessão restaurada guarda a posição', restored.resumePositionMs === 42_000, String(restored.resumePositionMs));
check('posição quase no início não é retomada', restoredPlaybackState(900).resumePositionMs === null);
check('posição inválida não é retomada', restoredPlaybackState('42000').resumePositionMs === null);

console.log(bad ? `\n  ${bad} falha(s)` : '\n  Todos os casos passaram.');
process.exit(bad ? 1 : 0);
