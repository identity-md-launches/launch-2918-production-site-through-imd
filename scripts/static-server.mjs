import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

// A bounded verification/preview server; callers own and close its lifecycle.
export async function serveExport(directory = 'dist') {
  const root = resolve(directory);
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
  const server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (!path.startsWith('/preview/')) { response.writeHead(404); response.end('Use /preview/'); return; }
      let file = resolve(root, path.slice('/preview/'.length) || 'index.html');
      if (!file.startsWith(root + sep)) throw new Error('Outside export.');
      if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
      response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(await readFile(file));
    } catch { response.writeHead(404); response.end('Not found'); }
  });
  await new Promise((res, rej) => { server.once('error', rej); server.listen(0, '127.0.0.1', res); });
  const address = server.address();
  return { url: `http://127.0.0.1:${address.port}/preview/`, close: () => new Promise(res => server.close(res)) };
}
