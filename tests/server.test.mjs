import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createAppServer } from '../server.mjs';

test('local server serves the app and modules while refusing unrelated files, writes and invalid paths', async t => {
  const server = createAppServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  const request = (path, method = 'GET', host = `127.0.0.1:${port}`) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers: { host } }, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', text => { body += text; });
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
    });
    req.on('error', reject); req.end();
  });
  const page = await request('/');
  assert.equal(page.status, 200);
  assert.match(page.body, /CPU-Monitor/);
  const module = await request('/src/cpu.mjs');
  assert.equal(module.status, 200);
  assert.match(module.type, /javascript/);
  assert.equal((await request('/README.md')).status, 404);
  assert.equal((await request('/.git/config')).status, 404);
  assert.equal((await request('/src/%2f..%2f..%2fREADME.md')).status, 404);
  assert.equal((await request('/%', 'GET')).status, 400);
  assert.equal((await request('/', 'POST')).status, 405);
  assert.equal((await request('/', 'GET', 'example.com')).status, 403);
});
