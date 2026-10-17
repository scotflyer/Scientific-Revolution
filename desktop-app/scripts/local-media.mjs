import { createReadStream, statSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import content from '../src/content.json' with { type: 'json' };

// Development prototype only. Electron will own media access in stage D.
const root = fileURLToPath(new URL('../../', import.meta.url));
const mediaRoot = realpathSync(resolve(root, '视频'));
const allowed = new Map(content.lessons.map(lesson => [lesson.id, lesson.relativeVideoPath]));

function handle(req, res, next) {
  const url = new URL(req.url || '/', 'http://prototype.local');
  if (!url.pathname.startsWith('/media/')) return next();
  const videoPath = allowed.get(url.pathname.slice(7));
  if (!videoPath) { res.writeHead(404); return res.end('Unknown lesson'); }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
  let filename, size;
  try {
    filename = realpathSync(resolve(root, videoPath));
    const inside = relative(mediaRoot, filename);
    if (isAbsolute(inside) || inside === '..' || inside.startsWith(`..${sep}`)) throw new Error('Outside media root');
    size = statSync(filename).size;
  } catch { res.writeHead(404); return res.end('Video unavailable'); }
  const headers = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  let start = 0, end = size - 1;
  if (req.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!match || (!match[1] && !match[2])) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
    if (!match[1]) start = Math.max(0, size - Number(match[2]));
    else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end();
    }
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['Content-Length'] = String(end - start + 1);
  res.writeHead(req.headers.range ? 206 : 200, headers);
  if (req.method === 'HEAD') return res.end();
  const stream = createReadStream(filename, { start, end });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

export function localMedia() {
  return { name: 'local-publication-media',
    configureServer(server) { server.middlewares.use(handle); },
    configurePreviewServer(server) { server.middlewares.use(handle); } };
}
