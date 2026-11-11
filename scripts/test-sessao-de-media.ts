/**
 * A Duotone nos controlos de média do Windows (issue #10, 11/11):
 * electron/sessaoDeMedia.cjs (a ponte que entra no frame do YouTube) e
 * src/lib/sessaoDeMedia.ts (o lado da página). O script corre num `vm` com uma
 * MediaSession falsa, com getters e setters no protótipo, como a do Chromium.
 *
 * Correr: node --experimental-strip-types scripts/test-sessao-de-media.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { acaoDaMensagem, foiUmSalto, pedidoDaSessao } from '../src/lib/sessaoDeMedia.ts';

const require = createRequire(import.meta.url);
/** Os objetos do vm são de outro contexto: compara-se o JSON. */
const j = (x: unknown) => JSON.parse(JSON.stringify(x));
const { ACOES, scriptDaSessao, validarSessao } = require('../electron/sessaoDeMedia.cjs');

// ---- validar o pedido da página -------------------------------------------------
const boa = { titulo: 'Bones', artista: 'Imagine Dragons', album: 'Mercury', capa: 'https://i.ytimg.com/vi/x/mqdefault.jpg', estado: 'playing', duracao: 165, posicao: 12 };
assert.deepEqual(validarSessao(boa), { ...boa });
assert.equal(validarSessao(null), null);
assert.equal(validarSessao([1]), null);
assert.equal(validarSessao({ ...boa, titulo: '' }), null, 'a tocar sem título não serve');
assert.deepEqual(validarSessao({ estado: 'none' }), { titulo: '', artista: '', album: '', capa: '', estado: 'none', duracao: null, posicao: null }, 'sem música: a sessão limpa');
assert.equal(validarSessao({ ...boa, capa: 'file:///C:/x.png' })!.capa, '', 'só https na capa');
assert.equal(validarSessao({ ...boa, estado: 'qualquer' })!.estado, 'none');
assert.equal(validarSessao({ ...boa, posicao: 999 })!.posicao, 165, 'a posição não passa da duração');
assert.equal(validarSessao({ ...boa, duracao: -1 })!.posicao, null, 'sem duração não há posição');
assert.equal(validarSessao({ ...boa, titulo: 'x'.repeat(1000) })!.titulo.length, 300);

// ---- o script no frame do YouTube --------------------------------------------------
function frameDoYouTube() {
  const enviadas: { dados: any; origem: string }[] = [];
  const handlersNativos = new Map<string, unknown>();
  const posicoes: unknown[] = [];
  class MediaMetadata { d: any; constructor(d: any) { this.d = d; } }
  class MediaSession {
    _meta: any = null; _estado = 'none';
    get metadata() { return this._meta; }
    set metadata(v) { this._meta = v; }
    get playbackState() { return this._estado; }
    set playbackState(v) { this._estado = v; }
    setActionHandler(acao: string, f: unknown) { handlersNativos.set(acao, f); }
    setPositionState(p?: unknown) { posicoes.push(p ?? 'limpa'); }
  }
  const ms = new MediaSession();
  const janela: any = { navigator: { mediaSession: ms }, MediaMetadata, parent: { postMessage: (dados: any, origem: string) => enviadas.push({ dados, origem }) } };
  janela.window = janela;
  const contexto = vm.createContext(janela);
  return { ms, contexto, enviadas, handlersNativos, posicoes, correr: (codigo: string) => vm.runInContext(codigo, contexto) };
}

{
  const f = frameDoYouTube();
  // O YouTube põe os seus antes de nós chegarmos.
  f.correr(`navigator.mediaSession.metadata = new MediaMetadata({ title: 'Me at the zoo' }); navigator.mediaSession.setActionHandler('seekbackward', () => 1);`);
  const sessao = validarSessao(boa);
  assert.equal(f.correr(scriptDaSessao(sessao, 'http://localhost:18081')), true);
  assert.equal(f.ms.metadata.d.title, 'Bones', 'o título é o da Duotone');
  assert.equal(f.ms.metadata.d.artist, 'Imagine Dragons');
  assert.deepEqual(j(f.ms.metadata.d.artwork), [{ src: boa.capa }]);
  assert.equal(f.ms.playbackState, 'playing');
  assert.deepEqual(j(f.posicoes.at(-1)), { duration: 165, position: 12, playbackRate: 1 }, 'a barra de progresso do Windows');
  for (const acao of ACOES) assert.equal(typeof f.handlersNativos.get(acao), 'function', `a ação ${acao} está ligada`);

  // O YouTube volta a escrever a cada vídeo: deixa de poder.
  f.correr(`navigator.mediaSession.metadata = new MediaMetadata({ title: 'Outro vídeo' }); navigator.mediaSession.playbackState = 'paused';`);
  assert.equal(f.ms.metadata.d.title, 'Bones', 'as escritas do YouTube nos metadados são ignoradas');
  assert.equal(f.ms.playbackState, 'playing');
  const nossoSeguinte = f.handlersNativos.get('nexttrack');
  f.correr(`navigator.mediaSession.setActionHandler('nexttrack', () => 'do youtube'); navigator.mediaSession.setActionHandler('seekforward', () => 2);`);
  assert.equal(f.handlersNativos.get('nexttrack'), nossoSeguinte, 'o YouTube não troca as nossas ações');
  assert.equal(typeof f.handlersNativos.get('seekforward'), 'function', 'as outras ações do YouTube passam');

  // As ações vão à página, só para a origem da app.
  (f.handlersNativos.get('nexttrack') as () => void)();
  (f.handlersNativos.get('seekto') as (d: unknown) => void)({ seekTime: 42 });
  assert.deepEqual(j(f.enviadas), [
    { dados: { duotoneMedia: 'nexttrack' }, origem: 'http://localhost:18081' },
    { dados: { duotoneMedia: 'seekto', seekTime: 42 }, origem: 'http://localhost:18081' },
  ]);

  // A música seguinte: o mesmo script atualiza, sem voltar a instalar.
  f.correr(scriptDaSessao(validarSessao({ ...boa, titulo: 'Believer', estado: 'paused', duracao: 204, posicao: 0 }), 'http://localhost:18081'));
  assert.equal(f.ms.metadata.d.title, 'Believer');
  assert.equal(f.ms.playbackState, 'paused');
  assert.equal(f.handlersNativos.get('nexttrack'), nossoSeguinte, 'as ações não se duplicam');

  // Sem música: limpa.
  f.correr(scriptDaSessao(validarSessao({ estado: 'none' }), 'http://localhost:18081'));
  assert.equal(f.ms.metadata, null);
  assert.equal(f.posicoes.at(-1), 'limpa');
}

{
  // Um título com aspas e barras não parte o script (vai como JSON).
  const f = frameDoYouTube();
  f.correr(scriptDaSessao(validarSessao({ ...boa, titulo: 'Don\'t "Stop" </script> \\ Me' }), 'http://localhost:18081'));
  assert.equal(f.ms.metadata.d.title, 'Don\'t "Stop" </script> \\ Me');
}

// ---- o lado da página -------------------------------------------------------------
assert.deepEqual(acaoDaMensagem('https://www.youtube-nocookie.com', { duotoneMedia: 'nexttrack' }), { acao: 'nexttrack', segundos: null });
assert.deepEqual(acaoDaMensagem('https://www.youtube.com', { duotoneMedia: 'seekto', seekTime: 30.5 }), { acao: 'seekto', segundos: 30.5 });
assert.equal(acaoDaMensagem('https://evil.example', { duotoneMedia: 'nexttrack' }), null, 'só dos frames do YouTube');
assert.equal(acaoDaMensagem('https://www.youtube.com.evil.example', { duotoneMedia: 'nexttrack' }), null);
assert.equal(acaoDaMensagem('https://www.youtube.com', { duotoneMedia: 'apagar-tudo' }), null, 'só as ações conhecidas');
assert.equal(acaoDaMensagem('https://www.youtube.com', { duotoneMedia: 'seekto' }), null, 'um "ir para" sem tempo não serve');
assert.equal(acaoDaMensagem('https://www.youtube.com', 'nexttrack'), null);

assert.deepEqual(pedidoDaSessao({ titulo: 'Bones', artista: 'Imagine Dragons', album: null, capa: 'https://c', aTocar: true, posicaoMs: 12_000, duracaoMs: 165_000 }),
  { titulo: 'Bones', artista: 'Imagine Dragons', album: 'Duotone', capa: 'https://c', estado: 'playing', duracao: 165, posicao: 12 });
assert.equal(pedidoDaSessao({ titulo: null, artista: null, album: null, capa: null, aTocar: false, posicaoMs: 0, duracaoMs: 0 }).estado, 'none');
assert.equal(pedidoDaSessao({ titulo: 'x', artista: null, album: null, capa: 'http://inseguro', aTocar: false, posicaoMs: 0, duracaoMs: 0 }).capa, '');

assert.equal(foiUmSalto(10_000, 10_250, 250, true), false, 'o andar normal não é um salto');
assert.equal(foiUmSalto(10_000, 60_000, 250, true), true, 'saltar para a frente');
assert.equal(foiUmSalto(60_000, 0, 250, true), true, 'voltar ao início');
assert.equal(foiUmSalto(10_000, 10_000, 5000, false), false, 'em pausa a posição fica');

// ---- as teclas de média já não passam pelo globalShortcut --------------------------
const MAIN = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
assert.ok(!/globalShortcut\.register\('Media/.test(MAIN), 'pedir as teclas de média ao globalShortcut tira a Duotone dos controlos do Windows');
assert.match(MAIN, /ipcMain\.handle\('media:sessao'/);

console.log('sessão de média do Windows: ok');
