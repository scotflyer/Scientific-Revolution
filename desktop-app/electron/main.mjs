import { app, BrowserWindow, dialog, ipcMain, protocol, session, Menu, screen } from 'electron';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PublicationContent, inside } from './content.mjs';
import { ReaderStore } from './storage.mjs';
import { fileResponse } from './stream.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const development = process.argv.includes('--dev');
const devOrigin = 'http://127.0.0.1:4173';
const appOrigin = 'sr-app://publication';
const client = path.resolve(directory, development ? '../dist/client' : '../client');
app.setName('Scientific Revolution');
// Development and distribution use one stable per-user location.
app.setPath('userData', path.join(app.getPath('appData'), 'Scientific-Revolution'));
if (process.env.SR_USER_DATA) app.setPath('userData', path.resolve(process.env.SR_USER_DATA));
protocol.registerSchemesAsPrivileged([
  { scheme: 'sr-app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  { scheme: 'sr-media', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

let window, publication, store, closing = false, closeAllowed = false, closeTimer;
const allowedURL = value => { try { const u = new URL(value); return development ? u.origin === devOrigin : u.protocol === 'sr-app:' && u.host === 'publication'; } catch { return false; } };
const checkSender = event => {
  if (!window || event.sender !== window.webContents || event.senderFrame !== event.sender.mainFrame || !allowedURL(event.senderFrame.url)) throw new Error('IPC_NOT_ALLOWED');
};
const snapshot = () => ({ content: publication.baseline, reader: store.reader, contentStatus: publication.status(), storageWarning: store.warning || store.loadWarning });

function showWindow() {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

async function protocols() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  const csp = `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; media-src sr-media:; connect-src 'self' sr-media:; base-uri 'none'; form-action 'none'; frame-src 'none'`;
  protocol.handle('sr-app', async request => {
    try {
      const url = new URL(request.url);
      if (url.host !== 'publication') return new Response(null, { status: 404 });
      const name = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      const filename = await realpath(path.resolve(client, name));
      if (!inside(await realpath(client), filename)) return new Response(null, { status: 403 });
      const type = types[path.extname(filename)];
      if (!type) return new Response(null, { status: 404 });
      const info = await stat(filename);
      if (!info.isFile()) return new Response(null, { status: 404 });
      const response = fileResponse(request, filename, info.size, type);
      response.headers.set('Content-Security-Policy', csp);
      response.headers.set('X-Content-Type-Options', 'nosniff');
      return response;
    } catch { return new Response(null, { status: 404 }); }
  });
  protocol.handle('sr-media', async request => {
    try {
      const url = new URL(request.url);
      if (url.host !== 'publication' || !/^\/[a-z]+-\d{2}$/.test(url.pathname)) return new Response(null, { status: 404 });
      const { filename, size } = await publication.resolveLesson(url.pathname.slice(1));
      const response = fileResponse(request, filename, size, 'video/mp4');
      response.headers.set('Access-Control-Allow-Origin', development ? devOrigin : appOrigin);
      response.headers.set('X-Content-Type-Options', 'nosniff');
      return response;
    } catch { return new Response(null, { status: 404 }); }
  });
}

async function createWindow() {
  const work = screen.getPrimaryDisplay().workAreaSize;
  window = new BrowserWindow({ title: '科学革命', width: Math.min(1600, work.width), height: Math.min(960, work.height),
    minWidth: 1280, minHeight: 720, useContentSize: true, show: false, backgroundColor: '#03141e', autoHideMenuBar: true,
    webPreferences: { preload: path.join(directory, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, devTools: !app.isPackaged } });
  window.setMinimumSize(1280, 720 + Math.max(0, window.getSize()[1] - window.getContentSize()[1]));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (!allowedURL(url)) event.preventDefault(); });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.once('ready-to-show', showWindow);
  window.on('close', event => {
    if (closeAllowed) return;
    event.preventDefault();
    if (closing) return;
    closing = true;
    window.webContents.send('publication:before-close');
    closeTimer = setTimeout(async () => { await store.flush(); closeAllowed = true; window?.close(); }, 2500);
  });
  window.on('closed', () => { window = null; });
  await window.loadURL(development ? devOrigin : `${appOrigin}/index.html`);
  // A completed load must reveal the app even if ready-to-show was missed
  // or the launcher's first Windows show command was suppressed.
  showWindow();
}

if (!process.argv.includes('--allow-multiple') && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', showWindow);
  void app.whenReady().then(async () => {
  const manifestFile = path.resolve(directory, development ? '../src/content.json' : '../content.json');
  const baseline = JSON.parse(await readFile(manifestFile, 'utf8'));
  store = new ReaderStore(app.getPath('userData'), baseline.lessons);
  await store.load();
  const searchStarts = process.env.SR_CONTENT_ROOT ? [] : [app.getAppPath(), path.dirname(app.getPath('exe')), process.resourcesPath, process.cwd()];
  publication = new PublicationContent(baseline, searchStarts, [process.env.SR_CONTENT_ROOT, store.contentRoot]);
  await publication.discover();
  if (publication.root) await store.save(store.reader, publication.root);
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'fullscreen'));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'fullscreen');
  session.defaultSession.on('will-download', event => event.preventDefault());
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const u = new URL(details.url);
    const permitted = ['sr-app:', 'sr-media:', 'devtools:'].includes(u.protocol) || (development && (u.origin === devOrigin || u.origin === 'ws://127.0.0.1:4173'));
    callback({ cancel: !permitted });
  });
  ipcMain.handle('publication:bootstrap', event => { checkSender(event); return snapshot(); });
  ipcMain.handle('publication:save-reader', (event, reader) => { checkSender(event); return store.save(reader); });
  ipcMain.handle('publication:rediscover', async event => {
    checkSender(event); const status = await publication.discover();
    if (publication.root) await store.save(store.reader, publication.root);
    return status;
  });
  ipcMain.handle('publication:choose-content', async event => {
    checkSender(event);
    const result = await dialog.showOpenDialog(window, { title: '选择包含“视频”和内容清单的出版物文件夹', properties: ['openDirectory'] });
    if (result.canceled) return null;
    const status = await publication.discover(result.filePaths[0]);
    if (status.ready) await store.save(store.reader, publication.root);
    return status;
  });
  ipcMain.handle('publication:finish-close', async (event, reader) => {
    checkSender(event); if (!closing) return { ok: false };
    const result = await store.save(reader); await store.flush();
    clearTimeout(closeTimer); closeAllowed = true; setImmediate(() => window?.close()); return result;
  });
  await protocols();
  await createWindow();
  app.on('activate', () => { if (!window) { closing = false; closeAllowed = false; void createWindow(); } else showWindow(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  }).catch(error => { console.error(error); dialog.showErrorBox('科学革命无法启动', '应用文件无法读取。请重新打开完整的程序目录。'); app.quit(); });
}
