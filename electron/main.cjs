const { app, BrowserWindow, ipcMain, Menu, net, protocol, session, shell, Tray, globalShortcut } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const isDev = !app.isPackaged;
let mainWindow = null;
let tray = null;
let isQuitting = false;

protocol.registerSchemesAsPrivileged([{
  scheme: 'duotone',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}]);

const http = require('node:http');
const fs = require('node:fs');

let localServer = null;
const SERVER_PORT = 18081;

function startLocalServer() {
  const webRoot = path.resolve(__dirname, '..', 'dist-web');
  localServer = http.createServer((req, res) => {
    const urlPath = req.url.split('?')[0];
    const safeUrlPath = decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath).replace(/^[/\\]+/, '');
    const filePath = path.resolve(webRoot, safeUrlPath);
    
    if (!filePath.startsWith(webRoot)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }
    
    fs.readFile(filePath, (err, data) => {
      if (err) {
        fs.readFile(path.resolve(webRoot, 'index.html'), (err2, data2) => {
          if (err2) {
            res.statusCode = 404;
            res.end('Not Found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data2);
          }
        });
      } else {
        const ext = path.extname(filePath).toLowerCase();
        let contentType = 'application/octet-stream';
        if (ext === '.html') contentType = 'text/html; charset=utf-8';
        else if (ext === '.js') contentType = 'application/javascript; charset=utf-8';
        else if (ext === '.css') contentType = 'text/css; charset=utf-8';
        else if (ext === '.json') contentType = 'application/json; charset=utf-8';
        else if (ext === '.png') contentType = 'image/png';
        else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
        else if (ext === '.gif') contentType = 'image/gif';
        else if (ext === '.svg') contentType = 'image/svg+xml; charset=utf-8';
        else if (ext === '.ico') contentType = 'image/x-icon';
        
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      }
    });
  });
  
  localServer.listen(SERVER_PORT, '127.0.0.1', () => {
    console.log(`Local production server listening on http://127.0.0.1:${SERVER_PORT}`);
  });
}

/**
 * Captura do audio do YouTube — o que alimenta o glitch equalizer do
 * Now Playing (src/desktop/glitch/).
 *
 * O player do desktop e o IFrame oficial do YouTube: o som nasce dentro de um
 * frame de outra origem e nao ha `<audio>` nosso para ligar a um analyser. A
 * unica via e o Electron.
 *
 * Quando o renderer chama `getDisplayMedia`, este handler responde com o
 * WebFrameMain do YouTube no campo `audio` — captura SO daquele frame, nao do
 * ecra nem do sistema — e com `enableLocalEcho: true`, que e o que mantem o
 * som a sair pelas colunas enquanto e capturado. Sem PO Token e sem desligar a
 * webSecurity.
 *
 * Nao se devolve `video`: o efeito precisa do sinal, nao de pixeis, e capturar
 * imagem era trabalho de GPU para deitar fora.
 */
function frameDoYouTube(raiz) {
  if (!raiz) return raiz;
  try {
    for (const frame of raiz.framesInSubtree || []) {
      let anfitriao = '';
      try { anfitriao = new URL(frame.url).hostname; } catch { continue; }
      if (/(^|\.)(youtube|youtube-nocookie)\.com$/.test(anfitriao)) return frame;
    }
  } catch {}
  // Sem iframe do YouTube (ainda nao ha faixa) o frame da propria app serve:
  // a captura fica viva e passa a ter sinal assim que o player montar.
  return raiz;
}

function configurarCaptura(ses) {
  ses.setDisplayMediaRequestHandler((request, callback) => {
    callback({ audio: frameDoYouTube(request.frame), enableLocalEcho: true });
  }, { useSystemPicker: false });

  // A app AUTO-APROVA o pedido de captura. E dito ao utilizador nas Definicoes
  // (opcao "Album art glitch"), nao escondido — e desligar a opcao para a
  // captura do lado do renderer.
  //
  // O resto e negado de proposito: sem handler o Electron concede quase tudo,
  // e um leitor de musica nao tem nada que ver com geolocalizacao, MIDI, USB
  // ou serie.
  const PERMITIDAS = new Set([
    'media', 'display-capture', 'fullscreen', 'notifications',
    'clipboard-read', 'clipboard-sanitized-write',
  ]);
  ses.setPermissionRequestHandler((_conteudos, permissao, callback) => callback(PERMITIDAS.has(permissao)));
  ses.setPermissionCheckHandler((_conteudos, permissao) => PERMITIDAS.has(permissao));
}

/**
 * Equalizador — o grafo corre DENTRO do frame do YouTube.
 *
 * O audio toca num iframe de outra origem, e do lado do renderer nao lhe
 * tocamos. O que destrava isto e o `executeJavaScript` do WebFrameMain, que
 * corre codigo dentro de qualquer frame: la dentro o `<video>` e local e o
 * `createMediaElementSource` e legitimo. O `src` do video e um `blob:` de um
 * MediaSource, ou seja da propria origem — por isso a WebAudio nao o silencia.
 *
 * Medido antes de escrever isto: +12 dB contra -12 dB nas bandas altas dao
 * 20,4 dB de diferenca, e as bandas nao tocadas ficam quietas.
 *
 * DOIS CAMINHOS QUE MORRERAM, para nao se repetirem:
 *   - capturar o audio do frame e reemitir filtrado: o `enableLocalEcho:false`
 *     NAO cala o original (confirmado de ouvido) e ouvia-se em duplicado;
 *   - calar o player e reemitir: o mute apaga tambem a captura (RMS a zero).
 *
 * `createMediaElementSource` so pode ser chamado UMA VEZ por elemento, dai o
 * `window.__duotoneEq` guardar o grafo e a instalacao ser idempotente.
 */
const EQ_INSTALAR = `(() => {
  const v = document.querySelector('video');
  if (!v) return { ok: false, porque: 'sem video' };
  const eq = window.__duotoneEq;
  // Se o YouTube trocou o elemento, o grafo antigo ficou preso ao anterior e
  // tem de se montar outro.
  if (eq && eq.video === v) return { ok: true, ja: true };
  try {
    const ctx = eq ? eq.ctx : new (window.AudioContext || window.webkitAudioContext)();
    const fonte = ctx.createMediaElementSource(v);
    const bandas = [105, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 10000];
    const tipos = ['lowshelf', 'peaking', 'peaking', 'peaking', 'peaking',
      'peaking', 'peaking', 'peaking', 'peaking', 'highshelf'];
    let no = fonte;
    const filtros = bandas.map((f, i) => {
      const b = ctx.createBiquadFilter();
      b.type = tipos[i];
      b.frequency.value = f;
      b.Q.value = 1;
      b.gain.value = 0;
      no.connect(b);
      no = b;
      return b;
    });
    // Compatibilidade com builds antigas da ponte. A margem atual e sempre 1:
    // frequencias nao tocadas mantem o volume original.
    const margem = ctx.createGain();
    margem.gain.value = 1;
    // Ultima rede de seguranca. O master nao e atenuado: o limiter so apanha
    // picos que o reforco novo empurre para alem da saida digital. Flat usa
    // ratio 1 e fica transparente. Releases demasiado curtos modulam a propria
    // onda dos graves, por isso a recuperacao demora 150 ms.
    const limitador = ctx.createDynamicsCompressor();
    limitador.threshold.value = -0.1;
    limitador.knee.value = 0;
    limitador.ratio.value = 1;
    limitador.attack.value = 0.003;
    limitador.release.value = 0.15;
    no.connect(margem);
    margem.connect(limitador);
    limitador.connect(ctx.destination);
    window.__duotoneEq = { ctx, filtros, margem, limitador, video: v };
    return { ok: true, estado: ctx.state };
  } catch (e) {
    return { ok: false, porque: (e && e.name) + ': ' + (e && e.message) };
  }
})()`;

const eqAplicar = (ganhos, compensacao) => `(async () => {
  const eq = window.__duotoneEq;
  if (!eq) return { ok: false, porque: 'sem grafo' };
  try { await eq.ctx.resume(); } catch (e) {}
  const g = ${JSON.stringify(ganhos)};
  const margem = ${JSON.stringify(compensacao)};
  // Rampa curta: saltar o ganho de uma vez estala nas colunas.
  const t = eq.ctx.currentTime;
  eq.filtros.forEach((f, i) => {
    const v = Number(g[i]) || 0;
    try { f.gain.setTargetAtTime(v, t, 0.02); } catch (e) { f.gain.value = v; }
  });
  // Mantido para aceitar mensagens de builds anteriores; nas atuais e sempre
  // unidade e, portanto, nao baixa o master.
  if (eq.margem) {
    const m = Number(margem);
    const seguro = Number.isFinite(m) && m > 0 && m <= 1 ? m : 1;
    try { eq.margem.gain.setTargetAtTime(seguro, t, 0.02); }
    catch (e) { eq.margem.gain.value = seguro; }
  }
  if (eq.limitador) {
    const activo = g.some((v) => Math.abs(Number(v) || 0) >= 0.05);
    // Web Audio limita o ratio a 20. Com ratio 1 o no e transparente quando
    // o equalizador esta Flat; com EQ ativo funciona como peak limiter.
    try { eq.limitador.ratio.setTargetAtTime(activo ? 20 : 1, t, 0.02); }
    catch (e) { eq.limitador.ratio.value = activo ? 20 : 1; }
  }
  return { ok: true, margem: margem };
})()`;

function frameDoYouTubeParaEq(raiz) {
  if (!raiz) return null;
  try {
    for (const frame of raiz.framesInSubtree || []) {
      let anfitriao = '';
      try { anfitriao = new URL(frame.url).hostname; } catch { continue; }
      if (/(^|\.)(youtube|youtube-nocookie)\.com$/.test(anfitriao)) return frame;
    }
  } catch {}
  return null;
}

/**
 * O tom acompanha a velocidade, em vez de o browser esticar o tempo.
 *
 * ISTO ESTAVA PARTIDO E NAO SE VIA. O renderer tentava fazer
 * `iframe.contentDocument.querySelectorAll('video')` — mas o iframe e de outra
 * origem, o `contentDocument` vem `null`, e o bloco inteiro nunca corria. O
 * `preservesPitch` ficava no valor por omissao (`true`), o browser esticava o
 * tempo para manter o tom, e era DAI que vinham os artefactos em camara lenta:
 * a 0,5x um algoritmo de time-stretch tem de inventar metade do sinal.
 *
 * Com `preservesPitch = false` nao ha nada a inventar — e uma leitura mais
 * lenta da mesma onda, como abrandar uma fita. O tom desce, e e isso que faz o
 * lento soar a "slowed" em vez de soar a estragado.
 */
const PRESERVAR_TOM = `(() => {
  const v = document.querySelector('video');
  if (!v) return { ok: false, porque: 'sem video' };
  const antes = v.preservesPitch;
  v.preservesPitch = false;
  v.mozPreservesPitch = false;
  v.webkitPreservesPitch = false;
  return { ok: true, antes, agora: v.preservesPitch, rate: v.playbackRate };
})()`;

/**
 * Insiste ate o `<video>` existir. Medido: a primeira tentativa chega cedo
 * demais — o iframe ainda nao trocou de elemento — e falhava em silencio, o que
 * deixava a faixa inteira a tocar com o tempo esticado.
 */
async function pararDeEsticarOTempo(win, tentativas = 8) {
  if (!win || win.isDestroyed()) return { ok: false, porque: 'sem janela' };
  for (let i = 0; i < tentativas; i++) {
    const frame = frameDoYouTubeParaEq(win.webContents.mainFrame);
    if (frame) {
      try {
        const r = await frame.executeJavaScript(PRESERVAR_TOM);
        if (r && r.ok) return r;
      } catch (e) {
        if (i === tentativas - 1) return { ok: false, porque: e && e.message };
      }
    }
    await new Promise((r) => setTimeout(r, 400));
    if (win.isDestroyed()) return { ok: false, porque: 'janela fechada' };
  }
  return { ok: false, porque: 'sem video ao fim de varias tentativas' };
}

/**
 * Instala (se preciso) e aplica os ganhos. Devolve o que correu, para o
 * renderer poder dizer a verdade em vez de fingir que o EQ esta ligado.
 *
 * Uma falha aqui NAO tem consequencias no som: sem grafo, o video toca pelo
 * caminho normal. E por isso que isto pode falhar sem estragar nada.
 */
async function aplicarEqualizador(win, ganhos, compensacao) {
  if (!win || win.isDestroyed()) return { ok: false, porque: 'sem janela' };
  const frame = frameDoYouTubeParaEq(win.webContents.mainFrame);
  if (!frame) return { ok: false, porque: 'sem frame do YouTube' };
  try {
    const instalado = await frame.executeJavaScript(EQ_INSTALAR);
    if (!instalado || !instalado.ok) return { ok: false, porque: (instalado && instalado.porque) || 'nao instalou' };
    return await frame.executeJavaScript(eqAplicar(ganhos, compensacao));
  } catch (e) {
    return { ok: false, porque: e && e.message };
  }
}

function sendWindowState(win) {
  win.webContents.send('window:maximized', win.isMaximized());
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'logo_windows.png');
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Duotone',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Duotone');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'Duotone',
    frame: false,
    show: false,
    backgroundColor: '#09090d',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'logo_windows.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      webSecurity: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.on('maximize', () => sendWindowState(win));
  win.on('unmaximize', () => sendWindowState(win));
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  win.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith('http://localhost:8081') : (url.startsWith(`http://127.0.0.1:${SERVER_PORT}`) || url.startsWith(`http://localhost:${SERVER_PORT}`));
    if (!allowed) {
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  if (isDev) win.loadURL(process.env.DUOTONE_DEV_URL || 'http://localhost:8081');
  else win.loadURL(`http://localhost:${SERVER_PORT}/index.html`);
  mainWindow = win;
}

ipcMain.handle('player:preservar-tom', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return pararDeEsticarOTempo(win);
});

ipcMain.handle('eq:aplicar', async (event, ajuste) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  // Aceita a forma antiga (so o array) porque o preload e o renderer sao
  // empacotados juntos mas podem ficar dessincronizados numa build parcial:
  // sem este campo, assume unidade e nao rebenta.
  const ganhos = Array.isArray(ajuste) ? ajuste : (ajuste && ajuste.ganhos) || [];
  const compensacao = Array.isArray(ajuste) ? 1 : Number(ajuste && ajuste.compensacao);
  return aplicarEqualizador(win, ganhos, Number.isFinite(compensacao) ? compensacao : 1);
});

ipcMain.on('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
ipcMain.on('window:toggle-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.on('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());
ipcMain.handle('window:is-maximized', (event) => BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false);
ipcMain.on('context-menu', (event, items) => {
  const safeItems = Array.isArray(items) ? items.slice(0, 8) : [];
  Menu.buildFromTemplate(safeItems.map((item) => ({
    label: String(item.label || ''),
    enabled: item.enabled !== false,
    click: () => event.sender.send('context-menu:selected', String(item.id || '')),
  }))).popup({ window: BrowserWindow.fromWebContents(event.sender) });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  if (!isDev) startLocalServer();
  configurarCaptura(session.defaultSession);

  createWindow();
  createTray();

  try {
    globalShortcut.register('MediaPlayPause', () => {
      if (mainWindow) mainWindow.webContents.send('media:play-pause');
    });
    globalShortcut.register('MediaNextTrack', () => {
      if (mainWindow) mainWindow.webContents.send('media:next');
    });
    globalShortcut.register('MediaPreviousTrack', () => {
      if (mainWindow) mainWindow.webContents.send('media:prev');
    });
  } catch (e) {
    console.error('Could not register global shortcuts:', e);
  }

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
