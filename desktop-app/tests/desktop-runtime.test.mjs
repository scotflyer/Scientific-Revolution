import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rename, readdir, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import content from '../src/content.json' with { type: 'json' };
import { PublicationContent, validateManifest } from '../electron/content.mjs';
import { ReaderStore } from '../electron/storage.mjs';
import { byteRange, fileResponse } from '../electron/stream.mjs';
import { sanitizeReader, mergeRanges } from '../shared/reader-state.mjs';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), '科学革命 D '));
  await mkdir(path.join(root, '视频'));
  await writeFile(path.join(root, 'content.json'), JSON.stringify(content));
  return root;
}

test('approved manifest rejects additional media IDs, changed text and traversal paths', () => {
  assert.equal(validateManifest(content, content), content);
  for (const mutation of [v => v.lessons.push({ ...v.lessons[0], id: 'unknown-01' }), v => v.lessons[0].relativeVideoPath = '视频/../../secret.mp4', v => v.lessons[0].title = 'Changed']) {
    const changed = structuredClone(content); mutation(changed);
    assert.throws(() => validateManifest(changed, content));
  }
});

test('discovers manifest independently of cwd, preserves Chinese and extension spaces, reports missing media', async () => {
  const root = await fixture();
  const lesson = content.lessons.find(l => l.id === 'astronomy-06');
  const filename = path.join(root, lesson.relativeVideoPath);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, Buffer.alloc(4096, 7));
  const nested = path.join(root, 'Windows', '程序'); await mkdir(nested, { recursive: true });
  const publication = new PublicationContent(content, [nested]);
  const status = await publication.discover();
  assert.equal(status.ready, true);
  assert.equal(status.missing.length, 43);
  assert.equal((await publication.resolveLesson(lesson.id)).filename, filename);
  await assert.rejects(publication.resolveLesson('../../secret'));
  await rename(filename, filename + '.disconnected');
  await assert.rejects(publication.resolveLesson(lesson.id));
  await rename(path.join(root, '视频'), path.join(root, '视频-断开'));
  assert.equal((await publication.discover()).ready, false);
});

test('media symlink cannot escape validated video directory', async () => {
  const root = await fixture();
  const outside = await mkdtemp(path.join(os.tmpdir(), 'sr-outside-'));
  const lesson = content.lessons[0];
  const filename = path.join(root, lesson.relativeVideoPath);
  await writeFile(path.join(outside, path.basename(filename)), 'private');
  await symlink(outside, path.dirname(filename), 'junction');
  const publication = new PublicationContent(content, [], [root]);
  assert.equal((await publication.discover()).ready, true);
  await assert.rejects(publication.resolveLesson(lesson.id), /MEDIA_OUTSIDE_ROOT/);
});

test('single Range stream supports open and suffix ranges, HEAD and rejects malformed or overflowing ranges', async () => {
  const root = await fixture(); const filename = path.join(root, 'sample.bin');
  const data = Buffer.from('0123456789'); await writeFile(filename, data);
  for (const [header, expected] of [['bytes=2-5', '2345'], ['bytes=7-', '789'], ['bytes=-3', '789'], ['bytes=0-999', '0123456789']]) {
    const response = fileResponse(new Request('sr-media://publication/test', { headers: { Range: header } }), filename, 10, 'video/mp4');
    assert.equal(response.status, 206); assert.equal(await response.text(), expected);
  }
  for (const bad of ['bytes=-0', 'bytes=10-', 'bytes=5-4', 'bytes=0-1,3-4', 'bytes=9007199254740992-', 'garbage']) assert.equal(byteRange(bad, 10), null);
  const head = fileResponse(new Request('sr-media://publication/test', { method: 'HEAD' }), filename, 10, 'video/mp4');
  assert.equal(head.status, 200); assert.equal(head.headers.get('content-length'), '10'); assert.equal(await head.text(), '');
  const invalid = fileResponse(new Request('sr-media://publication/test', { headers: { Range: 'bytes=10-' } }), filename, 10, 'video/mp4');
  assert.equal(invalid.status, 416); assert.equal(invalid.headers.get('content-range'), 'bytes */10');
});

test('completion rejects seeking-only and overlapping inflated ranges; actual disjoint coverage is merged', () => {
  const lesson = content.lessons[0];
  const p = { seconds: lesson.durationSeconds, updatedAt: 1, covered: [[0, 1], [0, 1]], finished: true };
  assert.equal(sanitizeReader({ favorites: [lesson.id, lesson.id, 'invalid'], progress: { [lesson.id]: p } }, content.lessons).progress[lesson.id].finished, false);
  p.covered = [[0, lesson.durationSeconds * .5], [lesson.durationSeconds * .4, lesson.durationSeconds]];
  assert.equal(sanitizeReader({ progress: { [lesson.id]: p } }, content.lessons).progress[lesson.id].finished, true);
  p.finished = false;
  assert.equal(sanitizeReader({ progress: { [lesson.id]: p } }, content.lessons).progress[lesson.id].finished, false);
  assert.deepEqual(mergeRanges([[0, 1], [1.1, 2]]), [[0, 1], [1.1, 2]]);
});

test('queued atomic saves retain latest state and restore favorites, position, covered intervals and completion', async () => {
  const root = await fixture(); const directory = path.join(root, '用户记录');
  const store = new ReaderStore(directory, content.lessons); await store.load();
  const lesson = content.lessons[0];
  const value = { favorites: [lesson.id], progress: { [lesson.id]: { seconds: 12, updatedAt: 2, covered: [[0, 12]], finished: false } } };
  const first = store.save(value, root);
  value.progress[lesson.id].seconds = 22;
  value.progress[lesson.id].covered = [[0, 22]];
  const last = store.save(value, root); await first; assert.deepEqual(await last, { ok: true });
  const restart = new ReaderStore(directory, content.lessons); await restart.load();
  assert.equal(restart.reader.progress[lesson.id].seconds, 22); assert.deepEqual(restart.reader.favorites, [lesson.id]);
  assert.deepEqual(restart.reader.progress[lesson.id].covered, [[0, 22]]); assert.equal(restart.contentRoot, root);
  assert.deepEqual((await readdir(directory)).filter(n => n.endsWith('.tmp')), []);
});

test('corrupt records are backed up; unwritable user data returns actionable failure', async () => {
  const root = await fixture(); const store = new ReaderStore(root, content.lessons);
  await writeFile(store.filename, '{broken'); await store.load();
  assert.equal(store.warning, true);
  assert.ok((await readdir(root)).some(n => n.includes('.unreadable-')));
  assert.equal((await store.save()).ok, true);
  assert.equal(JSON.parse(await readFile(store.filename, 'utf8')).schemaVersion, 1);
  const blocked = path.join(root, 'file-not-directory'); await writeFile(blocked, 'locked');
  const inaccessible = new ReaderStore(blocked, content.lessons);
  assert.equal((await inaccessible.save()).ok, false);
});

test('cross-device rename fallback preserves the previous record and saves the latest state', async () => {
  const directory = await fixture();
  const store = new ReaderStore(directory, content.lessons, { renameFile: async () => { throw Object.assign(new Error('Virtual filesystem'), { code: 'EXDEV' }); } });
  const value = { favorites: [content.lessons[0].id], progress: {} };
  assert.equal((await store.save()).ok, true);
  assert.equal((await store.save(value)).ok, true);
  assert.deepEqual(JSON.parse(await readFile(store.filename + '.backup', 'utf8')).reader.favorites, []);
  const restart = new ReaderStore(directory, content.lessons); await restart.load();
  assert.deepEqual(restart.reader.favorites, value.favorites);
});
