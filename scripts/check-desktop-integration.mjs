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
class Janela extends EventEmitter {
  constructor() {
    super(); janela = this;
    this.visivel = false; this.focada = false; this.minimizada = false;
    this.webContents = { mainFrame: {}, send: (...args) => events.set('sent', args), setWindowOpenHandler() {}, on() {} };
  }
  loadURL() {} show() { this.visivel = true; } focus() { this.focada = true; }
  isFocused() { return this.focada; } isMinimized() { return this.minimizada; }
  restore() { this.minimizada = false; }
}
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
  ipcMain: { handle: (event, fn) => handlers.set(event, fn), on: (event, fn) => handlers.set(event, fn) },
};
const contexto = vm.createContext({
  require: (id) => id === 'electron' ? electron : id === 'node:fs' ? {
    readFileSync: () => { if (!guardado) throw Error('Sem preferência'); return guardado; },
    writeFileSync: (_path, data) => { guardado = data; },
  } : require(id),
  __dirname: new URL('../electron/', import.meta.url).pathname, console,
  process: { platform: 'win32', execPath: 'C:/Duotone/Duotone.exe', argv: ['--duotone-auto-start'], env: {} },
  setTimeout, clearTimeout,
});
vm.runInContext(fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8'), contexto);
vm.runInContext('createWindow()', contexto);
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
console.log('Integração Electron: arranque, notificações, clique e isolamento IPC passaram.');
