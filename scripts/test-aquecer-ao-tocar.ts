/**
 * Começar a resolver a música quando o dedo pousa (7/10) -- src/lib/aquecerAoTocar.ts.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-duplos.mjs scripts/test-aquecer-ao-tocar.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A decisão vive num ficheiro com imports de runtime (a cache e o resolvedor):
// lê-se a função pelo texto, sem a carregar, e prova-se a regra.
const fonte = readFileSync(new URL('../src/lib/aquecerAoTocar.ts', import.meta.url), 'utf8');
const REAQUECER = Number(/REAQUECER_DEPOIS_MS = ([\d_]+)/.exec(fonte)![1].replace(/_/g, ''));
const ESPERA = Number(/ESPERA_AO_POUSAR_MS = (\d+)/.exec(fonte)![1]);
const deveAquecer = (o: { fonte: string; emCache: boolean; aquecidaEm: number | undefined; agora: number }) =>
  !(o.fonte !== 'youtube' || o.emCache) && (o.aquecidaEm === undefined || o.agora - o.aquecidaEm >= REAQUECER);
assert.match(fonte, /if \(o\.fonte !== 'youtube' \|\| o\.emCache\) return false;/, 'a regra é a do ficheiro');
assert.match(fonte, /return o\.aquecidaEm === undefined \|\| o\.agora - o\.aquecidaEm >= REAQUECER_DEPOIS_MS;/);

assert.equal(deveAquecer({ fonte: 'youtube', emCache: false, aquecidaEm: undefined, agora: 0 }), true);
assert.equal(deveAquecer({ fonte: 'youtube', emCache: true, aquecidaEm: undefined, agora: 0 }), false, 'no telemóvel não precisa');
assert.equal(deveAquecer({ fonte: 'spotify', emCache: false, aquecidaEm: undefined, agora: 0 }), false);
assert.equal(deveAquecer({ fonte: 'youtube', emCache: false, aquecidaEm: 0, agora: 1000 }), false, 'a mesma, já aquecida há pouco');
assert.equal(deveAquecer({ fonte: 'youtube', emCache: false, aquecidaEm: 0, agora: REAQUECER }), true);

// Pelo MESMO caminho do leitor, para ele se juntar à resolução em curso.
assert.match(fonte, /resolveYouTubeStream\(track\.sourceId, qualidade\)/);
const leitor = readFileSync(new URL('../src/components/YouTubePlayerView.tsx', import.meta.url), 'utf8');
assert.match(leitor, /resolveYouTubeStream\(track\.sourceId, quality\),/, 'o leitor resolve com os mesmos argumentos');
assert.doesNotMatch(fonte, /downloadProgressiveAudio|descarregar/i, 'só resolve, não descarrega');

// Só com o dedo parado, e nunca em modo de seleção.
assert.ok(ESPERA >= 60 && ESPERA <= 150, `espera curta (${ESPERA} ms)`);
const linha = readFileSync(new URL('../src/components/TrackRow.tsx', import.meta.url), 'utf8');
assert.match(linha, /onPressIn=\{selectMode \? undefined : \(\) => \{/);
assert.match(linha, /setTimeout\(\(\) => \{ aquecer\.current = null; aquecerAoTocar\(track\); \}, ESPERA_AO_POUSAR_MS\)/);
assert.match(linha, /onPressOut=\{\(\) => \{ largarAquecer\(\); onPressOut\?\.\(\); \}\}/, 'largar o dedo (ou um scroll) cancela');

const web = readFileSync(new URL('../src/lib/aquecerAoTocar.web.ts', import.meta.url), 'utf8');
assert.match(web, /export function aquecerAoTocar\(_track: Track\): void \{\}/, 'no PC não faz nada');

console.log('Aquecer ao tocar: só resolve, pelo caminho do leitor, com o dedo parado.');
