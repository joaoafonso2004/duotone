// A ponte da casca Tauri (desktop/src/ponte.js) contra a do Electron
// (electron/preload.cjs), e cada comando que ela chama contra as três listas que
// o Tauri exige. Sem isto, um comando que falte numa delas é recusado em silêncio
// ("not allowed by ACL") e a página lê a falha como "não há".
//
// Lê código como texto: normaliza os finais de linha (o CI do Windows faz
// checkout com CRLF).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ler = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const preload = ler('electron/preload.cjs');
const ponte = ler('desktop/src/ponte.js');
const build = ler('desktop/build.rs');
const capacidade = JSON.parse(ler('desktop/capabilities/preview/default.json'));
// A de produção (`--features producao`) é a mesma lista, só com a porta da Duotone.
const deProducao = JSON.parse(ler('desktop/capabilities/producao/default.json'));
assert.deepEqual(deProducao.permissions, capacidade.permissions, 'as duas identidades autorizam os mesmos comandos');
assert.deepEqual(deProducao.windows, capacidade.windows);
assert.deepEqual(capacidade.remote.urls, ['http://localhost:18082/*', 'http://localhost:18082'], 'a Preview na porta dela');
assert.deepEqual(deProducao.remote.urls, ['http://localhost:18081/*', 'http://localhost:18081'], 'a de produção na porta da Duotone');
const canal = ler('desktop/src/canal.rs');
assert.match(canal, /cfg\(not\(feature = "producao"\)\)\]\nmod identidade \{\n {4}pub const IDENTIFICADOR: &str = "com\.joao\.duotone\.desktop\.preview";\n {4}pub const PORTA: u16 = 18082;/);
assert.match(canal, /cfg\(feature = "producao"\)\]\nmod identidade \{\n {4}pub const IDENTIFICADOR: &str = "com\.joao\.duotone\.desktop";\n {4}pub const PORTA: u16 = 18081;/);
assert.equal(JSON.parse(ler('desktop/tauri.conf.json')).identifier, 'com.joao.duotone.desktop.preview');
assert.equal(JSON.parse(ler('desktop/tauri.producao.conf.json')).identifier, 'com.joao.duotone.desktop');
const main = ler('desktop/src/main.rs');

// As chaves de cada objeto exposto (a indentação é a de cada ficheiro).
const objeto = preload.slice(preload.indexOf("exposeInMainWorld('duotoneDesktop'"), preload.indexOf("exposeInMainWorld('duotoneDesktop'") + 20000);
const doElectron = new Set([...objeto.slice(0, objeto.indexOf('\n}));')).matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]));
const bloco = ponte.slice(ponte.indexOf('const ponte = {'), ponte.indexOf('\n  };', ponte.indexOf('const ponte = {')));
const doTauri = [...bloco.matchAll(/^ {4}(\w+):/gm)].map((m) => m[1]);

assert.ok(doElectron.size > 40, `o preload tem ${doElectron.size} chaves: a leitura falhou`);
assert.ok(doTauri.length > 5, 'a ponte do Tauri tem de ter chaves');
// As que só existem no Tauri: o motor só de áudio (decidido a 21/11: não entra no Electron).
// E o canal das atualizações (22/11): o Electron é sempre `windows`, a página assume-o sem a chave.
const SO_DO_TAURI = new Set(['pedirAoInnerTube', 'aquecerLigacoes', 'sondarAudio', 'registarAudio', 'adiantarAudio', 'audioNaCache', 'canalDasAtualizacoes',
  'descarregarAudio', 'cancelarDownloadDeAudio', 'tirarDownloadDeAudio', 'audioNoDisco']);
assert.match(ponte, /canalDasAtualizacoes: '__CANAL_DAS_ATUALIZACOES__',/);
assert.match(ler('desktop/src/ponte.rs'), /\.replace\("__CANAL_DAS_ATUALIZACOES__", crate::canal::ATUALIZACAO_ENTRADA\)/, 'a casca põe o canal da identidade');
for (const chave of doTauri) assert.ok(doElectron.has(chave) || SO_DO_TAURI.has(chave), `"${chave}" não existe no preload do Electron (erro de nome?)`);
assert.equal(new Set(doTauri).size, doTauri.length, 'chave repetida na ponte');

// Só no frame principal e na origem da app: a ponte corre em todos os frames.
assert.match(ponte, /if \(window\.top !== window \|\| location\.origin !== '__ORIGEM__'/);

// O "slowed" no IFrame de recurso (21/11): o script do frame do YouTube entra na janela,
// só corre dentro de um frame do YouTube posto pela app, e não chama a ponte.
const webview = ler('desktop/src/webview.rs');
const doFrame = webview.slice(webview.indexOf('pub fn script_do_frame_do_youtube'), webview.indexOf('pub fn configurar'));
assert.match(main, /\.initialization_script\(&?webview::script_do_frame_do_youtube\(\)\)/, 'o script do frame do YouTube não entra na janela');
assert.match(doFrame, /window\.top === window \|\|/, 'o script do frame tem de sair no frame principal');
assert.match(doFrame, /ancestorOrigins/, 'o script do frame tem de conferir que o frame é da app');
assert.match(doFrame, /preservesPitch = false/);
assert.doesNotMatch(doFrame, /__TAURI|invoke/, 'o script do frame do YouTube não fala com a casca');

// Cada comando chamado: declarado no build.rs, autorizado na capability, registado no main.rs.
const comandos = [...new Set([...ponte.matchAll(/(?:invoke|pedir)\('([a-z_]+)'/g)].map((m) => m[1]))];
assert.ok(comandos.length > 0);
const declarados = new Set([...build.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));
const permissoes = new Set(capacidade.permissions);
for (const c of comandos) {
  assert.ok(declarados.has(c), `"${c}" não está no AppManifest do desktop/build.rs`);
  assert.ok(permissoes.has(`allow-${c.replace(/_/g, '-')}`), `"allow-${c.replace(/_/g, '-')}" não está na capability`);
  assert.match(main, new RegExp(`(?:ponte|rede|audio|saude|mini|arranque|barra|notificacoes|atualizacao|spotify|sessao)::${c}\\b`), `"${c}" não está no generate_handler do main.rs`);
}
// A capability nunca aceita curingas na origem (a ponte existe no frame do YouTube).
for (const url of capacidade.remote.urls) assert.match(url, /^http:\/\/localhost:\d+(\/\*)?$/, `origem larga demais: ${url}`);

// A ponte do mini leitor (F6, desktop/src/ponteMini.js) contra o electron/preloadMini.cjs.
const preloadMini = ler('electron/preloadMini.cjs');
const ponteMini = ler('desktop/src/ponteMini.js');
const doElectronMini = new Set([...preloadMini.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]));
const blocoMini = ponteMini.slice(ponteMini.indexOf('window.duotoneMini = Object.freeze({'));
const doTauriMini = [...blocoMini.matchAll(/^ {4}(\w+):/gm)].map((m) => m[1]);
assert.ok(doElectronMini.size >= 10, `o preloadMini tem ${doElectronMini.size} chaves: a leitura falhou`);
assert.deepEqual([...doTauriMini].sort(), [...doElectronMini].sort(), 'a ponte do mini tem as mesmas chaves do preloadMini');
assert.match(ponteMini, /if \(window\.top !== window \|\| location\.origin !== '__ORIGEM__' \|\| !\/\[\?&\]janela=mini\\b\/\.test\(location\.search\)/, 'a ponte do mini só na janela do mini');
const comandosMini = [...new Set([...ponteMini.matchAll(/pedir\('([a-z_]+)'/g)].map((m) => m[1]))];
for (const c of comandosMini) {
  assert.ok(declarados.has(c), `"${c}" (mini) não está no AppManifest`);
  assert.ok(permissoes.has(`allow-${c.replace(/_/g, '-')}`), `"allow-${c.replace(/_/g, '-')}" (mini) não está na capability`);
  assert.match(main, new RegExp(`mini::${c}\\b`), `"${c}" (mini) não está no generate_handler`);
}
assert.ok(capacidade.windows.includes('mini'), 'a capability tem de incluir a janela do mini');

// Os controlos de média (F5, sessao.rs): a ponte guarda as ações que a página liga no
// navigator.mediaSession e chama-as quando o Windows manda uma (o "media:acao" do Rust).
// O ponte.js a sério numa vm, com um navigator falso.
{
  const ligadasNoWebView2 = [];
  const chamadas = [];
  const janela = {
    location: { origin: '__ORIGEM__' },
    __TAURI_INTERNALS__: { invoke: (comando, args) => { chamadas.push([comando, args]); return Promise.resolve(true); } },
    navigator: { mediaSession: { setActionHandler(acao, f) { ligadasNoWebView2.push([acao, typeof f]); } } },
    document: { dispatchEvent() {}, addEventListener() {} },
    addEventListener() {}, removeEventListener() {}, console,
  };
  janela.window = janela;
  janela.top = janela;
  vm.runInNewContext(ler('desktop/src/ponte.js'), janela);
  const recebidas = [];
  janela.navigator.mediaSession.setActionHandler('pause', (d) => recebidas.push(['pause', d.action, d.seekTime]));
  janela.navigator.mediaSession.setActionHandler('seekto', (d) => recebidas.push(['seekto', d.action, d.seekTime]));
  janela.navigator.mediaSession.setActionHandler('play', null);
  assert.deepEqual(ligadasNoWebView2, [['pause', 'function'], ['seekto', 'function'], ['play', 'object']], 'a ação também se liga no WebView2, como a página pediu');
  janela.__duotoneEvento('media:acao', { acao: 'pause', segundos: null });
  janela.__duotoneEvento('media:acao', { acao: 'seekto', segundos: 42 });
  janela.__duotoneEvento('media:acao', { acao: 'play' });
  janela.__duotoneEvento('media:acao', { acao: 'nexttrack' });
  janela.__duotoneEvento('media:acao', null);
  assert.deepEqual(recebidas, [['pause', 'pause', undefined], ['seekto', 'seekto', 42]], 'só as ações ligadas, com o seekTime; uma desligada ou sem dono não faz nada');
  await janela.duotoneDesktop.definirSessaoDeMedia({ titulo: 'S', estado: 'playing' });
  // O objeto vem da vm (outro realm): compara-se pelo JSON.
  assert.equal(JSON.stringify(chamadas.at(-1)), JSON.stringify(['sessao_de_media_definir', { sessao: { titulo: 'S', estado: 'playing' } }]));
}

// O canal de atualizações da Preview (22/11, o João: "Sim, cria").
{
  const wf = ler('.github/workflows/release-windows-preview.yml');
  assert.match(wf, /tags: \['win-preview-v\*'\]/, 'só as tags da Preview');
  assert.match(wf, /VERSAO="\$\{TAG#win-preview-v\}"/);
  assert.match(wf, /-name "Duotone Preview_\*-setup\.exe"/);
  assert.match(wf, /mv "\$SRC" release\/Duotone-Preview-Setup\.exe/, 'o nome que o canal.rs pede');
  assert.match(wf, /npx -y "\$TAURI_CLI" build --config versao\.conf\.json/, 'a identidade da Preview (sem --features producao)');
  assert.ok(!/producao/.test(wf.replace(/^#.*$/gm, '')), 'nada da identidade de produção');
  assert.match(wf, /--latest=false/, 'a Duotone continua a ser o Latest do repositório');
  assert.match(wf, /client_payload\[platform\]=windowsPreview/);
  // As tags da Preview não entram nos workflows da Duotone.
  for (const outro of ['build-windows.yml', 'release-windows-tauri.yml']) {
    assert.ok(!/win-preview/.test(ler('.github/workflows/' + outro).replace(/^\s*#.*$/gm, '')), outro + ' não apanha a Preview');
  }
  assert.match(ler('.github/workflows/release.yml'), /win-preview-v\*\) echo "id=windowsPreview"[^\n]*asset=Duotone-Preview-Setup\.exe/);
  // O canal da identidade da Preview é o que o workflow publica.
  assert.match(canal, /ATUALIZACAO_ENTRADA: &str = "windowsPreview";\n {4}pub const ATUALIZACAO_TAG: &str = "win-preview-v";\n {4}pub const ATUALIZACAO_INSTALADOR: &str = "Duotone-Preview-Setup\.exe";/);
  // Só a Preview instalada se troca pela do canal; a de target\release fica como foi compilada.
  assert.match(ler('desktop/src/atualizacao.rs'), /fn disponivel\(\) -> bool \{\n {4}if cfg!\(debug_assertions\) \{\n {8}return false;\n {4}\}\n {4}if !crate::canal::E_A_PREVIEW \{\n {8}return true;\n {4}\}\n {4}let exe = std::env::current_exe\(\)[^\n]*\n {4}instalacao_por_utilizador\(/);
}

// O mini leitor nunca se cria dentro de uma chamada do WebView2 (25/11: não abria desde o
// Tauri, "failed to create webview ... 0x80010108"): o comando é assíncrono e o tabuleiro
// lança uma thread.
assert.match(ler('desktop/src/mini.rs'), /#\[tauri::command\]\npub async fn mini_alternar\(app: AppHandle, janela: WebviewWindow\)/);
assert.match(main, /"mini" => \{\n\s*let app = app\.clone\(\);\n\s*std::thread::spawn\(move \|\| mini::alternar\(&app\)\);\n\s*\}/);
assert.match(ler('desktop/src/mini.rs'), /if A_MEXER\.swap\(true, Ordering::SeqCst\) \{\n\s*return;\n\s*\}/, 'dois toques seguidos não abrem duas janelas');

const faltam = [...doElectron].filter((k) => !doTauri.includes(k));
console.log(`Ponte Tauri: ${doTauri.filter((k) => doElectron.has(k)).length} de ${doElectron.size} chaves do preload (mais ${doTauri.filter((k) => SO_DO_TAURI.has(k)).length} só do Tauri), ${comandos.length} comandos declarados, autorizados e registados. Por fazer: ${faltam.length}.`);
