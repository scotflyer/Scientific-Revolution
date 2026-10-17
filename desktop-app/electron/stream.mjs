import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';

export function byteRange(header, size) {
  if (!header) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  let start = 0, end = size - 1;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
  } else {
    start = Number(match[1]);
    if (match[2]) {
      const requestedEnd = Number(match[2]);
      if (!Number.isSafeInteger(requestedEnd)) return null;
      end = Math.min(end, requestedEnd);
    }
  }
  if (!Number.isSafeInteger(start) || start > end || start >= size) return null;
  return { start, end, partial: true };
}

export function fileResponse(request, filename, size, type) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
  const range = byteRange(request.headers.get('range'), size);
  if (!range) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  const { start, end, partial } = range;
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'Content-Length': String(end - start + 1) };
  if (partial) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  if (request.method === 'HEAD') return new Response(null, { status: partial ? 206 : 200, headers });
  const stream = createReadStream(filename, { start, end });
  // Chromium cancelling a seek destroys the underlying stream via Readable.toWeb.
  return new Response(Readable.toWeb(stream), { status: partial ? 206 : 200, headers });
}
