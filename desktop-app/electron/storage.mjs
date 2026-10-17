import { mkdir, readFile, rename, writeFile, copyFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { emptyReader, sanitizeReader } from '../shared/reader-state.mjs';

export class ReaderStore {
  constructor(directory, lessons, { renameFile = rename } = {}) {
    this.directory = directory;
    this.filename = path.join(directory, 'reader-state.v1.json');
    this.lessons = lessons;
    this.reader = emptyReader();
    this.contentRoot = null;
    this.warning = false;
    this.loadWarning = false;
    this.queue = Promise.resolve();
    this.sequence = 0;
    this.renameFile = renameFile;
  }
  async load() {
    try {
      const value = JSON.parse(await readFile(this.filename, 'utf8'));
      if (value.schemaVersion !== 1) throw new Error('Unknown reader schema');
      this.reader = sanitizeReader(value.reader, this.lessons);
      this.contentRoot = typeof value.contentRoot === 'string' ? value.contentRoot : null;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.warning = true;
        this.loadWarning = true;
        try { await copyFile(this.filename, `${this.filename}.unreadable-${Date.now()}`); } catch { /* Best effort backup. */ }
      }
    }
    return this.reader;
  }
  save(reader = this.reader, contentRoot = this.contentRoot) {
    this.reader = sanitizeReader(reader, this.lessons);
    this.contentRoot = contentRoot;
    const document = JSON.stringify({ schemaVersion: 1, reader: this.reader, contentRoot: this.contentRoot }, null, 2);
    const temp = `${this.filename}.${process.pid}.${++this.sequence}.tmp`;
    const write = this.queue.catch(() => {}).then(async () => {
      try {
        await mkdir(this.directory, { recursive: true });
        await writeFile(temp, document, { encoding: 'utf8', mode: 0o600, flush: true });
        try { await this.renameFile(temp, this.filename); }
        catch (error) {
          if (error.code !== 'EXDEV') throw error;
          // Some virtualized Windows user-data folders reject same-directory
          // rename as cross-device. Preserve the previous record before copying.
          try { await copyFile(this.filename, `${this.filename}.backup`); } catch (backupError) { if (backupError.code !== 'ENOENT') throw backupError; }
          await copyFile(temp, this.filename);
          await unlink(temp);
        }
        this.warning = false;
        return { ok: true };
      } catch {
        this.warning = true;
        try { await unlink(temp); } catch { /* Ignore missing temporary file. */ }
        return { ok: false };
      }
    });
    this.queue = write;
    return write;
  }
  async flush() { await this.queue; }
}
