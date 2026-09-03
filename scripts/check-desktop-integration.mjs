import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const handlers = new Map();
const events = new Map();
let startup = { openAtLogin: false, executableWillLaunchAtLogin: false };
let guardado = null;
let janela;
const avisos = [];
const externos = [];
const captura = {};
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
    this.webContents = wc;
  }
  loadURL(url) { this.webContents.url = url; this.webContents.mainFrame.url = url; }
  show() { this.visivel = true; } focus() { this.focada = true; }
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
    whenReady: () => ({ then() {} }), getPath: () => 'qa', quit() {},
    getLoginItemSettings: () => startup, setLoginItemSettings: (settings) => { startup = { ...settings, executableWillLaunchAtLogin: settings.openAtLogin }; } },
  BrowserWindow: Janela, Notification: Aviso, protocol: { registerSchemesAsPrivileged() {} },
  shell: { openExternal: (url) => externos.push(url) },
  session: { defaultSession: {} },
  Menu: { buildFromTemplate: () => ({ popup() {} }) },
  ipcMain: { handle: (event, fn) => handlers.set(event, fn), on: (event, fn) => handlers.set(event, fn) },
};
const contexto = vm.createContext({
  require: (id) => id === 'electron' ? electron : id === 'node:fs' ? {
    readFileSync: () => { if (!guardado) throw Error('Sem preferência'); return guardado; },
    writeFileSync: (_path, data) => { guardado = data; },
  } : require(id),
  __dirname: new URL('../electron/', import.meta.url).pathname, console,
  process: { platform: 'win32', execPath: 'C:/Duotone/Duotone.exe', argv: ['--duotone-auto-start'], env: {} },
  captura,
  URL, setTimeout, clearTimeout,
});
vm.runInContext(fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8'), contexto);
vm.runInContext('createWindow()', contexto);
assert.equal(janela.options.webPreferences.webSecurity, true);
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
captura.request(janela.webContents, 'geolocation', (value) => { permitido = value; }, { requestingUrl: 'http://localhost:18081/player' });
assert.equal(permitido, false, 'Permissões desnecessárias são negadas');
let fonteCapturada;
captura.display({ frame: { url: 'https://evil.test' } }, (value) => { fonteCapturada = value; });
assert.equal(Object.keys(fonteCapturada).length, 0, 'Um frame externo não pode iniciar captura');
captura.display({ frame: janela.webContents.mainFrame }, (value) => { fonteCapturada = value; });
assert.equal(fonteCapturada.enableLocalEcho, true);
const evento = () => ({ sender: janela.webContents, senderFrame: janela.webContents.mainFrame });
janela.emit('ready-to-show');
assert.equal(janela.visivel, false, 'O arranque automático no tabuleiro não abre a janela');
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
