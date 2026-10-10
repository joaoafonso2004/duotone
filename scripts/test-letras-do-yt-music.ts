// As letras do YouTube Music (10/10), com respostas reais (a letra trocada por
// texto de exemplo: o repositório é público).
// Correr: node --experimental-strip-types scripts/test-letras-do-yt-music.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FORMA_DA_LETRA, lerLetra, separadorDaLetra } from '../src/lib/letrasDoYtMusic.ts';

const fixture = (nome: string) => JSON.parse(readFileSync(new URL(`./fixtures/${nome}`, import.meta.url), 'utf8'));

// O separador "Lyrics" do next.
assert.equal(separadorDaLetra(fixture('ytmusic-letra-next.json')), 'MPLYt_tgXtwLUuDoP-1');
assert.equal(separadorDaLetra({}), null);
assert.equal(separadorDaLetra({ tabRenderer: { endpoint: { browseEndpoint: { browseId: 'UCabc' } } } }), null, 'só o da letra');
assert.ok(FORMA_DA_LETRA.test('MPLYt_tgXtwLUuDoP-1'));
assert.ok(!FORMA_DA_LETRA.test('MPLYt_../../x'));

// Um upload de música ("- Topic"): sincronizada com este áudio.
const sinc = lerLetra(fixture('ytmusic-letra-sincronizada.json'))!;
assert.equal(sinc.sincronizada, true);
assert.equal(sinc.linhas.length, 81);
assert.equal(sinc.linhas[0].timeMs, 0, 'o ♪ da introdução fica, com o tempo dele');
assert.equal(sinc.linhas[1].timeMs, 16780);
assert.ok(sinc.linhas.every((l, i) => i === 0 || l.timeMs >= sinc.linhas[i - 1].timeMs), 'por ordem');
assert.ok(!sinc.texto.includes('♪'), 'o texto não leva os ♪');
assert.equal(sinc.texto.split('\n')[0], 'Linha de exemplo 1');

// Um videoclipe: as linhas vêm sem tempos (o relógio do vídeo não é o da gravação).
const video = lerLetra(fixture('ytmusic-letra-videoclipe.json'))!;
assert.equal(video.sincronizada, false);
assert.equal(video.linhas.length, 0);
assert.ok(video.texto.length > 0, 'mas o texto serve');

// Pelo cliente da web vem só o texto.
const web = lerLetra(fixture('ytmusic-letra-web.json'))!;
assert.equal(web.sincronizada, false);
assert.ok(web.texto.startsWith('Linha de exemplo 0\nLinha de exemplo 1'), 'sem os \\r');

// Sem letra ("Lyrics not available at this time").
assert.equal(lerLetra(fixture('ytmusic-letra-sem.json')), null);
assert.equal(lerLetra(null), null);

// Meia letra com tempos não é sincronizada.
const meia = lerLetra({ timedLyricsData: [
  { lyricLine: 'a', cueRange: { startTimeMilliseconds: '100' } },
  { lyricLine: 'b' },
] })!;
assert.equal(meia.sincronizada, false);
assert.equal(meia.texto, 'a\nb');

// A ligação: o lrclib primeiro; o YouTube Music quando ele não tem tempos.
const api = readFileSync(new URL('../src/api/lyrics.ts', import.meta.url), 'utf8');
assert.match(api, /letraDoYtMusic\(videoId\)/);
const estado = readFileSync(new URL('../src/state/lyrics.ts', import.meta.url), 'utf8');
assert.match(estado, /track\.source==='youtube'\?track\.sourceId:undefined/, 'o vídeo vai para a segunda fonte');
const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
assert.match(main, /ipcMain\.handle\('ytmusic:letra', async \(event, pedido\) => \{\s*if \(!daJanelaPrincipal\(event\)\)/, 'no PC, pela ponte e só da janela principal');
console.log('Letras do YouTube Music: separador, sincronizada, videoclipe, web e sem letra passaram.');
