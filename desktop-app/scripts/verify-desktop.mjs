import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, cp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import content from '../src/content.json' with { type: 'json' };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userData = await mkdtemp(path.join(os.tmpdir(), 'sr-desktop-qa-'));
const checks = [], errors = [], external = [];
const desktopEnv = { ...process.env };
delete desktopEnv.ELECTRON_RUN_AS_NODE;
let application, page;
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
const launch = async (directory = userData) => {
  application = await electron.launch({ args: [path.join(root, 'dist/desktop'), '--allow-multiple'], cwd: os.tmpdir(),
    env: { ...desktopEnv, SR_USER_DATA: directory, SR_CONTENT_ROOT: path.dirname(root) }, timeout: 30000 });
  application.process().stderr.on('data', data => { if (process.env.SR_QA_VERBOSE) process.stderr.write(data); });
  page = await application.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  await page.getByRole('button', { name: '开始学习', exact: true }).or(page.getByRole('button', { name: '继续观看', exact: true })).waitFor();
};
const loaded = () => page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0));
const ready = () => page.waitForFunction(() => document.querySelector('video')?.readyState >= 2, null, { timeout: 30000 });
const seek = async seconds => {
  await page.locator('video').evaluate((v, t) => { v.currentTime = t; }, seconds);
  await page.waitForFunction(() => !document.querySelector('video')?.seeking);
};
const route = async hash => { await page.evaluate(value => { location.hash = value; }, hash); };
const close = async () => {
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await new Promise(resolve => { const process = application.process(); if (process.exitCode !== null) resolve(); else process.once('exit', resolve); });
  application = null;
};

await mkdir(path.join(root, 'qa/stage-d'), { recursive: true });
try {
  await launch(); await loaded();
  check('Built desktop launches from unrelated working directory without Vite or HTTP', page.url().startsWith('sr-app://publication/'));
  check('First desktop launch has no fabricated history', await page.getByRole('button', { name: '开始学习', exact: true }).count() === 1);
  const boot = await page.evaluate(() => window.publicationDesktop.bootstrap());
  check('Content root discovery resolves all 44 original media mappings', boot.contentStatus.ready && boot.contentStatus.missing.length === 0 && boot.content.lessons.length === 44);
  check('Renderer exposes only specific desktop methods and no Node filesystem access', await page.evaluate(() => typeof window.require === 'undefined' && typeof window.process === 'undefined' && Object.keys(window.publicationDesktop).length === 6));
  const prefs = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
  check('Context isolation, renderer sandbox and web security are enabled', prefs.contextIsolation && prefs.sandbox && prefs.webSecurity && !prefs.nodeIntegration);
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 720));
  await page.screenshot({ path: path.join(root, 'qa/stage-d/home-1280.png') });
  for (const module of content.modules) {
    await route(`/module/${module.id}`); await loaded();
    check(`Theme ${module.id} uses approved data and artwork`, await page.locator('.lesson-row').count() === module.lessonCount);
    const lesson = content.lessons.find(l => l.moduleId === module.id);
    await page.locator(`[data-lesson="${lesson.id}"]`).click(); await ready();
    check(`Original H.264/AAC playback loads for ${module.id}`, await page.locator('video').evaluate(v => v.videoWidth > 0 && v.duration > 1400));
  }
  await route('/module/astronomy'); await loaded();
  await page.locator('.lesson-scroll').evaluate(e => e.scrollTop = e.scrollHeight);
  const top = await page.locator('.lesson-scroll').evaluate(e => e.scrollTop);
  await page.locator('[data-lesson="astronomy-13"]').click(); await ready();
  check('Last lesson disables next', await page.getByRole('button', { name: '后一讲', exact: true }).isDisabled());
  await page.getByRole('button', { name: '返回主题目录', exact: true }).click();
  check('Return restores directory scroll and lecture focus', await page.locator('.lesson-scroll').evaluate((e, t) => Math.abs(e.scrollTop - t) < 1, top) && await page.locator('[data-lesson="astronomy-13"]').evaluate(e => e === document.activeElement));
  await page.getByRole('button', { name: '搜索讲次', exact: true }).click();
  await page.getByRole('textbox').fill('不存在的讲题');
  check('Empty search offers explicit recovery', await page.getByText('没有找到相关讲次').count() === 1);
  await page.getByRole('textbox').fill('地动日心说'); await page.locator('.result-row>button').click(); await ready();
  check('Search opens correct desktop media ID', await page.locator('video').getAttribute('src') === 'sr-media://publication/astronomy-03');
  await seek(60);
  await page.getByRole('button', { name: '收藏本讲', exact: true }).click();
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('video').currentTime > 61);
  const geometry = await page.locator('video').boundingBox();
  await page.getByRole('button', { name: '打开目录', exact: true }).click();
  check('Small-window directory pauses without resizing video', await page.locator('video').evaluate(v => v.paused) && JSON.stringify(geometry) === JSON.stringify(await page.locator('video').boundingBox()));
  await page.screenshot({ path: path.join(root, 'qa/stage-d/panel-1280.png') });
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('video').paused);
  check('Esc restores playback and panel entry focus', await page.getByRole('button', { name: '打开目录', exact: true }).evaluate(e => e === document.activeElement));
  await page.getByRole('button', { name: '关于本书', exact: true }).click();
  check('Global dialog pauses playing video', await page.locator('video').evaluate(v => v.paused));
  await page.getByRole('button', { name: '关闭', exact: true }).click(); await page.waitForFunction(() => !document.querySelector('video').paused);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByRole('combobox', { name: '播放速度' }).selectOption('1.5');
  await page.getByRole('slider', { name: '音量', exact: true }).fill('0.4');
  check('Speed and volume control the actual video', await page.locator('video').evaluate(v => v.playbackRate === 1.5 && v.volume === .4));
  await page.getByRole('button', { name: '静音', exact: true }).click();
  check('Mute works', await page.locator('video').evaluate(v => v.muted));
  await page.getByRole('button', { name: '全屏', exact: true }).click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  check('Fullscreen preserves title and independent controls', await page.locator('.playing-info h1').isVisible() && await page.locator('.player-controls').isVisible());
  await page.getByRole('button', { name: '退出全屏', exact: true }).click();
  await seek(88); // Close immediately, before the debounce, to exercise final flush.
  await close();
  let record = JSON.parse(await readFile(path.join(userData, 'reader-state.v1.json'), 'utf8'));
  check('Native window close flushes final seek, favorites and real played ranges', record.reader.favorites.includes('astronomy-03') && record.reader.progress['astronomy-03'].seconds >= 88 && record.reader.progress['astronomy-03'].covered.some(([a, b]) => b - a > .5));
  await launch();
  check('Actual app restart restores continue watching', await page.getByRole('button', { name: '继续观看', exact: true }).count() === 1);
  await page.getByRole('button', { name: '继续观看', exact: true }).click(); await ready();
  check('Actual app restart restores favorite and position', await page.getByRole('button', { name: '已收藏', exact: true }).count() === 1 && await page.locator('video').evaluate(v => v.currentTime >= 88 && v.currentTime < 90));
  check('Desktop storage does not use browser localStorage', await page.evaluate(() => localStorage.getItem('scientific-revolution.prototype.v1') === null));
  for (const lesson of content.lessons) {
    const result = await page.evaluate(async id => { const r = await fetch(`sr-media://publication/${id}`, { method: 'HEAD' }); return { status: r.status, length: r.headers.get('content-length') }; }, lesson.id);
    assert.equal(result.status, 200, lesson.id); assert.ok(Number(result.length) > 0);
  }
  check('All 44 original media files respond to HEAD through restricted protocol', true);
  const ranges = await page.evaluate(async () => {
    const ok = await fetch('sr-media://publication/astronomy-06', { headers: { Range: 'bytes=0-1023' } });
    const bad = await fetch('sr-media://publication/astronomy-06', { headers: { Range: 'bytes=999999999999-' } });
    const unknown = await fetch('sr-media://publication/unknown-01');
    return { status: ok.status, bytes: (await ok.arrayBuffer()).byteLength, bad: bad.status, unknown: unknown.status };
  });
  check('Range protocol preserves filename spaces and rejects invalid ranges and unknown IDs', ranges.status === 206 && ranges.bytes === 1024 && ranges.bad === 416 && ranges.unknown === 404);
  await route('/player/astronomy-07'); await ready(); await seek(90);
  check('Second extension-space filename decodes and seeks', await page.locator('video').evaluate(v => v.currentTime >= 90));
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 720));
  await route('/player/astronomy-04'); await ready();
  await page.screenshot({ path: path.join(root, 'qa/stage-d/long-title-1280.png') });
  check('Full long title wraps outside original video', await page.locator('.playing-info h1').evaluate(e => e.getBoundingClientRect().height > 40));
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(2048, 1152));
  await page.screenshot({ path: path.join(root, 'qa/stage-d/player-2048.png') });
  await route('/player/foundations-01'); await ready();
  check('First lesson disables previous', await page.getByRole('button', { name: '前一讲', exact: true }).isDisabled());
  await page.locator('video').evaluate(v => { v.currentTime = v.duration - .4; });
  await page.waitForFunction(() => !document.querySelector('video').seeking);
  await page.getByRole('button', { name: '播放', exact: true }).click(); await page.waitForFunction(() => document.querySelector('video').ended);
  // Allow asynchronous renderer save to reach main.
  await page.waitForFunction(async () => (await window.publicationDesktop.bootstrap()).reader.progress['foundations-01']?.seconds > 1400);
  check('Seeking to natural end does not mark unwatched lecture complete', !(await page.evaluate(() => window.publicationDesktop.bootstrap())).reader.progress['foundations-01'].finished);
  check('No application page errors or external runtime requests in normal flows', errors.length === 0 && external.length === 0);
  await close();
  // A root with an approved manifest and no video files simulates absent media
  // without touching or renaming any original publication assets.
  const absentRoot = await mkdtemp(path.join(os.tmpdir(), 'sr-missing-media-'));
  await mkdir(path.join(absentRoot, '视频')); await writeFile(path.join(absentRoot, 'content.json'), JSON.stringify(content));
  const alternateData = await mkdtemp(path.join(os.tmpdir(), 'sr-failure-qa-'));
  await writeFile(path.join(alternateData, 'reader-state.v1.json'), JSON.stringify({ schemaVersion: 1, contentRoot: absentRoot, reader: { favorites: [], progress: {} } }));
  application = await electron.launch({ args: [path.join(root, 'dist/desktop'), '--allow-multiple'], cwd: os.tmpdir(), env: { ...desktopEnv, SR_USER_DATA: alternateData, SR_CONTENT_ROOT: absentRoot } });
  page = await application.firstWindow(); await page.getByRole('button', { name: '开始学习', exact: true }).waitFor();
  await route('/player/physics-01'); await page.getByText('视频暂时无法播放').waitFor();
  check('Absent media offers retry, directory return and content folder choice', await page.getByRole('button', { name: '重新载入', exact: true }).count() === 1 && await page.getByRole('button', { name: '选择内容文件夹', exact: true }).count() === 1);
  await page.screenshot({ path: path.join(root, 'qa/stage-d/media-error.png') });
  await page.getByRole('button', { name: '返回主题目录', exact: true }).last().click();
  check('Absent media can return to the correct theme', page.url().endsWith('/module/physics'));
  await close();
  // Seed previously watched intervals, then reach a real natural end. This also
  // exercises completed-state persistence without watching 24 minutes in QA.
  record = JSON.parse(await readFile(path.join(userData, 'reader-state.v1.json'), 'utf8'));
  const first = content.lessons[0];
  record.reader.progress[first.id] = { seconds: first.durationSeconds - .5, updatedAt: Date.now(), covered: [[0, first.durationSeconds * .95]], finished: false };
  await writeFile(path.join(userData, 'reader-state.v1.json'), JSON.stringify(record));
  await launch(); await route('/player/foundations-01'); await ready();
  await seek(first.durationSeconds - .4); await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('video').ended);
  await page.waitForFunction(async () => (await window.publicationDesktop.bootstrap()).reader.progress['foundations-01']?.finished);
  check('Natural end with prior actual coverage above 90 percent marks complete', true);
  await close(); await launch();
  check('Completed state and merged intervals survive actual restart', (await page.evaluate(() => window.publicationDesktop.bootstrap())).reader.progress['foundations-01'].finished);
  await close();
  const detached = await mkdtemp(path.join(os.tmpdir(), 'sr-detached-app-'));
  await cp(path.join(root, 'dist/desktop'), path.join(detached, 'app'), { recursive: true });
  const detachedData = path.join(detached, 'user');
  application = await electron.launch({ args: [path.join(detached, 'app'), '--allow-multiple'], cwd: detached, env: { ...desktopEnv, SR_USER_DATA: detachedData, SR_CONTENT_ROOT: path.join(detached, 'not-connected') } });
  page = await application.firstWindow(); await page.getByRole('button', { name: '重新查找', exact: true }).waitFor();
  check('Detached build with no content root provides reconnect and folder recovery', await page.getByText('未找到出版物内容。', { exact: false }).count() === 1);
  await application.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }); }, path.dirname(root));
  await page.getByRole('button', { name: '选择内容文件夹', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.content-notice'));
  check('Native folder selection reconnects detached app to validated publication', (await page.evaluate(() => window.publicationDesktop.bootstrap())).contentStatus.ready);
  await route('/player/astronomy-06'); await ready();
  check('Recovered content plays original media from the newly selected root', await page.locator('video').evaluate(v => v.videoWidth === 1920));
  await close();
  const deniedData = await mkdtemp(path.join(os.tmpdir(), 'sr-denied-store-'));
  await mkdir(path.join(deniedData, 'reader-state.v1.json'));
  await launch(deniedData);
  check('Unreadable or unwritable state file displays record warning', await page.locator('.storage-notice').isVisible());
  await route('/player/foundations-01'); await ready(); await page.getByRole('button', { name: '收藏本讲', exact: true }).click();
  await page.waitForFunction(async () => (await window.publicationDesktop.bootstrap()).reader.favorites.includes('foundations-01'));
  check('Storage failure leaves navigation and in-session favorites usable', await page.getByRole('button', { name: '已收藏', exact: true }).count() === 1);
  await close();
  await writeFile(path.join(root, 'qa/stage-d/verification.json'), JSON.stringify({ date: '2026-10-17', platform: 'Windows x64', runtime: 'Electron 38.8.6', result: 'passed', checks, errors, externalRuntimeRequests: external, temporaryUserData: userData, scope: 'Stage D developer verification; not stage E/F USB or macOS acceptance' }, null, 2));
  console.log(JSON.stringify({ result: 'passed', checks: checks.length, errors, externalRuntimeRequests: external.length, userData }, null, 2));
} finally { if (application) await application.close(); }
