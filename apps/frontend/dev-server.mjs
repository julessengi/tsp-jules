import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const host = '127.0.0.1';
const port = Number(process.env.FRONTEND_PORT || 4173);
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/assets/tsp-mark.svg', ['assets/tsp-mark.svg', 'image/svg+xml']]
]);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + host + ':' + port);
  if (url.pathname.startsWith('/api/v1/') || url.pathname === '/api/v1') {
    const upstream = http.request({
      hostname: '127.0.0.1', port: 3001, path: url.pathname + url.search,
      method: req.method, headers: { ...req.headers, host: '127.0.0.1:3001' }
    }, (response) => {
      res.writeHead(response.statusCode || 502, response.headers);
      response.pipe(res);
    });
    upstream.on('error', () => {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ message: 'API indisponible. Démarrez PostgreSQL, Redis et le backend sur le port 3001.' }));
    });
    req.pipe(upstream);
    return;
  }

  const asset = assets.get(url.pathname);
  if (!asset) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  try {
    const body = await readFile(path.join(root, asset[0]));
    res.writeHead(200, {
      'Content-Type': asset[1], 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    });
    res.end(body);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Unable to load frontend asset');
  }
});

server.listen(port, host, () => {
  console.log('TSP-JULES frontend preview: http://' + host + ':' + port);
  console.log('API proxy: http://127.0.0.1:3001/api/v1');
});
