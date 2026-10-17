import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export function inside(root, filename) {
  const rel = path.relative(root, filename);
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

export function validateManifest(value, baseline) {
  // The first release has one approved publication. An external manifest cannot
  // add IDs, paths or UI text to that edition.
  if (!isDeepStrictEqual(value, baseline)) throw new Error('CONTENT_MANIFEST_INVALID');
  const ids = new Set();
  for (const lesson of value.lessons) {
    const p = lesson.relativeVideoPath;
    if (ids.has(lesson.id) || !/^[a-z]+-\d{2}$/.test(lesson.id) || typeof p !== 'string' ||
        !p.startsWith('视频/') || p.includes('\\') || p.split('/').some(part => part === '..' || part === '.') ||
        !p.endsWith('.mp4') || !Number.isFinite(lesson.durationSeconds) || lesson.durationSeconds <= 0) throw new Error('CONTENT_MANIFEST_INVALID');
    ids.add(lesson.id);
  }
  return value;
}

function ancestors(start) {
  const result = [];
  if (!start) return result;
  let current = path.resolve(start);
  for (let i = 0; i < 7; i++) {
    result.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return result;
}

export class PublicationContent {
  constructor(baseline, starts = [], preferred = []) {
    this.baseline = validateManifest(baseline, baseline);
    this.candidates = [...new Set([...preferred.filter(Boolean), ...starts.flatMap(ancestors)])];
    this.root = null;
    this.missing = [];
  }
  async inspect(candidate) {
    const root = await realpath(candidate);
    const media = await realpath(path.join(root, '视频'));
    if (!inside(root, media) || !(await stat(media)).isDirectory()) throw new Error('CONTENT_NOT_FOUND');
    const manifests = ['content.json', 'desktop-app/src/content.json'];
    let manifest;
    for (const name of manifests) {
      let value;
      try {
        const file = await realpath(path.join(root, name));
        if (!inside(root, file)) throw new Error('CONTENT_MANIFEST_INVALID');
        value = JSON.parse(await readFile(file, 'utf8'));
      } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      manifest = validateManifest(value, this.baseline);
      break;
    }
    if (!manifest) throw new Error('CONTENT_MANIFEST_MISSING');
    return { root, manifest };
  }
  async discover(selected) {
    const candidates = selected ? [selected] : [...new Set([this.root, ...this.candidates].filter(Boolean))];
    for (const candidate of candidates) {
      try {
        const { root } = await this.inspect(candidate);
        this.root = root;
        this.missing = [];
        for (const lesson of this.baseline.lessons) {
          try { await this.resolveLesson(lesson.id); } catch { this.missing.push(lesson.id); }
        }
        return this.status();
      } catch { /* Try the next candidate; never serve an unvalidated root. */ }
    }
    if (!selected) this.root = null;
    return { ready: false, missing: [], code: 'CONTENT_NOT_FOUND' };
  }
  status() { return { ready: !!this.root, missing: [...this.missing], code: this.root ? null : 'CONTENT_NOT_FOUND' }; }
  async resolveLesson(id) {
    const lesson = this.baseline.lessons.find(l => l.id === id);
    if (!lesson || !this.root) throw new Error('MEDIA_NOT_FOUND');
    // Resolve on every request, including Range requests, to handle a removed
    // USB drive and prevent symlink/junction escape after discovery.
    const media = await realpath(path.join(this.root, '视频'));
    const filename = await realpath(path.resolve(this.root, lesson.relativeVideoPath));
    if (!inside(this.root, media) || !inside(media, filename)) throw new Error('MEDIA_OUTSIDE_ROOT');
    const info = await stat(filename);
    if (!info.isFile() || info.size <= 0) throw new Error('MEDIA_NOT_FOUND');
    return { filename, size: info.size };
  }
}
