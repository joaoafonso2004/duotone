import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const raizDesktop = fs.readFileSync(new URL('../src/navigation/RootNavigator.web.tsx', import.meta.url), 'utf8');
assert.match(raizDesktop, /useSincroniaDaSessao\(\)/,
  'A shell do Windows tem de montar o seguidor do Jam; sem ele fica em Loading 0%');
const handlers = new Map();
const events = new Map();
let startup = { openAtLogin: false, executableWillLaunchAtLogin: false };
let guardado = null;
let janela;
const avisos = [];
const externos = [];
const captura = {};
let aoJuntarDiscord = null;
let preparacoesDiscord = 0;
let saidas = 0;
// A saúde (electron/saude.cjs) tem o seu teste; aqui é um duplo que decide se
// se recarrega, para se ver que a janela obedece.
const saudeDupla = { recarregar: true, registos: [], ler: () => ({ incidentes: [], processoComecouEm: 1 }) };
saudeDupla.rendererMorreu = (d) => { saudeDupla.registos.push(['renderer', d.reason]); return saudeDupla.recarregar; };
saudeDupla.janelaPresa = () => saudeDupla.registos.push(['presa']);
saudeDupla.processoFilhoMorreu = (d) => saudeDupla.registos.push(['filho', d.type]);
saudeDupla.erroDoPrincipal = (_e, onde) => saudeDupla.registos.push(['principal', onde]);
class Janela extends EventEmitter {
  constructor(options) {
    super(); janela = this;
    this.options = options;
    this.visivel = false; this.focada = false; this.minimizada = false;
    const wc = new EventEmitter();
    wc.mainFrame = { url: '' };
    wc.send = (...args) => events.set('sent', args);
    wc.setWindowOpenHandler = (fn) => { wc.openHandler = fn; };
    wc.getURL = () => wc.url || '';
    wc.isLoadingMainFrame = () => false;
    wc.recargas = 0;
    wc.reload = () => { wc.recargas++; };
    this.webContents = wc;
  }
  loadURL(url) { this.webContents.url = url; this.webContents.mainFrame.url = url; }
  isDestroyed() { return false; }
  show() { this.visivel = true; } hide() { this.visivel = false; } focus() { this.focada = true; }
  isFocused() { return this.focada; } isMinimized() { return this.minimizada; }
  restore() { this.minimizada = false; }
}
Janela.fromWebContents = (contents) => contents === janela?.webContents ? janela : null;
class Aviso extends EventEmitter {
  static isSupported() { return true; }
  constructor(options) { super(); this.options = options; avisos.push(this); }
  show() { this.mostrado = true; } close() {}
}
const electron = {
  app: { isPackaged: true, requestSingleInstanceLock: () => true, on: (event, fn) => events.set(event, fn),
    whenReady: () => ({ then() {} }), getPath: () => 'qa', getVersion: () => '9.9.9', quit() { saidas++; },
    getLoginItemSettings: () => startup, setLoginItemSettings: (settings) => { startup = { ...settings, executableWillLaunchAtLogin: settings.openAtLogin }; } },
  BrowserWindow: Janela, Notification: Aviso, protocol: { registerSchemesAsPrivileged() {} },
  crashReporter: { start: (opcoes) => { captura.crashReporter = opcoes; } },
  powerMonitor: { getSystemIdleTime: () => 42 },
  shell: { openExternal: (url) => externos.push(url) },
  session: { defaultSession: {} },
  Menu: { buildFromTemplate: () => ({ popup() {} }) },
  ipcMain: { handle: (event, fn) => handlers.set(event, fn), on: (event, fn) => handlers.set(event, fn) },
};
const contexto = vm.createContext({
  // O `main.cjs` corre aqui dentro com um `require` de mentira, e um caminho
  // RELATIVO nao resolve a partir deste script. O modulo do Discord entra como
  // duplo: esta verificacao e sobre a casca do Electron, e nao sobre o socket
  // do Discord, que tem os seus proprios testes.
  // Os módulos da atualização, dos atalhos e do mini leitor são puros (sem
  // `electron`): entram os verdadeiros.
  require: (id) => id === './messageBadge.cjs' ? require('../electron/messageBadge.cjs') : id === './saude.cjs' ? { criarSaude: (o) => { captura.saude = o; return saudeDupla; } } : id === './atualizacao.cjs' ? require('../electron/atualizacao.cjs') : id === './atalhos.cjs' ? require('../electron/atalhos.cjs') : id === './miniLeitor.cjs' ? require('../electron/miniLeitor.cjs') : id === './discord.cjs' ? {
    DISCORD_APP_ID: '1547625164328538133',
    definirPresenca: () => Promise.resolve(false),
    prepararDiscord: () => { preparacoesDiscord++; return Promise.resolve(true); },
    ouvirJuncao: (listener) => { aoJuntarDiscord = listener; },
    fecharDiscord() {},
  } : id === 'electron' ? electron : id === 'node:fs' ? {
    readFileSync: () => { if (!guardado) throw Error('Sem preferência'); return guardado; },
    writeFileSync: (_path, data) => { guardado = data; },
  } : require(id),
  __dirname: new URL('../electron/', import.meta.url).pathname, console,
  process: {
    platform: 'win32', execPath: 'C:/Duotone/Duotone.exe', argv: ['--duotone-auto-start'], env: {},
    on: (evento, fn) => { captura[`processo:${evento}`] = fn; },
  },
  captura,
  URL, setTimeout, clearTimeout,
});
vm.runInContext(fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8'), contexto);
vm.runInContext('createWindow()', contexto);
assert.equal(janela.options.webPreferences.webSecurity, true);
// A saúde: Crashpad sem envio, e a página que morre volta a abrir (se a saúde deixar).
assert.equal(captura.crashReporter.uploadToServer, false, 'os dumps não saem do PC');
assert.equal(captura.saude.pastaDosDumps, 'qa');
janela.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
assert.equal(janela.webContents.recargas, 1, 'a página que morreu volta a abrir');
saudeDupla.recarregar = false;
janela.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
assert.equal(janela.webContents.recargas, 1, 'em ciclo, não se recarrega');
janela.emit('unresponsive');
captura['processo:uncaughtException'](new Error('x'));
captura['processo:unhandledRejection']('y');
events.get('child-process-gone')({}, { type: 'GPU', reason: 'crashed' });
assert.deepEqual(saudeDupla.registos, [
  ['renderer', 'crashed'], ['renderer', 'crashed'], ['presa'],
  ['principal', 'uncaughtException'], ['principal', 'unhandledRejection'], ['filho', 'GPU'],
]);
assert.equal(janela.options.webPreferences.contextIsolation, true);
assert.equal(janela.options.webPreferences.sandbox, true);
let bloqueado = false;
janela.webContents.emit('will-navigate', { preventDefault: () => { bloqueado = true; } }, 'http://localhost:18081@example.invalid/phishing');
assert.equal(bloqueado, true, 'Uma URL que apenas começa pelo endereço local não passa');
assert.equal(externos.at(-1), 'http://localhost:18081@example.invalid/phishing');
assert.equal(vm.runInContext("origemDaApp('http://localhost:18081/player')", contexto), true);
assert.equal(vm.runInContext("origemDaApp('http://localhost:18081.evil.test/player')", contexto), false);
assert.equal(vm.runInContext("resolverFicheiroLocal('/%E0%A4%A','C:/app/dist').status", contexto), 400, 'URLs malformadas devolvem 400');
assert.equal(vm.runInContext("resolverFicheiroLocal('/..%5Csegredo.txt','C:/app/dist').status", contexto), 403, 'Um caminho não sai da pasta da aplicação');
assert.equal(vm.runInContext("resolverFicheiroLocal('/assets/app.js','C:/app/dist').status", contexto), 200);
vm.runInContext(`configurarCaptura({
  setDisplayMediaRequestHandler(fn){captura.display=fn},
  setPermissionRequestHandler(fn){captura.request=fn},
  setPermissionCheckHandler(fn){captura.check=fn}
})`, contexto);
let permitido;
captura.request(janela.webContents, 'media', (value) => { permitido = value; }, { requestingUrl: 'https://evil.test' });
assert.equal(permitido, false, 'Permissões de outra origem são negadas');
captura.request(janela.webContents, 'media', (value) => { permitido = value; }, { requestingUrl: 'http://localhost:18081/player' });
assert.equal(permitido, true, 'A janela principal mantém a permissão de áudio');
captura.request(janela.webContents, 'media', (value) => { permitido = value; }, { requestingUrl: 'http://localhost:18081/player', mediaTypes: ['audio'] });
assert.equal(permitido, true, 'Um pedido só de áudio continua a passar');
captura.request(janela.webContents, 'media', (value) => { permitido = value; }, { requestingUrl: 'http://localhost:18081/player', mediaTypes: ['audio', 'video'] });
assert.equal(permitido, false, 'O "media" deixa de abrir a porta à câmara');
captura.check(janela.webContents, 'media', 'http://localhost:18081', { mediaType: 'video' });
assert.equal(
  captura.check(janela.webContents, 'media', 'http://localhost:18081', { mediaType: 'video' }),
  false,
  'A verificação de permissão também recusa vídeo',
);
captura.request(janela.webContents, 'geolocation', (value) => { permitido = value; }, { requestingUrl: 'http://localhost:18081/player' });
assert.equal(permitido, false, 'Permissões desnecessárias são negadas');
let fonteCapturada;
captura.display({ frame: { url: 'https://evil.test' } }, (value) => { fonteCapturada = value; });
assert.equal(Object.keys(fonteCapturada).length, 0, 'Um frame externo não pode iniciar captura');
captura.display({ frame: janela.webContents.mainFrame }, (value) => { fonteCapturada = value; });
assert.equal(fonteCapturada.enableLocalEcho, true);
const evento = () => ({ sender: janela.webContents, senderFrame: janela.webContents.mainFrame });
assert.deepEqual(handlers.get('saude:ler')(evento()), { incidentes: [], processoComecouEm: 1 });
assert.throws(() => handlers.get('saude:ler')({ sender: janela.webContents, senderFrame: { url: 'https://www.youtube-nocookie.com' } }),
  'o iframe do YouTube não lê a saúde da app');
assert.equal(handlers.get('sistema:segundos-sem-interacao')(evento()), 42, 'a presença lê a inatividade do sistema');
assert.throws(() => handlers.get('sistema:segundos-sem-interacao')({ sender: janela.webContents, senderFrame: { url: 'https://www.youtube-nocookie.com' } }),
  'o iframe do YouTube não lê a inatividade');
janela.emit('ready-to-show');
assert.equal(janela.visivel, false, 'O arranque automático no tabuleiro não abre a janela');
aoJuntarDiscord('duotone-jam:123e4567-e89b-42d3-a456-426614174000');
assert.deepEqual(events.get('sent'), ['discord:juntar', 'duotone-jam:123e4567-e89b-42d3-a456-426614174000']);
events.get('second-instance')({}, ['C:/Duotone/Duotone.exe', 'discord-1547625164328538133://']);
assert.equal(preparacoesDiscord, 1, 'Aceitar um convite volta a ligar o pipe do Discord');
assert.equal(handlers.get('startup:get')(evento()).enabled, false);
const ligado = handlers.get('startup:set')(evento(), true, 'window');
assert.equal(ligado.enabled, true);
assert.equal(startup.args[0], '--duotone-auto-start');
assert.equal(startup.path, 'C:/Duotone/Duotone.exe');
vm.runInContext('createWindow()', contexto);
janela.emit('ready-to-show');
assert.equal(janela.visivel, true, 'O modo janela abre no início de sessão');
handlers.get('startup:set')(evento(), false, 'tray');
assert.equal(startup.openAtLogin, false);
assert.throws(() => handlers.get('startup:set')({ sender: {}, senderFrame: {} }, true, 'window'));
assert.equal(handlers.get('window:close-to-tray:get')(evento()), true,
  'Por omissão o X mantém a música no tabuleiro');
janela.visivel = true;
let impediuFecho = false;
janela.emit('close', { preventDefault: () => { impediuFecho = true; } });
assert.equal(impediuFecho, true);
assert.equal(janela.visivel, false, 'Com a opção ligada o X esconde a janela');
assert.equal(handlers.get('window:close-to-tray:set')(evento(), false), false);
janela.visivel = true;
impediuFecho = false;
janela.emit('close', { preventDefault: () => { impediuFecho = true; } });
assert.equal(impediuFecho, false, 'Com a opção desligada o X deixa fechar a janela');
assert.equal(saidas, 0, 'O window-all-closed é que termina a app depois de a janela fechar');
assert.throws(() => handlers.get('window:close-to-tray:set')({ sender: {}, senderFrame: {} }, true));
// Instalar uma atualização corre um .exe: só a janela principal o pode pedir.
await assert.rejects(handlers.get('atualizacao:instalar')({ sender: {}, senderFrame: {} }), /invalido/);
// Atalhos globais e mini leitor (24/9): só a janela principal mexe nos atalhos,
// e nada vem por omissão.
const doIframe = { sender: janela.webContents, senderFrame: { url: 'https://www.youtube-nocookie.com' } };
assert.throws(() => handlers.get('atalhos:ler')(doIframe), /inválido/);
assert.throws(() => handlers.get('atalhos:definir')(doIframe, 'seguinte', { code: 'KeyN', ctrlKey: true, altKey: true }), /inválido/);
assert.throws(() => handlers.get('atalhos:a-gravar')(evento(), 'sim'), /inválido/);
assert.deepEqual(handlers.get('atalhos:ler')(evento()).atalhos, {}, 'nenhum atalho vem posto');
assert.equal(handlers.get('atalhos:definir')(evento(), 'formatar', { code: 'KeyF', ctrlKey: true, altKey: true }).erro, 'acao-desconhecida');
assert.equal(handlers.get('atalhos:definir')(evento(), 'seguinte', { code: 'KeyN' }).erro, 'sem-modificador',
  'uma tecla sozinha não pode ser atalho global');
assert.equal(handlers.get('mini:esta-aberto')(doIframe), false, 'o iframe não pergunta pelo mini');
const notificar = handlers.get('notification:message');
notificar(evento(), { id: '1', title: 'Ana', body: 'Partilhou uma música.' });
assert.equal(avisos.length, 1);
assert.equal(avisos[0].mostrado, true);
notificar(evento(), { id: '1', title: 'Ana', body: 'Repetida' });
assert.equal(avisos.length, 1, 'O mesmo id não gera duas notificações');
notificar({ sender: janela.webContents, senderFrame: {} }, { id: 'iframe', title: 'YouTube', body: 'Não permitido' });
assert.equal(avisos.length, 1, 'Um iframe não pode pedir notificações');
janela.minimizada = true;
avisos[0].emit('click');
assert.equal(janela.focada, true);
assert.equal(janela.minimizada, false);
assert.equal(events.get('sent')[0], 'notification:open');
notificar(evento(), { id: '2', title: 'Ana', body: 'Já estás na app' });
assert.equal(avisos.length, 1, 'Não interrompe a janela que já tem foco');
console.log('Integração Electron: origem exata, permissões, captura, arranque, notificações e isolamento IPC passaram.');
