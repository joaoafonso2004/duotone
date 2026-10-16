// O vídeo no Now Playing do PC (16/10).
// Correr: node --experimental-strip-types scripts/test-video-no-leitor.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deveMostrarVideo, ESPERA_NO_ARRANQUE_MS, ESTILO_NO_PALCO, MARGEM_DO_FIM_MS } from '../src/lib/videoNoLeitor.ts';

const base = {
  ligado: true, temPalco: true, aTocar: true, aTocarDesde: 0, posicaoMs: 60_000, duracaoMs: 200_000, agora: 30_000,
};
assert.equal(deveMostrarVideo(base), true, 'ligado, com palco, a tocar há uns segundos');
assert.equal(deveMostrarVideo({ ...base, ligado: false }), false, 'desligado: a capa');
assert.equal(deveMostrarVideo({ ...base, temPalco: false }), false, 'sem o Now Playing aberto (ou com a letra): em casa');
assert.equal(deveMostrarVideo({ ...base, aTocar: false }), false, 'em pausa: a capa (a sobreposição de pausa do player não se vê)');
assert.equal(deveMostrarVideo({ ...base, aTocarDesde: null }), false, 'o motor ainda não confirmou que toca');
assert.equal(deveMostrarVideo({ ...base, agora: ESPERA_NO_ARRANQUE_MS - 1 }), false, 'no arranque espera (o título do vídeo)');
assert.ok(ESPERA_NO_ARRANQUE_MS >= 5000, 'as sobreposições do player ainda se viam aos 4 s (medido no browser)');
assert.equal(deveMostrarVideo({ ...base, agora: ESPERA_NO_ARRANQUE_MS }), true);
assert.equal(deveMostrarVideo({ ...base, posicaoMs: 200_000 - MARGEM_DO_FIM_MS }), false, 'nos últimos segundos: a capa (os ecrãs finais)');
assert.equal(deveMostrarVideo({ ...base, duracaoMs: 0 }), true, 'sem duração conhecida não se esconde por isso');
assert.match(ESTILO_NO_PALCO, /pointer-events:none/, 'o vídeo nunca recebe cliques (nem mostra os controlos do player)');
assert.match(ESTILO_NO_PALCO, /width:177\.78%/, 'enche o quadrado: 16:9 cortado dos lados');

// O motor: muda o iframe com `moveBefore` (não recarrega), e só o do ATIVO.
const motor = readFileSync(new URL('../src/components/YouTubePlayerView.web.tsx', import.meta.url), 'utf8');
assert.match(motor, /\(palco as any\)\.moveBefore\(ativo, null\)/);
assert.match(motor, /\(casa as any\)\.moveBefore\(iframe, irmao\)/, 'e volta para o mesmo lugar em casa');
assert.match(motor, /paraCasa\(outro\);/, 'o player do crossfade fica sempre em casa');
assert.match(motor, /if \(s === 3\) \{\s*state\._setBuffering\(true\);\s*if \(aTocarDesdeRef\.current != null\) \{ aTocarDesdeRef\.current = null; aplicarVideo\(\); \}/,
  'o buffering esconde o vídeo (o círculo de carregar também é do player)');
for (const v of ['iv_load_policy: 3', 'fs: 0', 'disablekb: 1']) {
  assert.equal(motor.split(v).length - 1, 2, `${v} nos dois players`);
}
// O palco devolve o iframe ANTES de sair do DOM: a limpeza de um efeito de layout.
const pagina = readFileSync(new URL('../src/desktop/paginas/NowPlayingPage.web.tsx', import.meta.url), 'utf8');
assert.match(pagina, /useLayoutEffect\(\(\) => \{\s*useVideoNoLeitor\.getState\(\)\.definirPalco\(ref\.current\);\s*return \(\) => useVideoNoLeitor\.getState\(\)\.definirPalco\(null\);/);
assert.match(pagina, /\{videoLigado && !showLyrics \? <PalcoDoVideo lado=\{ladoCapa\} \/> : null\}/, 'sem palco com a letra à frente');
assert.match(pagina, /modo=\{videoAVista \? 'off' : glitch\}/, 'o efeito da capa pára por baixo do vídeo');
console.log('Vídeo no leitor do PC: quando se mostra, como enche a capa, o iframe que muda sem recarregar e o regresso a casa passaram.');
