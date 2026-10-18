import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const publicFiles = new Set(['/index.html', '/styles.css', '/app.mjs', '/favicon.svg']);

export function createAppServer() {
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'");
    const respond = (status, text) => { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(text); };
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) return respond(403, 'Nur lokale Zugriffe erlaubt.');
    if (!['GET', 'HEAD'].includes(req.method)) return respond(405, 'Nur GET und HEAD erlaubt.');
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { return respond(400, 'Ungültige Adresse.'); }
    if (pathname === '/') pathname = '/index.html';
    if (!publicFiles.has(pathname) && !/^\/src\/[A-Za-z0-9_-]+\.mjs$/.test(pathname)) return respond(404, 'Datei nicht gefunden.');
    try {
      const body = await readFile(resolve(root, `.${pathname}`));
      res.writeHead(200, { 'Content-Type': types[extname(pathname)], 'Content-Length': body.length });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { respond(404, 'Datei nicht gefunden.'); }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.TRIOS_PORT || 4313);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    console.error('TRIOS_PORT muss zwischen 1024 und 65535 liegen.'); process.exit(1);
  }
  const server = createAppServer();
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE'
      ? `Port ${port} wird bereits verwendet. Öffne http://127.0.0.1:${port}, falls TRIOS schon läuft, oder starte mit TRIOS_PORT=4314 npm start.`
      : error.message);
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`TRIOS / 3 läuft: ${url}\nZum Beenden: Ctrl+C. Dieses Fenster während der Nutzung offen lassen.`);
    if (process.env.TRIOS_OPEN === '1' && process.platform === 'darwin') {
      const child = spawn('open', [url], { stdio: 'ignore' });
      child.on('error', () => console.log(`Browser manuell öffnen: ${url}`));
    }
  });
}
