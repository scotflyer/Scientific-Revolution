import content from './content.json';
import { emptyReader, sanitizeReader, type ReaderState } from '../shared/reader-state.mjs';

export type ContentStatus = { ready: boolean; missing: string[]; code: string | null };
type DesktopBridge = {
  bootstrap(): Promise<{ content: typeof content; reader: ReaderState; contentStatus: ContentStatus; storageWarning: boolean }>;
  saveReader(reader: ReaderState): Promise<{ ok: boolean }>;
  rediscover(): Promise<ContentStatus>;
  chooseContent(): Promise<ContentStatus | null>;
  onBeforeClose(callback: () => void): () => void;
  finishClose(reader: ReaderState): Promise<{ ok: boolean }>;
};
declare global { interface Window { publicationDesktop?: DesktopBridge } }

const storageKey = 'scientific-revolution.prototype.v1';
export const isDesktop = !!window.publicationDesktop;
let reader = emptyReader();
let storageWarning = false;
let status: ContentStatus = { ready: true, missing: [], code: null };
let saveTimer: number | undefined;
let saving = Promise.resolve();
const notifyStorage = (failed: boolean) => { storageWarning = failed; window.dispatchEvent(new Event('publication-storage')); };

export async function initializeRuntime() {
  if (window.publicationDesktop) {
    try {
      const result = await window.publicationDesktop.bootstrap();
      // The desktop main process validates the external first-release manifest.
      reader = sanitizeReader(result.reader, result.content.lessons);
      storageWarning = result.storageWarning;
      status = result.contentStatus;
    } catch {
      storageWarning = true;
      status = { ready: false, missing: [], code: 'CONTENT_NOT_FOUND' };
    }
    window.publicationDesktop.onBeforeClose(() => {
      // Player listeners synchronously capture the final position before IPC.
      window.dispatchEvent(new Event('publication-flush'));
      clearTimeout(saveTimer);
      void saving.finally(() => window.publicationDesktop!.finishClose(reader));
    });
  } else {
    try { reader = sanitizeReader(JSON.parse(localStorage.getItem(storageKey) || '{}'), content.lessons); }
    catch { storageWarning = true; }
  }
  window.addEventListener('pagehide', () => {
    window.dispatchEvent(new Event('publication-flush'));
    clearTimeout(saveTimer);
    void flushReader();
  });
}

export const readReader = () => reader;
export const getStorageWarning = () => storageWarning;
export const getContentStatus = () => status;
export const mediaURL = (id: string) => isDesktop ? `sr-media://publication/${id}` : `/media/${id}`;

export function writeReader(value: ReaderState) {
  reader = value;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void flushReader(), 250);
}
export function flushReader() {
  const value = reader;
  saving = saving.catch(() => {}).then(async () => {
    try {
      if (window.publicationDesktop) {
        const result = await window.publicationDesktop.saveReader(value);
        notifyStorage(!result.ok);
      } else { localStorage.setItem(storageKey, JSON.stringify(value)); notifyStorage(false); }
    } catch { notifyStorage(true); }
  });
  return saving;
}
export async function recoverContent(choose = false) {
  if (!window.publicationDesktop) return status;
  try {
    const next = await (choose ? window.publicationDesktop.chooseContent() : window.publicationDesktop.rediscover());
    if (next) { status = next; window.dispatchEvent(new Event('publication-content')); }
  } catch { status = { ready: false, missing: [], code: 'CONTENT_NOT_FOUND' }; window.dispatchEvent(new Event('publication-content')); }
  return status;
}
