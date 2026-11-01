/**
 * O outro aparelho a tocar (1/11, `docs/continuar-aqui-maquete.html`): o aviso
 * é só a chegada, o X marca a sessão como vista (já não cala 15 min), e fica um
 * sítio a que se volta -- o botão na barra do PC, a lingueta e o mini do
 * iPhone. Tudo lê a mesma sessão: nada de pedidos novos. As regras são puras
 * (`lib/handoff.ts`); a ligação lê-se como TEXTO.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-outro-aparelho.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { deveAvisar, vistosQueFicam, type RemoteSession } from '../src/lib/handoff.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

const sessao = (deviceId: string): RemoteSession => ({
  deviceId, deviceName: '', deviceKind: 'desktop',
  track: { source: 'youtube', sourceId: 'x', title: 'Song', artist: 'Artist', album: null, artworkUrl: null, durationSeconds: 161 },
  queue: [], queueIndex: 0, positionMs: 0, isPlaying: true, updatedAt: new Date(0).toISOString(), idadeMs: 0, lidaEm: 0, ritmo: 1,
} as RemoteSession);

console.log('\no X marca como visto');
caso('uma oferta por ver avisa; vista, não', () => {
  assert.equal(deveAvisar(sessao('pc'), []), true);
  assert.equal(deveAvisar(sessao('pc'), ['pc']), false);
  assert.equal(deveAvisar(null, []), false);
});
caso('o visto fica enquanto a sessão desse aparelho fica, e sai quando ela sai', () => {
  assert.deepEqual(vistosQueFicam(['pc'], sessao('pc')), ['pc']);
  assert.deepEqual(vistosQueFicam(['pc'], null), [], 'parou de vez: da próxima vez avisa outra vez');
  assert.deepEqual(vistosQueFicam(['pc'], sessao('ipad')), []);
});

console.log('\na ligação');
const sync = ler('src/lib/sessionSync.ts');
caso('o X chama o verOAviso, e os 15 min ficam só para quem assume', () => {
  assert.match(sync, /const dismiss = useCallback\(\(\) => \{\n\s+if \(oferta\) verOAviso\(oferta\.deviceId\);/);
  assert.match(sync, /dismissDevice\(session\.deviceId\);/, 'o takeOverSession continua a silenciar a origem');
  assert.match(sync, /useOutroAparelho\.setState\(oferta \? \{ oferta, aviso \} : \{ oferta: null, aviso: false, aberto: false \}\);/);
});
caso('uma só leitura das sessões: o hook só se chama nos dois avisos', () => {
  const todos = (pasta: string): string[] => readdirSync(pasta).flatMap((n) => {
    const f = join(pasta, n);
    return statSync(f).isDirectory() ? todos(f) : /\.tsx?$/.test(n) ? [f.replace(/\\/g, '/')] : [];
  });
  const chamam = todos('src').filter((f) => /useHandoffSession\(\)/.test(ler(f)) && !f.endsWith('lib/sessionSync.ts'));
  assert.deepEqual(chamam.sort(), ['src/components/HandoffBanner.tsx', 'src/components/HandoffBanner.web.tsx']);
  for (const f of ['src/components/OutroAparelho.tsx', 'src/desktop/OutroAparelho.web.tsx', 'src/state/outroAparelho.ts', 'src/lib/comandarOutro.ts']) {
    assert.ok(!/fetchOtherSessions|supabase\./.test(ler(f)), `${f} não vai à rede por si`);
  }
});
caso('PC: o botão com o nome do aparelho na barra, e a barra dele sem nada a tocar aqui', () => {
  const casca = ler('src/desktop/casca.web.tsx');
  assert.match(casca, /if \(!p\.current\) return <BarraDoOutroAparelho \/>;/);
  assert.match(casca, /<BotaoDoOutroAparelho \/>\n\s+<BarraDoVolume \/>/);
  const aviso = ler('src/components/HandoffBanner.web.tsx');
  assert.match(aviso, /if \(!session \|\| !aviso\) return null;/);
  assert.match(aviso, /document\.getElementById\(ID_DO_BOTAO\)/, 'o X voa para o botão');
  assert.match(aviso, /prefers-reduced-motion: reduce/);
});
caso('iPhone: a lingueta com música aqui, o mini do outro sem ela, e a folha', () => {
  const doca = ler('src/components/Doca.tsx');
  assert.match(doca, /\{modo === 'separadores' && comMusicaNaLoja \? <LinguetaDoOutroAparelho alturaDoVidro=\{altura\} \/> : null\}/);
  assert.match(doca, /\{modo !== 'escondida' && !comMusicaNaLoja \? <MiniDoOutroAparelho \/> : null\}/);
  assert.match(doca, /const temMusica = \(comMusicaNaLoja && !aFechar\) \|\| \(doOutro && !comMusicaNaLoja\);/);
  assert.match(ler('src/navigation/RootNavigator.tsx'), /<HandoffBanner \/>[\s\S]{0,200}<FolhaDoOutroAparelho \/>/);
  const aviso = ler('src/components/HandoffBanner.tsx');
  assert.match(aviso, /if \(!session \|\| !aviso \|\| expanded\) return null;/);
  assert.ok(!/Control .* from here/.test(aviso), 'a linha solta "Control PC from here" saiu');
});
caso('o leitor do iPhone (Now Playing e o mini de cá) não mudou', () => {
  assert.ok(!/OutroAparelho|outroAparelho/.test(ler('src/components/PlayerRoot.tsx')));
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');
