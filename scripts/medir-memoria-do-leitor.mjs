/**
 * Ensaio local: node --expose-gc scripts/medir-memoria-do-leitor.mjs
 *
 * Store verdadeira, disco e serviços substituídos por duplos. A amostragem
 * do V8 inclui objetos já recolhidos: heapUsed depois de GC só mediria o que
 * ficou vivo. Estes números NÃO medem o Hermes, React nem a ponte nativa.
 * Não corre na suite: alocações amostradas não são um limiar estável de CI.
 */
import { Session } from 'node:inspector';
import './registar-duplos.mjs';

globalThis.fetch = () => { throw new Error('Rede proibida neste ensaio'); };
const { usePlayer } = await import('../src/state/player.ts');
const { vigiarOLeitor } = await import('../src/state/vigiaDoLeitor.ts');
await new Promise(resolve => setImmediate(resolve));
const queue = Array.from({ length: 30 }, (_, i) => ({
  source: 'youtube', sourceId: `ensaio${i}`, title: `Faixa ${i}`, artist: 'Artista',
  durationSeconds: 240, artworkUrl: null, album: null,
}));
usePlayer.setState({ current: queue[0], queue, queueIndex: 0, isPlaying: true,
  buffering: false, playbackConfirmed: true, maquina: { fase: 'pronto', intencao: 'tocar' } });
const largar = vigiarOLeitor();
let invalidacoesDoLeitor = 0;
const largarContagem = usePlayer.subscribe((s, p) => {
  if (s.maquina !== p.maquina) invalidacoesDoLeitor++;
});
const inspector = new Session();
inspector.connect();
const pedir = (metodo, params = {}) => new Promise((resolve, reject) => {
  inspector.post(metodo, params, (erro, r) => erro ? reject(erro) : resolve(r));
});

async function medir(nome, acao, n = 10_000) {
  for (let i = 0; i < 100; i++) acao(i);
  globalThis.gc?.();
  invalidacoesDoLeitor = 0;
  await pedir('HeapProfiler.startSampling', { samplingInterval: 512,
    includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const inicio = performance.now();
  for (let i = 0; i < n; i++) acao(i);
  const ms = performance.now() - inicio;
  const { profile } = await pedir('HeapProfiler.stopSampling');
  let total = 0;
  const sitios = [];
  function somar(no) {
    total += no.selfSize;
    if (no.selfSize) sitios.push({ funcao: no.callFrame.functionName,
      ficheiro: no.callFrame.url.split('/').slice(-2).join('/'),
      linha: no.callFrame.lineNumber + 1, bytes: no.selfSize });
    no.children.forEach(somar);
  }
  somar(profile.head);
  sitios.sort((a, b) => b.bytes - a.bytes);
  console.log(JSON.stringify({ nome, chamadas: n, ms: Math.round(ms),
    bytesPorChamada: Math.round(total / n), invalidacoesDoLeitor,
    mbPorMinutoA1Hz: Math.round(total / n * 60 / 1_048_576 * 100) / 100,
    sitios: sitios.slice(0, 5) }, null, 2));
}

try {
  await medir('timeUpdate: buffering e progresso', i => {
    const s = usePlayer.getState();
    s._setBuffering(false);
    s._setProgress(5000 + (i % 200) * 1000, 240000);
  });
  await medir('proximaFaixa linear', () => usePlayer.getState().proximaFaixa());
  usePlayer.setState({ shuffle: true, shuffleOrder: queue.map(t => `${t.source}:${t.sourceId}`) });
  await medir('proximaFaixa shuffle', () => usePlayer.getState().proximaFaixa());
} finally {
  largar(); largarContagem(); inspector.disconnect();
  // A store programa uma escrita adiada; o ensaio não precisa de esperar por ela.
  await usePlayer.persist.clearStorage();
}
